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
// ⚠️ READ FROM tools/cue_sheet.json, NEVER KEPT HERE. This used to be a
// hardcoded table written 08-13; four cues were deliberately re-cut on 08-16
// on the client's own ear ("his ear again", "on his tempo") and the table
// went stale — the harness then reported the client-approved audio as
// MISMATCHED for two days. A verification tool holding its own copy of the
// thing it verifies against verifies nothing (LESSONS: card_overlaps'
// MAX_SEPARATION, sam_coverage's crop table, and now this). The sheet's `dur`
// is stamped from the shipped file when a cut is accepted; a re-cut updates
// the sheet in the same commit or this check fails loudly — which is the
// point: it is a tripwire for a silently swapped or truncated file.
const { readFileSync } = await import('fs');
const sheet = JSON.parse(readFileSync(new URL('../cue_sheet.json', import.meta.url), 'utf8'));
const want = Object.fromEntries(
  Object.entries(sheet.cues).filter(([, c]) => typeof c.dur === 'number')
    .map(([k, c]) => [k, c.dur]));
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
