// CHANGING A SETTING DOES NOT RESTART THE GAME.
//
// Client: "setting the time and settings shouldn't restart the whole damn game
// man, it shouldn't reset everything, it shouldn't stop the music. Nothing, no
// changes or edits in the game should restart the whole game."
//
// He is describing `location.reload()`, which is what TIME OF DAY used to do.
// The comment defending it argued that re-resolving eight plates, ~60
// multiplane cards, the sky, the lighting rig and the rain live was a lot of
// machinery for one setting — all true, and all beside the point, because a
// reload stops the music, drops the audio graph the player had to gesture to
// unlock, and blinks the screen.
//
// ⚠️ THE OLD HARNESS COULD NOT SEE ANY OF THIS. `relaytod` flips the setting by
// writing localStorage and calling page.reload() itself, so it passes whether
// the app reloads or not — it never touches the real control. That is why this
// file exists and why it drives `#sTod` exactly the way a thumb does.
//
//   1-3.  Before: the title cue is audible off the MASTER BUS, and the page is
//         stamped with a marker that only a reload can remove.
//   4-7.  Flip the real select. The stage objects actually change half, the
//         marker SURVIVES, the panel is still open on the same pane, and the
//         cue's own playhead only moves FORWARD — a restart would send it to
//         zero, so that is the direct test of "it shouldn't stop the music".
//   8.    No dropout across the switch, sampled every frame. Measured as the
//         longest run of SILENT frames rather than a bare minimum: the title
//         cue has quiet bars, so a low sample means nothing, while music
//         stopping is hundreds of consecutive zeroes. Graded against this same
//         track's behaviour when nothing is happening.
//   9-10. The new half is real: a run started afterwards is in it, and its
//         plates are genuinely loaded rather than silently missing.
//   11.   ⚠️ THE MARKER CHECK CAN FAIL, proven by reloading on purpose.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/todlive.mjs
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
// ⚠️ NO ?tod= FLAG. The URL override beats the stored setting by design, so a
// harness that boots with ?tod=night is testing a page where the select cannot
// win — which is exactly how this file first reported the swap as broken when
// it was working. The setting is the thing under test, so the setting is the
// only thing that may decide.
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  try { localStorage.setItem('wh_sound', 'on'); localStorage.setItem('wh_tod', 'night'); } catch (e) { /* */ }
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.evaluate(() => window.__audio.level());     // builds the analyser
await p.waitForFunction(() => {
  const s = window.__audio.music.status();
  return s.playing === 'title' && s.el && !s.el.paused && window.__audio.level() > 0.01;
}, null, { timeout: 30000 });

// A DROPOUT IS A RUN OF SILENT FRAMES, NOT A LOW ONE. The title cue has quiet
// bars in it, so a bare minimum reads 0.004 in an untouched 11 seconds and
// means nothing. Music STOPPING looks completely different: hundreds of
// consecutive frames at zero. So the measurement is the longest silent RUN,
// and it is taken against this track's own behaviour when nothing is happening.
const SILENT = 0.002;
const runProbe = `(async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const rms = [];
  for (let i = 0; i < 300; i++) { rms.push(window.__audio.level()); await raf(); }
  return rms;
})()`;
const longestSilence = (rms, thr) => {
  let run = 0, worst = 0;
  for (const v of rms) { run = v < thr ? run + 1 : 0; if (run > worst) worst = run; }
  return worst;
};
const baseRms = await p.evaluate(runProbe);
const baseSilence = longestSilence(baseRms, SILENT);

const before = await p.evaluate(() => {
  // A reload wipes the marker. Nothing else in the app touches it.
  window.__aliveMarker = 'still here';
  return { tod: window.__tod, level: window.__audio.level(),
    t: window.__audio.music.status().el.t };
});
check('the title cue is audible before the switch', before.level > 0.01, `bus ${before.level.toFixed(3)}`);
check('the game starts on the night half', before.tod === 'night', `tod=${before.tod}`);
await p.evaluate(() => window.__panel.open('settings'));
check('OPTIONS is open on the settings pane', await p.evaluate(() => window.__panel.isOpen));

// ── flip it the way a thumb does, and watch the bus the whole way ────────
const during = await p.evaluate(async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const el = document.getElementById('sTod');
  el.value = 'day';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  const rms = [];
  // Long enough to cover the plate fetch on a cold cache and the swap after it.
  for (let i = 0; i < 600 && window.__tod !== 'day'; i++) {
    rms.push(window.__audio.level());
    await raf();
  }
  for (let i = 0; i < 60; i++) { rms.push(window.__audio.level()); await raf(); }
  return {
    tod: window.__tod,
    marker: window.__aliveMarker || null,
    open: window.__panel.isOpen,
    // The cue's own playhead. A restart sends this back to zero; a reload
    // would too. It only ever moves forward if the same element kept playing.
    t: window.__audio.music.status().el.t,
    playing: window.__audio.music.status().playing,
    note: document.getElementById('todNote').textContent,
    rms,
  };
});
const swapSilence = longestSilence(during.rms, SILENT);
check('the stage objects really changed half', during.tod === 'day', `tod=${during.tod}`);
check('NOTHING RELOADED — the page marker survived the switch',
  during.marker === 'still here', `marker=${during.marker}`);
check('the panel is still open, on the same pane', during.open);
check('the same cue kept playing — its playhead only moved forward',
  during.playing === 'title' && during.t > before.t,
  `title t ${before.t.toFixed(2)} -> ${during.t.toFixed(2)}`);
check('THE MUSIC NEVER STOPS across the switch',
  swapSilence <= baseSilence + 3,
  `longest silent run ${swapSilence} frames over ${during.rms.length}, `
  + `against ${baseSilence} when nothing is happening`);
check('and the note goes back to describing the setting, not "Switching…"',
  !/Switching/.test(during.note), JSON.stringify(during.note.slice(0, 46)));

// ── the new half is real, not just a label ───────────────────────────────
const run = await p.evaluate(async () => {
  window.__startStage(0);
  await new Promise((r) => requestAnimationFrame(r));
  const st = window.__game;
  const id = st.level.stage.id;
  return { tod: st.level.stage.tod, screen: st.screen, plate: !!window.__images[id], id };
});
check('a run started afterwards is in the new half',
  run.tod === 'day' && run.screen === 'playing', JSON.stringify(run));
check('and its plate is actually loaded, not silently missing', run.plate, run.id);

// ── ⚠️ it can fail: reload on purpose and the marker must be gone ─────────
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game, null, { timeout: 25000 });
const gone = await p.evaluate(() => window.__aliveMarker || null);
check('BREAK-TEST — a real reload DOES clear the marker, so the check has teeth',
  gone === null, `marker after reload=${gone}`);

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `\nFAILED: ${bad.length} of ${checks.length}` : `\nALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
