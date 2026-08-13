// The CHAMPAGNE RELAY button on the title card: is it there, does pressing it
// start a relay run, and does a normal START still start a normal one?
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const c = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await c.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(900);

const r = await p.evaluate(() => window.__title.relayRect(window.__game.titleBox));
console.log('button rect:', JSON.stringify(r && { x: Math.round(r.x), y: Math.round(r.y),
  w: Math.round(r.w), h: Math.round(r.h) }));
const opt = await p.evaluate(() => window.__title.optionsRect(window.__game.titleBox));
console.log('OPTIONS rect:', JSON.stringify(opt && { y: Math.round(opt.y), h: Math.round(opt.h) }),
  '-> relay sits below it:', r && opt ? r.y >= opt.y + opt.h : 'n/a');
await p.screenshot({ path: process.env.SEAM_OUT + '/relaybtn.png' });

// Press it. First tap is spent waking audio, so tap twice.
const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
await p.touchscreen.tap(cx, cy);
await p.waitForTimeout(500);
await p.touchscreen.tap(cx, cy);
await p.waitForTimeout(1400);
const a = await p.evaluate(() => ({ screen: window.__game.screen,
  enemies: window.__game.level ? window.__game.level.enemies.length : null,
  aura: window.__game.player ? window.__game.player.invulnerableUntil > performance.now() : null }));
console.log('after pressing RELAY:', JSON.stringify(a), a.screen === 'playing' && a.enemies === 0 && a.aura ? 'PASS' : 'FAIL');

// Back to the title, then a normal START must be a normal run again.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(900);
await p.touchscreen.tap(215, 300);
await p.waitForTimeout(400);
await p.touchscreen.tap(215, 300);
await p.waitForTimeout(1600);
const n = await p.evaluate(() => ({ screen: window.__game.screen,
  enemies: window.__game.level ? window.__game.level.enemies.length : null }));
console.log('after a normal START :', JSON.stringify(n), n.screen === 'playing' && n.enemies > 0 ? 'PASS' : 'FAIL');
console.log(errs.length ? errs.join('\n') : 'no errors thrown');
await b.close();
