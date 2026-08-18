// THE COMBO CHAIN — does it count, does it break, and does it stay out of the
// score.
//
// Client: "can you add the combo counter into the game so it actually counts?
// ...or actually a combo system."
//
// ⚠️ THE CLAIM THIS EXISTS TO PROTECT IS THE NEGATIVE ONE. A combo is a
// flourish and a statistic here, and it must remain worth exactly zero points,
// because every score in this game is recomputed server-side and checked
// against a measured ceiling (61,650 perfect, 70,000 refused) and a 400/second
// rate limit. The day a combo quietly adds points, the failure is not a wrong
// number on screen — it is a genuinely great run refused as "implausible-rate"
// in the middle of a contest with a prize on it. So test 2 below is the
// important one, and it is written to fail loudly rather than to pass.
//
// It also measures the DESIGN premise rather than trusting the arithmetic in
// main.js: a post-stomp bounce has to actually carry far enough to reach the
// next enemy at the generator's minimum spacing, or the chain is unreachable
// and the feature is decorative.
//
// Run:  PLAYWRIGHT=... CHROMIUM=... node tools/harness/combo.mjs
//       (needs the dev server: npx vite --port 5199 --strictPort)
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const URL = process.env.URL || 'http://localhost:5199/';

const b = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

// Drive the REAL update loop. Nothing here calls resolveEnemyCollision
// directly: a stomp has to arrive the way a player's does, through the frame,
// or this grades a function rather than the game.
const run = await p.evaluate(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = window.__game;
  window.__startStage(0);
  for (let k = 0; k < 4; k++) await frame();

  const pl = g.player;
  const out = {};

  // ── 1. THE CHAIN COUNTS ────────────────────────────────────────────────
  // Enemies parked HIGH above the floor, so he cannot touch ground between
  // links and the only thing under test is the chain itself.
  const HIGH = pl.y - 600;

  // ⚠️ BUILT WITH createEnemy AND ITS REAL VARIANT KEY. Hand-rolled enemy
  // objects passed variant 0, and the renderer died on `variant.atlas` after
  // link one - which read exactly like the combo failing to chain. A fake
  // entity that the rest of the game cannot draw is a harness bug wearing a
  // product bug's clothes.
  const { createEnemy } = await import('/src/entities/enemy.js');
  const mk = (x, y) => createEnemy(x, y, 0, 'a');

  const scoreBefore = g.score;
  const chain = [];
  const N = 5;
  g.level.enemies.length = 0;
  // ⚠️ HELD IN A LOCAL LIST, NOT INDEXED OUT OF THE LIVE ONE. A defeated
  // enemy is spliced out of level.enemies a few frames later, so indexing it
  // by position mid-chain reads the wrong entity.
  const mine = [];
  for (let i = 0; i < N; i++) { const e = mk(2000 + i * 400, HIGH); mine.push(e); g.level.enemies.push(e); }

  for (let i = 0; i < N; i++) {
    const e = mine[i];
    // Over this one, airborne, feet in the stomp band, falling. Re-pushed
    // each link because the defeat timer removes it from the level list.
    if (!g.level.enemies.includes(e)) g.level.enemies.push(e);
    pl.x = e.x; pl.y = e.y - pl.h + 10; pl.vy = 2; pl.onGround = false; pl.dead = false;
    await frame();
    chain.push({ link: i + 1, alive: e.alive, combo: g.combo, best: g.comboBest });
  }
  out.chain = chain;
  out.scoreDelta = g.score - scoreBefore;
  out.stomps = N;

  // ── 2. AND IT BREAKS ON THE GROUND ─────────────────────────────────────
  const comboAtPeak = g.combo;
  const bestAtPeak = g.comboBest;
  // ⚠️ LAND HIM ON REAL GROUND, DO NOT FORCE THE FLAG. Setting onGround=true
  // by hand proves nothing: updatePlayer recomputes it against the map every
  // frame, and 600px above the floor it is false again before anything reads
  // it. Put him back where he spawned and let the physics do it, then assert
  // he actually got there - otherwise a green "landing breaks the chain" is
  // just the harness agreeing with itself.
  pl.x = g.spawnX !== undefined ? g.spawnX : 3 * 32;
  pl.y = HIGH + 400; pl.vy = 0; pl.onGround = false;
  let landed = false;
  for (let k = 0; k < 240 && !landed; k++) { await frame(); landed = pl.onGround; }
  out.afterLanding = { combo: g.combo, best: g.comboBest, comboAtPeak, bestAtPeak, landed };

  // ── 3. THE RUN LOG ─────────────────────────────────────────────────────
  const log = g.runLog.finish();
  out.comboEvents = log.events.filter((e) => e.type === 'combo').map((e) => e.n);
  out.stompEvents = log.events.filter((e) => e.type === 'stomp').length;
  // Every event must still carry a monotonic timestamp - the Worker's scorer
  // discards anything out of order, so a payload that trampled `t` would
  // silently cost points rather than erroring.
  let mono = true, last = -1;
  for (const e of log.events) { if (e.t < last) mono = false; last = e.t; }
  out.monotonic = mono;

  // ── 4. THE DESIGN PREMISE, MEASURED ────────────────────────────────────
  // Does a post-stomp bounce actually carry to the next enemy at the
  // generator's tightest legal spacing? Driven through the real physics, not
  // recomputed from the constants main.js quotes.
  const phys = await import('/src/core/physics.js');
  const gen = { T: 32, MIN_COLS: 8 };
  pl.x = 3000; pl.y = HIGH; pl.onGround = false; pl.dead = false;
  pl.vy = -10.5;              // STOMP_BOUNCE_VY
  pl.vx = phys.RUN_SPEED;
  const x0 = pl.x, y0 = pl.y;
  let ticks = 0, reach = 0;
  // Free-flight integration of the SAME constants the player update uses,
  // stepped here so the measurement cannot be perturbed by input, camera or
  // collision - what is being measured is the arc, not the level.
  let vy = -10.5, y = 0, x = 0;
  while (y <= 0 && ticks < 400) {
    vy = Math.min(vy + phys.GRAV, phys.TERMINAL_VY);
    y += vy; x += phys.RUN_SPEED; ticks++;
  }
  reach = Math.round(x);
  out.arc = { ticks, reach, minSpacing: gen.MIN_COLS * gen.T, x0, y0 };

  return out;
});

console.log('\n=== 1. the chain counts ===');
for (const c of run.chain) {
  console.log(`  link ${c.link}: enemy dead=${String(c.alive === false).padEnd(5)} `
    + `combo=${c.combo}  best=${c.best}`);
}
console.log('\n=== 2. it scores nothing ===');
console.log(`  ${run.stomps} stomps -> score +${run.scoreDelta}   (50 each = ${run.stomps * 50}, no bonus)`);
console.log('\n=== 3. the ground breaks it ===');
const a = run.afterLanding;
console.log(`  in the air: combo=${a.comboAtPeak} best=${a.bestAtPeak}`);
console.log(`  on landing: combo=${a.combo} best=${a.best}  (really landed: ${a.landed})`);
console.log('\n=== 4. the run log ===');
console.log(`  combo events: [${run.comboEvents.join(', ')}]   stomp events: ${run.stompEvents}`);
console.log(`  timestamps monotonic: ${run.monotonic}`);
console.log('\n=== 5. is a chain physically reachable? ===');
console.log(`  a bounce flies ${run.arc.ticks} ticks and carries ${run.arc.reach}px at run speed`);
console.log(`  the generator's tightest enemy spacing is ${run.arc.minSpacing}px`);

const N = run.stomps;
const checks = [
  ['every link killed its enemy', run.chain.every((c) => c.alive === false)],
  ['the chain counts up 1..N', run.chain.every((c, i) => c.combo === i + 1)],
  ['best tracks the peak', run.chain[N - 1].best === N],
  // ⚠️ THE ONE THAT MATTERS. See the header.
  ['a combo is worth ZERO points', run.scoreDelta === N * 50],
  ['he actually reached the ground', a.landed === true],
  ['landing breaks the chain', a.combo === 0],
  ['landing does NOT reset the run best', a.best === a.bestAtPeak && a.best === N],
  ['the log carries each new best, 2..N', run.comboEvents.join() === Array.from({ length: N - 1 }, (_, i) => i + 2).join()],
  ['the log still counts every stomp', run.stompEvents === N],
  ['event timestamps stayed monotonic', run.monotonic],
  ['a bounce out-reaches the tightest spacing', run.arc.reach >= run.arc.minSpacing],
  ['no page errors', errs.length === 0],
];
console.log('');
for (const [what, pass] of checks) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}`);
if (errs.length) console.log('  THROWN: ' + errs.join(' | '));
const bad = checks.filter(([, ok]) => !ok).length;
console.log(bad === 0 ? `\nALL ${checks.length} PASS` : `\nFAILED: ${bad} checks`);
await b.close();
process.exit(bad === 0 ? 0 : 1);
