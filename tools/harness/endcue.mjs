// THE NEXT SCENE'S MUSIC STARTS AT THE FINISH LINE, ON EVERY STAGE.
//
// Two client notes, one rule. First: "as soon as you cross the finish line the
// music for the transition map should already start." Then, once that shipped
// and he heard the end of the game: "the music from the ending scene should
// start sooner."
//
// So the clear card never plays the stage it just ended — it plays whatever
// comes next. Stages 1-4 hand to their map cue, stage 5 hands to the credits,
// and in both cases the tap that leaves the card must change nothing in the
// audio: same cue, no restart, no cross-fade, no seam.
//
// ⚠️ READ THE CUE FOUR FRAMES LATE, NOT ON THE FRAME THE SCREEN FLIPS.
//
// The first version of this file reported stage 4 asking for `stage_04` and I
// nearly went looking for a bug in cueForScreen(). It was the test. update()
// calls `audio.music.play(cueForScreen())` at the TOP, and the playing branch
// that sets `stageClear` runs BELOW it — so on the frame the screen changes,
// the cue that was asked for is still the previous screen's. A poll that exits
// the instant `screen === 'stageClear'` therefore reads one frame stale.
//
// Whether it did was a race between this harness's requestAnimationFrame and
// the game's, which is exactly why stages 1-3 passed and stage 4 failed in the
// same run — the same code, graded differently by timing. Holding four frames
// after the transition removes the race instead of hiding it.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/endcue.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

// What each stage's clear card must ask for: the thing that comes NEXT.
// Stage 4 rides to Buckhead on map_04_05 now; only stage FIVE hands to the
// credits (both new cues are reprises — see src/audio/music.js — but the
// SLOT asked for is what this grades, not the bytes behind it).
const EXPECT = ['map_01_02', 'map_02_03', 'map_03_04', 'map_04_05', 'credits'];

for (let si = 0; si < 5; si++) {
  const r = await p.evaluate(async (idx) => {
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const g = window.__game;
    window.__startStage(idx);
    for (let k = 0; k < 12; k++) await frame();
    const during = window.__audio.music.status().playing;
    // Put him over the line and let update() notice it on its own, rather
    // than setting the screen by hand — the point is that crossing does it.
    g.player.x = (g.level.stage.stageEnd + 2) * 32;
    g.player.vy = 0;
    for (let k = 0; k < 40 && g.screen !== 'stageClear'; k++) await frame();
    const reached = g.screen;
    for (let k = 0; k < 4; k++) await frame();   // see the note at the top
    return { during, reached, cue: window.__audio.music.status().playing };
  }, si);

  check(`stage ${si + 1} plays its own track while running`,
    r.during === `stage_0${si + 1}`, JSON.stringify(r.during));
  check(`stage ${si + 1} clear card asks for ${EXPECT[si]}`,
    r.reached === 'stageClear' && r.cue === EXPECT[si], JSON.stringify(r));
}

// The tap off the last clear card must not disturb the track it is already
// playing. Read the screen immediately before the press so this asserts ONE
// transition — stageClear -> complete — and not whatever came after it.
const fin = await p.evaluate(async () => {
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const g = window.__game;
  for (let k = 0; k < 40; k++) await frame();     // let the credits run a beat
  const before = { screen: g.screen, t: window.__audio.music.status().el.t };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let k = 0; k < 6; k++) await frame();
  const s = window.__audio.music.status();
  return { before, after: g.screen, cue: s.playing, t: s.el ? s.el.t : null };
});
check('the tap goes from the clear card to the results',
  fin.before.screen === 'stageClear' && fin.after === 'complete', JSON.stringify(fin));
check('and the credits cue carries across unchanged',
  fin.cue === 'credits', JSON.stringify(fin.cue));
check('and the track does not restart at the seam',
  fin.t !== null && fin.t >= fin.before.t - 0.05, `t ${fin.before.t} -> ${fin.t}`);

console.log('');
console.log(checks.every(([, o]) => o)
  ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, o]) => !o).map(([w]) => w).join(', '));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
