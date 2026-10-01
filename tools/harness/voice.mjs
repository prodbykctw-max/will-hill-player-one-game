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

// ── THE MANHOLES CARD WAITS FOR "... PAUSE" ─────────────────────────────
// Client: "I don't want you to be able to click past the manhole one until
// the pause plays." Pressed the instant it speaks, and every 50ms after: the
// card must not turn while the take is playing, and must turn on the first
// press after it ends — the wait is the line, never longer.
const hold = await p.evaluate(() => new Promise((done) => {
  const a = window.__audio;
  const t0 = performance.now();
  window.__tutorialAdvance();                 // finishes the typing
  window.__tutorialAdvance();                 // tries to turn — refused
  const refused = window.__game.dialogue.page === 2;
  let turnedWhilePlaying = false;
  const poll = () => {
    const playing = a.voicePlaying('instructions/manholes');
    window.__tutorialAdvance();
    if (window.__game.dialogue.page === 2) { if (performance.now() - t0 < 6000) setTimeout(poll, 50); else done({ refused, stuck: true }); return; }
    turnedWhilePlaying = playing;
    done({ refused, turnedWhilePlaying, heldMs: Math.round(performance.now() - t0) });
  };
  poll();
}));
check('the manholes card refuses a press while "... pause" is still playing', hold.refused, JSON.stringify(hold));
check('and turns on the first press once the line has ended, not before',
  !hold.stuck && !hold.turnedWhilePlaying && hold.heldMs >= 2500 && hold.heldMs < 3600, JSON.stringify(hold));
check('turning to card 4 speaks "dash"', await waitSaid('instructions/dash', 3000), await said());
const free = await p.evaluate(() => {
  window.__tutorialAdvance(); window.__tutorialAdvance();
  return window.__game.dialogue.page;
});
check('every other card still turns on a press while he is talking', free === 4, `page ${free}`);
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

// ── ENEMY DEFEATS: A STOMP, OR AN AIR DASH ONTO HIS HEAD ────────────────
// The rule is about 1 in 3 defeats with a 7s gap. Client: "make sure it
// applies to when you dash on the enemy's head too." Real defeats through the
// loop, parked high so he never lands (combo.mjs's method). The chance is
// pinned with a Math.random stub so each case is decided, not rolled: 0 makes
// the 1-in-3 pass, 0.99 makes it fail.
await p.evaluate(() => window.__startStage(0));
await p.waitForTimeout(600);
const defeat = (dash, roll) => p.evaluate(async ({ dash, roll }) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = window.__game; const a = window.__audio;
  const { createEnemy } = await import('/src/entities/enemy.js');
  const pl = g.player;
  g.level.enemies.length = 0;
  const e = createEnemy(pl.x + 400, pl.y - 600, 0, 'a');
  g.level.enemies.push(e);
  const before = a.voiceCount();
  const home = { x: pl.x, y: pl.y };   // on the street, where startStage left him
  const real = Math.random;
  Math.random = () => roll;
  pl.x = e.x; pl.y = e.y - pl.h + 10; pl.vy = 2; pl.onGround = false; pl.dead = false;
  if (dash) { pl.dashing = true; pl.dashT = 12; pl.dashVx = 0; }
  await frame();
  Math.random = real;
  // Back down on the street, so he cannot fall into a pit while the next
  // check waits out the 7s gap — a knockdown would speak its own line and
  // (correctly) restart the gap.
  pl.dashing = false; pl.dashT = 0; pl.x = home.x; pl.y = home.y; pl.vy = 0;
  return { killed: !e.alive, spoke: a.voiceCount() > before, line: a.lastVoice() };
}, { dash, roll });
await p.waitForTimeout(7500);                       // clear of the 7s gap
await p.evaluate(() => window.__startStage(0));
await p.waitForTimeout(400);
const d1 = await defeat(true, 0);
check('an AIR DASH onto his head defeats him and speaks jump-on-ninja',
  d1.killed && d1.spoke && d1.line.startsWith('jump-on-ninja/'), JSON.stringify(d1));
const d2 = await defeat(false, 0);
check('a stomp right after stays quiet: the 7-second gap', d2.killed && !d2.spoke, JSON.stringify(d2));
await p.waitForTimeout(7500);
// ⚠️ A FRESH STAGE AFTER EVERY WAIT. Parked 600 up and left alone for 7.5s,
// he falls — through a pit on a bad draw — and GAME KNOCKED takes over, so
// the next "defeat" happened on the knockdown card and read as silence.
await p.evaluate(() => window.__startStage(0));
await p.waitForTimeout(400);
const d3 = await defeat(true, 0.99);
check('past the gap, a dash defeat that loses the 1-in-3 roll stays quiet', d3.killed && !d3.spoke,
  JSON.stringify(d3));
const d4 = await defeat(false, 0);
check('and a stomp that wins it speaks', d4.killed && d4.spoke && d4.line.startsWith('jump-on-ninja/'),
  JSON.stringify(d4));

// ── THE SFX SWITCH SILENCES HIM ──────────────────────────────────────────
const muted = await p.evaluate(() => {
  const a = window.__audio;
  a.setSfxMuted(true);
  const spoke = a.voice('stage-clear', { force: true });
  a.setSfxMuted(false);
  return spoke;
});
check('with SFX off he says nothing', muted === false);

// ── ONE TAKE THAT NEVER ARRIVES DOES NOT SILENCE ITS FOLDER ─────────────
// The deck used to return the same undecoded top card on every call, so one
// failed download muted that moment for the session. Fail one stage-clear
// take at the network, then deal: the other five must still play.
{
  const c5 = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p5 = await c5.newPage();
  // ⚠️ THE AUDIO FETCH, NOT THE MODULE IMPORT. On the dev server the
  // import.meta.glob `?url` import is itself a module request
  // (…/wooooo.mp3?t=…&import&url); failing THAT breaks the module graph and
  // the game never boots. A phone's real failure is the later fetch of the
  // file itself, which carries no query.
  await p5.route((u) => u.pathname.endsWith('/wooooo.mp3') && !u.search, (r) => r.abort());
  await p5.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p5.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p5.mouse.click(5, 5);
  await p5.waitForTimeout(2500);
  const seq = await p5.evaluate(() => {
    const a = window.__audio; const out = [];
    for (let i = 0; i < 15; i++) out.push(a.voice('stage-clear', { force: true }) ? a.lastVoice().split('/')[1] : 'SILENT');
    return out;
  });
  check('a take whose download failed is skipped, not a whole moment gone quiet',
    !seq.includes('SILENT') && !seq.includes('wooooo') && new Set(seq).size === 5, seq.join(' '));
  await c5.close();
}
// With SFX off nothing plays, so nothing holds: the card turns straight away
// (a hold that waited on a silent line would strand a muted player). Its own
// page — the intro only opens once a session.
{
  const pm = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  pm.on('pageerror', (e) => errs.push(e.message));
  await pm.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await pm.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await pm.mouse.click(5, 5);
  await pm.waitForFunction(() => (window.__audio.voiceLines().instructions || []).length === 8, null, { timeout: 10000 });
  await pm.evaluate(() => { window.__audio.setSfxMuted(true); window.__startStage(0); });
  await pm.waitForFunction(() => window.__game.dialogue, null, { timeout: 10000 });
  for (let i = 0; i < 2; i++) {
    await pm.evaluate(() => { window.__tutorialAdvance(); window.__tutorialAdvance(); });
    await pm.waitForTimeout(150);
  }
  const mutedTurn = await pm.evaluate(() => {
    const at = window.__game.dialogue.page;
    window.__tutorialAdvance(); window.__tutorialAdvance();
    return [at, window.__game.dialogue.page];
  });
  check('with SFX off the manholes card does not wait', mutedTurn[0] === 2 && mutedTurn[1] === 3, JSON.stringify(mutedTurn));
  await pm.context().close();
}
check('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log('');
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `${checks.length - bad.length}/${checks.length} passed` : `ALL ${checks.length} PASS`);
if (bad.length) { bad.forEach(([w]) => console.log('  FAILED: ' + w)); process.exit(1); }
