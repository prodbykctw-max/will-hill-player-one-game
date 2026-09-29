// WILL HILL'S VOICE LINES — each folder speaks at its own moment, and cycles.
//
// Client: "Add some voiceover elements for his character to have throughout
// the game", then: "the voice lines, they're folded perfectly, so can we just
// make them match the instructions and where their places should be... stage
// clear statements... you should be able to just cycle those."
//
// Graded by WHAT HE ACTUALLY SAID (audio.lastVoice(), set only when a take
// really started on the audio graph), driven through the real update loop:
// the tutorial card turning, a real hit, a real bottle, the real finish line,
// a real fall. Not by calling say() — a harness that calls the function grades
// the function, not the game.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/voice.mjs
import { TUTORIAL_VOICE, TUTORIAL_LESSONS } from '../../src/world/tutorial.js';

const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

check('one take per intro card', TUTORIAL_VOICE.intro.length === TUTORIAL_LESSONS.intro.length,
  `${TUTORIAL_VOICE.intro.length} takes, ${TUTORIAL_LESSONS.intro.length} cards`);

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
// A real gesture, so the audio context may run (browsers refuse it otherwise).
await p.mouse.click(5, 5);
await p.keyboard.press('Shift');
await p.waitForFunction(() => {
  const L = window.__audio.voiceLines();
  return L.instructions && L.instructions.length === 8;
}, null, { timeout: 10000 });

const lines = await p.evaluate(() => window.__audio.voiceLines());
const want = { instructions: 8, 'jump-on-ninja': 2, 'hit-by-ninja': 2, 'power-ups': 6, 'stage-clear': 6, loss: 3 };
check('all six of his folders shipped, every take in each',
  Object.entries(want).every(([g, n]) => (lines[g] || []).length === n),
  Object.entries(lines).map(([g, l]) => `${g} ${l.length}`).join(', '));
check('every intro card\'s take exists',
  TUTORIAL_VOICE.intro.every((t) => lines.instructions.includes(t)));

const said = () => p.evaluate(() => window.__audio.lastVoice());
const waitSaid = (prefix, timeout = 6000) => p.waitForFunction(
  (pre) => (window.__audio.lastVoice() || '').startsWith(pre), prefix, { timeout })
  .then(() => true).catch(() => false);
// Wait for him to finish, so a non-forced moment is not refused for talking over.
const quiet = () => p.waitForTimeout(3500);

// ── THE INTRO: each card speaks its own take ─────────────────────────────
await p.evaluate(() => window.__startStage(0));
await p.waitForFunction(() => window.__game.dialogue, null, { timeout: 10000 });
check('card 1 speaks "help me make it"', await waitSaid('instructions/help-me-make-it'), await said());
await p.evaluate(() => { window.__tutorialAdvance(); window.__tutorialAdvance(); });
check('turning to card 2 speaks "arrows"', await waitSaid('instructions/arrows', 3000), await said());
await p.evaluate(() => { window.__tutorialAdvance(); window.__tutorialAdvance(); });
check('card 3 speaks "manholes"', await waitSaid('instructions/manholes', 3000), await said());
await p.evaluate(() => { let n = 0; while (window.__game.dialogue && n < 60) { window.__tutorialAdvance(); n++; } });
await quiet();

// ── A HIT: an enemy takes a heart ────────────────────────────────────────
await p.evaluate(() => new Promise((done) => {
  const g = window.__game;
  const en = g.level.enemies.find((e) => e.alive);
  const pl = g.player;
  pl.inv = 0; pl.stumble = 0; pl.dashing = false; pl.dashT = 0;
  pl.x = en.x - 2; pl.y = en.y; pl.vy = 0;
  let n = 0;
  const tick = () => { if (++n < 30) requestAnimationFrame(tick); else done(); };
  requestAnimationFrame(tick);
}));
check('an enemy hit speaks a hit-by-ninja take', await waitSaid('hit-by-ninja/'), await said());
await quiet();

// ── A BOTTLE: every power-up take belongs to champagne ───────────────────
const bottleSays = async () => {
  await p.evaluate(async () => {
    const g = window.__game;
    // The level is generated as he runs; make sure a bottle exists to grab.
    const { genAhead } = await import('/src/world/generator.js');
    genAhead(g.level, g.level.stage.stageEnd + 40);
    const bt = g.level.champagnes.find((c) => !c.got);
    g.player.x = bt.x; g.player.y = bt.y; g.player.vy = 0;
  });
  return waitSaid('power-ups/');
};
check('grabbing champagne speaks a power-ups take', await bottleSays(), await said());

// ── STAGE CLEAR, AND THE CYCLE ──────────────────────────────────────────
const clearOnce = async () => {
  await p.evaluate(async () => {
    const T = 32;
    const g = window.__game;
    const { genAhead } = await import('/src/world/generator.js');
    genAhead(g.level, g.level.stage.stageEnd + 40);
    g.player.x = g.level.stage.stageEnd * T + 4;
  });
  await p.waitForFunction(() => window.__game.screen === 'stageClear', null, { timeout: 8000 });
  await waitSaid('stage-clear/');
  return said();
};
const c1 = await clearOnce();
check('clearing a stage speaks a stage-clear take', (c1 || '').startsWith('stage-clear/'), c1);
await quiet();
await p.evaluate(() => window.__startStage(0));
await p.waitForTimeout(600);
const c2 = await clearOnce();
check('and the next clear does not repeat it', (c2 || '').startsWith('stage-clear/') && c2 !== c1,
  `${c1} -> ${c2}`);
await quiet();

// ── GAME KNOCKED ─────────────────────────────────────────────────────────
await p.evaluate(() => window.__startStage(0));
await p.waitForTimeout(600);
await p.evaluate(() => { const g = window.__game; g.hearts = 0; g.player.y = 40000; });
await p.waitForFunction(() => window.__game.screen === 'gameOver', null, { timeout: 10000 });
check('being knocked out speaks a loss take', await waitSaid('loss/'), await said());

// ── RANDOM, BUT NEVER STUCK ─────────────────────────────────────────────
// Client: "it should never just get stuck on repeating the same thing over
// and over again, it should just randomize." Deal 60 of each moment straight
// off the audio module: no take twice running, and every take heard within
// each run of <deck size> — the deck, not a coin that can land the same way
// five times.
const deal = await p.evaluate((groups) => {
  const a = window.__audio;
  const out = {};
  for (const g of groups) {
    const seq = [];
    for (let i = 0; i < 60; i++) { a.voice(g, { force: true }); seq.push(a.lastVoice().split('/')[1]); }
    out[g] = seq;
  }
  return out;
}, ['jump-on-ninja', 'hit-by-ninja', 'power-ups', 'stage-clear', 'loss']);
for (const [g, seq] of Object.entries(deal)) {
  const n = lines[g].length;
  const noRepeat = seq.every((x, i) => i === 0 || x !== seq[i - 1]);
  // ⚠️ THE DECK MAY ALREADY BE PART-DEALT — the game moments above drew
  // from it — so its boundaries are unknown here. Graded without them: every
  // take turns up in ANY 2n-1 plays in a row, and 60 plays split within 2.
  let even = true;
  for (let i = 0; i + 2 * n - 1 <= seq.length; i++) {
    if (new Set(seq.slice(i, i + 2 * n - 1)).size !== n) even = false;
  }
  const counts = lines[g].map((t) => seq.filter((x) => x === t).length);
  if (Math.max(...counts) - Math.min(...counts) > 2) even = false;
  const firstOrders = new Set();
  for (let i = 0; i + n <= seq.length; i++) firstOrders.add(seq.slice(i, i + n).join());
  check(`${g}: random, never twice running, all ${n} before any repeats`,
    noRepeat && even && (n < 3 || firstOrders.size > 1),
    `${seq.slice(0, Math.min(12, seq.length)).join(' ')}${noRepeat ? '' : '  (REPEAT)'}`);
}

// ── THE SFX SWITCH SILENCES HIM ──────────────────────────────────────────
const muted = await p.evaluate(() => {
  const a = window.__audio;
  a.setSfxMuted(true);
  const spoke = a.voice('stage-clear', { force: true });
  a.setSfxMuted(false);
  return spoke;
});
check('with SFX off he says nothing', muted === false);

check('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log('');
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `${checks.length - bad.length}/${checks.length} passed` : `ALL ${checks.length} PASS`);
if (bad.length) { bad.forEach(([w]) => console.log('  FAILED: ' + w)); process.exit(1); }
