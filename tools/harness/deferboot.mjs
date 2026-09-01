// FIRST-LOAD DEFERRAL: the boot buys the title and stage one; stages 2-5 and
// the MARTA map arrive BEHIND the title, and the ride HOLDS if they are late.
//
// Client: "My goal is to have an instant load every visit." The first visit
// is this deferral (~2.2 MB off the boot); the second visit is the service
// worker caching what the background load fetches. This grades the first
// half, three ways:
//
//   A. dev — with every `edgewood` image BLOCKED at the network: the title
//      must still come up (the boot no longer needs stage 2), stage 2 must
//      be absent from `__images` (impossible to pass by racing — the file is
//      unreachable), the ride must HOLD at full progress instead of entering
//      a bare stage, and unblocking must release the hold via the retry.
//   B. dev — unblocked: request ORDER proves the split (every title/eav
//      image is requested before the FIRST late image), the late set lands
//      in `__images`, and the deferral-aware `__startStage` hook still
//      reaches stage 3.
//   C. prod preview — the same request-order proof against the real hashed
//      bundle, where the dev hooks are folded out.
//
// ⚠️ Route filtering is by resourceType()==='image' — blocking by URL
// pattern alone also kills Vite's `?import` MODULE requests for the same
// file and bricks the boot (documented trap; see game-harness skill).
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/deferboot.mjs
//   (expects vite dev on :5199 and `vite preview` on :5210)
const _pw = await import(process.env.PLAYWRIGHT); const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const checks = []; const ck = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };
// No trailing dash after the stem: dev serves unhashed names (marta-map.webp)
// while prod appends -<hash>; both must match.
const LATE = /\/(edgewood|underground|l5p|marta-map)[^/]*\.(webp|png)/;
const BOOT = /\/(eav-|title|enemy|will-hill|moneybag|champagne|ending-)[^/]*\.(webp|png)/;

// ── A. blocked stage 2: boot survives, ride holds, unblock releases ──────
{
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.route('**/*', (route) => {
    const r = route.request();
    if (r.resourceType() === 'image' && /edgewood/.test(r.url())) return route.abort();
    return route.continue();
  });
  await p.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  let titled = true;
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 }).catch(() => { titled = false; });
  ck('A1 title comes up with stage-2 art unreachable', titled);
  // The title now shows on its OWN art, so stage 1 may still be in flight at
  // first sight of it — wait for it to land (REST is unblocked; only
  // edgewood is dead, and edgewood can NEVER arrive, so that half is
  // race-free by construction).
  let eavIn = true;
  await p.waitForFunction(() => !!window.__images?.eav, null, { timeout: 15000 }).catch(() => { eavIn = false; });
  const boot = await p.evaluate(() => ({ eav: !!window.__images?.eav, e: !!window.__images?.edgewood }));
  ck('A2 stage 1 lands behind the title; stage 2 never does', eavIn && boot.eav && !boot.e, JSON.stringify(boot));
  await p.evaluate(() => { const g = window.__game; g.rideFrom = 'eav'; g.rideTo = 1; g.screen = 'riding'; g.screenT = 0; });
  await p.waitForTimeout(3500); // RIDE_TICKS is 150 (~2.5s); well past the doors
  const held = await p.evaluate(() => ({ screen: window.__game.screen, t: window.__game.screenT }));
  ck('A3 ride HOLDS at the platform (screenT pinned)', held.screen === 'riding' && held.t === 150, JSON.stringify(held));
  // The map is late here too (it is in the same blocked flight as far as the
  // retry goes), and the narrowed martamap guard means the held screen must
  // still show the ROUTE and TRAIN over the dark ground — not a blackout.
  const lit = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n / (d.length / 4);
  });
  ck('A3b the held ride still draws route and train, not a blackout', lit > 0.003, `lit=${(lit * 100).toFixed(2)}%`);
  await p.unroute('**/*');
  let released = true;
  await p.waitForFunction(() => window.__game.screen === 'playing' && window.__game.stageIndex === 1 && !!window.__images.edgewood,
    null, { timeout: 25000 }).catch(() => { released = false; });
  const after = await p.evaluate(() => ({ screen: window.__game.screen, i: window.__game.stageIndex }));
  ck('A4 unblocking releases the hold into stage 2, art present', released, JSON.stringify(after));
  await p.close();
}

// ── B. unblocked: order, arrival, and the dev door ───────────────────────
{
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  const reqs = [];
  p.on('request', (r) => { if (r.resourceType() === 'image') reqs.push(r.url()); });
  await p.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  let lateIn = true;
  await p.waitForFunction(() => ['edgewood', 'underground', 'l5p', 'martamap'].every((k) => !!window.__images[k]),
    null, { timeout: 25000 }).catch(() => { lateIn = false; });
  const firstLate = reqs.findIndex((u) => LATE.test(u));
  const lastBoot = reqs.reduce((a, u, i) => (BOOT.test(u) ? i : a), -1);
  ck('B1 every boot image is requested before the first late image',
    firstLate > -1 && lastBoot > -1 && lastBoot < firstLate, `lastBoot=${lastBoot} firstLate=${firstLate} of ${reqs.length}`);
  ck('B2 the late set lands in __images behind the title', lateIn);
  const jump = await p.evaluate(async () => { await window.__startStage(2); return window.__game.level && window.__game.level.stage.id; });
  ck('B3 __startStage(2) still opens the Underground', jump === 'underground', 'id=' + jump);
  // The soundtrack prewarm: every cue's element must have been sent for
  // without any gesture and without its screen ever being reached — the
  // client's "everything needs to be ready" rule. Staggered at 900ms per
  // cue, ten cues, so allow a generous window.
  let warmed = [];
  await p.waitForFunction(() => {
    const st = window.__audio && window.__audio.music.status();
    return st && st.warmed && st.warmed.length >= 10;
  }, null, { timeout: 30000 }).catch(() => {});
  warmed = await p.evaluate(() => window.__audio.music.status().warmed);
  ck('B4 the whole soundtrack is warmed behind the art', warmed.length >= 10, `warmed: ${warmed.join(',')}`);
  await p.close();
}

// ── C. the production build tells the same story on the wire ─────────────
{
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  const reqs = [];
  const mp3s = new Set();
  p.on('request', (r) => {
    if (r.resourceType() === 'image') reqs.push(r.url());
    if (r.url().includes('.mp3')) mp3s.add(r.url().replace(/^.*\//, '').replace(/-[^-]*\.mp3.*$/, ''));
  });
  await p.goto('http://localhost:5210/', { waitUntil: 'domcontentloaded' });
  // No dev hooks in prod — wait until each late group has been requested.
  const groupsIn = () => ['edgewood', 'underground', 'l5p', 'marta-map'].every((g) => reqs.some((u) => u.includes('/' + g)));
  for (let n = 0; n < 100 && !groupsIn(); n++) await p.waitForTimeout(250);
  ck('C1 prod background load fetches all late groups', groupsIn(), `${reqs.length} image requests`);
  // The soundtrack prewarm on the real build: ten cues, no gesture, no
  // screen ever left the title. Staggered 900ms apart behind the images.
  for (let n = 0; n < 80 && mp3s.size < 10; n++) await p.waitForTimeout(250);
  ck('C3 prod prewarms the whole soundtrack, no gesture needed', mp3s.size >= 10, `${mp3s.size} cues: ${[...mp3s].join(',')}`);
  const firstLate = reqs.findIndex((u) => LATE.test(u));
  const lastBoot = reqs.reduce((a, u, i) => (BOOT.test(u) ? i : a), -1);
  ck('C2 prod order: boot art first, late art strictly after',
    firstLate > -1 && lastBoot > -1 && lastBoot < firstLate, `lastBoot=${lastBoot} firstLate=${firstLate}`);
  await p.close();
}

console.log('\n' + (checks.every(([, o]) => o) ? `ALL ${checks.length} PASS` : 'FAILED'));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
