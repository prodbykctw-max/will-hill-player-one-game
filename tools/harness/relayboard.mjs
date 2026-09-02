// THE DEV DOORS MUST NOT REACH THE PRIZE BOARD.
//
// `?relay=1` strips enemies and pit deaths; `?stage=N` starts a run partway
// in. Both are the client's own inspection tools and stay fully playable —
// but a COMPLETED run under either flag is not a contest run, and until the
// gate this file grades existed, it submitted like one: a relay bag-farm
// would have landed on a board with a real prize on it. Found while
// reviewing an outside patch spec whose integrity section assumed the gate
// was already there.
//
// Method: point the game at a stub board via the dev-only `?lb=` override,
// jump to the last stage, teleport across its finish line so the run
// completes, and count the POSTs that arrive at /submit.
//   relay run       -> 0 submits
//   ?stage=5 run    -> 0 submits (did not begin at stage one)
//   plain run       -> 1 submit  (the gate must not eat real runs)
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/relayboard.mjs
const _pw = await import(process.env.PLAYWRIGHT); const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const checks = []; const ck = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };

async function completedRun(query) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  let submits = 0;
  await p.route('**/submit', (route) => {
    if (route.request().method() === 'POST') submits += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  // Registered BEFORE the game boots, with the app's real key, so the
  // submit path never holds the run for the sign-up (unregistered runs are
  // deliberately held on-device — outbox.mjs grades that; here it would
  // only mask the thing being measured).
  await p.addInitScript(() => {
    localStorage.setItem('wh_contest_reg', JSON.stringify({ phone: '4045550100', email: '' }));
  });
  await p.goto(`http://localhost:5199/${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.evaluate(async () => { await window.__startStage(4); });   // the LAST stage (buckhead)
  await p.waitForFunction(() => window.__game.screen === 'playing', null, { timeout: 15000 });
  // Across the finish line of the last stage: the run completes and the
  // submit decision fires. A registered identity is stubbed so the submit
  // path has no reason of its own to hold back.
  // A score in hand, or bankLocalRun's own zero-score filter (dying broke
  // stays unrecorded) makes the banking checks below vacuously pass/fail.
  await p.evaluate(() => { window.__game.score = 500; window.__game.player.x = 10 ** 7; });
  // Crossing lands on STAGE CLEAR; the run completes off its button. Space
  // presses the primary button on every between-screen (betweenscreens.mjs
  // grades that), after the screen's own arming delay.
  await p.waitForFunction(() => window.__game.screen === 'stageClear', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(900);
  // keydown AND keyup: a Space with no release stays held, and the complete
  // screen's own arming delay then reads the held key as a second press —
  // measured here as RESTART firing and the whole run starting over.
  await p.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 60);
  });
  await p.waitForFunction(() => window.__game.screen === 'complete', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);   // give a queued submit time to fire
  const screen = await p.evaluate(() => window.__game.screen);
  const banked = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('wh_local_runs') || '[]').length);
  await ctx.close();
  return { submits, screen, banked };
}

// The OTHER exit — a run that DIES also submits (death path in main.js),
// and it was gated later than the completion path was: a ?stage=4 run that
// died still reached the board after the completion gate landed. Both exits
// are graded now.
async function deadRun(query) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  let submits = 0;
  await p.route('**/submit', (route) => {
    if (route.request().method() === 'POST') submits += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await p.addInitScript(() => {
    localStorage.setItem('wh_contest_reg', JSON.stringify({ phone: '4045550100', email: '' }));
  });
  await p.goto(`http://localhost:5199/${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.evaluate(async () => { await window.__startStage(4); });   // the LAST stage (buckhead)
  await p.waitForFunction(() => window.__game.screen === 'playing', null, { timeout: 15000 });
  await p.evaluate(() => {
    const g = window.__game;
    g.continues = 0;   // no continue screen in the way
    g.score = 500;   // same reason as the completed helper — banking needs money in hand
    g.player.hearts = 0; g.player.dead = true; g.player.deathCause = 'enemy';
  });
  await p.waitForFunction(() => window.__game.screen !== 'playing', null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const screen = await p.evaluate(() => window.__game.screen);
  const banked = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('wh_local_runs') || '[]').length);
  await ctx.close();
  return { submits, screen, banked };
}

const lb = '&lb=http://localhost:5199/__stub';
const relay = await completedRun('?relay=1&tod=night' + lb);
ck('a completed RELAY run never reaches the board', relay.submits === 0, `submits=${relay.submits} screen=${relay.screen}`);
const staged = await completedRun('?stage=5&tod=night' + lb);
ck('a run that began mid-game never reaches the board', staged.submits === 0, `submits=${staged.submits} screen=${staged.screen}`);
const plain = await completedRun('?tod=night' + lb);
ck('and a plain completed run still submits exactly once', plain.submits === 1, `submits=${plain.submits} screen=${plain.screen}`);
const stagedDeath = await deadRun('?stage=5&tod=night' + lb);
ck('a mid-game run that DIES never reaches the board either', stagedDeath.submits === 0,
  `submits=${stagedDeath.submits} screen=${stagedDeath.screen}`);
const plainDeath = await deadRun('?tod=night' + lb);
ck('and a plain death still submits its run once', plainDeath.submits === 1,
  `submits=${plainDeath.submits} screen=${plainDeath.screen}`);

// ── AND THE SHARE CARD IS GATED THE SAME WAY ─────────────────────────────
// The dev doors used to bank locally even though they never submitted, so a
// relay walk (permanent aura, every bag doubled) left an unbeatable ghost on
// "your best on this device" and the share card bragged a number the contest
// never saw — the MikeJone investigation's one real find. Door runs leave NO
// trace, local or remote; real runs still bank.
ck('a RELAY run leaves nothing on the device best', relay.banked === 0, `banked=${relay.banked}`);
ck('a staged run leaves nothing on the device best', staged.banked === 0, `banked=${staged.banked}`);
ck('a staged DEATH leaves nothing on the device best', stagedDeath.banked === 0, `banked=${stagedDeath.banked}`);
ck('a plain run still banks its score locally', plain.banked === 1, `banked=${plain.banked}`);
ck('and a plain death banks too', plainDeath.banked === 1, `banked=${plainDeath.banked}`);

console.log('\n' + (checks.every(([, o]) => o) ? `ALL ${checks.length} PASS` : 'FAILED'));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
