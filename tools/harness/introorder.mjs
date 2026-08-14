// DOES HIS NAME LAND BEFORE PLAYER ONE?
//
// Client: "on the intro transition, before PLAYER ONE shows up, will he show
// up — so his name should appear and PLAYER ONE appear last than all of that."
//
// The INTRO table says so. That is not the same as it being true on screen,
// and this exact page has already shipped one order nobody chose: `tp_logo` is
// the GOLD line only, so WILL HILL: could not appear until the whole backdrop
// faded up — AFTER the line beneath it. A table read is not a measurement.
//
// So this samples the running canvas. Two probe boxes, one over each line of
// the wordmark, in canvas coordinates derived from the card's own emitted
// bounding box. A line has "landed" when the ink inside its box stops moving.
// Each line is counted by ITS OWN COLOUR — the same key the cutter used, white
// and low-saturation for WILL HILL:, warm and saturated for PLAYER ONE. A
// first pass counted "anything that is not sky blue", which read a full
// 11,352/11,352 before either card had moved: during the assembly the backdrop
// is not there yet, so the box is BLACK, and black is not blue. An empty
// screen scored as a finished wordmark.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT = process.env.SEAM_OUT || '.';
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

// Sample every other tick through the whole assembly. Each sample counts the
// non-sky pixels inside each line's box, so a card sliding in registers as the
// count climbing and a landed card as the count going flat.
const film = await p.evaluate(async () => {
  const g = window.__game, t = window.__title;
  const cv = document.querySelector('canvas');
  const box = g.titleBox;
  const planes = { wordmark: [0.2028, 0.0933, 0.8171, 0.1399],
    logo: [0.102, 0.0911, 0.9707, 0.2185] };
  // ⚠️ THE TWO LINES ALMOST TOUCH, so each probe has to be trimmed back to the
  // part of its box that only its own colour can reach.
  //
  // The wordmark plane runs to y-frac 0.1399 (source row 258) but the gold
  // starts at row 231, and PLAYER ONE's top bevel is light enough to pass a
  // white key. Untrimmed, the white count climbed from 4,946 to 8,004 over
  // ticks 100-126 — exactly the window the BACKDROP fades up in — which read
  // as WILL HILL: still arriving long after its card had landed, and inverted
  // the whole result. 0.1220 is source row 225, clear of the gold.
  //
  // The logo plane spans BOTH lines (SAM took the pair as one region), so its
  // probe starts at 0.145 — below the white line entirely.
  //
  // titleBox is the DRAWN rect of the plate: { s, dx, dy, dw, dh }. Fractions
  // in the planes file are of the SOURCE plate, so they map through dw/dh.
  const rect = (f, from, to) => ({
    x: Math.round(box.dx + f[0] * box.dw), w: Math.round((f[2] - f[0]) * box.dw),
    y: Math.round(box.dy + (from ?? f[1]) * box.dh),
    h: Math.round(((to ?? f[3]) - (from ?? f[1])) * box.dh),
  });
  // ⚠️ AND THE WHITE PROBE MUST NOT SEE THE CLOUDS. They are white and
  // unsaturated too, they sit at source rows 44-128 directly above the
  // wordmark, and a probe running to the top of the frame counts them. That
  // put the white centroid at 63.7 when WILL HILL: actually rests at row ~109
  // — the reading was mostly cloud — and it kept creeping while the backdrop
  // faded up its own thinner wisps. Starting at source row 156 clears the
  // cloud bank and still leaves the card room to descend into.
  //
  // The gold probe can run tall: nothing else on this page passes a warm
  // saturated key.
  const boxes = { wordmark: rect(planes.wordmark, 0.0846, 0.1236),
    logo: rect(planes.logo, 0.145, 0.2185) };
  boxes.logo.y = 0; boxes.logo.h = Math.round(0.2185 * box.dh + box.dy);

  // ── POSITION, NOT PIXEL COUNT ──────────────────────────────────────────
  //
  // Counting a line's pixels inside its own box cannot tell "the card landed"
  // from "the backdrop arrived". Measured: the white count sat at 3,106 from
  // tick 86 and then climbed to 4,994 across ticks 100-126, which is exactly
  // the BASE_IN window — the card's feathered edges read dark over the black
  // of an unbuilt page and light once there is sky behind them. The count
  // moves; the letters do not.
  //
  // So track the CENTROID ROW of each colour down the whole flight path. A
  // card in flight has its centroid somewhere above its resting row; a landed
  // card holds. The backdrop cannot shift it, because the backdrop's own copy
  // of the line is at the same rows. It also survives the two cards crossing:
  // PLAYER ONE sweeps down THROUGH WILL HILL: on its way past (white ink drops
  // to 379 at tick 74 as the gold covers it), and the white pixels that are
  // still visible are still on their own rows, so the centroid holds.
  const c2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const centroid = (r, kind) => {
    c2.canvas.width = r.w; c2.canvas.height = r.h;
    c2.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = c2.getImageData(0, 0, r.w, r.h).data;
    let n = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const hit = kind === 'white' ? (mx > 150 && sat < 0.22)
        : (R > 120 && R > B + 55 && G > B + 25 && sat > 0.35);
      if (hit) { n++; sy += Math.floor((i / 4) / r.w); }
    }
    return { n, y: n ? +(r.y + sy / n).toFixed(1) : null };
  };

  // REPLAY THE ASSEMBLY FROM ZERO. It starts the instant the page loads, so by
  // the time a harness has attached and resolved the boxes it is already ~28
  // ticks in — past the first landing. Re-stamping introAt runs it again.
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  g.introAt = g.screenT;
  await frame();
  const out = [];
  const end = t.settledAt() + 8;
  while ((g.introT || 0) < end) {
    const w = centroid(boxes.wordmark, 'white');
    const l = centroid(boxes.logo, 'gold');
    out.push({ t: g.introT || 0, wy: w.y, wn: w.n, ly: l.y, ln: l.n });
    await frame();
  }
  return { rows: out, boxes, settledAt: t.settledAt() };
});

const rows = film.rows;
console.log(`  sampled ${rows.length} frames, intro settles at tick ${film.settledAt}`);
console.log(`  probe boxes: ${JSON.stringify(film.boxes)}`);

// Landed = the first tick after which the centroid never moves more than 2px
// from where it finishes.
//
// TWO px, not one, and the reason is measurable rather than a fudge: these
// cards travel five hundred pixels, and the only sub-2px motion left after
// they stop is the backdrop fading up behind their antialiased edges, which
// walks the white centroid 97.5 -> 98.9 across BASE_IN. Two is far below any
// real movement and just above that.
//
// OCCLUDED FRAMES ARE NOT MOVEMENT EITHER. You cannot measure where a card is
// while another card is on top of it, and PLAYER ONE sweeps down THROUGH WILL
// HILL: on its way past — white pixels drop from 4,104 to 871 for a few ticks
// and the handful still showing skew the centroid 8px. Frames holding under
// half the final pixel count are dropped rather than read.
function landedAt(yKey, nKey) {
  const finN = Math.max(...rows.map((r) => r[nKey] || 0));
  const seen = rows.filter((r) => r[yKey] !== null && r[nKey] >= finN * 0.5);
  if (!seen.length) return null;
  const fin = seen[seen.length - 1][yKey];
  for (let i = 0; i < seen.length; i++) {
    if (seen.slice(i).every((r) => Math.abs(r[yKey] - fin) <= 2.0)) return seen[i].t;
  }
  return null;
}
const wm = landedAt('wy', 'wn');
const lg = landedAt('ly', 'ln');
console.log('');
console.log('  tick    WILL HILL: centroid/px      PLAYER ONE centroid/px');
for (const r of rows.filter((_, i) => i % 6 === 0)) {
  const f = (y, n) => `${y === null ? '   --' : String(y).padStart(6)} /${String(n).padStart(6)}`;
  console.log(`  ${String(r.t).padStart(4)}      ${f(r.wy, r.wn)}        ${f(r.ly, r.ln)}`);
}
console.log('');
console.log(`  WILL HILL: stops moving at tick ${wm}`);
console.log(`  PLAYER ONE stops moving at tick ${lg}`);

check('both lines actually arrive', wm !== null && lg !== null, `${wm} / ${lg}`);
check('HIS NAME LANDS FIRST — PLAYER ONE is last', wm !== null && lg !== null && wm < lg,
  `WILL HILL: ${wm}, PLAYER ONE ${lg}`);
// And it has to be a beat you can see, not one tick.
//
// The threshold is deliberately well under what this reports. A centroid
// SATURATES: once a card substantially overlaps its probe the reading is
// already at its final value, so WILL HILL: reads 97.5 from tick 50 — nine
// ticks after it starts moving and twenty before its t1. The gap on screen is
// wider than the gap measured here, and asserting near the measured number
// makes the test flake on a change that improved things.
check('there is a visible beat between them',
  wm !== null && lg !== null && (lg - wm) >= 8, `${lg - wm} ticks apart, at least`);
// Nothing else may still be moving when PLAYER ONE lands, or it is not "last".
const stillMoving = rows.filter((r) => r.t > wm && r.t < lg).length;
check('the name is up and holding while PLAYER ONE comes in', stillMoving > 0);

await p.screenshot({ path: `${OUT}/intro-settled.png` });
console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w).join(', ')}`);
await b.close();
