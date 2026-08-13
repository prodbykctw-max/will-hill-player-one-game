// CHAMPAGNE RELAY across BOTH times of day, and across the settings switch.
//
// relay.mjs already proved the flag works at night. The client's question is
// narrower and more practical: "I wanna make sure that the champagne relay
// version of the game works in night mode as well... when I switch the time
// of day, as long as that works I could check it."
//
// So there are three things to prove, not one:
//   1. relay behaves identically whether the stages resolved day or night,
//   2. the TITLE BUTTON (not just ?relay=1) starts a relay run in either,
//   3. flipping the setting in OPTIONS — which reloads the page, and a reload
//      is exactly where a runtime flag can quietly evaporate — leaves relay
//      reachable and the stages actually switched.
//
// Point 3 is the one worth the harness. `TIME_OF_DAY` is read once at boot,
// so changing it reloads; `relay` lives in a module variable. If the reload
// dropped him somewhere other than the title card he would be stuck in a
// normal run with no way back to the button.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT = process.env.SEAM_OUT || '.';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const newPage = async () => {
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  return p;
};
const atTitle = (p) => p.waitForFunction(() => window.__game && window.__game.screen === 'title',
  null, { timeout: 25000 });

// THE GAME OPENS ON A BLACK CARD. Nothing on the title exists until it is
// tapped — `titleBox` is not even set, so relayRect() returns null and a
// harness that reaches for a button first dies on `reading 'x'`. One tap in
// open space opens the door and starts the assembly; wait for that to land
// before touching anything, or the button is still fading in under the finger.
const enter = async (p) => {
  await atTitle(p);
  await p.waitForTimeout(400);
  await p.touchscreen.tap(215, 466);
  await p.waitForFunction(() => window.__game.introTapped, null, { timeout: 10000 });
  await p.waitForTimeout(2600);
};

// Walk all four stages: what spawned, is the aura up, does a pit kill him.
async function sweep(p) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push(await p.evaluate(async (idx) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const g = window.__game;
      window.__startStage(idx);
      for (let k = 0; k < 3; k++) await frame();
      const { genAhead } = await import('/src/world/generator.js');
      genAhead(g.level, g.level.stage.stageEnd + 60);   // force every spawn
      await frame();
      const aura = g.player.invulnerableUntil > performance.now();
      const x0 = g.player.x;
      g.player.y = 99999; g.player.vy = 0;               // off the end of the world
      for (let k = 0; k < 6; k++) await frame();
      return { id: g.level.stage.id, tod: g.level.stage.tod, enemies: g.level.enemies.length,
               bags: g.level.bags.length, champagnes: g.level.champagnes.length, aura,
               dead: !!g.player.dead, caught: Math.abs(g.player.x - x0) < 400 && g.player.y < 5000 };
    }, i));
  }
  return out;
}

const show = (rows) => rows.forEach((r) => console.log(
  `    ${r.id.padEnd(12)} tod=${String(r.tod).padEnd(5)} enemies ${String(r.enemies).padStart(3)}` +
  `  bags ${String(r.bags).padStart(3)}  champagne ${String(r.champagnes).padStart(2)}` +
  `  aura ${r.aura ? 'ON ' : 'off'}  fell: dead=${r.dead} caught=${r.caught}`));

// ── 1 & 2. relay vs the real build, at night and in daylight ─────────────
const byTod = {};
for (const tod of ['night', 'day']) {
  console.log(`\n=== ${tod.toUpperCase()} ===`);
  const pr = await newPage();
  await pr.goto(`http://localhost:5199/?relay=1&tod=${tod}`, { waitUntil: 'networkidle' });
  await atTitle(pr);
  const relay = await sweep(pr);
  console.log('  CHAMPAGNE RELAY:'); show(relay);

  const pn = await newPage();
  await pn.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await atTitle(pn);
  const real = await sweep(pn);
  console.log('  the real build :'); show(real);
  console.log('');

  check(`[${tod}] every stage resolved ${tod}`, relay.every((r) => r.tod === tod));
  check(`[${tod}] relay spawns no enemies`, relay.every((r) => r.enemies === 0));
  check(`[${tod}] real build still spawns them`, real.every((r) => r.enemies > 0));
  check(`[${tod}] relay keeps bags and bottles`,
    relay.every((r) => r.bags > 0 && r.champagnes > 0));
  check(`[${tod}] relay aura on, real build off`,
    relay.every((r) => r.aura) && real.every((r) => !r.aura));
  check(`[${tod}] relay survives the pit, real build dies`,
    relay.every((r) => !r.dead && r.caught) && real.every((r) => r.dead));
  // The whole point of the walkthrough is that the LAYOUT is the shipping
  // one. Same seed, same recipe -> the bag counts have to line up exactly.
  check(`[${tod}] layout identical to the real build`,
    relay.every((r, i) => r.bags === real[i].bags && r.champagnes === real[i].champagnes),
    `bags ${relay.map((r) => r.bags).join('/')} vs ${real.map((r) => r.bags).join('/')}`);

  // The title button, in this time of day, with no URL flag at all.
  const pb = await newPage();
  await pb.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await enter(pb);
  await pb.screenshot({ path: `${OUT}/relay-title-${tod}.png` });
  const rect = await pb.evaluate(() => window.__title.relayRect(window.__game.titleBox));
  await pb.touchscreen.tap(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await pb.waitForTimeout(1600);
  const pressed = await pb.evaluate(() => ({ screen: window.__game.screen,
    tod: window.__game.level && window.__game.level.stage.tod,
    enemies: window.__game.level ? window.__game.level.enemies.length : null,
    aura: window.__game.player ? window.__game.player.invulnerableUntil > performance.now() : null }));
  check(`[${tod}] title button starts a relay run`,
    pressed.screen === 'playing' && pressed.enemies === 0 && pressed.aura && pressed.tod === tod,
    JSON.stringify(pressed));
  byTod[tod] = relay;
}

// The two times of day must be the same GAME, differing only in the plates.
check('day and night generate the same layout',
  byTod.day.every((r, i) => r.bags === byTod.night[i].bags
    && r.champagnes === byTod.night[i].champagnes),
  `bags day ${byTod.day.map((r) => r.bags).join('/')} vs night ${byTod.night.map((r) => r.bags).join('/')}`);

// ── 3. The settings switch: flip it, take the reload, press RELAY ────────
console.log('\n=== THE SETTINGS SWITCH ===');
const ps = await newPage();
await ps.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await atTitle(ps);
const before = await ps.evaluate(async () => (await import('/src/world/stages.js')).STAGES[0].tod);
// Ask for whichever one it is NOT, so the flip is always a real change.
const want = before === 'night' ? 'day' : 'night';
await ps.evaluate((v) => localStorage.setItem('wh_tod', v), want);
await ps.reload({ waitUntil: 'networkidle' });
await enter(ps);
const after = await ps.evaluate(async () => ({ tod: (await import('/src/world/stages.js')).STAGES[0].tod,
  screen: window.__game.screen,
  relayBtn: !!window.__title.relayRect(window.__game.titleBox) }));
check(`switching ${before} -> ${want} actually switched`, after.tod === want, JSON.stringify(after));
check('the reload lands back on the title card', after.screen === 'title');
check('CHAMPAGNE RELAY is still on that title card', after.relayBtn);

const rect2 = await ps.evaluate(() => window.__title.relayRect(window.__game.titleBox));
await ps.touchscreen.tap(rect2.x + rect2.w / 2, rect2.y + rect2.h / 2);
await ps.waitForTimeout(1600);
const post = await ps.evaluate(() => ({ screen: window.__game.screen,
  tod: window.__game.level && window.__game.level.stage.tod,
  enemies: window.__game.level ? window.__game.level.enemies.length : null,
  aura: window.__game.player ? window.__game.player.invulnerableUntil > performance.now() : null }));
check('relay works after the switch', post.screen === 'playing' && post.enemies === 0
  && post.aura && post.tod === want, JSON.stringify(post));

// And the flag must NOT survive into a normal run started after it.
await ps.reload({ waitUntil: 'networkidle' });
await enter(ps);
await ps.touchscreen.tap(215, 300); await ps.waitForTimeout(1600);
const normal = await ps.evaluate(() => ({ screen: window.__game.screen,
  enemies: window.__game.level ? window.__game.level.enemies.length : null }));
check('a normal START after the switch is still a normal run',
  normal.screen === 'playing' && normal.enemies > 0, JSON.stringify(normal));

// ── The front door ───────────────────────────────────────────────────────
console.log('\n=== THE BLACK CARD ===');
const pd = await newPage();
await pd.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await atTitle(pd); await pd.waitForTimeout(1200);
const shut = await pd.evaluate(() => ({ tapped: window.__game.introTapped,
  box: !!window.__game.titleBox }));
check('opens shut, with no title drawn behind it', !shut.tapped && !shut.box,
  JSON.stringify(shut));
await pd.touchscreen.tap(215, 466);
await pd.waitForFunction(() => window.__game.introTapped, null, { timeout: 10000 });
await pd.waitForTimeout(300);
const opened = await pd.evaluate(() => ({ cue: window.__audio.music.status().playing,
  audible: !window.__audio.music.status().el?.paused, screen: window.__game.screen }));
check('one tap in open space starts the theme', opened.cue === 'title' && opened.audible,
  JSON.stringify(opened));
await pd.waitForTimeout(2600);
const settled = await pd.evaluate(() => ({ screen: window.__game.screen,
  relay: !!window.__title.relayRect(window.__game.titleBox),
  opts: !!window.__title.optionsRect(window.__game.titleBox) }));
check('it settles into the menu, both controls present',
  settled.screen === 'title' && settled.relay && settled.opts, JSON.stringify(settled));
await pd.touchscreen.tap(215, 240); await pd.waitForTimeout(1600);
const ran = await pd.evaluate(() => ({ screen: window.__game.screen }));
check('then open space is START', ran.screen === 'playing', JSON.stringify(ran));

console.log('');
console.log(checks.every(([, p]) => p)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, p]) => !p).map(([w]) => w).join(', ')}`);
await b.close();
