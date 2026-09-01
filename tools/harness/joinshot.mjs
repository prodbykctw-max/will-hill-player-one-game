// Park on the frame where the base plate's repeat join is worst and crop
// tight around it, magnified — so the seam can be LOOKED at, not just scored.
// Needs the DEV build, same as seamsweep.mjs.
//
//   node tools/harness/joinshot.mjs <day|night> <tag>
//   PLAYWRIGHT=... CHROMIUM=/opt/pw-browsers/chromium SEAM_OUT=tools/captures node ...
// Playwright is not a dependency of this repo — it lives wherever the machine
// happens to have it (here: a global install ESM cannot see). Resolved through
// a variable so the harness runs without adding a build-time dependency to a
// game that ships no test runner.  PLAYWRIGHT=/path/to/playwright
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
// A path pointing at playwright's CommonJS entry arrives under `.default`;
// the bare specifier resolves as ESM and does not. Accept either.
const chromium = _pw.chromium || _pw.default?.chromium;

const TOD = process.argv[2] === 'day' ? 'day' : 'night';
const TAG = process.argv[3] || 'before';
const SP = process.env.SEAM_OUT || 'tools/captures';

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const p = await c.newPage();
p.on('pageerror', (e) => console.log('THROWN:', e.message));
await p.goto(`http://localhost:5199/?tod=${TOD}`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

for (let i = 0; i < 5; i++) {
  const r = await p.evaluate(async (stageIndex) => {
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const pm = (a, m) => ((a % m) + m) % m;
    const g = window.__game; const cam = window.__camera;
    window.__startStage(stageIndex);
    await frame();
    const cv = document.querySelector('canvas');
    const W = cv.width;
    const period = window.__plate.drawW;
    const spawnY = g.player.y;
    const endX = g.level.stage.stageEnd * 32;

    const put = async (x) => {
      g.player.x = x; g.player.vx = 0; g.player.y = spawnY; g.player.vy = 0;
      g.hearts = 3; g.player.hearts = 3;
      if (g.screen !== 'playing') g.screen = 'playing';
      cam.x = x;
      await frame();
    };
    // Walk forward until a join sits near mid-screen; report if it never does.
    let best = null;
    for (let x = 100; x < endX - 300; x += 60) {
      await put(x);
      const off = pm(window.__plate.par, period);
      // Park where the join is UGLIEST, not where it is most central — the
      // two are different frames, and the whole point is to look at the
      // worst one the player can walk into.
      const plate0 = window.__plate;
      const y0 = Math.max(0, Math.round(plate0.by + plate0.drawH * 0.10));
      const y1 = Math.min(cv.height, Math.round(plate0.groundY - 6));
      for (let k = -1; k <= 3; k++) {
        const jx = Math.round(-off + k * period);
        if (jx < 40 || jx > W - 40 || y1 - y0 < 20) continue;
        const rows = y1 - y0;
        const dd = cv.getContext('2d').getImageData(jx - 1, y0, 2, rows).data;
        let s2 = 0;
        for (let yy = 0; yy < rows; yy++) {
          const a2 = (yy * 2 + 1) * 4;
          s2 += Math.abs(dd[a2] - dd[a2 - 4]) + Math.abs(dd[a2 + 1] - dd[a2 - 3]) + Math.abs(dd[a2 + 2] - dd[a2 - 2]);
        }
        const stepv = s2 / (rows * 3);
        if (!best || stepv > best.step) best = { x, jx, step: +stepv.toFixed(1) };
      }
    }
    if (!best) return { stage: g.level.stage.id, tod: g.level.stage.tod, never: true };
    await put(best.x);
    const plate = window.__plate;
    return {
      stage: g.level.stage.id, tod: g.level.stage.tod,
      jx: best.jx, m: Math.round(best.x / 32), step: best.step,
      top: Math.round(plate.by), bot: Math.round(plate.groundY),
    };
  }, i);
  if (r.never) { console.log(`${r.stage}-${r.tod}: the join never reaches the screen in this stage`); continue; }
  const x = Math.max(0, r.jx - 70);
  const y = Math.max(0, r.top);
  const h = Math.min(430, r.bot - y);
  await p.screenshot({
    path: `${SP}/join_${TAG}_${r.tod}_${r.stage}.png`,
    clip: { x, y, width: 140, height: h },
  });
  console.log(`${r.stage}-${r.tod}: worst join step ${r.step} at screen x=${r.jx}, ${r.m}m -> join_${TAG}_${r.tod}_${r.stage}.png`);
}
await b.close();
