// THE FINISH LINE IS THE BANK — and a robbery only empties the pocket.
//
// Client: "banking at each finish line, robbery only risks the current
// stage's pocket." Before this rule one late hit dumped a whole five-stage
// purse ($950 off a 13,000+ run, in the live database). What this grades:
//
//   1. crossing a finish line locks the money held into state.banked
//   2. a knockdown on the NEXT stage scatters only score - banked, and the
//      score floors at the banked amount — to the dollar
//   3. the event log agrees: bagLost events count the POCKET's bags, not
//      the purse's, because the Worker recomputes the contest score from
//      those events and both sides must fall by the same amount
//   4. the control: with nothing banked, the first stage still loses its
//      whole pocket — the old rule inside one stage is unchanged
//
// ⚠️ CONTACT, NOT ARITHMETIC. The knockdown is parked-on-an-enemy physics,
// the same recipe as dashpass.mjs, so this measures the real handler.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/bankline.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const ck = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

async function page() {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  return { ctx, p };
}

// Park him on the nearest enemy, not dashing, and let the physics decide —
// returns once a heart is gone.
const knockdown = async (p) => p.evaluate(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = window.__game;
  const { genAhead } = await import('/src/world/generator.js');
  genAhead(g.level, 200);
  const en = g.level.enemies.find((e) => e.alive);
  if (!en) return { noEnemy: true };
  const before = g.hearts;
  g.player.dashing = false;
  g.player.x = en.x - 2; g.player.y = en.y; g.player.vy = 0;
  for (let k = 0; k < 60 && g.hearts === before; k++) await frame();
  // ⚠️ SNAPSHOT AT THE HIT, NOT AFTER A STROLL. The scatter is his own money
  // lying at his feet — a first draft teleported him "away" and he fell
  // through the level catching a bag on the way down, reading every floor
  // +100. The subtraction is synchronous with the contact, so the very next
  // frame is the honest number.
  return { hearts: g.hearts, score: g.score, banked: g.banked };
});

// ── 1-3: bank at the line, rob the pocket, log agrees ────────────────────
{
  const { ctx, p } = await page();
  const r = await p.evaluate(async () => {
    const frame = () => new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
    const g = window.__game;
    window.__startStage(0);
    for (let k = 0; k < 30; k++) await frame();
    g.score = 5000;
    g.player.x = g.level.stage.stageEnd * 32 + 12; g.hearts = 3;
    for (let k = 0; k < 40 && g.screen === 'playing'; k++) await frame();
    const atClear = { screen: g.screen, banked: g.banked };
    for (let k = 0; k < 90; k++) await frame();          // arm the card
    const btn = (window.__screenButtons || []).find((x) => /NEXT/.test(x.label));
    btn && btn.action();
    return atClear;
  });
  ck('the finish line banks the money in hand', r.screen === 'stageClear' && r.banked === 5000,
    `screen=${r.screen} banked=${r.banked}`);

  await p.waitForFunction(() => window.__game.screen === 'playing' && window.__game.stageIndex === 1,
    null, { timeout: 120000 });
  await p.waitForTimeout(500);
  await p.evaluate(async () => {
    const frame = () => new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
    const g = window.__game;
    for (let k = 0; k < 10; k++) await frame();
    g.score = 5700;                                       // 700 in the pocket
  });
  const hit = await knockdown(p);
  // ⚠️ THE FLOOR IS A RANGE OF ONE BAG, AND THAT IS THE GAME, NOT SLOP.
  // The scatter is Sonic's rings: a bag can spawn at his feet and be caught
  // in the SAME physics tick as the hit — measured at exactly +100 on every
  // run, deterministically, per seed. The log below is the exact contract
  // (bagLost counts the full pocket; the catch is a fresh 'bag' event), so
  // the Worker's recompute and the screen still agree to the dollar.
  ck('the knockdown scatters only the pocket — the score floors at the bank',
    !hit.noEnemy && hit.score >= 5000 && hit.score <= 5100 && hit.banked === 5000,
    JSON.stringify(hit));
  const lostEvents = await p.evaluate(() => {
    const log = window.__game.runLog.finish();
    return (log.events || []).filter((e) => e.type === 'bagLost').length;
  });
  ck('the event log lost exactly the pocket\'s bags — the Worker will agree',
    lostEvents === 7, `bagLost=${lostEvents} (700 / 100)`);
  await ctx.close();
}

// ── 4: the control — stage one, nothing banked, the pocket is everything ──
{
  const { ctx, p } = await page();
  await p.evaluate(async () => {
    const frame = () => new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
    const g = window.__game;
    window.__startStage(0);
    for (let k = 0; k < 30; k++) await frame();
    g.score = 800;
  });
  const hit = await knockdown(p);
  // Same one-bag same-tick catch tolerance as above.
  ck('with nothing banked the whole pocket still comes out',
    !hit.noEnemy && hit.score <= 100 && (hit.banked || 0) === 0,
    JSON.stringify(hit));
  await ctx.close();
}

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
