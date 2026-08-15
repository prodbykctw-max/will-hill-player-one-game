// THE OPTIONS SHELF, THE BOARD THAT DOES NOT SCROLL, AND THE SIGN-UP OFFERS.
//
// Client, spelling out the shelf: "under options — leaderboard is there.
// Instructions could also be found under the options. The settings button
// should be found under the options, and then back to the game should be
// filed under the options." Plus, separately: "change the UX so no scroll
// needed", "if you are already signed up the button wouldn't appear", and
// "an option to sign up should be before run and after death."
//
// Three of these are only true at a real viewport, which is why they are
// measured in a browser rather than reasoned about:
//
//   1. NO SCROLL is a pixel fact, not a CSS opinion. His MARTA card is
//      852x1846; at width:100% on a 430px phone it is ~849px tall before the
//      title, note and buttons exist. The check reads the panel's own
//      scrollHeight against its clientHeight — if a single pixel can be
//      scrolled, this fails.
//   2. THE PRE-RUN OFFER MUST NOT EAT A FIRST GAME OR AN INTRO SKIP. Both
//      guards live in main.js; here the offer is proven to fire only for a
//      player who already has a run banked, and to latch afterwards.
//   3. AFTER DEATH is the path that was missing entirely — finishing the
//      whole game asked, being knocked out did not, and being knocked out is
//      how nearly every run ends.
//
//   PLAYWRIGHT=... CHROMIUM=... OUT=... node tools/harness/optionsmenu.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
// Screenshots land in `shots/` unless SEAM_OUT says otherwise. It used to
// default to the repo ROOT, so any run without that variable set dropped
// untracked PNGs beside the source — which on this project is the exact
// shape of the accident the CLAUDE.md guardrail is about (harness output
// riding into a commit unnoticed). `shots/` is already gitignored.
const OUT = process.env.OUT || 'shots';
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// ── 1. the shelf, the board, the instructions ─────────────────────────────
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

await p.evaluate(() => window.__panel.open('menu'));
await p.waitForTimeout(250);
const menu = await p.evaluate(() => ({
  title: document.getElementById('panelTitle').textContent,
  btns: [...document.querySelectorAll('#pvMenu .btn')].map((x) => x.textContent.trim()),
}));
check('OPTIONS is a menu with his four items', menu.title === 'OPTIONS'
  && JSON.stringify(menu.btns)
    === JSON.stringify(['LEADERBOARD', 'HOW TO PLAY', 'SETTINGS', 'BACK TO GAME']),
  JSON.stringify(menu));
await p.screenshot({ path: `${OUT}/ux-menu.png` });

await p.click('#btnMenuBoard');
await p.waitForTimeout(700);
const board = await p.evaluate(() => {
  const panel = document.getElementById('panel');
  const card = document.getElementById('panelCard');
  return {
    scrollable: panel.scrollHeight - panel.clientHeight,
    cardH: Math.round(card.getBoundingClientRect().height),
    viewH: window.innerHeight,
    register: !document.getElementById('btnRegister').hidden,
    rows: [...document.querySelectorAll('#board li')].map((li) => li.textContent),
  };
});
check('the board fits with NO scrolling', board.scrollable <= 1,
  `card ${board.cardH}px in ${board.viewH}px, overflow ${board.scrollable}px`);
// Until the Worker is deployed the only row is the pinned WILL HILL 50,000 —
// nobody's practice runs are dressed up as a ranking.
check('the board is empty until the contest is live', board.rows.length <= 1,
  JSON.stringify(board.rows));
check('an unregistered player is offered the contest', board.register);
await p.screenshot({ path: `${OUT}/ux-board.png` });

await p.click('#btnBoardBack');
await p.waitForTimeout(200);
check('BACK steps up to OPTIONS, not out of the panel',
  await p.evaluate(() => document.getElementById('panelTitle').textContent) === 'OPTIONS');

await p.click('#btnMenuHow');
await p.waitForTimeout(200);
const how = await p.evaluate(() => ({
  t: document.getElementById('panelTitle').textContent,
  n: document.querySelectorAll('#howList li').length,
}));
check('HOW TO PLAY opens with its lessons', how.t === 'HOW TO PLAY' && how.n >= 6,
  JSON.stringify(how));
await p.screenshot({ path: `${OUT}/ux-how.png` });
await p.evaluate(() => window.__panel.close());

// ── 2. the offer before a run — only once a run exists ────────────────────
// A brand-new device must get straight into the game; the offer belongs to
// the player who has already played and now has something to enter.
await p.evaluate(() => { const g = window.__game; g.screenT = g.introAt + 999; });
await p.waitForTimeout(120);
await p.mouse.click(215, 700);
await p.waitForTimeout(400);
const fresh = await p.evaluate(() => ({
  screen: window.__game.screen,
  open: !document.getElementById('panel').hidden,
}));
check('a first-time player is never stopped by the form',
  !fresh.open && fresh.screen !== 'title', JSON.stringify(fresh));

// Bank a run, come back to the title, and the offer is due.
await p.evaluate(() => {
  localStorage.setItem('wh_local_runs', JSON.stringify([{ name: 'X', score: 900, t: 1, me: true }]));
});
await p.evaluate(() => { const g = window.__game; g.screen = 'title'; g.screenT = g.introAt + 999; });
await p.waitForTimeout(150);
await p.mouse.click(215, 700);
await p.waitForTimeout(450);
const offered = await p.evaluate(() => ({
  view: document.getElementById('panelTitle').textContent,
  open: !document.getElementById('panel').hidden,
  asked: localStorage.getItem('wh_signup_asked'),
}));
check('a returning player is offered sign-up before the run',
  offered.open && offered.view === 'ENTER THE CONTEST', JSON.stringify(offered));
check('and the offer is remembered on the device', offered.asked === '1');

// NOT NOW must hand the run back, not strand them on a panel.
await p.click('#btnSkip');
await p.waitForTimeout(500);
check('NOT NOW still starts the run they asked for',
  await p.evaluate(() => window.__game.screen) === 'playing');
await ctx.close();

// ── 3. and after death ────────────────────────────────────────────────────
const c2 = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p2 = await c2.newPage();
p2.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p2.addInitScript(() => { localStorage.setItem('wh_signup_asked', '1'); });
await p2.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p2.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
const dead = await p2.evaluate(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = window.__game;
  window.__startStage(0);
  for (let k = 0; k < 4; k++) await frame();
  g.continues = 0;
  g.score = 4321;
  g.player.y = 99999;                    // off the end of the world
  g.player.vy = 0;
  for (let k = 0; k < 12 && g.screen !== 'gameOver'; k++) await frame();
  g.screenT = 60;                        // past the tap guard
  return g.screen;
});
await p2.mouse.click(215, 500);
await p2.waitForTimeout(500);
const after = await p2.evaluate(() => ({
  open: !document.getElementById('panel').hidden,
  view: document.getElementById('panelTitle').textContent,
}));
check('and after death, when the score is fresh',
  dead === 'gameOver' && after.open && after.view === 'ENTER THE CONTEST',
  JSON.stringify({ dead, ...after }));
await c2.close();

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
