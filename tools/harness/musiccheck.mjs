// DOES EACH SCREEN PLAY THE CUE THE SHEET SAYS, AND DOES IT CROSS-FADE?
//
// Two traps, both hit on the first attempt:
//  - The unlock gesture must not be a tap on the title card. The lower half of
//    that screen opens OPTIONS, and every later click then lands on the panel.
//    A key the game does not bind unlocks audio without touching the game.
//  - The cues are `new Audio()`, never appended to the document, so
//    querySelectorAll('audio') returns nothing. Read audio.music.status().
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'] });
const c = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await c.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

await p.keyboard.press('ShiftLeft');          // unlocks audio, binds to nothing
await p.waitForTimeout(1200);

const snap = () => p.evaluate(() => ({
  screen: window.__game.screen, ...window.__audio.music.status(),
}));
const show = async (label) => {
  const s = await snap();
  const e = s.el;
  console.log(`${label.padEnd(20)} screen=${String(s.screen).padEnd(11)} cue=${String(s.playing).padEnd(10)} `
    + (e ? `t=${String(e.t).padEnd(6)} lvl=${String(e.level).padEnd(6)} dur=${e.dur} ready=${e.ready}`
         : 'element=none'));
  return s;
};

const s0 = await snap();
console.log(`wired ${s0.wired.length}/10, missing: ${s0.missing.length ? s0.missing.join(',') : 'none'}\n`);
await show('boot -> title');

// The handoff he asked about: title fades out as stage one comes up.
console.log('\nPRESS START, watching the cross-fade:');
await p.touchscreen.tap(215, 330);            // upper half = start, not OPTIONS
const t0 = Date.now();
for (let i = 0; i < 9; i++) {
  const s = await snap();
  console.log(`  +${String(Date.now() - t0).padStart(4)}ms  `
    + s.live.map((l) => `${l.slot} ${l.level.toFixed(2)}`).join('  |  ') || '  (silence)');
  await p.waitForTimeout(160);
}
await show('\nafter START');

await p.keyboard.press('Escape'); await p.waitForTimeout(1500); await show('paused');
await p.keyboard.press('Escape'); await p.waitForTimeout(1500); await show('resumed');

// Set the screens the game sets, rather than trying to play to them. `riding`
// needs rideFrom/rideTo or the MARTA renderer throws and freezes the loop,
// which is how an earlier harness ended up reading stale cues for a minute.
await p.evaluate(() => { const g = window.__game; g.screen = 'stageClear'; g.screenT = 0; });
await p.waitForTimeout(1500); await show('stage clear');
await p.evaluate(() => { const g = window.__game;
  g.rideFrom = 'eav'; g.rideTo = 1; g.screen = 'riding'; g.screenT = 0; });
await p.waitForTimeout(1500); await show('riding');
await p.evaluate(() => window.__startStage(1));
await p.waitForTimeout(1500); await show('stage 2');
await p.evaluate(() => { const g = window.__game; g.screen = 'complete'; g.screenT = 0; });
await p.waitForTimeout(1500); await show('complete');
await p.evaluate(() => { const g = window.__game; g.screen = 'gameOver'; g.screenT = 0; });
await p.waitForTimeout(1500); await show('game knocked');

// Every cue, checked for a real decoded duration against what was cut.
console.log('\nevery slot, loaded and measured:');
const want = { title: 86.0, stage_01: 96.0, map_01_02: 44.4, stage_02: 99.0, map_02_03: 46.9,
               stage_03: 102.4, map_03_04: 47.7, stage_04: 98.3, ui_pause: 78.4, credits: 41.4 };
const durs = await p.evaluate(async () => {
  // Load each file on its OWN element, outside the game's player, so the loop
  // re-stating the current cue cannot overwrite what is being measured.
  const srcs = window.__audio.music.status().srcs;
  const out = {};
  await Promise.all(Object.entries(srcs).map(([slot, src]) => new Promise((res) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => { out[slot] = +a.duration.toFixed(2); res(); });
    a.addEventListener('error', () => { out[slot] = 'ERR ' + (a.error && a.error.code); res(); });
    a.src = src;
    setTimeout(res, 8000);
  })));
  return out;
});
let bad = 0;
for (const slot of Object.keys(want)) {
  const d = durs[slot];
  const ok = typeof d === 'number' && Math.abs(d - want[slot]) < 1.0;
  if (!ok) bad++;
  console.log(`  ${slot.padEnd(10)} dur ${String(d).padEnd(7)} (cut ${want[slot]})  ${ok ? 'OK' : 'MISMATCH'}`);
}
console.log(`  ${bad ? bad + ' MISMATCHED' : 'all ten match the cut plan'}`);
console.log('\n' + (errs.length ? errs.join('\n') : 'no errors thrown'));
await b.close();
