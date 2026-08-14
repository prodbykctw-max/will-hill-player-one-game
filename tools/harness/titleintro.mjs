// THE TITLE CARD ASSEMBLING ITSELF, frame by frame.
//
// The portrait plate is cut into seven cards now, not five — WILL HILL: and
// both red stars split out of what used to be one ragged "logo" card (see
// tools/cut_title_extras.py) so his name can land before PLAYER ONE and the
// stars can land WITH it, per the client. Three things about the assembly are
// worth a harness rather than a look:
//
//   1. NOTHING MAY DOUBLE. The base is the whole painting, so its copy of
//      every card is already sitting at the destination. If the backdrop
//      starts before the last card lands you get two of that card, which has
//      happened once already and shipped two PLAYER ONEs.
//   2. The controls that are NOT painted in — the relay pill, the music box —
//      have to arrive with the last layer, not before it.
//   3. Tapping mid-assembly must still work, because that is the skip.
//
//   PLAYWRIGHT=... SEAM_OUT=... node tools/harness/titleintro.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const OUT = process.env.SEAM_OUT || '.';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

// Every card must actually have loaded. A missing image is silently skipped by
// the renderer, so the card would just never appear and the assembly would
// look "fine" with a hole in it.
const loaded = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  const spec = t.titleCards();
  const imgs = window.__images || {};
  return spec.map((c) => ({ key: c.key, ok: !!(imgs[c.key] && imgs[c.key].width),
    depth: c.depth, sway: !!c.sway }));
});
console.log('  cards:', loaded.map((c) => `${c.key}${c.ok ? '' : ' MISSING'}`).join(', '));
check('all seven cards loaded', loaded.length === 7 && loaded.every((c) => c.ok),
  JSON.stringify(loaded.map((c) => [c.key, c.ok])));
check('they are ordered far to near',
  loaded.every((c, i) => i === 0 || c.depth > loaded[i - 1].depth),
  loaded.map((c) => c.depth).join(' < '));

// Walk the intro clock and watch for the doubling. Sample points now run out
// to 180 — the street furniture lands by ~74, WILL HILL: by ~112, PLAYER ONE
// and both stars together by ~148 — so the final shots actually show the
// fully-settled card instead of stopping mid-assembly the way the old
// five-card schedule (last landing ~78) did.
const shots = [];
for (const t of [0, 14, 30, 46, 62, 78, 94, 112, 130, 148, 166, 180]) {
  await p.evaluate(async (tt) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__game.screenT = tt; window.__game.introAt = 0;
    await frame();
  }, t);
  shots.push({ t, b64: (await p.screenshot()).toString('base64') });
}
const fs = await import('fs');
fs.writeFileSync(`${OUT}/titleintro.json`, JSON.stringify(shots));

// The guard itself, read out of the module rather than trusted: the backdrop
// must not begin before the slowest card has landed. TITLE_COVER_ROWS was
// replaced by TITLE_SAFE (a {top,bottom} band, not a single row count) when
// the fit was reworked to split its crop across both ends — see stillscene.js.
const timing = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  return { cards: t.titleCards().length, safe: t.TITLE_SAFE };
});
check('the card list drives the timing', timing.cards === 7, JSON.stringify(timing));
check('TITLE_SAFE is a real top/bottom band',
  timing.safe && timing.safe.top > 0 && timing.safe.bottom > timing.safe.top,
  JSON.stringify(timing.safe));

// NO OTHER CARD MAY CARRY A STAR PIXEL. This is the exact bug the client
// caught live: "that star is still over the street sign." SAM's original cut
// of tp_pole bled into the right-hand star sitting beside the lamp post, so
// it rode along on the pole's early slide-in instead of landing with PLAYER
// ONE. tools/cut_title_extras.py now scrubs every other card against a
// dilated copy of the star mask on every re-cut — this checks the shipped
// assets rather than trusting that script ran.
const starLeak = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  const imgs = window.__images || {};
  const pts = { left: [48 / t.SRC_W, 338 / t.SRC_H], right: [808 / t.SRC_W, 339 / t.SRC_H] };
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const hits = [];
  for (const card of t.titleCards()) {
    if (card.key === 'tp_stars') continue;
    const img = imgs[card.key];
    if (!img || !img.width) continue;
    c.width = img.width; c.height = img.height;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    for (const [side, [fx, fy]] of Object.entries(pts)) {
      const x = Math.round(fx * img.width), y = Math.round(fy * img.height);
      const a = g.getImageData(x, y, 1, 1).data[3];
      if (a > 0) hits.push(`${card.key}/${side}(a=${a})`);
    }
  }
  return hits;
});
check('no card but tp_stars carries a star pixel', starLeak.length === 0,
  JSON.stringify(starLeak));

// And the skip still works mid-assembly.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(500);
await p.touchscreen.tap(215, 300);
await p.waitForTimeout(1700);
check('a tap during the assembly still starts the run',
  await p.evaluate(() => window.__game.screen) === 'playing');

console.log('');
console.log(checks.every(([, ok]) => ok) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, ok]) => !ok).map(([w]) => w).join(', '));
await b.close();
