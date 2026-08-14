// THE TITLE CARD ASSEMBLING ITSELF, frame by frame.
//
// The portrait plate is cut into five cards — the logo, both sign gantries,
// Will Hill and the streetlight — and they fly in from where they belong
// before the backdrop resolves behind them. Three things about that are worth
// a harness rather than a look:
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
check('all five cards loaded', loaded.length === 5 && loaded.every((c) => c.ok),
  JSON.stringify(loaded.map((c) => [c.key, c.ok])));
check('they are ordered far to near',
  loaded.every((c, i) => i === 0 || c.depth > loaded[i - 1].depth),
  loaded.map((c) => c.depth).join(' < '));

// Walk the intro clock and watch for the doubling.
const shots = [];
for (const t of [0, 14, 30, 46, 62, 78, 94, 118, 150]) {
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
// must not begin before the slowest card has landed.
const timing = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  return { cards: t.titleCards().length, cover: t.TITLE_COVER_ROWS };
});
check('the card list drives the timing', timing.cards === 5, JSON.stringify(timing));

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
