// WALK EACH STAGE END TO END AND FIND THE WORST VERTICAL EDGE ON SCREEN.
//
// The first version of this parked the camera where the BASE plate wraps and
// measured there. On three of the four stages it could not: at real-world
// scale the plate is 1100-1350px wide against a 430px canvas and the parallax
// rate is ~0.06, so a full plate period takes ~600m of walking and the stage
// is ~360m. The base plate's join never reaches mid-screen. Which means
// parking at a computed boundary was measuring a seam the player never sees,
// and missing the ones they do — the CARDS wrap on their own phases, and the
// cloud cards drift on a timer whether anyone walks or not.
//
// So: sweep the whole stage, score every frame, keep the worst. Whatever is
// actually the ugliest vertical edge in the stage is what comes back, seam or
// not, and after a fix the same sweep says whether it moved.
//
// The sweep must cover the WHOLE stage: an earlier version read
// `level.stageEnd`, which does not exist — it is `level.stage.stageEnd` — and
// silently fell back to a constant, covering 76% of l5p and missing the only
// stretch where that plate's join is on screen at all. Check the frame count
// against the stage length before quoting a result.
//
// Needs the DEV build (window.__game / __plate / __startStage are folded out
// of production):  npx vite --port 5199 --strictPort
//
//   node tools/harness/seamsweep.mjs <day|night> <tag>
//   PLAYWRIGHT=... CHROMIUM=/opt/pw-browsers/chromium SEAM_OUT=tools/captures node ...
// Playwright is not a dependency of this repo — it lives wherever the machine
// happens to have it (here: a global install ESM cannot see). Resolved through
// a variable so the harness runs without adding a build-time dependency to a
// game that ships no test runner.  PLAYWRIGHT=/path/to/playwright
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
// A path pointing at playwright's CommonJS entry arrives under `.default`;
// the bare specifier resolves as ESM and does not. Accept either.
const chromium = _pw.chromium || _pw.default?.chromium;
import { writeFileSync } from 'fs';

const TOD = process.argv[2] === 'day' ? 'day' : 'night';
const TAG = process.argv[3] || 'before';
const SP = process.env.SEAM_OUT || 'tools/captures';

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const p = await c.newPage();
p.on('pageerror', (e) => console.log('THROWN:', e.message));
await p.goto(`http://localhost:5199/?tod=${TOD}`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

const out = [];
for (let i = 0; i < 4; i++) {
  const r = await p.evaluate(async (stageIndex) => {
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const g = window.__game;
    const cam = window.__camera;
    window.__startStage(stageIndex);
    await frame();
    if (!window.__plate) return { err: 'no plate' };

    const cv = document.querySelector('canvas');
    const W = cv.width;
    const ctx2 = cv.getContext('2d');
    const endX = g.level.stage.stageEnd * 32;   // stage.stageEnd, NOT level.stageEnd

    // Teleporting the player across the stage drops him into pits, and after
    // enough of those the sweep ends on a GAME KNOCKED overlay having covered
    // a third of the level — which is how the first run of this missed the
    // one stage where the base plate's join DOES reach the screen. Put him
    // back on his spawn line every sample instead of letting him fall.
    const spawnY = g.player.y;
    const samples = [];
    let worst = null;
    for (let x = 100; x < endX - 300; x += 140) {
      g.player.x = x; g.player.vx = 0;
      g.player.y = spawnY; g.player.vy = 0;
      g.hearts = 3; g.player.hearts = 3;
      if (g.screen !== 'playing') g.screen = 'playing';
      cam.x = x;
      await frame();
      if (g.screen !== 'playing') continue;
      const plate = window.__plate;
      const y0 = Math.max(0, Math.round(plate.by + plate.drawH * 0.10));
      const y1 = Math.min(cv.height, Math.round(plate.groundY - 6));
      if (y1 - y0 < 20) continue;
      const rows = y1 - y0;
      const d = ctx2.getImageData(0, y0, W, rows).data;
      let peak = 0, peakX = 0;
      const step = new Float64Array(W);
      for (let cx = 1; cx < W; cx++) {
        let s = 0;
        for (let y = 0; y < rows; y++) {
          const a = (y * W + cx) * 4;
          s += Math.abs(d[a] - d[a - 4]) + Math.abs(d[a + 1] - d[a - 3]) + Math.abs(d[a + 2] - d[a - 2]);
        }
        const v = s / (rows * 3);
        step[cx] = v;
        if (v > peak) { peak = v; peakX = cx; }
      }
      const sorted = Array.from(step.slice(1)).sort((a, z) => a - z);
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const median = sorted[Math.floor(sorted.length / 2)];
      const pm = (a, m) => ((a % m) + m) % m;
      const off = pm(plate.par, plate.drawW);
      const joins = [];
      for (let k = -1; k <= 3; k++) {
        const jx = Math.round(-off + k * plate.drawW);
        if (jx >= 0 && jx <= W) joins.push(jx);
      }
      const onJoin = joins.some((j) => Math.abs(j - peakX) <= 3);
      const joinStep = joins.length ? Math.max(...joins.map((j) => step[Math.min(W - 1, Math.max(1, j))])) : 0;
      const rec = { x, peak: +peak.toFixed(1), peakX, p99: +p99.toFixed(2), median: +median.toFixed(2),
        joins, onJoin, joinStep: +joinStep.toFixed(1) };
      samples.push(rec);
      if (!worst || rec.peak > worst.peak) worst = rec;
    }
    // Park on the worst frame so the screenshot shows it.
    if (worst) {
      g.player.x = worst.x; g.player.vx = 0; g.player.y = spawnY; g.player.vy = 0;
      if (g.screen !== 'playing') g.screen = 'playing';
      cam.x = worst.x; await frame();
    }
    const peaks = samples.map((s) => s.peak).sort((a, z) => a - z);
    const onScreen = samples.filter((s) => s.joins.length);
    const joinPeaks = onScreen.map((s) => s.joinStep).sort((a, z) => a - z);
    const worstJoin = onScreen.reduce((m, s) => (!m || s.joinStep > m.joinStep ? s : m), null);
    return {
      stage: g.level.stage.id, tod: g.level.stage.tod, n: samples.length,
      drawW: Math.round(window.__plate.drawW),
      worst, medianPeak: +peaks[Math.floor(peaks.length / 2)].toFixed(1),
      joinFrames: onScreen.length, worstJoin,
      medianJoin: joinPeaks.length ? +joinPeaks[Math.floor(joinPeaks.length / 2)].toFixed(1) : null,
      samples,
    };
  }, i);
  if (r.err) { console.log(`stage ${i}: ${r.err}`); continue; }
  out.push(r);
  const w = r.worst;
  console.log(`${r.stage.padEnd(16)} drawW ${String(r.drawW).padStart(5)}  ${String(r.n).padStart(3)} frames  `
    + `worst edge ${String(w.peak).padStart(6)} at screen x=${String(w.peakX).padStart(3)} (${Math.round(w.x / 32)}m)  `
    + `that frame's p99 ${String(w.p99).padStart(6)}  ratio ${(w.peak / w.p99).toFixed(2)}x  `
    + `| typical frame's worst edge ${r.medianPeak}`);
  const j = r.worstJoin;
  console.log(`${''.padEnd(16)} plate join on screen in ${r.joinFrames}/${r.n} frames`
    + (j ? `  worst join step ${String(j.joinStep).padStart(6)} at ${Math.round(j.x / 32)}m `
      + `(that frame's p99 ${j.p99}, ratio ${(j.joinStep / j.p99).toFixed(2)}x)  median join ${r.medianJoin}` : ''));
  await p.screenshot({ path: `${SP}/sweep_${TAG}_${r.tod}_${r.stage}.png` });
}
writeFileSync(`${SP}/sweep_${TAG}_${TOD}.json`, JSON.stringify(out, null, 1));
await b.close();
