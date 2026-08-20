// THE TWO SHELLS OF ONE PHONE — Safari (URL bar, short viewport) vs the
// installed PWA (full height, islands) — and the small phones behind them.
//
// Client, with photographs of the SAME build in both shells: *"we need to
// find some middle ground so both of them... I've worked hard on them clouds
// bro and that's not showing up on the web browser."*
//
// ⚠️ THE CLOUDS ARE THE ACCEPTANCE CRITERION, NOT THE WORDMARK. This grades,
// per geometry, from pixels:
//   sky      screen px of sky visible above the wordmark's topmost ink —
//            the band his clouds live in. Safari used to crop to EXACTLY the
//            ink row (0px of sky), which photographed as a clipped title.
//   feet gap px between the hero's painted sneakers and the top of the drawn
//            PRESS START block — the "too close to his feet" complaint.
// Geometries: PWA 430x932 (islanded), Safari ~430x780, the older ~430x830,
// iPhone SE 375x667, and a Pixel-ish 412x780.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/titleshells.mjs [--shots]
const _pw = await import(process.env.PLAYWRIGHT); const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const checks = []; const ck = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };
const shots = process.argv.includes('--shots');

const GEOMS = [
  // name, width, height, top inset (island/clock), bottom inset (home bar).
  // Insets are the PWA's problem: Safari accounts for its own bars.
  ['PWA 430x932', 430, 932, 59, 34],
  ['Safari 430x780', 430, 780, 0, 0],
  ['Safari 430x830', 430, 830, 0, 0],
  ['SE 375x667', 375, 667, 0, 0],
  ['Pixelish 412x780', 412, 780, 0, 0],
];

for (const [name, w, h, inset, insetBot] of GEOMS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.addInitScript(([top, bot]) => {
    window.__safeTopOverride = top;
    if (bot) window.__safeBottomOverride = bot;
  }, [inset, insetBot]);
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  // Let the assembly intro finish so the wordmark is at rest.
  await p.waitForTimeout(4500);

  const m = await p.evaluate(() => {
    const cv = document.querySelector('canvas');
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const d = c.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    // The wordmark's topmost ink: scan the columns the lettering occupies
    // (middle 60%) for the first row that is dark (the black outline) or
    // metal-bright (the WILL HILL face) rather than sky blue.
    const x0 = Math.floor(W * 0.25), x1 = Math.floor(W * 0.75);
    let inkY = -1;
    for (let y = 0; y < Math.floor(H * 0.5) && inkY < 0; y++) {
      let hits = 0;
      for (let x = x0; x < x1; x += 4) {
        const [r, g, bl] = at(x, y);
        const dark = r < 70 && g < 70 && bl < 80;
        const face = r > 150 && g > 150 && bl > 150 && Math.abs(r - bl) < 40;
        if (dark || face) hits++;
      }
      if (hits > 14) inkY = y;   // a real ink row, not a bird or a star
    }
    // Sky band above the ink: rows that are mostly sky/cloud (blue-dominant
    // or cloud-white), counted from the ink row upward.
    let sky = 0;
    if (inkY > 0) {
      for (let y = inkY - 1; y >= 0; y--) {
        let good = 0, n = 0;
        for (let x = x0; x < x1; x += 4) {
          const [r, g, bl] = at(x, y); n++;
          if (bl > r && bl > 60) good++;              // sky
          else if (r > 160 && g > 160 && bl > 160) good++; // cloud
        }
        if (good / n > 0.7) sky++; else break;
      }
    }
    const btns = (window.__screenButtons || []).map((x) => ({ label: x.label, y: x.y, h: x.h }));
    return { inkY, sky, dpr: W / cv.getBoundingClientRect().width, btns };
  });
  const cssSky = (m.sky / m.dpr).toFixed(0);
  const cssInk = (m.inkY / m.dpr).toFixed(0);
  console.log(`${name}: wordmark ink at y=${cssInk}css, sky above it ${cssSky}px`);
  if (shots) {
    await p.screenshot({ path: `/tmp/claude-0/-home-user-will-hill-player-one-game/c1dd2cd0-1bc7-5470-833f-f06ac511c37d/scratchpad/shell-${name.replace(/\W+/g, '')}.png` });
  }
  // HIS CRITERION: clouds visible in EVERY shell. The cloud puffs sit right
  // above the wordmark; 20 css px is the least that still reads as weather
  // rather than as a blue sliver.
  ck(`${name}: clouds show above the wordmark`, Number(cssSky) >= 20, `${cssSky}px of sky`);
  ck(`${name}: the wordmark clears the top edge`, Number(cssInk) >= (inset ? 59 : 8) + 2, `ink at ${cssInk}px`);
  // THE OTHER END — the client's PWA question: "What about the bottom?" The
  // whole drawn control block (PRESS START, the bar, OPTIONS | MUSIC) must
  // clear the home-indicator strip homeLayout reserves. Measured from the
  // layout's own rects, in CSS px, against the canvas's CSS height minus the
  // inset this geometry declared.
  const lay = await p.evaluate(() => {
    const t = window.__title, bx = window.__game.titleBox;
    const l = t.homeLayout(bx);
    const o = t.optionsRect(bx), m = t.musicRect(bx);
    const cv = document.querySelector('canvas');
    const s = cv.getBoundingClientRect().width / cv.width;
    const bot = Math.max(l.prompt.y + l.prompt.h, l.banner.y + l.banner.h,
      o.y + o.h, m.y + m.h);
    return { botCss: bot * s, cssH: cv.getBoundingClientRect().height };
  });
  ck(`${name}: the control block clears the bottom inset`,
    lay.botCss <= lay.cssH - insetBot + 1,
    `block foot ${lay.botCss.toFixed(0)}px vs usable ${(lay.cssH - insetBot).toFixed(0)}px`);
  await ctx.close();
}
console.log('\n' + (checks.every(([, o]) => o) ? `ALL ${checks.length} PASS` : 'FAILED'));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
