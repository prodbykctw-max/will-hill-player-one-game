// THE ACTUAL MECHANISM. createMediaElementSource permanently takes an element
// out of the speakers; calling it on a SUSPENDED context is what made the
// title cue inaudible. So count the calls and check WHEN they happen relative
// to the context waking up.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--autoplay-policy=document-user-activation-required'] });
const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
await p.addInitScript(() => {
  window.__log = [];
  const Orig = window.AudioContext || window.webkitAudioContext;
  const origCMES = Orig.prototype.createMediaElementSource;
  Orig.prototype.createMediaElementSource = function (el) {
    window.__log.push({ what: 'createMediaElementSource', ctxState: this.state });
    return origCMES.call(this, el);
  };
  const origResume = Orig.prototype.resume;
  Orig.prototype.resume = function () {
    return origResume.call(this).then((r) => { window.__log.push({ what: 'resumed' }); return r; });
  };
});
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(2500);
const log = await p.evaluate(() => window.__log);
const bad = log.filter((e) => e.what === 'createMediaElementSource' && e.ctxState !== 'running');
console.log('calls, in order:');
for (const e of log.slice(0, 8)) console.log('   ', JSON.stringify(e));
console.log(`\nelement redirected into the graph while the context was NOT running: ${bad.length}`);
console.log(bad.length === 0 ? 'PASS  the cue keeps its own output until the graph can carry it'
                             : 'FAIL  still redirecting into a dead graph');
await b.close();
