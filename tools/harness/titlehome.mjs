// THE HOME PAGE'S THREE CONTROLS: ARE THEY REAL BUTTONS, AND DO THEY GO
// WHERE THEY SAY?
//
// Client, on the live build: "I'm not really comfortable with how start game,
// options and music buttons are sitting. And also, from that page, I want
// someone to be able to immediately enter the contest."
//
// ⚠️ THE OLD LAYOUT WAS ANCHORED TO THE PAINTING, AND THAT WAS THE BUG.
// OPTIONS was his painted word at source row 1609 of 1844, so where it landed
// depended on how the cover-crop fell. Measured across four phones: 12-14px
// tall — a third of a usable tap target — and simultaneously bunched high
// with 73-82px of dead pavement under it on a tall phone and crushed against
// the bottom edge with a 6px gap on an SE. Same layout, opposite failure.
//
// So homeLayout() lays the controls out from the SCREEN, upward from the
// bottom inset, and this file is the thing that stops that regressing. It
// asks four questions on every shape:
//
//   1. is every control a real tap target,
//   2. do any two of them overlap, or run off the frame,
//   3. do they stay clear of PRESS START — his painted hero lettering, which
//      cannot move and must never be covered,
//   4. and does the banner actually open the right panel, both when the
//      player has entered the contest and when they have not.
//
// ⚠️ AND THAT THE PAINTED "OPTIONS" IS GONE. There are two OPTIONS the moment
// a plate carrying the painted word gets drawn — which is exactly what
// happened once the drawn control shipped: title-portrait-skyline.webp reads
// as "the towers" but below the sky it is a byte-exact copy of the whole
// plate, drawn full-frame at depth 0.020, so it repainted the word straight
// back on top of the patched plate at no parallax offset. Invisible in the
// asset audit, obvious on screen. The pixel check at the bottom of this file
// reads the band off the live canvas, which is the only place all the layers
// are actually stacked.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/titlehome.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT = process.env.SEAM_OUT || 'shots';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// The four the client actually holds, plus the two extremes of the range.
const SHAPES = [
  ['iPhone SE', 375, 667],
  ['iPhone 12 mini', 360, 780],
  ['iPhone 15 Pro', 393, 852],
  ['Android 412', 412, 780],
  ['15 Pro Max', 430, 932],
  ['Pixel 7', 412, 915],
  ['Pro Max + URL bar', 430, 840],
  ['his screenshot', 471, 825],
];

// ⚠️ HIS LAYOUT OUTRANKS THE ROUND NUMBER, and that ordering is the whole
// correction. 44px is Apple's floor and the target, but when the road runs
// short the controls SHRINK to 38 rather than rearranging themselves — the
// first version did the opposite and handed him a home page he had never
// seen on the two smallest phones. He was unambiguous: "I literally sent you
// an image so why did you not do that and who asked you to change the layout
// based on the phone type."
const TAP_MIN = 38;          // the two-row floor; 44 wherever the road allows
const TAP_MIN_SHORT = 34;    // only where the bar cannot exist at any height
// PRESS START's painted foot, in source rows: PROMPT.y + PROMPT.h in
// src/render/title.js. Nothing may cross it.
const PROMPT_BOTTOM = 1572;
// The bottom inset the layout aims for. A control may sit above it; none may
// cross it, or a home indicator eats the tap.
const SAFE_BOTTOM = 4;

const overlaps = (a, c) => a && c
  && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;

const REG = JSON.stringify({ phone: '4045550100', email: 'x@example.com' });

async function openTitle(ctx, { registered = false } = {}) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.evaluate(([reg, on]) => {
    try {
      if (on) localStorage.setItem('wh_contest_reg', reg);
      else localStorage.removeItem('wh_contest_reg');
      localStorage.removeItem('wh_signup_asked');
    } catch (_e) { /* private mode */ }
  }, [REG, registered]);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  // Past the intro assembly, so the controls are at full alpha and the
  // settled plate has taken over from the bare one.
  await p.waitForTimeout(3200);
  return p;
}

// ── 1-3. GEOMETRY, ON EVERY SHAPE ────────────────────────────────────────
for (const [name, w, h] of SHAPES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const p = await openTitle(ctx);
  const r = await p.evaluate((promptBottom) => {
    const t = window.__title, bx = window.__game.titleBox;
    const cv = document.querySelector('canvas');
    const l = t.homeLayout(bx);
    // PROMPT_FOOT (1580) is what homeLayout clamps against; promptBottom
    // (1572) is the painted foot this file grades against. Both, on purpose.
    const clampFoot = bx.dy + (1580 / 1844) * bx.dh;
    return {
      rows: l.rows,
      banner: t.bannerRect(bx), opts: t.optionsRect(bx), music: t.musicRect(bx),
      label: t.bannerLabel(bx, false),
      road: cv.height - clampFoot,
      promptFoot: bx.dy + (promptBottom / 1844) * bx.dh,
      cw: cv.width, ch: cv.height,
    };
  }, PROMPT_BOTTOM);

  const min = r.rows === 1 ? TAP_MIN_SHORT : TAP_MIN;
  const all = [['the contest banner', r.banner], ['OPTIONS', r.opts], ['MUSIC', r.music]];
  console.log(`\n  ${name}  ${w}x${h}   ${r.rows === 1 ? 'one row' : 'HIS LAYOUT'}`);

  // ⚠️ THE CHECK THAT WOULD HAVE CAUGHT IT. His layout — the green contest bar
  // across, OPTIONS and MUSIC in a row under it — is the ONLY layout, and a
  // shape may only fall out of it when the road below PRESS START genuinely
  // cannot hold it at the floor sizes. Measured, not asserted by eye: if the
  // road is there and the layout is not, that is the bug he found.
  const twoRowNeed = 8 + 38 + 8 + 38;      // bottom + banner + gap + row floors
  check('  his layout is used, or the road provably cannot hold it',
    r.rows === 2 || r.road < twoRowNeed,
    `${r.rows === 1 ? 'one row' : 'his layout'}, road ${Math.round(r.road)}px, needs ${twoRowNeed}`);

  // ⚠️ AND THE COPY, because the bug he caught was a WORD. Every check in this
  // file measured rectangles and all of them were green over a button that
  // said "ENTER" directly under PRESS START — "now the fucking enter button
  // looks redundant like it's another start button."
  check('  the contest button never just says ENTER', r.label !== 'ENTER',
    `reads "${r.label}"`);
  check('  and it names the contest, whatever the shape',
    /CONTEST|BOARD/.test(r.label), `reads "${r.label}"`);

  for (const [label, rect] of all) {
    check(`  ${label} is a real tap target`, !!rect && rect.h >= min - 0.5 && rect.w >= 44,
      rect ? `${Math.round(rect.w)}x${Math.round(rect.h)}, floor ${min}` : 'missing');
    check(`  ${label} is inside the frame`,
      !!rect && rect.x >= 0 && rect.y >= 0
      && rect.x + rect.w <= r.cw + 0.5 && rect.y + rect.h <= r.ch - SAFE_BOTTOM + 0.5,
      rect ? `x ${Math.round(rect.x)}..${Math.round(rect.x + rect.w)} of ${r.cw}, `
        + `y ${Math.round(rect.y)}..${Math.round(rect.y + rect.h)} of ${r.ch}` : 'missing');
    // His lettering is painted into the plate and cannot move out of the way.
    check(`  ${label} stays clear of PRESS START`, !!rect && rect.y >= r.promptFoot - 0.5,
      rect ? `top ${Math.round(rect.y)} vs prompt foot ${Math.round(r.promptFoot)}` : 'missing');
  }
  check('  no two controls overlap',
    !overlaps(r.banner, r.opts) && !overlaps(r.banner, r.music) && !overlaps(r.opts, r.music));

  await p.screenshot({ path: `${OUT}/titlehome-${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
  await ctx.close();
}

// ── 4. THE BANNER GOES WHERE IT SAYS, BOTH WAYS ──────────────────────────
//
// Not registered it must open the sign-up; registered it must open the board
// — and either way NOT NOW / BACK land back on the home page, because that is
// where the player was. `flow: 'title'` in src/ui/panel.js is the only thing
// making that true; the three older flows still go where they went.
const view = (p) => p.evaluate(() => ({
  open: !document.getElementById('panel').hidden,
  // ⚠️ The sign-up is a LAYER over whichever view is showing, not a view of
  // its own — ask about it first or a .find() returns the backdrop behind it.
  view: !document.getElementById('entryLayer').hidden ? 'pvForm'
    : ['pvMenu', 'pvBoard', 'pvHow', 'pvSettings']
      .find((id) => !document.getElementById(id).hidden),
  screen: window.__game.screen,
}));

const tapBanner = async (p) => {
  const { x, y } = await p.evaluate(() => {
    const r = window.__title.bannerRect(window.__game.titleBox);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
  // mouse.click, NOT touchscreen.tap — a touch event's delayed synthetic
  // click lands on whatever DOM button the panel put at that point once it is
  // open, which reads exactly like a stuck-on-form navigation bug.
  await p.mouse.click(x, y);
  await p.waitForTimeout(450);
};

console.log('\n  the banner, not registered');
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await openTitle(ctx, { registered: false });
  await tapBanner(p);
  let s = await view(p);
  check('  ENTER THE CONTEST opens the sign-up', s.open && s.view === 'pvForm', JSON.stringify(s));
  await p.click('#btnSkip');
  await p.waitForTimeout(350);
  s = await view(p);
  check('  NOT NOW goes back to the home page, not the leaderboard',
    !s.open && s.screen === 'title', JSON.stringify(s));
  // And it did not eat the run on the way past.
  check('  the game is still startable afterwards',
    await p.evaluate(() => window.__game.screen) === 'title');
  await ctx.close();
}

console.log('\n  the banner, already registered');
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await openTitle(ctx, { registered: true });
  await tapBanner(p);
  let s = await view(p);
  check('  a registered player gets the board, never the sign-up again',
    s.open && s.view === 'pvBoard', JSON.stringify(s));
  await p.click('#btnBoardBack');
  await p.waitForTimeout(350);
  s = await view(p);
  check('  BACK goes to the home page, not into OPTIONS',
    !s.open && s.screen === 'title', JSON.stringify(s));
  await ctx.close();
}

// ── 5. AND THERE IS ONLY ONE "OPTIONS" ON THE SCREEN ─────────────────────
//
// Read off the LIVE canvas, with every card stacked, because that is where
// the skyline copy of the plate reappeared after the asset itself measured
// clean. The word is high-contrast pale type on wet cobble; bare road over
// those rows measures a p99-p1 spread under 70 and the word measures ~165.
console.log('\n  the painted OPTIONS is off the plate');
for (const [name, w, h] of [['iPhone SE', 375, 667], ['Android 412', 412, 780],
  ['15 Pro Max', 430, 932]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const p = await openTitle(ctx);
  const r = await p.evaluate(() => {
    const bx = window.__game.titleBox;
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    // OPTIONS_BOX in src/render/title.js, in source pixels, mapped through
    // wherever the cover-crop put the plate on this shape.
    const sx = bx.dw / 853, sy = bx.dh / 1844;
    const x0 = Math.max(0, Math.round(bx.dx + 334 * sx));
    const x1 = Math.min(cv.width, Math.round(bx.dx + 518 * sx));
    const y0 = Math.max(0, Math.round(bx.dy + 1599 * sy));
    const y1 = Math.min(cv.height, Math.round(bx.dy + 1647 * sy));
    if (x1 <= x0 || y1 <= y0) return null;
    // Anything the layout draws over the band would be measured as the word,
    // so the check only runs on rows no control covers.
    const l = window.__title.homeLayout(bx);
    const top = Math.min(l.banner.y, l.options.y, l.music.y);
    const yEnd = Math.min(y1, Math.round(top));
    if (yEnd - y0 < 6) return { skipped: true };
    const d = g.getImageData(x0, y0, x1 - x0, yEnd - y0).data;
    const lum = [];
    for (let i = 0; i < d.length; i += 4) lum.push((d[i] + d[i + 1] + d[i + 2]) / 3);
    lum.sort((m, n) => m - n);
    const at = (q) => lum[Math.min(lum.length - 1, Math.floor(q * lum.length))];
    return { spread: at(0.99) - at(0.01), rows: yEnd - y0 };
  });
  if (!r) { check(`  [${name}] the band was measurable`, false); await ctx.close(); continue; }
  if (r.skipped) {
    // A one-row layout can sit right on the band; there is nothing left to
    // read, and nothing to hide behind either.
    check(`  [${name}] the controls cover the old word's rows`, true, 'nothing exposed to measure');
  } else {
    check(`  [${name}] no painted OPTIONS on the road`, r.spread < 70,
      `contrast ${r.spread.toFixed(0)} over ${r.rows} exposed rows (a word measures ~165)`);
  }
  await ctx.close();
}

// ⚠️ AND THE CHECK ABOVE MUST BE ABLE TO FAIL. Two of the three shapes above
// have their controls sitting exactly over the old word's rows, so there is
// nothing left to read on them — which means the metric is only doing work on
// one shape and had better be doing it properly. The pristine plate
// (title-portrait.webp) is kept in the repo WITH the word, as the archive the
// patch is cut from, so swapping it in is a real ghost, not a simulated one.
//
// ⚠️ AND IT IS SWAPPED IN FOR THE SKYLINE CARD, NOT FOR THE PLATE — which is
// the whole lesson of the bug. Putting the word back on the base changes
// nothing on screen, because the skyline card is drawn over it and is opaque
// across these rows. The topmost layer painting the band is the one that
// decides what is there, and for a year that layer has been a full copy of
// the plate hiding behind a name that says "towers".
{
  const ctx = await b.newContext({ viewport: { width: 412, height: 780 }, hasTouch: true });
  const p = await openTitle(ctx);
  const spread = await p.evaluate(async () => {
    const im = window.__titleImages;
    im.tp_skyline = im.title_base;            // the archive, word and all
    await new Promise((r) => setTimeout(r, 200));
    const bx = window.__game.titleBox;
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    const sx = bx.dw / 853, sy = bx.dh / 1844;
    const x0 = Math.round(bx.dx + 334 * sx), x1 = Math.round(bx.dx + 518 * sx);
    const y0 = Math.round(bx.dy + 1599 * sy);
    const yEnd = Math.round(window.__title.homeLayout(bx).banner.y);
    const d = g.getImageData(x0, y0, x1 - x0, yEnd - y0).data;
    const lum = [];
    for (let i = 0; i < d.length; i += 4) lum.push((d[i] + d[i + 1] + d[i + 2]) / 3);
    lum.sort((m, n) => m - n);
    const at = (q) => lum[Math.min(lum.length - 1, Math.floor(q * lum.length))];
    return at(0.99) - at(0.01);
  });
  check('  [break-test] putting the word back does trip the check', spread >= 70,
    `contrast ${spread.toFixed(0)} with the pristine plate drawn`);
  await ctx.close();
}

console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w.trim()).join(', ')}`);
await b.close();
