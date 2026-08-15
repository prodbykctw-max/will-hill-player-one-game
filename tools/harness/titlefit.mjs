// DOES THE TITLE FILL THE SCREEN, ON EVERY PHONE, WITHOUT LOSING ANYTHING?
//
// Client, repeatedly and with screenshots: "there is still black on the left
// and right of the intro screen... I want the image stretched wide so it fills
// those black spaces... I want one solid image, I don't want that blurry
// looking shit."
//
// Three things were tried and thrown out before this: a squashed mirror of the
// plate's edges (backwards WILL and reversed PLAYER ONE down both sides), the
// same mirror progressively defocused (his call — no blur), and a horizontal
// stretch (a non-uniform scale on a dithered pixel painting, which this repo
// has already rejected once). What shipped is a straight ZOOM of his painting
// with the crop SPLIT between top and bottom, which fits because the plate has
// 165 spare rows above the title and 208 below OPTIONS and the worst phone
// needs 350 of that 373.
//
// So there are five things to prove on every shape, and pixel-peeping one
// screenshot proves none of them:
//   1. no black bars at the sides,
//   2. the top of WILL HILL: is on screen,
//   3. the foot of OPTIONS is on screen,
//   4. MUSIC does not overlap OPTIONS or run off the frame,
//   5. MUSIC sits DIRECTLY under OPTIONS, centred on the same x. Client:
//      "that music button ultimately is going to be under the OPTIONS button,
//      and that will be stacked perfectly." CHAMPAGNE RELAY came off the card
//      entirely after this — "that's like a dev/dashboard thing" — so this is
//      also the file that has to prove it stays gone: `relayRect` must no
//      longer exist on the title module at all.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
// Screenshots land in `shots/` unless SEAM_OUT says otherwise. It used to
// default to the repo ROOT, so any run without that variable set dropped
// untracked PNGs beside the source — which on this project is the exact
// shape of the accident the CLAUDE.md guardrail is about (harness output
// riding into a commit unnoticed). `shots/` is already gitignored.
const OUT = process.env.SEAM_OUT || 'shots';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// Logical viewports. The URL-bar rows are the important ones — a browser
// keeping 90-120px of height is what makes a phone WIDER than the plate and
// is the whole reason the bars appeared.
const SHAPES = [
  ['iPhone SE', 375, 667],
  ['iPhone 12/13/14', 390, 844],
  ['iPhone 12 + URL bar', 390, 760],
  ['iPhone 15 Pro Max', 430, 932],
  ['Pro Max + URL bar', 430, 840],
  ['Pixel 7', 412, 915],
  ['his screenshot', 471, 825],
];

// Source rows, and they must match TITLE_SAFE in src/render/title.js.
const NAME_TOP = 165;
// ⚠️ OPTIONS IS NO LONGER WHERE IT IS PAINTED. liftOptions() redraws the
// plate's bottom band OPTIONS_LIFT rows higher, so the word's foot lands at
// 1635 - OPTIONS_LIFT. Checking the painted row would now be checking bare
// road, and would pass while the word itself hung off the bottom.
const OPTIONS_LIFT = 16;
const OPT_BOTTOM = 1635 - OPTIONS_LIFT;

const overlaps = (a, c) => a && c
  && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;

for (const [name, w, h] of SHAPES) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/?tod=day', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.titleBox, null, { timeout: 25000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(([nameTop, optBottom]) => {
    const g = window.__game, t = window.__title, bx = g.titleBox;
    const cv = document.querySelector('canvas');
    const row = (src) => bx.dy + (src / 1844) * bx.dh;
    return {
      bars: Math.round(bx.dx),
      fillsWidth: Math.round(bx.dw) >= cv.width - 1,
      nameTop: Math.round(row(nameTop)),
      optBottom: Math.round(row(optBottom)),
      ch: cv.height,
      opt: t.optionsRect(bx), music: t.musicRect(bx),
      relayGone: typeof t.relayRect === 'undefined' && typeof t.hitRelay === 'undefined',
    };
  }, [NAME_TOP, OPT_BOTTOM]);

  console.log(`\n  ${name}  ${w}x${h}`);
  check(`  no side bars`, r.bars <= 1 && r.fillsWidth, `dx=${r.bars}`);
  check(`  the top of WILL HILL: is on screen`, r.nameTop >= 0, `row 165 at y=${r.nameTop}`);
  check(`  the foot of OPTIONS is on screen`, r.optBottom <= r.ch,
    `row 1635 at y=${r.optBottom} of ${r.ch}`);
  check(`  CHAMPAGNE RELAY stays off the title card`, r.relayGone,
    `relayRect=${typeof r.relayGone}`);
  check(`  MUSIC does not overlap OPTIONS`, !overlaps(r.music, r.opt));
  // Everything drawn has to be inside the frame, or MUSIC is unreachable.
  const inside = (x) => !x || (x.y >= 0 && x.y + x.h <= r.ch && x.x >= 0 && x.x + x.w <= 430 + 400);
  check(`  MUSIC is inside the frame`, inside(r.music));
  // Client: "that music button ultimately is going to be under the OPTIONS
  // button... stacked perfectly." Directly under, on the SAME x-centre, is
  // the literal shape of "stacked perfectly" — checked, not eyeballed.
  const optCx = r.opt.x + r.opt.w / 2, musicCx = r.music.x + r.music.w / 2;
  check(`  MUSIC is centred on OPTIONS' own x`, Math.abs(optCx - musicCx) <= 1,
    `optCx=${optCx.toFixed(1)} musicCx=${musicCx.toFixed(1)}`);
  check(`  MUSIC sits directly below OPTIONS, not above or beside it`,
    r.music.y > r.opt.y + r.opt.h, `opt.y=${r.opt.y.toFixed(1)} music.y=${r.music.y.toFixed(1)}`);

  await p.screenshot({ path: `${OUT}/titlefit-${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
  await p.context().close();
}

// ── THE INSTALLED APP: HIS NAME MUST CLEAR THE DYNAMIC ISLAND ─────────────
//
// Client, with a PWA screenshot: the top of WILL HILL: is cut off behind the
// island. index.html asks for a translucent status bar, so a home-screen
// launch puts the canvas under it while Safari does not — which is why the
// browser framed correctly and the installed app did not.
//
// Playwright cannot emulate an island, so stillscene exposes
// __safeTopOverride and this asserts the invariant directly: the first row of
// the SAFE band (row 165, the topmost title ink) must land at or below the
// reserved strip, at every shape, with the reserve on.
{
  const RESERVE = 62;                       // ~iPhone 15 Pro portrait inset
  for (const [w, h] of [[430, 932], [393, 852], [375, 667], [412, 915]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
    await pg.addInitScript((r) => { window.__safeTopOverride = r; }, RESERVE);
    await pg.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
    await pg.waitForTimeout(300);
    const r = await pg.evaluate(async () => {
      const t = await import('/src/render/title.js');
      const box = window.__game.titleBox;
      if (!box) return null;
      const s = box.dw / t.SRC_W;
      return { inkTop: box.dy + t.TITLE_SAFE.top * s, dy: box.dy, s: +s.toFixed(4) };
    });
    check(`[PWA ${w}x${h}] his name clears the island`,
      !!r && r.inkTop >= RESERVE - 0.5,
      r ? `title ink starts at y=${r.inkTop.toFixed(1)}, reserve ${RESERVE}` : 'no box');
    await pg.context().close();
  }
}

console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w.trim()).join(', ')}`);
await b.close();
