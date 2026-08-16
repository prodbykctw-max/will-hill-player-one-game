// IS THE SKY CLEAN BEFORE THE LETTERING LANDS?
//
// Client, photographing the intro mid-assembly: "can we do something about the
// scars and the sky before the text for Will Hill falls in place."
//
// The scars were in `title-portrait-bare.webp` — the intro-only plate whose
// lettering has been lifted out so WILL HILL can land on sky that does not
// already carry it. Its holes were filled with per-row strips and then blurred
// to hide the row-joins, and a blurred patch in a textured sky reads as a
// letter-shaped smudge; the mask also stopped one pixel past the outline, so
// the letters' dark shadow stayed behind as a ghost. tools/cut_title_bare.py
// now takes the halo with the letters and fills with real sky, and gates
// itself on five measurements.
//
// ⚠️ BUT A GREEN ASSET IS NOT A GREEN SCREEN. The plate is drawn scaled through
// a fit box, under the skyfill underlay, with cards flying over it, fading up
// on its own curve. None of that is visible to the offline tool. So this
// measures the RUNNING PAGE at ticks where the lettering has not landed yet.
//
// THE STATISTIC FOLLOWS THE GEOMETRY. High-pass energy — mean |L - boxmean(5)|
// — inside each lettering box, against the SAME ROWS immediately left and
// right of it. Same altitude, same fit scale, same compression, so the only
// difference left is the fill. A global sky average would be measuring the
// plate's vertical gradient instead. Ratio, never an absolute: the canvas is
// scaled by the fit and texture scales with it.
//
// BREAK-TEST: `git stash` the new plate (or check out the previous asset) and
// re-run — the offline red-first record is 0.493 of clean-sky texture and a
// 4.57-level rim step, against 0.975 and 0.75 for the plate this grades.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT = process.env.SEAM_OUT || 'shots';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=day', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
  null, { timeout: 25000 });

const film = await p.evaluate(async () => {
  const g = window.__game;
  const cv = document.querySelector('canvas');
  const box = g.titleBox;
  // Source fractions from title-portrait-planes.json — the same numbers the
  // cutter removed, so the probe cannot drift from the hole.
  const planes = {
    wordmark: [0.1993, 0.0916, 0.8206, 0.1415],
    logo: [0.1055, 0.1508, 0.905, 0.2104],
  };
  const rect = (f) => ({
    x: Math.round(box.dx + f[0] * box.dw), w: Math.round((f[2] - f[0]) * box.dw),
    y: Math.round(box.dy + f[1] * box.dh), h: Math.round((f[3] - f[1]) * box.dh),
  });
  const c2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const energy = (r) => {
    if (r.w < 10 || r.h < 10 || r.x < 0 || r.y < 0
        || r.x + r.w > cv.width || r.y + r.h > cv.height) return null;
    c2.canvas.width = r.w; c2.canvas.height = r.h;
    c2.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = c2.getImageData(0, 0, r.w, r.h).data;
    const L = new Float64Array(r.w * r.h);
    for (let i = 0; i < r.w * r.h; i++) {
      L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    }
    let acc = 0, n = 0;
    for (let y = 2; y < r.h - 2; y++) {
      for (let x = 2; x < r.w - 2; x++) {
        let m = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) m += L[(y + dy) * r.w + (x + dx)];
        }
        acc += Math.abs(L[y * r.w + x] - m / 25); n++;
      }
    }
    return n ? acc / n : null;
  };
  // ⚠️ THE REFERENCE SKY IS ABOVE AND BELOW, NOT LEFT AND RIGHT — twice
  // measured, twice wrong before this.
  //
  // Sideways flanks fail on both boxes. The logo spans source x 0.106-0.905 of
  // a plate drawn 430px wide on this phone, so its flanks fall off the canvas
  // and score null. And the wordmark's flanks land on the BAKED CLOUDS at
  // rows 169-261 — energy 3.47 against 1.02 inside, which graded clean sky as
  // a 0.29 failure. Same trap introorder.mjs documents for its white probe:
  // whatever is beside the lettering up there is cloud, not sky.
  //
  // The belts directly above the wordmark (source rows ~140-166) and below the
  // logo (~392-420) are full-width clean sky — that is measured, it is where
  // the cutter's own donors come from. Same columns as the box, so same
  // horizontal position under the fit; a different altitude, which the
  // vertical gradient makes slightly darker or lighter but does not make
  // smoother.
  //
  // AND THE STATISTIC IS A MEDIAN OF TILES, because the drifting cloud sprites
  // cross these belts at runtime. A mean would let one cloud in one tile
  // inflate the reference and hide a flat fill; a median over six tiles cannot
  // be moved by a cloud that covers less than half the belt.
  const REF = { wordmark: [0.0760, 0.0890], logo: [0.2125, 0.2280] };
  const tiles = (r, n) => {
    const out = [];
    const tw = Math.floor(r.w / n);
    if (tw < 12 || r.h < 12) return out;
    for (let i = 0; i < n; i++) {
      const e = energy({ x: r.x + i * tw, y: r.y, w: tw, h: r.h });
      if (e != null) out.push(e);
    }
    return out;
  };
  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s.length % 2 ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  // ⚠️ AND ENERGY ALONE CANNOT SEE A GHOST. Proven on the old plate: its
  // wordmark fill scored 2.0x the belt's energy and sailed through, because
  // the scars are not only smooth — the patch edges and a stray cloud
  // fragment the old donor had grabbed are HARD, and hard edges are energy.
  // What the client actually saw was letter-SHAPED structure, so the second
  // metric looks for exactly that: column means, minus their own smooth trend.
  // Vertical strokes leave streaks in that signal; sky does not. Offline on
  // the plate itself — belt sky 0.329, old fill 1.106, new fill 0.281, and
  // the letters themselves 39.4.
  const streak = (r) => {
    if (r.w < 24 || r.h < 8) return null;
    c2.canvas.width = r.w; c2.canvas.height = r.h;
    c2.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = c2.getImageData(0, 0, r.w, r.h).data;
    const cm = new Float64Array(r.w);
    for (let x = 0; x < r.w; x++) {
      let s = 0;
      for (let y = 0; y < r.h; y++) {
        const i = (y * r.w + x) * 4;
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      cm[x] = s / r.h;
    }
    // Smoothing window scales with the fit, so this measures the same
    // physical width of painting on every phone.
    const win = Math.max(9, Math.round(25 * box.s)) | 1;
    let acc = 0;
    for (let x = 0; x < r.w; x++) {
      let s = 0, n = 0;
      for (let k = x - (win >> 1); k <= x + (win >> 1); k++) {
        if (k >= 0 && k < r.w) { s += cm[k]; n++; }
      }
      acc += Math.abs(cm[x] - s / n);
    }
    return acc / r.w;
  };
  const probe = (k) => {
    const r = rect(planes[k]);
    const t = Math.round(r.w * 0.12);
    const inner = { x: r.x + t, y: r.y, w: r.w - 2 * t, h: r.h };
    const [f0, f1] = REF[k];
    const ref = { x: inner.x, y: Math.round(box.dy + f0 * box.dh),
      w: inner.w, h: Math.round((f1 - f0) * box.dh) };
    const ti = tiles(inner, 6), tr = tiles(ref, 6);
    return { inside: median(ti), ref: median(tr), nIn: ti.length, nRef: tr.length,
      streakIn: streak(inner), streakRef: streak(ref) };
  };

  // REPLAY THE ASSEMBLY FROM ZERO — same reason introorder.mjs does it: by the
  // time the harness has attached, the intro is already ~28 ticks in.
  // ⚠️ There is no state.introT; it is a local in draw(). Derive it the way
  // draw() does, off the two fields that really are on state.
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  g.introAt = g.screenT;
  await frame();
  const introT = () => g.screenT - g.introAt;
  // 26: base fully up. 74: WILL HILL: lands. 118: PLAYER ONE + stars land.
  // 30 is the first solid frame with nothing landed; 90 still has the logo's
  // box open. Sampled as they pass rather than seeked to — there is no seek
  // hook on this page and inventing one would be grading a harness fiction.
  const want = [{ t: 30, keys: ['wordmark', 'logo'] }, { t: 90, keys: ['logo'] }];
  const got = [];
  while (introT() < 130) {
    const now = introT();
    for (const wgt of want) {
      if (!wgt.done && now >= wgt.t) {
        wgt.done = true;
        for (const k of wgt.keys) got.push({ t: now, k, ...probe(k) });
      }
    }
    if (want.every((w) => w.done)) break;
    await frame();
  }
  return { got, box, canvas: { w: cv.width, h: cv.height } };
});

console.log(`  canvas ${film.canvas.w}x${film.canvas.h}, plate drawn at `
  + `s=${film.box.s.toFixed(3)} dy=${film.box.dy.toFixed(1)}`);
for (const r of film.got) {
  const ratio = r.ref && r.inside != null ? r.inside / r.ref : null;
  console.log(`  tick ${r.t} ${r.k}: inside ${r.inside?.toFixed(3)} (${r.nIn} tiles) `
    + `vs belt sky ${r.ref?.toFixed(3)} (${r.nRef} tiles) -> ratio ${ratio?.toFixed(3)}`);
  check(`tick ${r.t}: the ${r.k} sky is as textured as the belt sky`,
    ratio != null && ratio >= 0.6, `ratio ${ratio?.toFixed(3)} (>= 0.60)`);
  const sr = r.streakRef && r.streakIn != null ? r.streakIn / r.streakRef : null;
  console.log(`  tick ${r.t} ${r.k}: column streak ${r.streakIn?.toFixed(3)} vs belt `
    + `${r.streakRef?.toFixed(3)} -> ratio ${sr?.toFixed(3)}`);
  check(`tick ${r.t}: no letter-shaped ghost in the ${r.k} sky`,
    sr != null && sr <= 2.0, `streak ratio ${sr?.toFixed(3)} (<= 2.0)`);
}
check('both boxes were sampled before their lettering landed', film.got.length === 3,
  `${film.got.length} samples`);

// The lettering must still ARRIVE. A plate with the holes left open would
// score perfectly on texture and be a broken intro.
const landed = await p.evaluate(async () => {
  const g = window.__game;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const { INTRO_TICKS } = await import('/src/render/title.js');
  while (g.screenT - g.introAt < INTRO_TICKS + 6) await frame();
  const cv = document.querySelector('canvas');
  const box = g.titleBox;
  const f = [0.1993, 0.0916, 0.8206, 0.1415];
  const r = {
    x: Math.round(box.dx + f[0] * box.dw), w: Math.round((f[2] - f[0]) * box.dw),
    y: Math.round(box.dy + f[1] * box.dh), h: Math.round((f[3] - f[1]) * box.dh),
  };
  const c2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  c2.canvas.width = r.w; c2.canvas.height = r.h;
  c2.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const d = c2.getImageData(0, 0, r.w, r.h).data;
  let white = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx > 150 && (mx - mn) / mx < 0.22) white++;
  }
  return white;
});
check('WILL HILL: still lands on the finished card', landed > 500, `${landed} white px`);
await p.screenshot({ path: `${OUT}/barescars-settled.png` });

const pass = checks.filter((c) => c[1]).length;
console.log(`\n${pass === checks.length ? 'ALL ' : ''}${pass}/${checks.length} PASS`);
await b.close();
process.exit(pass === checks.length ? 0 : 1);
