// SPEED AND SMOOTHNESS, MEASURED ON A SLOWED CPU — the screens this game
// spends its time on, timed frame by frame.
//
// Client: "do speed and performance tests." A desktop runs anything at 60fps,
// so this slows Chromium's CPU 4x (DevTools' "mid-tier mobile" setting) and
// reads the frame intervals the game actually got:
//
//   A. load (production preview :5210) — navigation to the first painted
//      title, and what crossed the wire before it
//   B. frames (dev :5199, for the __game hooks) — title, the stage-one intro
//      bubble, a stage running, the Buckhead MARTA ride, the SHOWTIME ending
//   C. the first tap — the moment every sample and all 27 voice lines are
//      fetched and decoded; any main-thread task over 50ms is a hitch a
//      player would feel on PRESS START
//   D. memory — the JS heap, and the decoded soundtrack, which lives outside
//      it (a decoded song is float32 PCM: seconds x 44100 x 2ch x 4 bytes)
//
// Reports numbers; grades only what would be felt: a scene whose median frame
// is over 20ms (below 50fps), a first-tap task over 200ms, or a whole song
// decoded into memory.
//
// ⚠️ FRAMES ARE GRADED AT SLOW=1 ONLY. This container has no GPU, so every
// drawImage is software-rasterised at 3x density; at SLOW=4 the title and
// stages read 10-16fps — and read the SAME on the build from before the
// 2026-09 intro/voice/music work (measured side by side), so that number is
// the container, not the game. SLOW=4 still prints, as a stress reading, and
// still grades the first tap and memory, which do not depend on a GPU.
//
//   SLOW=4 PLAYWRIGHT=... CHROMIUM=... node tools/harness/perf.mjs   # stress
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/perf.mjs
//   (expects vite dev on :5199 and `vite preview` on :5210)
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};
const SLOW = +(process.env.SLOW || 1);
const DEV = process.env.DEV_URL || 'http://localhost:5199';
const PROD = process.env.PROD_URL || 'http://localhost:5210';

async function page(url, { seedIntro = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  if (seedIntro) await p.addInitScript(() => localStorage.setItem('wh_intro_v6', '1'));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
  await p.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(e.duration); })
        .observe({ type: 'longtask', buffered: true });
    } catch (_e) {}
  });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  return { ctx, p, errs, t0 };
}

// rAF intervals over `ms`, in the page, so the numbers are the page's own.
const frames = (p, ms) => p.evaluate((dur) => new Promise((done) => {
  const d = [];
  let last = performance.now();
  const start = last;
  const tick = (t) => {
    d.push(t - last); last = t;
    if (t - start < dur) requestAnimationFrame(tick);
    else {
      d.sort((x, y) => x - y);
      const q = (f) => d[Math.min(d.length - 1, Math.floor(f * d.length))];
      done({ n: d.length, fps: +(1000 / (d.reduce((s, x) => s + x, 0) / d.length)).toFixed(1),
        med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +d[d.length - 1].toFixed(1),
        slow: d.filter((x) => x > 34).length });
    }
  };
  requestAnimationFrame(tick);
}), ms);

// ── A. LOAD, ON THE REAL BUILD ───────────────────────────────────────────
console.log(`\nA. load — production build, CPU ${SLOW}x slower`);
{
  const { ctx, p, errs, t0 } = await page(PROD + '/', { seedIntro: false });
  const bytes = { n: 0, sum: 0 };
  p.on('response', async (r) => { try { const bb = await r.body(); bytes.n++; bytes.sum += bb.length; } catch (_e) {} });
  // First painted title: the canvas centre stops being the loading black.
  let painted = null;
  for (let i = 0; i < 240 && painted === null; i++) {
    const lit = await p.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c || !c.width) return 0;
      const g = c.getContext('2d');
      const d = g.getImageData(c.width / 2 - 20, c.height / 3, 40, 40).data;
      let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k] + d[k + 1] + d[k + 2];
      return s / (d.length / 4);
    }).catch(() => 0);
    if (lit > 60) painted = Date.now() - t0;
    else await p.waitForTimeout(100);
  }
  const nav = await p.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) };
  });
  console.log(`  title painted at ${painted}ms · DOMContentLoaded ${nav.dcl}ms · load ${nav.load}ms `
    + `· ${bytes.n} responses, ${(bytes.sum / 1e6).toFixed(2)}MB by then`);
  check('the title paints on a slowed CPU (local network)', painted !== null && painted < 8000, `${painted}ms`);
  check('no errors loading the production build', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ── B. FRAMES, SCENE BY SCENE ────────────────────────────────────────────
console.log(`\nB. frames — CPU ${SLOW}x slower, phone viewport at 3x density`);
const scenes = [];
{
  const { ctx, p } = await page(DEV + '/?tod=night');
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  scenes.push(['title', await frames(p, 4000)]);
  // The intro bubble: a fresh latch, stage one, the bubble typing.
  await p.evaluate(() => { localStorage.removeItem('wh_intro_v6'); localStorage.removeItem('wh_intro_seen'); window.__startStage(0); });
  // (A build from before the intro bubble existed has no dialogue: skip it.)
  const hasIntro = await p.waitForFunction(() => window.__game.dialogue, null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  if (hasIntro) scenes.push(['intro bubble', await frames(p, 3000)]);
  await p.evaluate(() => { let n = 0; while (window.__game.dialogue && n < 60) { window.__tutorialAdvance(); n++; } });
  // A stage running right, the camera scrolling.
  await p.keyboard.down('ArrowRight');
  scenes.push(['stage, running', await frames(p, 4000)]);
  await p.keyboard.up('ArrowRight');
  await p.evaluate(() => { const g = window.__game; g.rideFrom = 'l5p'; g.rideTo = 4; g.screen = 'riding'; g.screenT = 0; });
  scenes.push(['MARTA ride to Buckhead', await frames(p, 3000)]);
  await p.evaluate(() => {
    const g = window.__game;
    g.finalLog = g.runLog.finish(); g.resultsShown = true; g.screen = 'complete'; g.screenT = 0;
  });
  scenes.push(['SHOWTIME ending', await frames(p, 4000)]);
  for (const [name, f] of scenes) {
    console.log(`  ${name.padEnd(24)} ${String(f.fps).padStart(5)}fps  median ${f.med}ms  p95 ${f.p95}ms  `
      + `worst ${f.max}ms  ${f.slow} frames >34ms of ${f.n}`);
    if (SLOW === 1) check(`${name}: median frame under 20ms`, f.med < 20, `${f.med}ms`);
  }

  // ── D. MEMORY ───────────────────────────────────────────────────────────
  const heap = await p.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
  const mf = await p.evaluate(() => window.__audio.music.status());
  console.log(`\nD. memory — JS heap ${(heap / 1e6).toFixed(1)}MB after every scene`);
  console.log(`  music: playing on the ${mf.mode}; decoded songs held: ${(mf.decoded || []).length}`);
  // Whole songs stream (music.js `stream`): decoded, each is 46-61MB of
  // float32 — the review of this pass found ~220MB of them held at once.
  check('no whole song is decoded into memory', (mf.decoded || []).length === 0,
    `decoded: ${(mf.decoded || []).join(',') || 'none'}`);
  await ctx.close();
}

// ── C. THE FIRST TAP ─────────────────────────────────────────────────────
console.log(`\nC. the first tap — every sample and voice line decoded, CPU ${SLOW}x slower`);
{
  const { ctx, p } = await page(DEV + '/?tod=night');
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 60000 });
  await p.waitForTimeout(4000);                     // let boot's own tasks settle
  await p.evaluate(() => { window.__longTasks.length = 0; });
  await p.mouse.click(5, 5);
  const f = await frames(p, 3000);
  const lt = await p.evaluate(() => window.__longTasks.slice());
  const decoded = await p.evaluate(() => (window.__audio.voiceLines ? Object.values(window.__audio.voiceLines()).flat().length : 0));
  console.log(`  ${lt.length} main-thread tasks over 50ms in the 3s after, longest ${lt.length ? Math.round(Math.max(...lt)) : 0}ms; `
    + `frames median ${f.med}ms, worst ${f.max}ms; ${decoded} voice lines known`);
  check('the first tap causes no main-thread task over 200ms', !lt.some((d) => d > 200),
    lt.map((d) => Math.round(d)).join(', '));
  await ctx.close();
}

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log('\n' + (bad.length ? `${checks.length - bad.length}/${checks.length} passed` : `ALL ${checks.length} PASS`));
if (bad.length) { bad.forEach(([w]) => console.log('  FAILED: ' + w)); process.exit(1); }
