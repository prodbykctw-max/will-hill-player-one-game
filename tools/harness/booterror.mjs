// A FAILED BOOT MUST LOOK LIKE A FAILED BOOT — not like "loading…".
//
// Handed to this session (DASHBOARD / BACKEND, `dashboard-kills-display-sizing`)
// by the BACKDROPS / DEPLOY chat (`contest-reg-image-crop`) in
// docs/MERGE_STATE.md, with the evidence attached:
//
//   "The ASSET LOAD FAILED screen survives less than one frame. main.js paints
//    it once from the asset .catch — but loop.start() is already repainting
//    60x/sec, and with `images` still null, draw()'s branch
//    (state.screen === 'loading' || !images) covers it with the LOADING card on
//    the next rAF. EVERY boot failure presents as 'loading…' — which is
//    verbatim the client's complaint."
//
// That is why a real outage and a slow connection were indistinguishable from
// the outside, and why "loading screen taking a bit" was an unfalsifiable
// report. `bootError` is now a latch that draw() tests BEFORE the loading
// branch, so the error owns the screen instead of losing a race to it.
//
// ⚠️ BLOCK THE IMAGE REQUEST, NOT THE `?import` ONE — this is the trap that
// already cost this session a wrong conclusion. In dev, Vite requests an asset
// TWICE and they are not the same thing:
//
//     /src/assets/sprites/enemy-a.webp?import   <- the JS MODULE. Blocking it
//                                                  stops main.js loading at
//                                                  all, so window.__game never
//                                                  exists and the canvas stays
//                                                  black. That reads exactly
//                                                  like the product failing
//                                                  and it is the harness
//                                                  failing.
//     /src/assets/sprites/enemy-a.webp          <- the actual image fetch,
//                                                  which is what a broken
//                                                  deploy breaks.
//
// So the route below matches the image and explicitly lets `?import` through.
//
//   (nohup npx vite --port 5199 --strictPort &)
//   node tools/harness/booterror.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const URL_ = process.env.URL || 'http://localhost:5199/';

const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const b = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// Graded from PIXELS, not from a variable. The question this file asks is what
// the PLAYER sees, and the bug it exists for was precisely a case where the
// code had "shown" the error and the player never saw it.
// ⚠️ MATCH #e0435f TIGHTLY, NOT "REDDISH". The first version of this counted
// any red-dominant pixel (r>140, g<r-60, b<r-30) and called a HEALTHY title
// screen an error, because his title art is full of warm signage: measured, the
// top hits were 208,128,0 / 176,96,0 / 192,112,0 — amber and orange with the
// BLUE CHANNEL AT ZERO, which a loose red test cannot tell from the error
// card's pink. A tight match on #e0435f (224,67,95) scores exactly 0% on the
// healthy title, so it discriminates. The false positive was in the
// instrument, not the game — worth remembering before loosening it again.
const palette = (p) => p.evaluate(() => {
  const cv = document.querySelector('canvas');
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let red = 0, lit = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], bl = d[i + 2];
    n++;
    if (r + g + bl > 90) lit++;
    if (Math.abs(r - 224) < 28 && Math.abs(g - 67) < 28 && Math.abs(bl - 95) < 28) red++;
  }
  return { redPct: +(100 * red / n).toFixed(2), litPct: +(100 * lit / n).toFixed(2) };
});

// ── 1. A BOOT THAT CANNOT FINISH SHOWS THE ERROR, AND KEEPS SHOWING IT ────
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  let blocked = 0;
  await p.route(/enemy-a[^/?]*\.webp/, (route) => {
    const u = route.request().url();
    if (u.includes('?import')) return route.continue();   // the MODULE — never block
    blocked++;
    return route.fulfill({ status: 404, body: '' });      // the IMAGE — dead forever
  });
  await p.goto(URL_, { waitUntil: 'commit' });

  // The loader's own deadline is 15s and it retries once, so a permanent
  // failure settles at ~30s. Poll for the condition; never sleep on a guess.
  let seen = null;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(1000);
    const q = await palette(p);
    if (q.redPct > 0.05) { seen = q; break; }
  }
  check('the image request was the one killed, not the module', blocked >= 1,
    `${blocked} image request(s) 404'd`);
  check('a permanently failed boot reaches the ERROR card', !!seen,
    seen ? `red ${seen.redPct}%  lit ${seen.litPct}%` : 'never showed red in 60s');

  if (seen) {
    // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. Before the latch the card was
    // painted once and covered on the next rAF, so ONE sighting proves
    // nothing — the check is that it is still there many frames later.
    await p.waitForTimeout(3000);
    const after = await palette(p);
    check('and it is STILL there ~180 frames later', after.redPct > 0.05,
      `red ${after.redPct}%`);
    check('the LOADING card did not repaint over it', after.litPct > 1,
      `lit ${after.litPct}%  (a dead or loading canvas measures ~0.3%)`);

    const labels = await p.evaluate(() => (window.__screenButtons || []).map((x) => x.label));
    check('a RETRY button is offered', labels.includes('RETRY'),
      `buttons: [${labels.join(', ')}]`);

    // ⚠️ AND IT HAS TO BE REACHABLE. During a failed boot `state.screen` is
    // still 'loading', and screenButtons are otherwise only walked on the end
    // screens — so without its own branch in the pointer handler the button
    // would draw perfectly and do nothing.
    const nav = [];
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) nav.push(f.url()); });
    const at = await p.evaluate(() => {
      const bt = (window.__screenButtons || []).find((x) => x.label === 'RETRY');
      if (!bt) return null;
      const cv = document.querySelector('canvas');
      const s = cv.getBoundingClientRect().width / cv.width;
      return { x: bt.x * s + (bt.w * s) / 2, y: bt.y * s + (bt.h * s) / 2 };
    });
    if (at) await p.touchscreen.tap(at.x, at.y);
    await p.waitForTimeout(2500);
    // Cache-busted on purpose: the failure this button is for is usually a
    // STALE index.html naming a bundle that no longer exists, and a plain
    // reload re-reads the same cached document and asks for the same dead URL.
    check('tapping RETRY reloads AND cache-busts the document',
      nav.some((u) => /[?&]r=\d+/.test(u)),
      nav.length ? nav[nav.length - 1] : 'no navigation happened');
  }
  await ctx.close();
}

// ── 2. AND A HEALTHY BOOT IS UNAFFECTED ──────────────────────────────────
// A latch that trips when nothing is wrong would be far worse than the bug it
// replaces, so this half is not optional.
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
    null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const q = await palette(p);
  const screen = await p.evaluate(() => (window.__game ? window.__game.screen : 'none'));
  check('a healthy boot shows NO error card', q.redPct < 0.05, `red ${q.redPct}%`);
  check('and it reaches the title', screen === 'title', `screen=${screen}`);
  check('with a lit screen, not a dead one', q.litPct > 20, `lit ${q.litPct}%`);
  await ctx.close();
}

console.log('');
const bad = checks.filter(([, ok]) => !ok).length;
console.log(bad === 0 ? `ALL ${checks.length} PASS` : `FAILED: ${bad} checks`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
