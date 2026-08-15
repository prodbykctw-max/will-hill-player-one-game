// DOES THE RUN ACTUALLY GET ADDED — WHICHEVER ORDER THEY DO IT IN?
//
// Client: "I wanna know how that process works when they enter before the run
// and when they enter after the run. Just wanna make sure that that run is
// actually added."
//
// It was not, and this is the file that would have caught it. `lbSubmit()`
// returned early when nobody was registered, and the submit fires at the
// MOMENT OF DEATH — before the panel has offered them the contest. So the
// common path (play, die, then decide to enter) threw the run away. Entering
// beforehand worked, which is exactly why it survived every previous test:
// whoever wrote one only wrote the easy half.
//
// Both halves now. The network is stubbed at `fetch`, so this grades what the
// game SENDS rather than needing a Worker deployed.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/entrypaths.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// Capture every /submit the page attempts, and force LB_URL on so the client
// actually tries — it short-circuits when the Worker URL is empty, which is
// the state the game ships in until the contest goes live.
const stub = () => {
  window.__posts = [];
  const orig = window.fetch;
  window.fetch = (u, o) => {
    const url = String(u);
    if (url.includes('/submit')) {
      try { window.__posts.push(JSON.parse(o.body)); } catch (_e) { window.__posts.push(null); }
      return Promise.resolve(new Response('{"ok":true,"rank":1,"score":1,"best":1,"total":1}',
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return orig(u, o);
  };
};

async function play(p) {
  // A short, real run: collect a few bags so the log is not empty, then die.
  return p.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const g = window.__game;
    window.__startStage(0);
    for (let k = 0; k < 6; k++) await frame();
    // ⚠️ START THE LOG. __startStage is the dev door straight into a stage and
    // skips startRun(), which is what mints the run id — so without this the
    // payload goes out with runId '' and the replay check has nothing to grade.
    // Real play always goes through startRun().
    g.runLog.start();
    for (let i = 0; i < 8; i++) g.runLog.record('bag');
    g.hearts = 0;
    g.player.y = 40000;                     // straight down the nearest pit
    for (let k = 0; k < 120 && g.screen !== 'gameOver'; k++) await frame();
    return g.screen;
  });
}

// ── 1. ENTER BEFORE THE RUN ────────────────────────────────────────────────
{
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.addInitScript(stub);
  await p.addInitScript(() => localStorage.setItem('wh_contest_reg',
    JSON.stringify({ phone: '4045550101', email: 'before@example.com' })));
  await p.goto('http://localhost:5199/?tod=night&lb=http://stub.invalid', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  const screen = await play(p);
  await p.waitForTimeout(400);
  const posts = await p.evaluate(() => window.__posts);
  check('entering BEFORE: the run is submitted when it ends',
    screen === 'gameOver' && posts.length === 1, JSON.stringify({ screen, posts: posts.length }));
  check('  and it carries the phone and the events',
    posts[0] && posts[0].phone === '4045550101' && posts[0].events.length >= 8,
    posts[0] ? `${posts[0].phone}, ${posts[0].events.length} events` : 'no post');
  check('  and a run id, so a replay can be refused',
    !!(posts[0] && /^[0-9a-f-]{16,64}$/i.test(posts[0].runId)), posts[0] && posts[0].runId);
  check('  and the empty honeypot field',
    !!posts[0] && posts[0].website === '', JSON.stringify(posts[0] && posts[0].website));
  await p.close();
}

// ── 2. ENTER AFTER THE RUN — the one that was broken ───────────────────────
{
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.addInitScript(stub);
  await p.goto('http://localhost:5199/?tod=night&lb=http://stub.invalid', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

  const screen = await play(p);
  await p.waitForTimeout(300);
  const before = await p.evaluate(() => window.__posts.length);
  check('entering AFTER: nothing is sent while they are unregistered',
    screen === 'gameOver' && before === 0, `${before} posts`);

  // Now do what a real player does: tap through to the offer and enter.
  const held = await p.evaluate(() => window.__lb.hasPendingRun());
  check('  the run is HELD, not thrown away', held === true, String(held));

  await p.evaluate(() => window.__panel.open('form'));
  await p.waitForTimeout(300);
  await p.fill('#fName', 'AFTERGUY');
  await p.fill('#fPhone', '4045550102');
  await p.fill('#fEmail', 'after@example.com');
  await p.click('#btnSave');
  await p.waitForTimeout(500);
  const posts = await p.evaluate(() => window.__posts);
  check('  entering sends the run they just played',
    posts.length === 1 && posts[0] && posts[0].phone === '4045550102',
    JSON.stringify({ n: posts.length, phone: posts[0] && posts[0].phone }));
  check('  with that run\'s own events, not an empty log',
    !!posts[0] && posts[0].events.length >= 8, posts[0] && `${posts[0].events.length} events`);
  check('  and it is not sent twice',
    (await p.evaluate(() => window.__lb.hasPendingRun())) === false);
  await p.close();
}

console.log('');
console.log(checks.every(([, o]) => o) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, o]) => !o).map(([w]) => w).join(', '));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
