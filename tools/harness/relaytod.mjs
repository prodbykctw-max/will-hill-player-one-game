// CHAMPAGNE RELAY across BOTH times of day, and across the settings switch.
//
// relay.mjs already proved the flag works at night. The client's question was
// narrower and more practical: "I wanna make sure that the champagne relay
// version of the game works in night mode as well... when I switch the time
// of day, as long as that works I could check it."
//
// ⚠️ THE TITLE BUTTON IS GONE. Client, later: "the champagne relay is not
// going to be there, that's like a dev/dashboard thing." So point 2 of the
// original three below no longer applies — there is no on-screen control to
// press, only `?relay=1` and the `window.__startStage` dev hook. This file now
// proves that removal explicitly (the pill is gone, and no tap on the title
// card can reach it) alongside the two points that still stand:
//   1. relay behaves identically whether the stages resolved day or night,
//   2. flipping the setting in OPTIONS — which reloads the page, and a reload
//      is exactly where a runtime flag can quietly evaporate — leaves the URL
//      flag reachable and the stages actually switched.
//
// Point 2 is the one worth the harness. `TIME_OF_DAY` is read once at boot,
// so changing it reloads; `relay` lives in a module variable. A reload has to
// leave `?relay=1` still meaning something, or the URL door is broken too.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const { startFromTitle } = await import('./startchain.mjs');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
// Screenshots land in `shots/` unless SEAM_OUT says otherwise. It used to
// default to the repo ROOT, so any run without that variable set dropped
// untracked PNGs beside the source — which on this project is the exact
// shape of the accident the CLAUDE.md guardrail is about (harness output
// riding into a commit unnoticed). `shots/` is already gitignored.
const OUT = process.env.SEAM_OUT || 'shots';
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

// THERE IS NO LONGER A DOOR TO KNOCK ON. The black TAP ANYWHERE card is gone
// at the client's call, and with it the swallowed first tap — so a harness that
// still taps once "to enter" now STARTS A RUN with that tap. All this has to do
// is wait for the card to finish revealing itself, or a button is still fading
// in under the finger.
const enter = async (p) => {
  await atTitle(p);
  await p.waitForTimeout(2600);
};

// Walk all five stages: what spawned, is the aura up, does a pit kill him.
async function sweep(p) {
  const out = [];
  for (let i = 0; i < 5; i++) {
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

  // The title card, in this time of day, with no URL flag at all — a normal
  // tap on open space must start a NORMAL run, never a relay one. There is no
  // button left to press instead; this is the negative case that replaces it.
  const pb = await newPage();
  await pb.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await enter(pb);
  await pb.screenshot({ path: `${OUT}/relay-title-${tod}.png` });
  const noButton = await pb.evaluate(() => typeof window.__title.relayRect === 'undefined'
    && typeof window.__title.hitRelay === 'undefined');
  check(`[${tod}] no CHAMPAGNE RELAY button exists on the title card`, noButton);
  // The start chain sits between the tap and the run now — see startchain.mjs.
  await startFromTitle(pb);
  const pressed = await pb.evaluate(() => ({ screen: window.__game.screen,
    tod: window.__game.level && window.__game.level.stage.tod,
    enemies: window.__game.level ? window.__game.level.enemies.length : null,
    aura: window.__game.player ? window.__game.player.invulnerableUntil > performance.now() : null }));
  check(`[${tod}] a tap on the title card is a normal run, never relay`,
    pressed.screen === 'playing' && pressed.enemies > 0 && !pressed.aura && pressed.tod === tod,
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
  screen: window.__game.screen }));
check(`switching ${before} -> ${want} actually switched`, after.tod === want, JSON.stringify(after));
check('the reload lands back on the title card', after.screen === 'title');

// The URL flag, not the (removed) button, is the surviving door — reload with
// it still in the address bar and the dev hook must still reach relay mode.
await ps.goto(`http://localhost:5199/?relay=1&tod=${want}`, { waitUntil: 'networkidle' });
await atTitle(ps);
const post = await ps.evaluate(async (idx) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = window.__game;
  window.__startStage(0);
  for (let k = 0; k < 3; k++) await frame();
  return { screen: g.screen, tod: g.level.stage.tod, enemies: g.level.enemies.length,
    aura: g.player.invulnerableUntil > performance.now() };
});
check('relay still reachable by URL after the switch', post.screen === 'playing'
  && post.enemies === 0 && post.aura && post.tod === want, JSON.stringify(post));

// And the flag must NOT survive into a normal run started by TAPPING the
// title card — the whole point of it being a "dev/dashboard thing" now.
await ps.reload({ waitUntil: 'networkidle' });
await enter(ps);
await startFromTitle(ps);
const normal = await ps.evaluate(() => ({ screen: window.__game.screen,
  enemies: window.__game.level ? window.__game.level.enemies.length : null }));
check('a normal START after the switch is still a normal run',
  normal.screen === 'playing' && normal.enemies > 0, JSON.stringify(normal));

// ── No front door ────────────────────────────────────────────────────────
console.log('\n=== THE CARD OPENS STRAIGHT AWAY ===');
const pd = await newPage();
await pd.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await enter(pd);
const up = await pd.evaluate(() => ({ screen: window.__game.screen,
  box: !!window.__game.titleBox,
  opts: !!window.__title.optionsRect(window.__game.titleBox),
  music: !!window.__title.musicRect(window.__game.titleBox),
  noRelay: typeof window.__title.relayRect === 'undefined'
    && typeof window.__title.hitRelay === 'undefined' }));
check('no black card — the title is up with OPTIONS and MUSIC, and no relay pill',
  up.screen === 'title' && up.box && up.opts && up.music && up.noRelay, JSON.stringify(up));
// ⚠️ MUSIC IS BESIDE OPTIONS NOW, NOT STACKED UNDER IT. This used to assert
// the stack — "that music button ultimately is going to be under the OPTIONS
// button... stacked perfectly" — which was the shape when OPTIONS was his
// painted word with a box hung below it. The controls are laid out from the
// bottom of the SCREEN now (homeLayout in src/render/title.js) and sit in a
// row with the contest banner above them; their full geometry is
// tools/harness/titlehome.mjs's subject. All this file needs from them is
// that the relay work above did not leave two controls on top of each other.
const sep = await pd.evaluate(() => {
  const t = window.__title, b2 = window.__game.titleBox;
  const o = t.optionsRect(b2), m = t.musicRect(b2);
  return { overlap: o.x < m.x + m.w && m.x < o.x + o.w
                 && o.y < m.y + m.h && m.y < o.y + o.h,
           optH: Math.round(o.h), musicH: Math.round(m.h) };
});
check('OPTIONS and MUSIC are two separate controls, both real tap targets',
  !sep.overlap && sep.optH >= 34 && sep.musicH >= 34, JSON.stringify(sep));
// ⚠️ INVERTED with the client's reversal: "I can still tap anywhere and
// start the game. I thought we removed that." Open space does NOTHING now;
// only his painted PRESS START commits to a run.
await pd.touchscreen.tap(215, 240); await pd.waitForTimeout(900);
check('open space is NOT a start any more', await pd.evaluate(() => window.__game.screen) === 'title');
const pr0 = await pd.evaluate(() => {
  const r = window.__title.promptRect(window.__game.titleBox);
  const cv = document.querySelector('canvas');
  const s = cv.getBoundingClientRect().width / cv.width;
  return { x: (r.x + r.w / 2) * s, y: (r.y + r.h / 2) * s };
});
await pd.touchscreen.tap(pr0.x, pr0.y); await pd.waitForTimeout(1700);
check('PRESS START is', await pd.evaluate(() => window.__game.screen) === 'playing');

console.log('');
console.log(checks.every(([, p]) => p)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, p]) => !p).map(([w]) => w).join(', ')}`);
await b.close();
