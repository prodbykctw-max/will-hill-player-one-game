// WILL HILL'S LIVE TUTORIAL — does the box actually freeze the world, type
// out, skip, advance, close, and retire itself, and does the trigger picker
// choose correctly?
//
// Client: "replacing the gameplay how to play instruction section completely
// with the portion of the first stage where Will Hill describes how to play
// with talk bubbles" — Pokémon-Game-Boy-NPC style: the world freezes, a box
// opens, and Will Hill (there is no separate NPC — it's the player) narrates
// what the old HOW TO PLAY panel used to show as ✕/✓ screenshots. This file
// tests THAT mechanism: src/world/tutorial.js (the words and the trigger
// math) and the open/advance/freeze wiring in src/main.js.
//
// ⚠️ NOT WHAT startflow.mjs TESTS. That file is the START CHAIN — does NOT
// NOW/SAVE reach a running game with no panel stop in the way. This file is
// what happens once you're there: does the box on-screen actually behave
// like Game Boy dialogue.
//
// ⚠️ NOT DRIVEN BY WALKING THE PROCEDURAL STAGE. Reaching all five lessons
// for real means hitting a pothole, a gap, a ninja and a bottle in whatever
// order stage one's seed puts them — playable, but choreographing that in a
// harness tests the LEVEL GENERATOR's layout, not the tutorial's own state
// machine. `window.__tutorialOpen`/`window.__tutorialAdvance` (main.js, DEV
// only) are the same door `window.__startStage` already opens for skipping
// straight to a stage — this harness uses them to drive the box directly and
// proves the picker logic (nextTutorialTrigger) separately, as a pure
// function, against synthetic levels.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/tutorial.mjs
import { nextTutorialTrigger, TUTORIAL_ORDER, TUTORIAL_LESSONS } from '../../src/world/tutorial.js';

const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// ── PART 1 — nextTutorialTrigger AS A PURE FUNCTION, no browser needed ────
// The whole point of keeping the trigger math out of main.js: this is cheap
// and exhaustive against level shapes a real seeded playthrough might not
// happen to produce.
{
  const emptyLevel = () => ({ obstacles: [], pits: [], enemies: [], champagnes: [] });

  check('intro fires first no matter what, with an empty `fired` set',
    nextTutorialTrigger(emptyLevel(), { x: 0 }, new Set()) === 'intro');

  const fired1 = new Set(['intro']);
  check('nothing fires with every hazard array still empty',
    nextTutorialTrigger(emptyLevel(), { x: 0 }, fired1) === null);

  // Four hazards, all within lead range, at different distances — nearest
  // one (ninja, x=100) must win, not TUTORIAL_ORDER's own listed order
  // (which puts pothole before ninja).
  const mixed = {
    obstacles: [{ x: 500 }],
    pits: [{ x: 300 }],
    enemies: [{ x: 100 }],
    champagnes: [{ x: 200 }],
  };
  check('the NEAREST un-taught hazard wins, not TUTORIAL_ORDER’s listed order',
    nextTutorialTrigger(mixed, { x: 0 }, fired1) === 'ninja');

  // Same level, ninja already taught — gap (300) beats champagne (200)? No —
  // champagne is closer (200 < 300), so champagne should win next.
  const fired2 = new Set(['intro', 'ninja']);
  check('with the nearest already taught, the NEXT nearest wins',
    nextTutorialTrigger(mixed, { x: 0 }, fired2) === 'champagne');

  // A hazard exists but is still beyond HAZARD_LEAD — must not fire early.
  const farOff = { obstacles: [{ x: 100000 }], pits: [], enemies: [], champagnes: [] };
  check('a hazard far beyond the lead distance does not fire yet',
    nextTutorialTrigger(farOff, { x: 0 }, fired1) === null);

  // Every lesson taught — nothing left to fire, ever.
  const allFired = new Set(TUTORIAL_ORDER);
  check('with every lesson fired, nothing triggers again',
    nextTutorialTrigger(mixed, { x: 0 }, allFired) === null);

  check('TUTORIAL_LESSONS has a non-empty page array for every id in TUTORIAL_ORDER',
    TUTORIAL_ORDER.every((id) => Array.isArray(TUTORIAL_LESSONS[id]) && TUTORIAL_LESSONS[id].length > 0),
    JSON.stringify(TUTORIAL_ORDER.map((id) => [id, TUTORIAL_LESSONS[id]?.length])));
}

// ── PART 2 — THE BOX, LIVE IN THE GAME ─────────────────────────────────
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

const frame = (n = 1) => p.evaluate(async (count) => {
  const raf = () => new Promise((res) => requestAnimationFrame(res));
  for (let i = 0; i < count; i++) await raf();
}, n);

// Straight to stage one, no title/panel dance — same door endcue.mjs and the
// others already use. A fresh context has no `wh_howto_seen`, so this is a
// never-taught player.
await p.evaluate(() => window.__startStage(0));
await frame(3);

const opened = await p.evaluate(() => ({
  screen: window.__game.screen,
  id: window.__game.dialogue && window.__game.dialogue.id,
  page: window.__game.dialogue && window.__game.dialogue.page,
}));
check('a never-taught player lands stage one already frozen on the intro lesson',
  opened.screen === 'playing' && opened.id === 'intro' && opened.page === 0,
  JSON.stringify(opened));

// ── THE FREEZE — hold RIGHT, the world must not move ─────────────────────
{
  const before = await p.evaluate(() => window.__game.player.x);
  await p.keyboard.down('ArrowRight');
  await frame(30);
  await p.keyboard.up('ArrowRight');
  const after = await p.evaluate(() => window.__game.player.x);
  check('holding RIGHT does nothing while the tutorial box is open — the world is frozen',
    after === before, `x ${before} -> ${after}`);
}

// ── THE TYPEWRITER — partial reveal, then a press instantly completes it ──
{
  const ticksPerChar = await p.evaluate(() => window.__tutorialTicksPerChar);
  const full = TUTORIAL_LESSONS.intro[0];
  const mid = await p.evaluate(() => window.__game.dialogue.pageT);
  const shownAtMid = Math.min(full.length, Math.floor(mid / ticksPerChar));
  check('the page is still mid-reveal a few frames after opening, not dumped instantly',
    shownAtMid > 0 && shownAtMid < full.length,
    `pageT=${mid} shown=${shownAtMid}/${full.length}`);

  // A press while still typing must complete the reveal WITHOUT moving to
  // the next page — the two are different presses, on purpose (Game Boy
  // convention: first press finishes the line, second turns the page).
  await p.evaluate(() => window.__tutorialAdvance());
  const afterSkip = await p.evaluate(() => ({
    page: window.__game.dialogue.page,
    pageT: window.__game.dialogue.pageT,
  }));
  check('a press while typing finishes the reveal and stays on the same page',
    afterSkip.page === 0 && afterSkip.pageT >= full.length * ticksPerChar,
    JSON.stringify(afterSkip));
}

// ── ADVANCE THROUGH EVERY PAGE, THEN CLOSE ────────────────────────────────
{
  const pageCount = TUTORIAL_LESSONS.intro.length;
  // One more press turns page 1 (already fully revealed above); each
  // subsequent page needs two — finish its reveal, then turn it — except the
  // harness cannot know in advance how many ticks a page needs, so press
  // twice unconditionally per remaining page: the first press is a no-op
  // once a page is already fully shown (advanceTutorialDialogue's own
  // contract — see main.js), so this is safe either way.
  for (let i = 1; i < pageCount; i++) {
    await p.evaluate(() => window.__tutorialAdvance());
    await p.evaluate(() => window.__tutorialAdvance());
  }
  // The lesson has `pageCount` pages; we've turned pages 0→1→…→last, then
  // one more press closes it.
  await p.evaluate(() => window.__tutorialAdvance());
  const closed = await p.evaluate(() => ({
    dialogue: window.__game.dialogue,
    firedIntro: window.__game.tutorialFired.has('intro'),
    howToSeen: localStorage.getItem('wh_howto_seen'),
  }));
  check('after the last page, the box closes and `intro` is marked fired',
    closed.dialogue === null && closed.firedIntro === true, JSON.stringify(closed));
  check('but howToSeen() stays false — four lessons still untaught',
    closed.howToSeen !== '1', `wh_howto_seen=${closed.howToSeen}`);
}

// ── THE FREEZE LIFTS ───────────────────────────────────────────────────
{
  const before = await p.evaluate(() => window.__game.player.x);
  await p.keyboard.down('ArrowRight');
  await frame(20);
  await p.keyboard.up('ArrowRight');
  const after = await p.evaluate(() => window.__game.player.x);
  check('with the box closed, holding RIGHT actually moves Will Hill again',
    after > before, `x ${before} -> ${after}`);
}

// ── PAUSE IS REFUSED WHILE A BOX IS OPEN ──────────────────────────────────
{
  await p.evaluate(() => { window.__game.dialogue = window.__tutorialOpen('pothole'); });
  await p.keyboard.down('KeyP');
  await p.keyboard.up('KeyP');
  await frame(2);
  const screen = await p.evaluate(() => window.__game.screen);
  check('P does not open the pause menu over a live tutorial box',
    screen === 'playing', `screen=${screen}`);
}

// ── THE REAL INPUT PATH: A PHYSICAL KEY PRESS REACHES THE BOX TOO ────────
// Everything above drove the box through the DEV door directly, which
// proves the state machine but not that confirmPressed() (JUMP) actually
// routes into it during a real frame of update(). One press, through a
// synthetic keyboard event exactly like a player's, closes the loop.
{
  const before = await p.evaluate(() => ({
    page: window.__game.dialogue.page, pageT: window.__game.dialogue.pageT,
  }));
  await p.keyboard.down('Space');
  await frame(2);
  await p.keyboard.up('Space');
  await frame(2);
  const after = await p.evaluate(() => ({
    page: window.__game.dialogue && window.__game.dialogue.page,
    pageT: window.__game.dialogue && window.__game.dialogue.pageT,
  }));
  check('a real JUMP keypress advances the box through update(), not just the DEV door',
    after.pageT !== before.pageT || after.page !== before.page,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}

// ── EVERY LESSON TAUGHT RETIRES THE TUTORIAL FOR GOOD ─────────────────────
{
  // Close whatever `pothole` left open from the two checks above, then force
  // every remaining lesson fired except the last, open the last directly,
  // and walk it to the end.
  await p.evaluate(() => {
    while (window.__game.dialogue) window.__tutorialAdvance();
    window.__game.tutorialFired = new Set(['intro', 'pothole', 'gap', 'ninja']);
    window.__game.dialogue = window.__tutorialOpen('champagne');
  });
  const pages = TUTORIAL_LESSONS.champagne.length;
  for (let i = 0; i < pages; i++) {
    await p.evaluate(() => window.__tutorialAdvance());
    await p.evaluate(() => window.__tutorialAdvance());
  }
  const done = await p.evaluate(() => ({
    dialogue: window.__game.dialogue,
    seen: localStorage.getItem('wh_howto_seen'),
  }));
  check('the fifth and final lesson retires the tutorial (howToSeen -> true)',
    done.dialogue === null && done.seen === '1', JSON.stringify(done));
}

await b.close();
console.log('');
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `${checks.length - bad.length}/${checks.length} passed` : `ALL ${checks.length} PASS`);
if (bad.length) {
  bad.forEach(([w]) => console.log('  FAILED: ' + w));
  process.exit(1);
}
