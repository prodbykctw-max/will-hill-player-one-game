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
// ⚠️ 34, and it came down TWICE for the same reason — the road below his
// painted PRESS START is fixed by the artwork, and anything that takes a bite
// out of it comes straight off these controls. First the two-row layout
// (44 -> 38), then reserving the home-indicator strip in the installed app
// (38 -> 34). Each step was the same trade, taken the same way: his layout is
// the invariant, the pixels are what bend.
const TAP_MIN = 34;          // the floor; 44 wherever the road allows
// ⚠️ PRESS START IS PART OF THE BLOCK NOW. It used to be painted into the
// plate at a fixed row, which is what made one layout impossible: the pavement
// left under it varied 3x across phones. It is a drawn sprite of his own
// lettering (tools/cut_title_prompt.py) and moves with everything else.
// The hero cannot move, so HE is what the block clamps against.
const HERO_FOOT = 0.7825;    // planes.json hero.frac[3]
// On the two tightest shapes in the set the block reaches its floors and still
// wants more room than exists between his shoes and the home indicator. That
// is measured, not tolerated blindly — 30px is what an iPhone SE needs in a
// standalone launch and anything past it means something regressed.
const HERO_SLACK = 30;
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
    const sprite = (window.__titleImages || {}).tp_prompt || {};
    return {
      rows: l.rows,
      prompt: t.promptRect(bx),
      banner: t.bannerRect(bx), opts: t.optionsRect(bx), music: t.musicRect(bx),
      label: t.bannerLabel(bx, false),
      feet: bx.dy + 0.7825 * bx.dh,
      spriteW: sprite.width || 0, spriteH: sprite.height || 0,
      spriteSrc: (sprite.src || '').split('/').pop(),
      cw: cv.width, ch: cv.height,
    };
  }, PROMPT_BOTTOM);

  const min = TAP_MIN;
  const all = [['the contest banner', r.banner], ['OPTIONS', r.opts], ['MUSIC', r.music]];
  console.log(`\n  ${name}  ${w}x${h}`);

  // ⚠️ THERE IS ONE LAYOUT AND EVERY DEVICE GETS IT. Client: "I just want
  // uniformity across all devices if possible." Two earlier versions shipped
  // a second arrangement on the smallest phones — one of them with the
  // contest button reading "ENTER" under PRESS START — and both times he
  // found it before any check did. No shape may fall out of it now, at any
  // size, for any reason.
  check('  one layout: PRESS START, the bar, then the two buttons',
    r.rows === 2 && !!r.prompt, JSON.stringify({ rows: r.rows, prompt: !!r.prompt }));
  check('  and PRESS START is above the bar, which is above the row',
    r.prompt.y + r.prompt.h <= r.banner.y + 0.5
    && r.banner.y + r.banner.h <= r.opts.y + 0.5,
    `prompt ${Math.round(r.prompt.y)}, banner ${Math.round(r.banner.y)}, row ${Math.round(r.opts.y)}`);
  // His lettering is a sprite now; a missing or empty one would silently
  // leave the page with no PRESS START at all.
  check('  his painted PRESS START is loaded and drawn, not set in type',
    r.spriteW >= 200 && r.spriteH >= 20,
    `sprite ${r.spriteW}x${r.spriteH} from ${r.spriteSrc}`);
  // ⚠️ AIR, NOT MERELY CLEARANCE. Client, on the live PWA: "the start button
  // cluster on the home screen seems to be a little too close to his feet."
  // It was 9px on a 15 Pro — not an overlap, and still wrong, because nothing
  // asked the block to leave him room. HERO_AIR reserves it before the block
  // is measured out, so where there is slack the sizes are untouched.
  check('  the block leaves the hero air, or is provably out of room',
    r.prompt.y >= r.feet + 20 || r.prompt.y >= r.feet - HERO_SLACK,
    `block top ${Math.round(r.prompt.y)} vs his feet ${Math.round(r.feet)} `
    + `(${Math.round(r.prompt.y - r.feet)}px)`);

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
    check(`  ${label} sits below PRESS START`, !!rect && rect.y >= r.prompt.y - 0.5,
      rect ? `top ${Math.round(rect.y)} vs PRESS START at ${Math.round(r.prompt.y)}` : 'missing');
  }
  check('  nothing in the block overlaps anything else in it',
    !overlaps(r.banner, r.opts) && !overlaps(r.banner, r.music) && !overlaps(r.opts, r.music)
    && !overlaps(r.prompt, r.banner) && !overlaps(r.prompt, r.opts) && !overlaps(r.prompt, r.music));

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

// ── 4b. THE INSTALLED APP: NOTHING UNDER THE HOME INDICATOR ──────────────
//
// Client, with a PWA screenshot: OPTIONS and MUSIC sliced off at the foot of
// the screen, the top edge of each box just visible and nothing else.
//
// ⚠️ AND EVERY CHECK IN THIS FILE WAS GREEN WHILE THAT SHIPPED. They all
// measured against `canvas.height`, and on the installed app the canvas
// deliberately runs BELOW the usable screen — #game is
// `calc(100dvh + env(safe-area-inset-bottom))` and resize() stretches it
// further to screen.height, both so the painting reaches the foot of the
// phone. In Safari the inset is 0, so the browser and the harness agreed with
// each other and both were blind.
//
// Chromium cannot launch as a home-screen app, so stillscene exposes
// __safeBottomOverride and this asserts the invariant directly: with a strip
// reserved, no control may cross into it.
//
// ⚠️ 48 IS THE TOP OF THE RANGE, AND THAT IS A CONTRACT, NOT A CONVENIENCE.
// This used to also test 59 — the number the probe reported on a stretched
// canvas — and 59 is not an unusable strip. A real iOS home indicator is
// 34pt; the extra came from `canvasH - innerHeight`, which is VISIBLE screen
// the canvas is deliberately painted into. Reserving it cost the client ~50px
// of dead pavement and shoved PRESS START onto the hero's shoes, so
// reservedBottom caps at 48 and the cap is checked on its own below.
console.log('\n  the installed app — nothing under the home indicator');
for (const reserve of [21, 34, 48]) {
  for (const [name, w, h] of [['iPhone 15 Pro', 393, 852], ['15 Pro Max', 430, 932],
    ['Android 412', 412, 780], ['iPhone SE', 375, 667]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    const p = await ctx.newPage();
    await p.addInitScript((r) => { window.__safeBottomOverride = r; }, reserve);
    await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__game && window.__game.titleBox, null, { timeout: 25000 });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const t = window.__title, bx = window.__game.titleBox;
      const cv = document.querySelector('canvas');
      const l = t.homeLayout(bx);
      const low = Math.max(l.prompt.y + l.prompt.h, l.banner.y + l.banner.h,
        l.options.y + l.options.h, l.music.y + l.music.h);
      return { low, ch: cv.height, rows: l.rows, minH: Math.min(l.banner.h, l.options.h, l.music.h) };
    });
    const floor = r.ch - reserve;
    check(`  [PWA ${w}x${h}, ${reserve}px strip] every control clears the indicator`,
      r.low <= floor + 0.5,
      `lowest edge ${Math.round(r.low)} vs usable floor ${Math.round(floor)} of ${r.ch}`);
    // And it must not have solved that by shrinking them into nothing.
    check(`  [PWA ${w}x${h}, ${reserve}px strip] and they are still tap targets`,
      r.minH >= TAP_MIN - 0.5, `smallest ${Math.round(r.minH)}px, floor ${TAP_MIN}`);
    await ctx.close();
  }
}

// ⚠️ THE CAP ITSELF. A preposterous reading must be refused, not obeyed —
// obeying one is what put ~90px of dead pavement under his buttons.
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__safeBottomOverride = 200; });
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.titleBox, null, { timeout: 25000 });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const l = window.__title.homeLayout(window.__game.titleBox);
    const cv = document.querySelector('canvas');
    return { low: Math.max(l.banner.y + l.banner.h, l.options.y + l.options.h,
      l.music.y + l.music.h), ch: cv.height };
  });
  const reserved = r.ch - r.low;
  check('  a 200px reading is capped at 48, not obeyed', reserved <= 48 + 12,
    `${Math.round(reserved)}px reserved from a 200px reading`);
  await ctx.close();
}

// ⚠️ AND IT MUST BE ABLE TO FAIL. If the layout ignored the strip — which is
// exactly what shipped — a 59px reserve would leave the row hanging over the
// floor. Prove the check sees that, by measuring against the RAW canvas
// height the broken version used.
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__safeBottomOverride = 0; });   // the old blindness
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.titleBox, null, { timeout: 25000 });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const l = window.__title.homeLayout(window.__game.titleBox);
    const cv = document.querySelector('canvas');
    return { low: Math.max(l.banner.y + l.banner.h, l.options.y + l.options.h,
      l.music.y + l.music.h), ch: cv.height };
  });
  check('  [break-test] ignoring the strip does put controls under it',
    r.low > r.ch - 59, `lowest edge ${Math.round(r.low)} would sit below a 59px floor of ${Math.round(r.ch - 59)}`);
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
