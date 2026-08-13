// CHAMPAGNE RELAY, checked against the real build side by side. Every claim
// has to hold in relay AND still be false in the normal game, or the flag is
// leaking into the contest version.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

const probe = async (url, label) => {
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  const out = [];
  for (let i = 0; i < 4; i++) {
    const r = await p.evaluate(async (idx) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const g = window.__game;
      window.__startStage(idx);
      for (let k = 0; k < 3; k++) await frame();
      // Generate the whole stage so every enemy that would exist, does.
      const end = g.level.stage.stageEnd;
      const { genAhead } = await import('/src/world/generator.js');
      genAhead(g.level, end + 60);
      await frame();
      const aura = g.player.invulnerableUntil > performance.now();
      // Walk him off the end of the world and see if he survives it.
      const x0 = g.player.x;
      g.player.y = 99999; g.player.vy = 0;
      for (let k = 0; k < 6; k++) await frame();
      return { id: g.level.stage.id, enemies: g.level.enemies.length,
               bags: g.level.bags.length, champagnes: g.level.champagnes.length,
               aura, screenAfterFall: g.screen, dead: !!g.player.dead,
               caught: Math.abs(g.player.x - x0) < 400 && g.player.y < 5000 };
    }, i);
    out.push(r);
  }
  console.log(`\n=== ${label} ===`);
  for (const r of out) {
    console.log(`  ${r.id.padEnd(12)} enemies ${String(r.enemies).padStart(3)}  bags ${String(r.bags).padStart(3)}  `
      + `champagne ${String(r.champagnes).padStart(2)}  aura ${r.aura ? 'ON ' : 'off'}  `
      + `after falling: screen=${r.screenAfterFall.padEnd(9)} dead=${r.dead} caught=${r.caught}`);
  }
  if (errs.length) console.log('  THROWN: ' + errs.join(' | '));
  return out;
};

const relay = await probe('http://localhost:5199/?relay=1&tod=night', 'CHAMPAGNE RELAY (?relay=1)');
const real  = await probe('http://localhost:5199/?tod=night', 'THE REAL BUILD (no flag)');

const ok = [
  ['relay spawns no enemies', relay.every((r) => r.enemies === 0)],
  ['real build still spawns them', real.every((r) => r.enemies > 0)],
  ['relay keeps the bags', relay.every((r) => r.bags > 0)],
  ['relay keeps the champagne bottles', relay.every((r) => r.champagnes > 0)],
  ['relay aura always on', relay.every((r) => r.aura)],
  ['real build aura off at spawn', real.every((r) => !r.aura)],
  ['relay survives the pit', relay.every((r) => !r.dead && r.caught)],
  ['real build still dies in the pit', real.every((r) => r.dead)],
];
console.log('');
for (const [what, pass] of ok) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}`);
console.log(ok.every(([, p]) => p) ? '\nALL PASS' : '\nSOMETHING FAILED');
await b.close();
