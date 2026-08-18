// DOES START ACTUALLY WALK CONTEST → HOW TO PLAY → GAME?
//
// Client, spelling the order out: "once you hit start game, you should be
// presented with registering for the contest with an option to skip if you
// want to, and then you should be presented with the instructions on how to
// play and then you can go." And, when asked whether a skip should stick:
// "ask again next time they start until they're registered."
//
// Three things this exists to stop coming back, each of which shipped once:
//
//   * THE GATE NOBODY COULD REACH. It was guarded on `localRuns().length`, so
//     the sign-up only appeared to somebody who had already played a run on
//     this device — i.e. never to the brand-new player it exists for.
//   * THE SECOND DOOR. Only the pointer handler ran the gate. Space, or the
//     JUMP pad on the title, called startRun() directly and walked past it.
//   * THE ONE-TIME LATCH. `signupOffered()` was written to localStorage the
//     first time the form appeared, so one NOT NOW retired the ask forever,
//     on this visit and every future one.
//
// It also pins the exit rule off the back of a run: NOT NOW there means the
// TITLE, in one tap, not a sideways step onto the leaderboard.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/startflow.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// Which view is up, read off the DOM rather than off any variable the code
// keeps — the player sees the DOM, not the variable.
//
// ⚠️ THE SIGN-UP IS NOT A VIEW ANY MORE AND THIS HAS TO ASK FOR IT FIRST.
// Cropping his cabinet to a card turned ENTER CONTEST into #entryLayer, a
// layer OVER whichever view the panel is showing — so when the form is up,
// pvHow or pvBoard is legitimately up as well, and a loop that returns the
// first unhidden view returns the BACKDROP. Every check in this file about
// the sign-up gate then reads 'how' and fails while the gate is working
// perfectly. The layer is asked about before the views, not after.
const view = (p) => p.evaluate(() => {
  if (document.getElementById('panel').hidden) return 'none';
  if (!document.getElementById('entryLayer').hidden) return 'form';
  for (const id of ['pvMenu', 'pvHow', 'pvBoard', 'pvSettings']) {
    if (!document.getElementById(id).hidden) return id.slice(2).toLowerCase();
  }
  return 'none';
});

async function fresh() {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto(BASE + '/?tod=night', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  // Past the title assembly — a tap inside it means "skip the animation" and
  // is deliberately exempt from the gate, so testing during it tests nothing.
  await p.waitForTimeout(3000);
  return p;
}

// The title card is canvas, so START is a coordinate, not a selector. Middle
// of the screen is the card; mouse.click, not touchscreen.tap, because a
// touch's delayed synthetic click lands on whatever DOM button the panel puts
// under that point once it is open.
const tapTitle = async (p) => { await p.mouse.click(215, 500); await p.waitForTimeout(700); };
const clickBtn = async (p, id) => {
  await p.evaluate((i) => document.getElementById(i).click(), id);
  await p.waitForTimeout(600);
};

// ── 1. a brand-new player, no runs banked, gets the form on the first START
{
  const p = await fresh();
  const runs = await p.evaluate(() => JSON.parse(localStorage.getItem('wh_runs') || '[]').length);
  await tapTitle(p);
  const v = await view(p);
  check('first START on a fresh device opens the contest form', v === 'form',
    `banked runs=${runs} view=${v}`);

  // ── 2. NOT NOW goes on to HOW TO PLAY, it does not dump them in the game
  await clickBtn(p, 'btnSkip');
  const v2 = await view(p);
  check('NOT NOW steps on to HOW TO PLAY', v2 === 'how', `view=${v2}`);
  check('the run is still queued behind it',
    await p.evaluate(() => !!window.__game.pendingRun));

  // ── 3. and that page's footer button is the way IN, labelled as one
  const label = await p.evaluate(() => document.getElementById('btnHowBack').textContent.trim());
  check('the HOW TO PLAY footer reads PLAY, not BACK', label === 'PLAY', `label=${label}`);
  await clickBtn(p, 'btnHowBack');
  await p.waitForTimeout(900);
  const screen = await p.evaluate(() => window.__game.screen);
  check('PLAY starts the run', screen === 'playing', `screen=${screen}`);
  check('the panel is gone', (await view(p)) === 'none');
  await p.context().close();
}

// ── 4. THE LATCH IS DEAD. Decline, get to the game, come back, get asked
//       again. Same page, same localStorage — this is the exact sequence the
//       old `signupOffered()` write made impossible.
{
  const p = await fresh();
  await tapTitle(p);
  await clickBtn(p, 'btnSkip');
  await clickBtn(p, 'btnHowBack');
  await p.waitForTimeout(600);
  // RELOAD, not an in-page reset — a reload keeps localStorage and throws
  // away memory, which is precisely the axis the old bug lived on. A latch
  // held in a variable would survive an in-page return to the title and fail
  // this anyway; only a stored one survives a reload, and that is what
  // `signupOffered()` used to write.
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.waitForTimeout(3000);
  await tapTitle(p);
  const v = await view(p);
  const offered = await p.evaluate(() => localStorage.getItem('wh_signup_offered'));
  check('the SECOND visit asks again — no one-time latch', v === 'form',
    `view=${v} wh_signup_offered=${offered}`);
  await p.context().close();
}

// ── 5. THE KEYBOARD IS THE SAME DOOR. Space used to call startRun() direct.
{
  const p = await fresh();
  // HELD, not pressed. confirmPressed() is sampled once per tick from the
  // key-state map, so a press-and-release inside a single frame is a coin
  // toss — this test flaked exactly that way before the key was held.
  await p.keyboard.down('Space');
  await p.waitForTimeout(250);
  await p.keyboard.up('Space');
  await p.waitForTimeout(800);
  const v = await view(p);
  const screen = await p.evaluate(() => window.__game.screen);
  check('Space runs the same gate as a tap', v === 'form',
    `view=${v} screen=${screen}`);
  await p.context().close();
}

// ── 6. A REGISTERED PLAYER IS NOT ASKED AGAIN — they get the lesson, not the
//       form. "They never should even have to sign up again."
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(BASE + '/?tod=night', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    // The real key and the real shape — isRegistered() wants 10+ phone digits
    // out of `wh_contest_reg`, not merely a saved name.
    localStorage.setItem('wh_name', 'TESTER');
    localStorage.setItem('wh_contest_reg',
      JSON.stringify({ phone: '4045551234', email: 't@e.com' }));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.waitForTimeout(3000);
  await tapTitle(p);
  const v = await view(p);
  check('a registered player skips the form and gets HOW TO PLAY', v === 'how', `view=${v}`);
  await clickBtn(p, 'btnHowBack');
  await p.waitForTimeout(900);
  check('and PLAY still starts their run',
    (await p.evaluate(() => window.__game.screen)) === 'playing');
  await p.context().close();
}

// ── 7. OFF THE BACK OF A RUN, THE BOARD IS THE LAST STOP.
//       Client: "die — leaderboard and registration... win? Ending scene then
//       Leaderboard and registration. If already registered, no registration
//       offer, only leaderboard." So the form is the offer and the board is
//       where it lets out, and BACK off THAT board leaves — it does not step
//       sideways into OPTIONS, which is a menu nobody asked for after a run.
//
//       Driven through `flow: 'post'` directly rather than by staging a
//       death: what changed is the routing, not the dying.
{
  const p = await fresh();
  await p.evaluate(() => window.__panel.open('form', { flow: 'post' }));
  await p.waitForTimeout(500);
  check('the post-run form opens', (await view(p)) === 'form');
  await clickBtn(p, 'btnSkip');
  const v = await view(p);
  check('NOT NOW there lets out onto the leaderboard', v === 'board', `view=${v}`);
  await clickBtn(p, 'btnBoardBack');
  const v2 = await view(p);
  const screen = await p.evaluate(() => window.__game.screen);
  check('and BACK off that board closes to the title, not to OPTIONS',
    v2 === 'none' && screen === 'title', `view=${v2} screen=${screen}`);

  // The red ✕ on his cabinet is wired to the same thing NOT NOW is.
  await p.evaluate(() => window.__panel.open('form', { flow: 'post' }));
  await p.waitForTimeout(400);
  await clickBtn(p, 'btnFormX');
  check('the red ✕ beside it agrees', (await view(p)) === 'board');

  // A REGISTERED player gets no offer at all — straight to the board.
  await p.evaluate(() => {
    localStorage.setItem('wh_contest_reg',
      JSON.stringify({ phone: '4045551234', email: 't@e.com' }));
  });
  await p.evaluate(() => window.__panel.open('board', { flow: 'post' }));
  await p.waitForTimeout(400);
  check('a registered player lands on the board with no form in the way',
    (await view(p)) === 'board');
  await clickBtn(p, 'btnBoardBack');
  check('and one BACK takes them out', (await view(p)) === 'none');

  // Reached from OPTIONS instead, the board still steps up to the menu.
  await p.evaluate(() => window.__panel.open('board'));
  await p.waitForTimeout(400);
  await clickBtn(p, 'btnBoardBack');
  const v4 = await view(p);
  check('but from OPTIONS the board still steps back to the menu', v4 === 'menu', `view=${v4}`);
  await p.context().close();
}

// ── 8. THE ORDINARY ROUTE IS UNTOUCHED. OPTIONS → HOW TO PLAY → BACK still
//       says BACK and still goes to the menu, with no run queued behind it.
{
  const p = await fresh();
  await p.evaluate(() => window.__panel && window.__panel.open('menu'));
  await p.waitForTimeout(500);
  await clickBtn(p, 'btnMenuHow');
  const label = await p.evaluate(() => document.getElementById('btnHowBack').textContent.trim());
  check('reached from OPTIONS the footer still reads BACK', label === 'BACK', `label=${label}`);
  await clickBtn(p, 'btnHowBack');
  const v = await view(p);
  check('and it steps back to the menu, not into a run', v === 'menu', `view=${v}`);
  check('no run was queued', await p.evaluate(() => !window.__game.pendingRun));
  await p.context().close();
}

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`);
if (bad.length) {
  bad.forEach(([w]) => console.log('  FAILED: ' + w));
  process.exit(1);
}
