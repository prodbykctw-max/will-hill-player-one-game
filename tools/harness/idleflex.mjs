// THE SECOND IDLE — the money count — tested before the art exists.
//
// The clip itself needs an AutoSprite sheet and AutoSprite is refusing calls
// for want of an API key, so what can be proven today is everything EXCEPT the
// pixels: that standing still long enough switches him to it, that any input
// puts him back on the plain idle immediately, and — the part worth a harness —
// that with the clip ABSENT the game behaves exactly as it did before, with no
// stutter in the breathing idle from an anim key changing under it.
//
// The stand-in is injected into the live atlas, so this drives the real
// `stepPlayer` gate rather than a copy of its logic. `HAS_FLEX` is read at
// module load, though, so the injection has to happen before player.js is
// evaluated — which is why the clip goes in through a query flag the page
// reads rather than being poked in afterwards.
//
//   PLAYWRIGHT=... node tools/harness/idleflex.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const page = async () => {
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/?tod=night&relay=1', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.touchscreen.tap(215, 466);                       // the front door
  await p.waitForFunction(() => window.__game.introTapped, null, { timeout: 10000 });
  await p.waitForTimeout(2600);
  await p.evaluate(() => window.__startStage(0));
  await p.waitForFunction(() => window.__game.screen === 'playing', null, { timeout: 15000 });
  return p;
};

// Stand him still for N ticks of real time and report what he is playing.
const stand = (p, ms) => p.evaluate(async (t) => {
  const g = window.__game;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, t));
  return { anim: g.player.anim, idleT: g.player.idleT, frame: g.player.frame };
}, ms);

// ── 1. With the clip ABSENT — today's shipping build ─────────────────────
console.log('\n=== CLIP ABSENT (what ships until the sheet lands) ===');
const p1 = await page();
// Read it through player.js's own export, which is the exact object the gate
// looked at. Importing the .json directly does not work — Vite serves it as a
// transformed module and a bare dynamic import of the path 404s.
const has = await p1.evaluate(async () =>
  !!(await import('/src/entities/player.js')).PLAYER_SPRITE.atlas.animations.idleFlex);
check('the atlas has no idleFlex yet', !has);
const a1 = await stand(p1, 1200);
const a2 = await stand(p1, 3600);
console.log(`    after 1.2s: ${JSON.stringify(a1)}`);
console.log(`    after 4.8s: ${JSON.stringify(a2)}`);
check('he stays on the plain idle past the trigger', a2.anim === 'idle',
  `idleT ${a2.idleT} (trigger is 200)`);
check('the idle counter is running, so only the gate is holding it',
  a2.idleT > 200, `idleT ${a2.idleT}`);

// THE STUTTER TEST. Without the HAS_FLEX gate, `anim` would flip to a clip the
// sheet lacks; resolveClip draws the right thing but advanceAnim resets animT
// on every change of key, so the breathing idle would snap to frame 0 every
// few seconds forever. Watch the frame for two full trigger windows and make
// sure it only ever wraps at the end of the cycle.
const frames = await p1.evaluate(async () => {
  const g = window.__game; const out = [];
  g.player.vx = 0;
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    out.push(g.player.frame);
  }
  return out;
});
const total = await p1.evaluate(async () =>
  (await import('/src/entities/player.js')).PLAYER_SPRITE.atlas.animations.idle.frameCount);
let backwards = 0;
for (let i = 1; i < frames.length; i++) {
  if (frames[i] < frames[i - 1] && frames[i - 1] !== total - 1) backwards++;
}
check('the idle never snaps back mid-cycle', backwards === 0,
  `${backwards} early resets over ${frames.length} frames of ${total}`);

// ── 2. With a stand-in clip PRESENT — what happens when the art lands ────
console.log('\n=== CLIP PRESENT (a stand-in, to drive the real gate) ===');
const p2 = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p2.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
// Patch the atlas module BEFORE player.js imports it. Vite serves the JSON as
// a module, so intercepting the request is the only way in ahead of the read.
// Read the atlas off DISK and serve our own module. Parsing what Vite returns
// does not work: it emits named exports plus a default that references them
// (`export default { frameSize: frameSize, ... }`), which is valid JS and not
// valid JSON, so JSON.parse dies on the first unquoted key.
const { readFileSync } = await import('fs');
const atlasSrc = JSON.parse(readFileSync('src/assets/sprites/will-hill.atlas.json', 'utf8'));
// Same shape as any other clip, pointed at the idle's own frames — the point
// here is the SWITCH, not the pixels.
atlasSrc.animations.idleFlex = { ...atlasSrc.animations.idle, loop: true, ticks: 5 };
await p2.route('**/will-hill.atlas.json*', (route) => route.fulfill({
  body: `export default ${JSON.stringify(atlasSrc)}`,
  headers: { 'content-type': 'application/javascript' },
}));
await p2.goto('http://localhost:5199/?tod=night&relay=1', { waitUntil: 'networkidle' });
await p2.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p2.touchscreen.tap(215, 466);
await p2.waitForFunction(() => window.__game.introTapped, null, { timeout: 10000 });
await p2.waitForTimeout(2600);
await p2.evaluate(() => window.__startStage(0));
await p2.waitForFunction(() => window.__game.screen === 'playing', null, { timeout: 15000 });

const b1 = await stand(p2, 1200);
const b2 = await stand(p2, 3600);
console.log(`    after 1.2s: ${JSON.stringify(b1)}`);
console.log(`    after 4.8s: ${JSON.stringify(b2)}`);
check('short pause is still the plain idle', b1.anim === 'idle', `idleT ${b1.idleT}`);
check('standing past 200 ticks starts the count', b2.anim === 'idleFlex', `idleT ${b2.idleT}`);

// One step and he is back to business. The check is that the COUNTER RESET,
// not that it reads exactly zero: `vx` decays below the walk threshold within a
// couple of ticks, so by the time this reads back he is already on the plain
// idle with the counter started again from scratch. Coming back 264 -> 1 is the
// reset; coming back 264 -> 265 would be the bug.
const moved = await p2.evaluate(async () => {
  const g = window.__game;
  const before = g.player.idleT;
  g.player.vx = 3;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { before, anim: g.player.anim, idleT: g.player.idleT };
});
check('moving drops the flex and zeroes the wait',
  moved.anim !== 'idleFlex' && moved.idleT < 5 && moved.before > 200,
  JSON.stringify(moved));
const again = await stand(p2, 900);
check('and the wait starts over, not where it left off', again.anim === 'idle',
  `idleT ${again.idleT}`);

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
