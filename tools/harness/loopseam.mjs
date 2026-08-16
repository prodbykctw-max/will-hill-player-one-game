// THE LOOP SEAM IS CROSSED, NOT WRAPPED — and the sound never drops.
//
// Client: "the songs need to be longer or we need to find better loop
// points." The points were already chosen by cross-correlation; what
// remained was the wrap itself — `loop = true` on an MP3 flicks at the seam
// (encoder priming samples plus element wrap latency). music.js now laps a
// looping cue across two elements: LAP seconds before the end the spare
// starts at zero, the pair cross, and they swap roles at the seam.
//
// Graded the only way this project grades audio — off the MASTER BUS
// (audio.level(), the RMS of samples actually reaching the destination),
// never off element flags. See tools/harness/musicbox.mjs for why: an
// element reported "playing" for weeks while the game was silent.
//
//   1. Sound on, title cue audible, graph adopted.
//   2. Seek to LAP+2s before the end, sample the bus every frame across the
//      seam: the lap must ENGAGE (laps counter), the bus must never drop to
//      silence, and afterwards exactly one element carries the cue at its
//      intended gain.
//   3. ⚠️ THE CHECK CAN FAIL, provably: run the same window with
//      window.__lapOff (the bare native loop). The lap must NOT engage there
//      — which pins the continuity above on the mechanism, not on luck. The
//      native wrap's dip is REPORTED for the record but not gated: Chrome
//      pads the gap well enough that RMS alone cannot always see the click.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/loopseam.mjs
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

async function crossTheSeam(lapOff) {
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.evaluate(() => { try { localStorage.setItem('wh_sound', 'on'); } catch (e) { /* */ } });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  if (lapOff) await p.evaluate(() => { window.__lapOff = true; });
  // The graph must be genuinely live before anything is measured: gain-node
  // level present and the bus actually moving.
  await p.evaluate(() => window.__audio.level());   // builds the analyser; first read is always 0
  await p.waitForFunction(() => {
    const s = window.__audio.music.status();
    return s.playing === 'title' && s.el && !s.el.paused && s.el.dur > 0 && window.__audio.level() > 0.01;
  }, null, { timeout: 30000 });

  const r = await p.evaluate(async () => {
    const raf = () => new Promise((res) => requestAnimationFrame(res));
    const m = window.__audio.music;
    const dur = m.status().el.dur;
    m.seek(dur - 3);
    const rms = [];
    let laps0 = m.status().lap.laps;
    let wrapped = false;
    let wrapFrame = -1;
    // ~7s at display rate: 3s run-in, the seam, and the settle after it.
    for (let i = 0; i < 420; i++) {
      rms.push(window.__audio.level());
      const el = m.status().el;
      if (el && el.t < dur - 4 && !wrapped) { wrapped = true; wrapFrame = i; }
      await raf();
    }
    const s = m.status();
    // ⚠️ WINDOWED PEAKS, NEVER SINGLE SAMPLES. audio.level() is an
    // instantaneous RMS of a waveform — a sample can land on a zero
    // crossing, and the first cut of this file gated on the raw minimum and
    // failed on a working lap (min 0.0057 against a 0.045 median, with the
    // music playing cleanly the whole way). musicbox.mjs's header warns of
    // exactly this. A real dropout is ~100ms+ of nothing, so the statistic
    // is the PEAK of each ~200ms window, and the floor is the worst window.
    const W = 12;
    const peaks = [];
    for (let i = 0; i + W <= rms.length; i += W) {
      peaks.push(Math.max(...rms.slice(i, i + W)));
    }
    const sorted = [...peaks].sort((a, b) => a - b);
    let minIdx = 0;
    for (let i = 1; i < peaks.length; i++) if (peaks[i] < peaks[minIdx]) minIdx = i;
    return {
      dur,
      laps: s.lap.laps - laps0,
      lapActive: s.lap.active,
      wrapped,
      wrapFrame,
      level: s.el ? s.el.level : 0,
      t: s.el ? s.el.t : -1,
      min: +sorted[0].toFixed(4),
      minFrame: minIdx * W,
      p05: +sorted[Math.floor(sorted.length * 0.05)].toFixed(4),
      median: +sorted[Math.floor(sorted.length / 2)].toFixed(4),
      peaks: peaks.map((x) => +x.toFixed(3)),
    };
  });
  await p.close();
  return r;
}

// ── the lap, live ──────────────────────────────────────────────────────────
const on = await crossTheSeam(false);
const { peaks: onPeaks, ...onSummary } = on;
console.log('  with the lap   ', JSON.stringify(onSummary));
console.log('  windows        ', onPeaks.join(' '));
check('the seam is crossed by a lap, not a wrap', on.laps >= 1 && !on.lapActive,
  `laps=${on.laps} active=${on.lapActive}`);
check('the cue is back near its start afterwards', on.t > 0 && on.t < 8, `t=${on.t}`);
// ⚠️ JUDGE THE SEAM'S OWN NEIGHBOURHOOD, NOT THE WHOLE SONG. The first two
// cuts of this gate compared the global floor to the median and failed on a
// working lap — because the MUSIC ITSELF swings 0.034-0.464 across this
// window (instrumented: the wrap landed at frame 202 with windows 0.405 /
// 0.177 / 0.152 around it, and the "failing" 0.034 sat at frame 264, a
// second into the song's own quiet beat). The lap's claim is only that the
// SEAM adds no dropout, so the gate is the seam's ±1 windows against the
// same threshold. The cuts are hook-into-hook by construction, so quiet
// music at the seam would itself be a regression worth failing on.
const W = 12;
const seamWin = Math.max(1, Math.floor(on.wrapFrame / W));
const local = on.peaks.slice(seamWin - 1, seamWin + 2);
check('THE SEAM ITSELF NEVER DIPS (wrap ±200ms windows)',
  local.length === 3 && Math.min(...local) > Math.max(0.02, on.median * 0.25),
  `seam windows [${local.join(', ')}] vs median ${on.median}`);
check('one element carries the cue at its intended gain after the swap',
  on.level > 0.3, `level=${on.level}`);

// ── the same window with the lap off — the check must be able to fail ─────
const off = await crossTheSeam(true);
console.log('  native loop    ', JSON.stringify(off));
check('with __lapOff the lap does NOT engage (native wrap only)',
  off.laps === 0 && off.wrapped, `laps=${off.laps} wrapped=${off.wrapped}`);
console.log(`  for the record: native-wrap bus floor min=${off.min} p05=${off.p05} vs lap ${on.min}/${on.p05}`);

console.log('');
console.log(checks.every(([, o]) => o) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, o]) => !o).map(([w]) => w).join(', '));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
