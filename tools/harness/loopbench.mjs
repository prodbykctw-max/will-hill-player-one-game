// THE BENCH'S NUMBERS MEAN WHAT THEY SAY.
//
// Client: "what would be cool if you created a bench for me to trim each track
// to the perfect loop with a little millisecond slider."
//
// This grades tools/loopbench.html — a tool, not the game, which is exactly
// why it needs a harness. Its whole job is to hand back numbers that get typed
// into a cue sheet and cut into shipped audio. If the READOUT and the AUDIO
// ever disagree — the panel saying 62.897s while the graph loops something
// else — the mistake is silent, survives review, and lands in the game as a
// wrong cut. Nobody would hear the bug; they would hear a bad loop and blame
// the music.
//
// So every check below reads the REAL state through window.__bench: the buffer
// actually handed to the audio graph and the text actually on the panel. A
// test that recomputed the numbers itself would agree with itself and prove
// nothing.
//
//   1-3.  The manifest drives the page: five cues, the ones he asked for.
//   4-7.  Picking STAGE 1 loads it, and the loop opens on what the game plays
//         today — 66.207s, 40.000 bars at the 145 BPM he gave.
//   8-11. Trimming to 38 bars reports 62.897s, −3.310s against now, and the
//         copied JSON carries hook 56.6 — the ORIGINAL-file coordinate
//         cut_loop.py needs, not the bench's own zero.
//   12-14. The crossfade is the cutter's, verified sample-for-sample against
//         crossfade_wrap(): head blended with what FOLLOWED the cut, and the
//         last sample untouched.
//   15.   ⚠️ THE CHECK CAN FAIL, provably: unticking the crossfade box — a
//         real control, not a stubbed function — must make the graph loop the
//         raw region instead, and the sample-exact checks must go red on it.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/loopbench.mjs
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
const near = (a, x, tol) => Math.abs(a - x) <= tol;

const p = await (await b.newContext({ viewport: { width: 900, height: 1200 } })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
// The explicit filename, not the directory: Vite's dev server answers a bare
// directory with the APP's index.html (its SPA fallback), so `/bench/` here
// would grade the game instead of the bench. Static hosting — which is what
// Pages is — serves index.html for the directory, so the URL he gets is
// `/bench/`.
await p.goto('http://localhost:5199/bench/index.html', { waitUntil: 'networkidle' });

// ── the cue list ────────────────────────────────────────────────────────
await p.waitForFunction(() => document.getElementById('cues').children.length > 0, null, { timeout: 15000 });
const cues = await p.$$eval('#cues button', (bs) => bs.map((x) => x.textContent));
check('manifest drives the cue list', cues.length === 5, `${cues.length} cues`);
check('the four gameplay stages are there',
  ['STAGE 1', 'STAGE 2', 'STAGE 3', 'STAGE 4'].every((s) => cues.some((c) => c.includes(s))));
check('the intro music is there', cues.some((c) => c.includes('TITLE')));

// ── picking stage one ───────────────────────────────────────────────────
await p.click('#cues button:nth-child(1)');
await p.waitForFunction(() => window.__bench && window.__bench.source(), null, { timeout: 20000 });
const s1 = await p.evaluate(() => {
  const st = window.__bench.state();
  return { ...st, dur: window.__bench.source().duration, sr: window.__bench.source().sampleRate,
    len: document.getElementById('lenOut').textContent,
    note: document.getElementById('cueNote').textContent };
});
check('stage one decodes', s1.slot === 'stage_01' && s1.dur > 60, `${s1.dur.toFixed(3)}s`);
check('the loop opens where the game wraps today', near(s1.endS, 66.207, 0.03), `end ${s1.endS.toFixed(3)}s`);
check('bench zero is the hook, so the loop starts at 0', s1.startS === 0);
check('40.000 bars at 145 BPM', /40\.00\d bars/.test(s1.len), s1.len);
check('the ceiling is stated, not left to be discovered',
  /trim it shorter/.test(s1.note) && /re-render/.test(s1.note));

// ── trimming to the 38 bars the correlation points at ───────────────────
await p.fill('#endN', '62.897');
await p.dispatchEvent('#endN', 'change');
const t = await p.evaluate(() => ({
  len: document.getElementById('lenOut').textContent,
  delta: document.getElementById('deltaOut').textContent,
  numbers: JSON.parse(window.__bench.numbers()),
  endS: window.__bench.state().endS,
}));
check('38.000 bars reads back', /38\.00\d bars/.test(t.len), t.len);
check('the change is shown against what ships', /−3\.31\d?s vs what ships now/.test(t.delta), t.delta);
check('the copied hook is the ORIGINAL-file coordinate',
  t.numbers.hook === 56.6, `hook ${t.numbers.hook}`);
check('the copied length is the loop, not the file',
  near(t.numbers.loopSeconds, 62.897, 0.001), `${t.numbers.loopSeconds}s`);

// ── the crossfade is the cutter's, sample for sample ────────────────────
// crossfade_wrap(): clip[:k] = nxt*cos(t*pi/2) + clip[:k]*sin(t*pi/2), where
// nxt is the audio that FOLLOWED the cut. Recomputed here from the decoded
// source and compared against the buffer the graph is actually looping.
await p.click('#play');
await p.waitForFunction(() => window.__bench.playingBuffer(), null, { timeout: 10000 });
const xf = await p.evaluate(() => {
  const src = window.__bench.source(), out = window.__bench.playingBuffer();
  const { endS } = window.__bench.state();
  const sr = src.sampleRate, n = Math.round(endS * sr), k = Math.round(0.015 * sr);
  const s = src.getChannelData(0), d = out.getChannelData(0);
  let worstHead = 0, worstBody = 0;
  for (let i = 0; i < k; i++) {
    const tt = i / (k - 1);
    const want = s[n + i] * Math.cos(tt * Math.PI / 2) + s[i] * Math.sin(tt * Math.PI / 2);
    worstHead = Math.max(worstHead, Math.abs(d[i] - want));
  }
  for (let i = k; i < n; i += 97) worstBody = Math.max(worstBody, Math.abs(d[i] - s[i]));
  return { len: out.length, want: n, worstHead, worstBody,
    headMoved: Math.abs(d[0] - s[0]), lastSample: Math.abs(d[n - 1] - s[n - 1]),
    region: window.__bench.loopRegion() };
});
check('the loop the graph plays is exactly the chosen length',
  xf.len === xf.want, `${xf.len} vs ${xf.want} samples`);
check('the head is the cutter\'s equal-power blend, sample for sample',
  xf.worstHead < 1e-6 && xf.headMoved > 1e-5,
  `err ${xf.worstHead.toExponential(1)}, moved ${xf.headMoved.toFixed(5)}`);
check('nothing past the 15ms is touched, and it still ends on its own sample',
  xf.worstBody === 0 && xf.lastSample === 0);

// ── A/B must not cost the working loop ──────────────────────────────────
// "What ships now" builds a second blended buffer. The cache holds one, so a
// naive implementation would evict the trimmed loop and rebuild it on every
// comparison — which is the one thing he will do over and over.
await p.click('#playNow');
await p.waitForFunction(() => {
  const b2 = window.__bench.playingBuffer();
  return b2 && Math.abs(b2.duration - 66.207) < 0.03;
}, null, { timeout: 10000 });
await p.click('#play');
const ab = await p.evaluate(() => ({ dur: window.__bench.playingBuffer().duration }));
check('A/B against what ships returns to the trimmed loop',
  near(ab.dur, 62.897, 0.002), `${ab.dur.toFixed(3)}s`);

// ── ⚠️ it can fail: untick the box and the raw region must be what loops ──
// Not just "something changed" — the two sample-exact checks above are re-run
// against the unticked state and MUST go red. A break-test that only proves a
// control is wired says nothing about whether the checks have teeth.
await p.uncheck('#xfade');
await p.waitForFunction(() => window.__bench.playingBuffer() === window.__bench.source(),
  null, { timeout: 10000 }).catch(() => {});
const raw = await p.evaluate(() => {
  const src = window.__bench.source(), out = window.__bench.playingBuffer();
  const { endS } = window.__bench.state();
  const sr = src.sampleRate, n = Math.round(endS * sr), k = Math.round(0.015 * sr);
  const s = src.getChannelData(0), d = out.getChannelData(0);
  let worstHead = 0;
  for (let i = 0; i < k; i++) {
    const tt = i / (k - 1);
    const want = s[n + i] * Math.cos(tt * Math.PI / 2) + s[i] * Math.sin(tt * Math.PI / 2);
    worstHead = Math.max(worstHead, Math.abs(d[i] - want));
  }
  return { same: out === src, region: window.__bench.loopRegion(), worstHead,
    headMoved: Math.abs(d[0] - s[0]) };
});
check('BREAK-TEST — unticking the crossfade loops the raw region instead',
  raw.same && near(raw.region.end, 62.897, 0.001),
  `whole file, loopEnd ${raw.region && raw.region.end.toFixed(3)}`);
check('BREAK-TEST — and the two sample-exact checks go red on it',
  raw.worstHead > 1e-3 && raw.headMoved === 0,
  `head err ${raw.worstHead.toExponential(1)}, unmoved ${raw.headMoved === 0}`);

// ── a cue whose tempo is a guess says so ────────────────────────────────
await p.click('#cues button:nth-child(2)');
await p.waitForFunction(() => window.__bench.state().slot === 'stage_02', null, { timeout: 20000 });
const guess = await p.evaluate(() => ({
  warn: document.getElementById('bpmWarn').hidden ? '' : document.getElementById('bpmWarn').textContent,
  alts: [...document.getElementById('bpmAlts').children].map((x) => x.textContent),
  bpm: document.getElementById('bpm').value,
}));
check('a detected tempo is labelled as detected', /DETECTED, not known/.test(guess.warn));
check('the ratio traps are one tap each', guess.alts.length === 2, guess.alts.join(' / '));
// The trap that actually caught this project: two thirds. 126.05 * 2/3 = 84.03.
check('and two thirds is one of them',
  guess.alts.some((a) => near(parseFloat(a), parseFloat(guess.bpm) * 2 / 3, 0.05)),
  `${guess.bpm} -> ${guess.alts.join(' / ')}`);

// ── a red bar count must accuse the tempo, not his ear ──────────────────
// His actual session: he trimmed the intro to start 38.809s / end 67.477s and
// the readout called it 15.829 bars in red, because the DETECTED tempo was
// 132.51. It was 16.000 bars exactly at 134 — which the same arithmetic proves
// twice, since the loop shipping before it is 48.0000 bars at 134 to a tenth
// of a millisecond. He stopped and asked whether the tool would even accept
// what he had picked. It would have; the interface just implied otherwise.
await p.click('#cues button:nth-child(5)');
await p.waitForFunction(() => window.__bench.state().slot === 'title', null, { timeout: 20000 });
await p.uncheck('#snap');
await p.fill('#startN', '38.809'); await p.dispatchEvent('#startN', 'change');
await p.fill('#endN', '67.477'); await p.dispatchEvent('#endN', 'change');
const fit = await p.evaluate(() => ({
  len: document.getElementById('lenOut').textContent,
  red: document.getElementById('lenOut').className.includes('warn'),
  shown: !document.getElementById('fitRow').hidden,
  chips: [...document.getElementById('fitBpm').children].map((x) => x.textContent),
}));
check('his intro pick reads 15.829 bars at the detected tempo, and is flagged',
  /15\.82\d bars/.test(fit.len) && fit.red, fit.len);
check('the tempo that makes it whole is offered instead of leaving it suspect',
  fit.shown && fit.chips.some((c) => /^16 bars @ 133\.9/.test(c)), fit.chips.join(' · '));
await p.click('#fitBpm button:nth-child(1)');
const fixed = await p.evaluate(() => ({
  len: document.getElementById('lenOut').textContent,
  green: document.getElementById('lenOut').className.includes('ok'),
  bpm: document.getElementById('bpm').value,
}));
check('tapping it turns his own pick green at 16.000 bars',
  /16\.000 bars/.test(fixed.len) && fixed.green, `${fixed.bpm} BPM — ${fixed.len}`);

// ── the selection plays back, and you can see where you are ─────────────
await p.check('#xfade');
await p.click('#play');
await p.waitForFunction(() => window.__bench.playhead() !== null, null, { timeout: 10000 });
const head = await p.evaluate(async () => {
  const a = window.__bench.playhead();
  await new Promise((r) => setTimeout(r, 700));
  const c = window.__bench.playhead();
  return { a, c, start: window.__bench.state().startS, end: window.__bench.state().endS };
});
check('the playhead advances while it plays', head.c > head.a, `${head.a.toFixed(2)} -> ${head.c.toFixed(2)}s`);
check('and stays inside the selection',
  head.a >= head.start - 0.01 && head.c <= head.end + 0.01,
  `[${head.start.toFixed(2)}, ${head.end.toFixed(2)}]`);

// ── ship it in one tap ──────────────────────────────────────────────────
const ship = await p.evaluate(() => window.__bench.ship());
check('SHIP THIS ONE sends a message that reads without the page',
  /LOOP BENCH — TITLE/.test(ship) && /cut knowledge_x_polo from 57\.309s for 28\.668s/.test(ship)
  && /was 85\.970s/.test(ship) && /16 bars @ 133\.95 BPM/.test(ship),
  ship.split('\n').slice(0, 3).join(' | '));
const parsed = await p.evaluate(() => JSON.parse(window.__bench.ship().split('\n').pop()));
check('and carries machine-readable numbers cut_loop.py can take',
  parsed.slot === 'title' && parsed.hook === 57.309 && parsed.loopSeconds === 28.668,
  JSON.stringify(parsed));

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - bad.length}/${checks.length} checks pass`);
process.exit(bad.length ? 1 : 0);
