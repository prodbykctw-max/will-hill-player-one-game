// IS THERE ANY SKY BELOW THE STREET?
//
// Client, on the live game: "out of nowhere there is a blue [seam] in the
// daytime that you can see in the street... at first it was just one solid
// street, what happened? now I'm seeing [seams] in the streets."
//
// He is right and it is not rain — rain is clipped above the ground line. The
// sky gradient was built to stop at `groundY` and then filled to
// `canvas.height`, so every pixel under the road was flat `stage.bg.horizon`.
// In daylight that is a saturated blue; at night it is near-black, which is
// why this only ever showed in the day plates. Anywhere the street tiles do
// not cover perfectly — and baked chunks resampled at independent subpixel
// phases do not — the blue came through as a thin seam.
//
// ⚠️ THIS MEASURES THE WHOLE STREET BAND, NOT JUST HOLES. tools/harness/
// pitsky.mjs already grades the inside of a PIT, which was the same leak found
// through a bigger opening. A pit is a 60px-wide window; a chunk seam is 1px
// wide and there are dozens of them, so this scans every column of the band
// and reports the bluest one rather than sampling a rect.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/skyleak.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => check('no exception', false, e.message));

// DAY on every stage. At night the horizon colour is near-black and a leak is
// invisible — grading this at night would pass a broken build, the same trap
// the multiplane doubling hid behind for weeks.
const STAGES = [[0, 'eav'], [1, 'edgewood'], [2, 'underground'], [3, 'l5p'],
                [4, 'buckhead']];

await p.goto(`${BASE}/?tod=day`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

for (const [idx, id] of STAGES) {
  // Walk a way in so the street is real generated level, not the runway, and
  // so the baked chunks have had to line up with each other several times.
  const info = await p.evaluate(async (i) => {
    window.__startStage(i);
    const st = window.__game;
    const cam = window.__camera;
    for (let k = 0; k < 90; k += 1) {
      st.hearts = 3; st.screen = 'playing';
      if (st.player) { st.player.x += 60; st.player.vy = 0; }
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    st.hearts = 3; st.screen = 'playing';
    // ⚠️ THE BAND IS THE SLAB, NOT EVERYTHING BELOW THE ROAD. The undercroft
    // starts at groundY + slabPx and paints its own art down there — and on
    // L5P that art includes a MARTA train in #2f5fa8, which is correctly and
    // deliberately blue. Scanning to the bottom of the canvas reported the
    // train as a sky leak (38 blue at y720) and would have had me "fixing" his
    // train. The uncovered band is the road's own thickness and nothing else.
    const pits = window.__pits ? window.__pits() : [];
    const slab = pits.length ? pits[0].slab : 62;
    return { ground: Math.round(cam.groundScreenY()), slab: Math.round(slab),
      horizon: window.__game.level.stage.bg.horizon };
  }, idx);

  // Read the band in the page, in one go, so the tick cannot advance between
  // deciding where to look and looking.
  const scan = await p.evaluate(([groundY, slab]) => {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const y0 = Math.max(0, groundY + 2);
    const y1 = Math.min(cv.height, groundY + slab);
    if (y1 - y0 < 4) return null;
    const d = g.getImageData(0, y0, cv.width, y1 - y0).data;
    // Bluest column in the band: blue minus the mean of the other two. Nothing
    // under a street is blue — the section is asphalt, aggregate, clay.
    let worst = -999; let worstX = -1; let worstY = -1; let n = 0;
    for (let y = 0; y < y1 - y0; y += 1) {
      for (let x = 0; x < cv.width; x += 1) {
        const i = (y * cv.width + x) * 4;
        const bl = d[i + 2] - (d[i] + d[i + 1]) / 2;
        if (bl > 14) n += 1;
        if (bl > worst) { worst = bl; worstX = x; worstY = y0 + y; }
      }
    }
    return { worst, worstX, worstY, blueish: n, band: (y1 - y0) * cv.width };
  }, [info.ground, info.slab]);

  if (!scan) { check(`${id}: street band exists to scan`, false, 'band too short'); continue; }
  // A hard threshold rather than a comparison with the sky: the section's own
  // palette is warm on every stage, so anything meaningfully blue below the
  // road is a leak whatever the sky happens to be doing.
  check(`${id}: no sky under the street`, scan.worst < 18,
    `bluest pixel ${scan.worst.toFixed(0)} at x${scan.worstX} y${scan.worstY}, `
    + `${scan.blueish} of ${scan.band} px blueish (horizon is ${info.horizon})`);
}

const bad = checks.filter(([, ok]) => !ok).length;
console.log('\n' + (bad === 0 ? `ALL ${checks.length} PASS` : `${bad} of ${checks.length} FAIL`));
await b.close();
process.exit(bad === 0 ? 0 : 1);
