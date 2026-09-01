// Does a hole in the road show the TUNNEL, or does it show the SKY?
//
// Client, on the live game: the holes in the ground show the sky gradient
// instead of the tunnel below.
//
// The mechanism, read out of the draw order and then measured here: the
// undercroft is drawn from groundY + slabPx DOWNWARD, so the slab band — the
// thickness of the road itself — is never covered by it. On solid ground
// drawTiles fills that band with paving. Over a hole nothing does, so what
// remains behind the pit's mouth is the backdrop, and the backdrop down there
// is the sky gradient. The pit throat eases from 0.97 to 0.20 alpha by the
// bottom of the slab, so 80% of the sky comes through, which in daylight is a
// saturated blue.
//
// WHAT THIS MEASURES. It finds a real pit in a real run, reads the pixels
// inside its mouth, and compares them against the sky at the top of the same
// frame. The test is a hue/blueness test rather than a brightness one: a hole
// is allowed to be dim, and it is allowed to carry the warning glow's red. It
// is not allowed to be BLUE, because there is nothing blue under a street.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/pitsky.mjs
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

// ⚠️ DAY, ON EVERY STAGE. The sky gradient at night is nearly black and a
// leak through the pit mouth is invisible — the same reason the multiplane
// doubling only ever showed in daylight. Grading this at night would pass a
// broken build.
// ⚠️ INDEX, NOT ID. window.__startStage is the game's own startStage(i) and
// it takes the stage index; passing an id throws inside createLevel on
// `undefined.recipe`, one frame later, which reads as a level-generation bug.
// Order matches src/world/stages.js — this table used to swap underground and
// l5p, so a failure was reported against the wrong stage's name.
const STAGES = [[0, 'eav'], [1, 'edgewood'], [2, 'underground'], [3, 'l5p'],
                [4, 'buckhead']];

await p.goto(`${BASE}/?tod=day`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

for (const [idx, id] of STAGES) {
  const r = await p.evaluate(async (stageIdx) => {
    // Start the stage, then walk the camera until a hole is actually on
    // screen. The recipe decides where holes fall, so this hunts for one
    // rather than assuming a coordinate. Positions come from window.__pits(),
    // which reads the same FLOOR_R/SLAB_R/zoom the renderer draws with —
    // re-deriving them here would grade this file's arithmetic.
    window.__startStage(stageIdx);
    const st = window.__game;
    const cam = window.__camera;
    // ⚠️ RE-STATE hearts AND screen EVERY STEP. Walking a harness across a
    // stage otherwise ends in the fall/die/respawn loop, and the camera snaps
    // on every respawn — the documented way these sweeps start measuring the
    // phase of a death loop instead of the scene.
    // ⚠️ MOVE THE PLAYER, NOT THE CAMERA. Nudging camera.x does nothing that
    // lasts: the camera lerps toward the player every frame, so it springs
    // straight back, the generator's write head never advances, and 400 steps
    // later the answer is "there are no holes in this game". Walking the
    // player is also what makes genC grow, which is what creates the holes to
    // find in the first place.
    const W = cam.vw * cam.zoom;
    for (let step = 0; step < 400; step += 1) {
      st.hearts = 3;
      st.screen = 'playing';
      if (st.player) st.player.x += 90;
      await new Promise((res) => requestAnimationFrame(() => res()));
      // Wide enough to sample inside without touching either lip, and clear
      // of the frame edges so the whole mouth is on screen.
      const usable = window.__pits().filter((q) => q.w > 44 && q.x > 14
        && q.x + q.w < W - 14);
      if (usable.length) return { ok: true, pits: usable, tick: st.tick, step };
    }
    return { ok: false, reason: 'no usable pit on screen in 400 steps' };
  }, idx);

  if (!r.ok) { check(`${id}: found a pit to look into`, false, r.reason); continue; }
  check(`${id}: found a pit to look into`, true, `${r.pits.length} on screen`);

  // Read the frame once, in the page, so the tick cannot advance between
  // deciding where to look and looking.
  const s = await p.evaluate((pits) => {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const grab = (x, y, w, h) => {
      x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
      w = Math.min(cv.width - x, Math.round(w)); h = Math.min(cv.height - y, Math.round(h));
      if (w < 1 || h < 1) return null;
      const d = g.getImageData(x, y, w, h).data;
      let n = 0; let R = 0; let G = 0; let B = 0; let bluest = -1;
      for (let i = 0; i < d.length; i += 4) {
        R += d[i]; G += d[i + 1]; B += d[i + 2]; n += 1;
        const bl = d[i + 2] - (d[i] + d[i + 1]) / 2;
        if (bl > bluest) bluest = bl;
      }
      return { r: R / n, g: G / n, b: B / n, n, bluest };
    };
    // The sky, for reference: the top 30 rows of the frame.
    const sky = grab(0, 0, cv.width, 30);
    const out = [];
    for (const q of pits) {
      // The lower half of the slab band, inside the mouth and away from the
      // lips — where the throat gradient is weakest and a leak would show.
      out.push({
        x: q.x, w: q.w,
        deep: grab(q.x + q.w * 0.25, q.top + q.slab * 0.55, q.w * 0.5, q.slab * 0.4),
      });
    }
    return { sky, pits: out, dpr: devicePixelRatio };
  }, r.pits);

  const skyBlue = s.sky.b - (s.sky.r + s.sky.g) / 2;
  for (const q of s.pits) {
    if (!q.deep) continue;
    const blue = q.deep.b - (q.deep.r + q.deep.g) / 2;
    // A hole may be dark, warm, or red-lit. It may not be blue. The sky's own
    // blueness is the yardstick — anything reaching a quarter of it is sky
    // coming through, not a painted surface.
    check(`${id}: the hole at x${Math.round(q.x)} is not showing sky`,
      blue < Math.max(6, skyBlue * 0.25),
      `hole blue ${blue.toFixed(1)} vs sky ${skyBlue.toFixed(1)} `
      + `(rgb ${q.deep.r.toFixed(0)},${q.deep.g.toFixed(0)},${q.deep.b.toFixed(0)})`);
  }
}

const bad = checks.filter(([, ok]) => !ok).length;
console.log('\n' + (bad === 0 ? `ALL ${checks.length} PASS` : `${bad} of ${checks.length} FAIL`));
await b.close();
process.exit(bad === 0 ? 0 : 1);
