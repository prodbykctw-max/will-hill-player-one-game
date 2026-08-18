// DO THE BETWEEN-SCREENS HAVE A BUTTON, AND IS IT THE ONLY WAY ON?
//
// PM, watching someone play: "let's add a score here. So people can see how
// much they have before entering a new level", and "we're really not pressing
// jump to continue, we're just tapping the screen to continue so should we
// just add a next stage button?"
//
// Both were true. advanceFromScreen() has always been reachable two ways —
// confirmPressed() in update() and a tap on any pixel in the pointer handler —
// so the card's "press JUMP to continue" named the input nobody used, and
// neither input had anything on screen that looked pressable.
//
// STAGE CLEAR and GAME KNOCKED now draw real buttons, pause-menu styled, and
// tap-anywhere is gone. The ending keeps HIS painted PRESS START TO CONTINUE
// as its target, because drawing an amber plate over his artwork is the exact
// thing every cabinet control avoids.
//
// ⚠️ WHAT THIS FILE IS REALLY FOR IS THE ABSENCE. Adding a button is visible
// the first time you look at it. Removing tap-anywhere is invisible until a
// screen has no reachable button at all and the game is a dead end — so the
// off-button tap is checked on every screen, and so is the ending's rect.
//
//   PLAYWRIGHT=... CHROMIUM=... BASE=... node tools/harness/betweenscreens.mjs
import { startFromTitle } from './startchain.mjs';

const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
  null, { timeout: 25000 });
await p.waitForTimeout(3000);
const reached = await startFromTitle(p);
check('a run is going', reached === 'playing', reached);

// Park on a between-screen. `screenT` past the arming delay unless told
// otherwise — the delay itself gets its own check below.
const park = async (screen, extra = {}) => {
  await p.evaluate(([s, x]) => {
    const g = window.__game;
    Object.assign(g, x);
    g.screen = s;
    g.screenT = 999;
  }, [screen, extra]);
  await p.waitForTimeout(260);
};
const buttons = () => p.evaluate(() =>
  (window.__screenButtons || []).map((x) => ({
    label: x.label, x: x.x, y: x.y, w: x.w, h: x.h })));
const screen = () => p.evaluate(() => window.__game.screen);

// ── STAGE CLEAR ─────────────────────────────────────────────────────────
console.log('\nSTAGE CLEAR');
await park('stageClear');
let bs = await buttons();
check('one button, and it says what it does',
  bs.length === 1 && bs[0].label === 'NEXT STAGE',
  bs.map((x) => x.label).join(' | '));

// THE SCORE IS ON THE CARD, measured rather than assumed. Two frames of the
// same screen with different scores: if the number is drawn, they differ, and
// they differ ABOVE the button. Decoding happens in the page — no image
// library in this repo's toolchain and the browser already has one.
const frameAt = async (score) => {
  await p.evaluate((s) => { window.__game.score = s; }, score);
  await p.waitForTimeout(120);
  return (await p.screenshot()).toString('base64');
};
const a1 = await frameAt(0);
const a2 = await frameAt(987654);
const band = await p.evaluate(async ([x, y]) => {
  const load = (bytes) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = rej;
    im.src = 'data:image/png;base64,' + bytes;
  });
  const grid = async (bytes) => {
    const im = await load(bytes);
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const g = cv.getContext('2d');
    g.drawImage(im, 0, 0);
    return { w: cv.width, h: cv.height,
      d: g.getImageData(0, 0, cv.width, cv.height).data };
  };
  const A = await grid(x); const B = await grid(y);
  const btnTop = (window.__screenButtons[0].y) * (A.w / innerWidth);
  let above = 0; let below = 0;
  for (let i = 0; i < A.d.length; i += 4) {
    if (Math.abs(A.d[i] - B.d[i]) > 12) {
      (Math.floor((i / 4) / A.w) < btnTop ? above++ : below++);
    }
  }
  return { above, below };
}, [a1, a2]);
check('the score is drawn on the card', band.above > 40,
  `${band.above}px changed above the button, ${band.below} below`);

// ── A TAP OFF A BUTTON DOES NOTHING. This is the regression the change is. ─
const away = await p.evaluate(() => {
  const bs = window.__screenButtons;
  // Well clear of every rect, and not on the pause chip either.
  const top = Math.min(...bs.map((r) => r.y));
  return { x: 30, y: Math.max(120, top - 90) };
});
await p.mouse.click(away.x, away.y);
await p.waitForTimeout(400);
check('a tap off the button does nothing', await screen() === 'stageClear',
  `tapped ${away.x},${away.y} -> ${await screen()}`);

// ── the arming delay still holds ────────────────────────────────────────
await p.evaluate(() => { window.__game.screenT = 3; });
bs = await buttons();
await p.mouse.click(bs[0].x + bs[0].w / 2, bs[0].y + bs[0].h / 2);
await p.waitForTimeout(300);
check('the button is dead for the first 20 ticks',
  await screen() === 'stageClear', await screen());

// ── and pressing it advances ────────────────────────────────────────────
await p.evaluate(() => { window.__game.screenT = 999; });
await p.mouse.click(bs[0].x + bs[0].w / 2, bs[0].y + bs[0].h / 2);
await p.waitForTimeout(500);
check('NEXT STAGE rides to the next neighbourhood',
  await screen() === 'riding', await screen());

// ── GAME KNOCKED, with a continue ───────────────────────────────────────
console.log('\nGAME KNOCKED');
await park('gameOver', { continues: 1 });
bs = await buttons();
check('two buttons when there is a continue to spend',
  bs.length === 2 && bs[0].label === 'GET BACK UP' && bs[1].label === 'END RUN',
  bs.map((x) => x.label).join(' | '));
// ⚠️ THE POINT OF THE SECOND BUTTON. JUMP used to spend the continue with no
// way to decline, and the prompt carried the whole distinction in a line of
// text a player could misread — and lose a run to.
await p.mouse.click(bs[1].x + bs[1].w / 2, bs[1].y + bs[1].h / 2);
await p.waitForTimeout(700);
const ended = await p.evaluate(() => ({
  screen: window.__game.screen,
  open: !document.getElementById('panel').hidden,
  continues: window.__game.continues,
}));
check('END RUN keeps the continue and opens the results',
  ended.open && ended.continues === 1, JSON.stringify(ended));

await p.evaluate(() => window.__panel.close());
await p.waitForTimeout(300);
await park('gameOver', { continues: 2 });
bs = await buttons();
await p.mouse.click(bs[0].x + bs[0].w / 2, bs[0].y + bs[0].h / 2);
await p.waitForTimeout(900);
const back = await p.evaluate(() => ({
  screen: window.__game.screen, continues: window.__game.continues,
  hearts: window.__game.hearts,
}));
check('GET BACK UP spends one and restarts the stage',
  back.continues === 1 && back.hearts === 3 && back.screen === 'playing',
  JSON.stringify(back));

// ── GAME KNOCKED, out of continues ──────────────────────────────────────
await park('gameOver', { continues: 0 });
bs = await buttons();
check('one button when there is nothing left to spend',
  bs.length === 1 && bs[0].label === 'SEE YOUR SCORE',
  bs.map((x) => x.label).join(' | '));

// ── KEYBOARD PARITY. Space presses the FIRST button, so the two paths ────
// cannot disagree about what a screen does.
await park('stageClear');
// ⚠️ HOLD IT, DO NOT PRESS IT. `jump()` is LEVEL-triggered — it reads
// `isDown('Space')` once per frame — so Playwright's ~10ms press can land
// entirely between two rAF ticks and never be sampled. This check passed and
// then failed on an identical build, which is the signature of a harness race
// and not of a product bug. Holding across several frames removes the race.
await p.keyboard.down('Space');
await p.waitForTimeout(200);
await p.keyboard.up('Space');
await p.waitForTimeout(500);
check('Space still presses the primary button',
  await screen() === 'riding', await screen());

// ── THE ENDING: HIS PLATE, HIS BUTTON, AND THE BOARD ON TOP OF IT ───────
//
// Client: "die or win? Ending scene then Leaderboard and registration." So on
// a win the ending plays, the board arrives over it ON ITS OWN, and dismissing
// the board reveals his painting again with RESTART on it. Three things have
// to hold and none of them is visible from a single screenshot: the board must
// arrive, it must arrive ONCE, and what is underneath must still be reachable.
console.log('\nTHE ENDING');
const toEnding = async (hold) => {
  await p.evaluate((h) => {
    const g = window.__game;
    for (let i = 0; i < 12; i++) g.runLog.record('bag');
    for (let i = 0; i < 9; i++) g.runLog.record('stomp');
    g.score = 31200; g.distanceM = 1487;
    g.finalLog = g.runLog.finish();
    g.resultsShown = h;              // true = hold the board off
    g.screen = 'complete';
    g.screenT = 999;
  }, hold);
  await p.waitForTimeout(700);
};
await toEnding(true);
bs = await buttons();
check('the ending has exactly one target and it is his painted RESTART',
  bs.length === 1 && bs[0].label === 'RESTART',
  bs.map((x) => x.label).join(' | '));
check('and it is on screen, not off the edge of the painting',
  bs.length === 1 && bs[0].x >= 0 && bs[0].y >= 0
    && bs[0].x + bs[0].w <= 430 && bs[0].y + bs[0].h <= 932,
  JSON.stringify(bs[0]));
await p.mouse.click(20, 60);
await p.waitForTimeout(400);
check('a tap off it does nothing on the ending too',
  await screen() === 'complete', await screen());

// THE EIGHT VALUES ARE DRAWN, and they are the run's.
//
// ⚠️ AGAINST A NOISE FLOOR, because this screen is never still. His RESTART
// plate is throbbing under pulsePrompt, so ANY two frames differ by thousands
// of pixels and a plain "did anything change" test passes whatever the stats
// do. The control is two frames at the SAME score: whatever changes between
// those is the pulse, and the score's own contribution is what beats it.
const endFrame = async (score) => {
  await p.evaluate((sc) => { window.__game.score = sc; }, score);
  await p.waitForTimeout(140);
  return (await p.screenshot()).toString('base64');
};
const diffIn = (a, c) => p.evaluate(async ([x, y]) => {
  const load = (bytes) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej;
    im.src = 'data:image/png;base64,' + bytes;
  });
  const grid = async (bytes) => {
    const im = await load(bytes);
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    return { w: cv.width, h: cv.height,
      d: g.getImageData(0, 0, cv.width, cv.height).data };
  };
  const A = await grid(x); const B = await grid(y);
  // ⚠️ MAP IT PROPERLY. The first version multiplied and divided by the same
  // device-pixel ratio — which cancels — then compared a device-pixel y to a
  // plate-pixel one, and reported zero changed pixels inside the block while
  // the numbers were plainly on screen. The plate covers the full WIDTH, so
  // its scale is screenshot width over plate width and its vertical offset is
  // what is left over, halved.
  const S = A.w / 853;
  const oy = (A.h - 1843 * S) / 2;
  const X0 = 500 * S; const X1 = 800 * S;
  const Y0 = oy + 450 * S; const Y1 = oy + 730 * S;
  let n = 0;
  for (let i = 0; i < A.d.length; i += 4) {
    if (Math.abs(A.d[i] - B.d[i]) < 14) continue;
    const px = (i / 4) % A.w; const py = Math.floor((i / 4) / A.w);
    if (px >= X0 && px <= X1 && py >= Y0 && py <= Y1) n++;
  }
  return n;
}, [a, c]);

const same1 = await endFrame(31200);
const same2 = await endFrame(31200);
const floor = await diffIn(same1, same2);          // the pulse alone
const other = await endFrame(7);
const signal = await diffIn(same2, other);         // the pulse plus the score
check("the run's own numbers are drawn, inside his stat block",
  signal > floor * 3 + 20, `changed ${signal}px against a ${floor}px noise floor`);

// ── the board arrives on its own, once ──────────────────────────────────
await toEnding(false);
await p.evaluate(() => { window.__game.screenT = 200; });
await p.waitForTimeout(900);
check('the board arrives over the ending without a tap',
  await p.evaluate(() => !document.getElementById('panel').hidden));
check('and the ending is still what is underneath',
  await screen() === 'complete', await screen());

// Dismiss the whole chain and his painting must come back — not the title,
// and above all not a dead screen.
for (const id of ['btnSkip', 'btnBack']) {
  const shown = await p.evaluate((i) => {
    const el = document.getElementById(i);
    return !!(el && el.offsetParent);
  }, id);
  if (shown) { await p.evaluate((i) => document.getElementById(i).click(), id); }
  await p.waitForTimeout(500);
}
await p.evaluate(() => { if (window.__panel.isOpen) window.__panel.close(); });
await p.waitForTimeout(600);
const back2 = await p.evaluate(() => ({
  screen: window.__game.screen,
  open: !document.getElementById('panel').hidden,
  btn: (window.__screenButtons || [])[0]?.label,
}));
check('dismissing it lands back on the ending with RESTART',
  back2.screen === 'complete' && !back2.open && back2.btn === 'RESTART',
  JSON.stringify(back2));

// ⚠️ AND IT MUST NOT COME BACK. The board is offered once per run; a latch
// that failed would reopen it on the very next frame and RESTART could never
// be pressed.
await p.waitForTimeout(900);
check('and it does not re-open itself',
  await p.evaluate(() => document.getElementById('panel').hidden));

bs = await buttons();
await p.mouse.click(bs[0].x + bs[0].w / 2, bs[0].y + bs[0].h / 2);
await p.waitForTimeout(1400);
check('RESTART starts a fresh run', await screen() === 'playing', await screen());

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - bad.length}/${checks.length} passed`);
if (bad.length) { for (const [w] of bad) console.log('  FAILED: ' + w); process.exit(1); }
