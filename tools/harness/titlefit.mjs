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
// ⚠️ THIS FILE IS ABOUT THE PAINTING, NOT THE BUTTONS, AND IT DID NOT USE TO
// BE. It carried three checks on where OPTIONS and MUSIC sat relative to each
// other, from when those were his painted word and a box stacked under it —
// including one asserting MUSIC is centred on OPTIONS' own x, which was the
// literal shape of "stacked perfectly" at the time. The controls are laid out
// from the SCREEN now (homeLayout in src/render/title.js), there are three of
// them, and they sit in a row. Their geometry, their tap targets and where
// they route moved to tools/harness/titlehome.mjs, which is where the client's
// newer call — "I'm not really comfortable with how start game, options and
// music buttons are sitting" — is defended. Nothing was dropped; it moved.
//
// What is left here is the question this file was opened to answer, which has
// not changed: does his PAINTING fill the screen on every phone without
// losing anything off an edge?
//   1. no black bars at the sides,
//   2. the top of WILL HILL: is on screen,
//   3. the foot of PRESS START is on screen — his hero lettering is painted
//      into the plate and cannot be moved out of a bad crop's way, so it is
//      the bottom-most thing the framing has to keep. It used to be OPTIONS'
//      foot at row 1635; that word is off the plate now
//      (tools/cut_title_options_out.py) and checking its row would be
//      checking bare road.
//   4. CHAMPAGNE RELAY stays off the card — "that's like a dev/dashboard
//      thing" — so `relayRect` must not exist on the title module at all.
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
// PRESS START's painted foot: PROMPT.y + PROMPT.h in src/render/title.js.
const PROMPT_BOTTOM = 1572;

for (const [name, w, h] of SHAPES) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/?tod=day', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.titleBox, null, { timeout: 25000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(([nameTop, promptBottom]) => {
    const g = window.__game, t = window.__title, bx = g.titleBox;
    const cv = document.querySelector('canvas');
    const row = (src) => bx.dy + (src / 1844) * bx.dh;
    return {
      bars: Math.round(bx.dx),
      fillsWidth: Math.round(bx.dw) >= cv.width - 1,
      nameTop: Math.round(row(nameTop)),
      promptFoot: Math.round(row(promptBottom)),
      ch: cv.height,
      relayGone: typeof t.relayRect === 'undefined' && typeof t.hitRelay === 'undefined',
    };
  }, [NAME_TOP, PROMPT_BOTTOM]);

  console.log(`\n  ${name}  ${w}x${h}`);
  check(`  no side bars`, r.bars <= 1 && r.fillsWidth, `dx=${r.bars}`);
  check(`  the top of WILL HILL: is on screen`, r.nameTop >= 0, `row 165 at y=${r.nameTop}`);
  check(`  the foot of PRESS START is on screen`, r.promptFoot <= r.ch,
    `row ${PROMPT_BOTTOM} at y=${r.promptFoot} of ${r.ch}`);
  check(`  CHAMPAGNE RELAY stays off the title card`, r.relayGone,
    `relayRect=${typeof r.relayGone}`);

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

// ── NO BACKGROUND AT THE HEAD OR THE FOOT ────────────────────────────────
//
// Client, on the installed app: "there is a black space at the bottom of the
// pwa... can we bring the image down some to cover that?"
//
// It was never the painting letterboxing — the canvas BOX stopped at the
// safe-area line and the strip below it was body's own #0a0810 showing
// through. Three things had to move together (index.html #game, resize() in
// main.js, fit() in stillscene.js) and any one of them regressing brings the
// band back, so this grades the only thing that matters: is there a row of
// canvas at either end with no painting on it?
//
// TWO MEASUREMENTS, because they fail differently. The GEOMETRY says whether
// the plate's rect reaches both edges; the PIXELS say whether what is drawn
// there is actually painting. A plate that reached the edge while the scene
// cleared to #07060a underneath would pass the first and fail the second.
{
  const BG_HEX = [7, 6, 10];          // stillscene's clear colour
  for (const [w, h, inset, tod] of [[430, 932, 59, 'day'], [393, 852, 59, 'night'],
    [375, 667, 20, 'day'], [412, 915, 24, 'night'], [1280, 800, 0, 'day']]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
    await pg.addInitScript((r) => { window.__safeTopOverride = r; }, inset);
    await pg.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
    await pg.waitForTimeout(300);
    const r = await pg.evaluate(({ bg }) => {
      const cv = document.querySelector('canvas');
      const box = window.__game.titleBox;
      if (!box) return null;
      // Rows of the canvas that are entirely the clear colour, counted in
      // from each end. The plate is a photograph of a street; a row of it is
      // never uniformly #07060a, so any such row is uncovered canvas.
      const c2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      c2.canvas.width = cv.width; c2.canvas.height = 1;
      const bgRow = (y) => {
        c2.drawImage(cv, 0, y, cv.width, 1, 0, 0, cv.width, 1);
        const d = c2.getImageData(0, 0, cv.width, 1).data;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - bg[0]) > 6 || Math.abs(d[i + 1] - bg[1]) > 6
              || Math.abs(d[i + 2] - bg[2]) > 6) return false;
        }
        return true;
      };
      let head = 0; while (head < cv.height && bgRow(head)) head++;
      let foot = 0; while (foot < cv.height && bgRow(cv.height - 1 - foot)) foot++;
      return {
        cw: cv.width, ch: cv.height,
        boxH: Math.round(cv.getBoundingClientRect().height),
        gapTop: Math.max(0, box.dy), gapBot: Math.max(0, cv.height - (box.dy + box.dh)),
        head, foot,
      };
    }, { bg: BG_HEX });
    const tag = `[foot ${w}x${h} ${tod}]`;
    if (!r) { check(`${tag} the title box was readable`, false); await pg.context().close(); continue; }
    check(`${tag} the canvas box spans the viewport`, r.boxH >= h,
      `css box ${r.boxH} vs viewport ${h}`);
    check(`${tag} the painting reaches both edges`, r.gapTop < 0.5 && r.gapBot < 0.5,
      `gap top ${r.gapTop.toFixed(1)}, bottom ${r.gapBot.toFixed(1)}`);
    check(`${tag} no background rows at the head or the foot`, r.head === 0 && r.foot === 0,
      `${r.head} rows at the head, ${r.foot} at the foot`);
    await pg.context().close();
  }

  // ⚠️ AND THE CHECK ABOVE MUST BE ABLE TO FAIL. Chromium cannot launch as an
  // installed iOS app, so the band is reproduced the way the bug produced it:
  // shorten the canvas BOX and let the page's own background show under it.
  // If this does not go red, the three checks above are decoration.
  {
    const pg = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
    await pg.goto('http://localhost:5199/?tod=day', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
    const band = await pg.evaluate(async () => {
      const cv = document.querySelector('canvas');
      cv.style.height = (window.innerHeight - 34) + 'px';   // the home-indicator inset
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 300));
      const shot = cv.getBoundingClientRect();
      return { boxH: Math.round(shot.height), viewport: window.innerHeight,
        uncovered: Math.round(window.innerHeight - shot.height) };
    });
    check('[break-test] shortening the canvas box does reopen the band',
      band.uncovered >= 30,
      `box ${band.boxH} in a ${band.viewport} viewport leaves ${band.uncovered}px of page showing`);
    await pg.context().close();
  }
}

console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w.trim()).join(', ')}`);
await b.close();
