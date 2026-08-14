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
// So there are four things to prove on every shape, and pixel-peeping one
// screenshot proves none of them:
//   1. no black bars at the sides,
//   2. the top of WILL HILL: is on screen,
//   3. the foot of OPTIONS is on screen,
//   4. no two controls overlap — filling the width costs the road CHAMPAGNE
//      RELAY and MUSIC used to stand on, and the first attempt drew all three
//      on top of PRESS START.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT = process.env.SEAM_OUT || '.';
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
const OPT_BOTTOM = 1635;

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
      opt: t.optionsRect(bx), relay: t.relayRect(bx), music: t.musicRect(bx),
    };
  }, [NAME_TOP, OPT_BOTTOM]);

  console.log(`\n  ${name}  ${w}x${h}`);
  check(`  no side bars`, r.bars <= 1 && r.fillsWidth, `dx=${r.bars}`);
  check(`  the top of WILL HILL: is on screen`, r.nameTop >= 0, `row 165 at y=${r.nameTop}`);
  check(`  the foot of OPTIONS is on screen`, r.optBottom <= r.ch,
    `row 1635 at y=${r.optBottom} of ${r.ch}`);
  check(`  RELAY and MUSIC do not overlap`, !overlaps(r.relay, r.music),
    JSON.stringify({ relay: r.relay && Math.round(r.relay.y), music: r.music && Math.round(r.music.y) }));
  check(`  neither control covers OPTIONS`,
    !overlaps(r.relay, r.opt) && !overlaps(r.music, r.opt));
  // Everything drawn has to be inside the frame, or a control is unreachable.
  const inside = (x) => !x || (x.y >= 0 && x.y + x.h <= r.ch && x.x >= 0 && x.x + x.w <= 430 + 400);
  check(`  both controls are inside the frame`, inside(r.relay) && inside(r.music));
  // Client: "reduced to about the same width as OPTIONS and equal width as
  // MUSIC." All three now share one literal target width, so this checks it
  // rather than trusting the geometry — a stray extra pixel of gap or icon
  // width is exactly the kind of thing that reads fine in the code and wrong
  // on his phone.
  check(`  RELAY, OPTIONS and MUSIC are all the same width`,
    Math.abs(r.relay.w - r.opt.w) <= 1 && Math.abs(r.music.w - r.opt.w) <= 1,
    `opt=${r.opt.w.toFixed(1)} relay=${r.relay.w.toFixed(1)} music=${r.music.w.toFixed(1)}`);

  await p.screenshot({ path: `${OUT}/titlefit-${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
  await p.context().close();
}

console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w.trim()).join(', ')}`);
await b.close();
