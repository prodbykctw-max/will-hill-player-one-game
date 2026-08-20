// DASH IS SAFE PASSAGE. Client, rethinking a spec that proposed dash-kills:
// "as long as dashing doesn't hurt me, I will keep dashing — just being able
// to dash past enemies, instead of having to kill them."
//
// Both sides graded, because a pass-through that also killed or a contact
// that still hurt would each betray a different half of that sentence:
//   1. dashing through an enemy: no heart lost, enemy still alive
//   2. the same overlap NOT dashing: the heart IS lost (the check can fail)
//   3. a stomp still kills, still bounces, still refunds the air jump
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/dashpass.mjs
const _pw = await import(process.env.PLAYWRIGHT); const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const checks = []; const ck = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.evaluate(async () => { await window.__startStage(0); });
await p.waitForFunction(() => window.__game.screen === 'playing' && window.__game.level.enemies.length > 0,
  null, { timeout: 15000 });

// Park the player ON an enemy in each state and let the physics tick decide.
const run = (mode) => p.evaluate((m) => new Promise((done) => {
  const g = window.__game;
  const pl = g.player;
  const en = g.level.enemies.find((e) => e.alive);
  const before = { hearts: pl.hearts, alive: en.alive };
  pl.inv = 0;                        // no leftover i-frames muddying the read
  pl.stumble = 0;
  pl.x = en.x - 2; pl.y = en.y;      // straight overlap, feet level with him
  pl.vy = 0;
  if (m === 'dash') { pl.dashing = true; pl.dashT = 30; pl.dashVx = 0; }
  else { pl.dashing = false; pl.dashT = 0; }
  if (m === 'stomp') { pl.onGround = false; pl.vy = 6; pl.y = en.y - pl.h + 4; pl.airJumps = 0; }
  // ⚠️ SAMPLE THE BOUNCE WHILE IT IS A BOUNCE. The first version read vy once
  // at +250ms — fifteen gravity ticks after a -10.5 launch, by which time it
  // measured +2.8 and called a working stomp broken. Track the minimum.
  let vyMin = 99;
  const iv = setInterval(() => { vyMin = Math.min(vyMin, pl.vy); }, 8);
  setTimeout(() => {
    clearInterval(iv);
    done({ before, hearts: pl.hearts, enemyAlive: en.alive,
      vyMin, airJumps: pl.airJumps });
  }, 250);
}), mode);

const dash = await run('dash');
ck('dashing through costs no heart', dash.hearts === dash.before.hearts, `hearts ${dash.before.hearts}->${dash.hearts}`);
ck('and the enemy LIVES — passage, not a kill', dash.enemyAlive === true);

// Reset position away, heal state, then the control case.
await p.evaluate(() => { const g = window.__game; g.player.x -= 200; g.player.inv = 0; });
const contact = await run('contact');
ck('the same overlap NOT dashing still costs the heart', contact.hearts === contact.before.hearts - 1,
  `hearts ${contact.before.hearts}->${contact.hearts}`);

await p.evaluate(() => { const g = window.__game; g.player.x -= 200; g.player.inv = 0; g.player.hearts = 3; });
const stomp = await run('stomp');
ck('a stomp still kills him', stomp.enemyAlive === false);
ck('and still bounces with the air jump refunded', stomp.vyMin < -5 && stomp.airJumps === 1,
  `vyMin=${stomp.vyMin?.toFixed(1)} airJumps=${stomp.airJumps}`);

console.log('\n' + (checks.every(([, o]) => o) ? `ALL ${checks.length} PASS` : 'FAILED'));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
