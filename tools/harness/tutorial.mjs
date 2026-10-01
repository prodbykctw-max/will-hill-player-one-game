// WILL HILL'S TUTORIAL BUBBLE — at the start of stage one, standing still,
// tapped through, then nothing else interrupts the run.
//
// Client: "I kind of want you just to be standing still in the beginning,
// read off all the instructions, let them tap through those... and then we
// gonna let the instructions just be at the beginning stage when you can't
// move and then go from there." And the pictures: "the champagne bottle, when
// you mention it, just show an image of the champagne bottle; money bags...
// show the money bags; enemies... a HUD image of them inside the bubble."
//
// Tests src/world/tutorial.js (the words and pictures) and the freeze /
// paging / drawing in src/main.js. Not the start chain — that is
// startflow.mjs.
//
// Driven through `window.__tutorialOpen` / `__tutorialAdvance` (main.js, DEV
// only) where the point is the state machine, and through real key presses
// where the point is that a player's input reaches it.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/tutorial.mjs
import {
  nextTutorialTrigger, TUTORIAL_ORDER, TUTORIAL_LESSONS, TUTORIAL_PICTURES, BAG_ICON, ARROW_L, ARROW_R,
} from '../../src/world/tutorial.js';

const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// ── PART 1 — the words and the pictures, no browser ──────────────────────
{
  check('the intro opens first, with nothing fired',
    nextTutorialTrigger({}, { x: 0 }, new Set()) === 'intro');
  check('and nothing ever opens after it — no mid-stage lessons',
    nextTutorialTrigger({}, { x: 99999 }, new Set(['intro'])) === null
    && TUTORIAL_ORDER.length === 1);

  const lines = TUTORIAL_LESSONS.intro;
  const pics = TUTORIAL_PICTURES.intro;
  check('one picture slot per line', pics.length === lines.length,
    `${pics.length} slots, ${lines.length} lines`);
  const names = { bag: /bag/i, champagne: /champagne/i, enemy: /enem/i };
  const mismatched = pics.map((k, i) => (k && !names[k].test(lines[i]) ? `${k}→"${lines[i]}"` : null))
    .filter(Boolean);
  check('each picture sits on the line that names it', mismatched.length === 0,
    mismatched.join(', '));
  for (const k of ['bag', 'enemy', 'champagne']) {
    check(`the ${k} gets its picture`, pics.includes(k));
  }
  // Client, on a sticky note, "in an effort to reduce clicks": the greeting
  // and the goal on ONE card, then the instructions, then "Let's get it!"
  check('one card: the greeting, then the goal on its own line',
    /^Yo! It.s Will Hill\.\nHelp me make it to my show\.$/.test(lines[0]), JSON.stringify(lines[0]));
  check('then the instructions, controls first', /to move/.test(lines[1]), lines[1]);
  check('jump and manholes are ONE card, and the old two are gone',
    lines.filter((t) => /JUMP|manhole|pothole|double jump/i.test(t) && !/heads/.test(t)).length === 1
    && lines.includes('Press JUMP to get over manholes… PAUSE'));
  check('champagne says power up, invincible, x2, 9 sec',
    lines.includes(`Champagne Power Ups!\nInvincible & ${BAG_ICON}x2 - 9 sec`));
  // Client: "use the games money bag for the x2 statement. I used my phones
  // emoji thinking youd know to use the games moneybag."
  check('the x2 is the GAME\'S money bag, not a phone emoji',
    lines.every((t) => !/\p{Emoji_Presentation}/u.test(t)) && lines.some((t) => t.includes(BAG_ICON)));
  // Client: "make those two arrows in the move card normal black arrows...
  // not the stock blue arrows." A typed ◀ / ▶ falls back to the phone's emoji
  // font on a canvas; the drawn stand-ins cannot.
  check('the move card\'s arrows are DRAWN, not typed ◀ ▶ glyphs',
    lines.every((t) => !/[\u25C0\u25B6\u2B05\u27A1]/.test(t))
    && lines[1].startsWith(`${ARROW_L} ${ARROW_R}`), JSON.stringify(lines[1]));
  check('eight cards, down from ten', lines.length === 8, `${lines.length}`);
  check('and signs off with "Let\'s get it!"', /^Let.s get it!$/.test(lines[lines.length - 1]),
    lines[lines.length - 1]);
}

// ── PART 2 — live ─────────────────────────────────────────────────────
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

// Straight to stage one. A fresh context has no `wh_intro_v6`, so this is
// a never-taught player. Polled, not slept: the bubble waits for him to land.
await p.evaluate(() => window.__startStage(0));
await p.waitForFunction(() => window.__game.dialogue, null, { timeout: 10000 });

const opened = await p.evaluate(() => ({
  screen: window.__game.screen,
  id: window.__game.dialogue.id,
  page: window.__game.dialogue.page,
  onGround: window.__game.player.onGround,
}));
check('stage one opens on the tutorial, first line first',
  opened.screen === 'playing' && opened.id === 'intro' && opened.page === 0, JSON.stringify(opened));
// Client, from his phone: "Firstly, he's floating in the air."
check('and he is STANDING when it opens, not hanging in the air', opened.onGround === true);

// ── HE CANNOT MOVE WHILE IT IS UP ────────────────────────────────────────
{
  const before = await p.evaluate(() => window.__game.player.x);
  await p.keyboard.down('ArrowRight');
  await frame(30);
  await p.keyboard.up('ArrowRight');
  const after = await p.evaluate(() => window.__game.player.x);
  check('holding RIGHT does nothing while the bubble is up', after === before,
    `x ${before} -> ${after}`);
}

// ── THE PICTURES HAVE SOMETHING TO DRAW ──────────────────────────────────
{
  const loaded = await p.evaluate(() => {
    const im = window.__images;
    const v = window.__game.level.stage.enemyVariants[0];
    const ok = (i) => !!(i && i.naturalWidth > 0);
    return { bag: ok(im.bag), champagne: ok(im.champagne), enemy: ok(im['enemy_' + v]), v };
  });
  check('the bag, bottle and enemy art are loaded for the bubble',
    loaded.bag && loaded.champagne && loaded.enemy, JSON.stringify(loaded));
}

// ── THE TYPEWRITER — partial reveal, then a press completes it ───────────
{
  const ticksPerChar = await p.evaluate(() => window.__tutorialTicksPerChar);
  const longest = TUTORIAL_LESSONS.intro.reduce((a, t, i, all) =>
    (t.length > all[a].length ? i : a), 0);
  const full = TUTORIAL_LESSONS.intro[longest];
  await p.evaluate((i) => { const d = window.__game.dialogue; d.page = i; d.pageT = 0; }, longest);
  await frame(6);
  const mid = await p.evaluate(() => window.__game.dialogue.pageT);
  const shownAtMid = Math.min(full.length, Math.floor(mid / ticksPerChar));
  check('a line types out rather than appearing all at once',
    shownAtMid > 0 && shownAtMid < full.length, `shown=${shownAtMid}/${full.length}`);
  await p.evaluate(() => window.__tutorialAdvance());
  const afterSkip = await p.evaluate(() => ({
    page: window.__game.dialogue.page, pageT: window.__game.dialogue.pageT,
  }));
  check('the first press finishes the line and stays on it',
    afterSkip.page === longest && afterSkip.pageT >= full.length * ticksPerChar,
    JSON.stringify(afterSkip));
  await p.evaluate(() => window.__tutorialAdvance());
  check('the second press turns the page',
    (await p.evaluate(() => window.__game.dialogue.page)) === longest + 1);
}

// ── PAUSE IS REFUSED WHILE IT IS UP ──────────────────────────────────────
{
  await p.keyboard.down('KeyP');
  await p.keyboard.up('KeyP');
  await frame(2);
  check('P does not open the pause menu over the bubble',
    (await p.evaluate(() => window.__game.screen)) === 'playing');
}

// ── A REAL JUMP PRESS REACHES IT ─────────────────────────────────────────
{
  const before = await p.evaluate(() => ({
    page: window.__game.dialogue.page, pageT: window.__game.dialogue.pageT,
  }));
  await p.keyboard.down('Space');
  await frame(2);
  await p.keyboard.up('Space');
  await frame(2);
  const after = await p.evaluate(() => ({
    page: window.__game.dialogue.page, pageT: window.__game.dialogue.pageT,
  }));
  check('a physical JUMP press advances the bubble, through update()',
    after.pageT !== before.pageT || after.page !== before.page,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}

// ── THROUGH TO THE END ───────────────────────────────────────────────────
{
  const presses = await p.evaluate(() => {
    let n = 0;
    while (window.__game.dialogue && n < 60) { window.__tutorialAdvance(); n++; }
    return n;
  });
  const closed = await p.evaluate(() => ({
    dialogue: window.__game.dialogue,
    seen: localStorage.getItem('wh_intro_v6'),
  }));
  check('after "Let\'s get it!" the bubble closes',
    closed.dialogue === null && presses < 60, JSON.stringify({ presses }));
  check('and the tutorial is retired for good (howToSeen)', closed.seen === '1',
    `wh_intro_v6=${closed.seen}`);
}

// ── THEN THE RUN IS THEIRS, UNINTERRUPTED ────────────────────────────────
{
  const before = await p.evaluate(() => window.__game.player.x);
  await p.keyboard.down('ArrowRight');
  await frame(20);
  await p.keyboard.up('ArrowRight');
  const after = await p.evaluate(() => window.__game.player.x);
  check('holding RIGHT moves him again', after > before, `x ${before} -> ${after}`);

  // Walk him up to the first bottle, the first ninja and the first pothole —
  // the places that used to stop the run with a lesson — and make sure
  // nothing opens.
  const stops = await p.evaluate(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const g = window.__game;
    const { genAhead } = await import('/src/world/generator.js');
    genAhead(g.level, g.level.stage.stageEnd + 60);
    const out = [];
    for (const [name, list] of [['pothole', g.level.obstacles], ['ninja', g.level.enemies],
      ['champagne', g.level.champagnes]]) {
      g.player.x = list[0].x - 200; g.player.vy = 0;
      for (let i = 0; i < 6; i++) await raf();
      out.push([name, !!g.dialogue]);
    }
    return out;
  });
  check('no bubble opens mid-stage at a pothole, a ninja or a bottle',
    stops.every(([, open]) => !open), JSON.stringify(stops));
}

// ── CLOSING THE LAST CARD WITH JUMP DOES NOT MAKE HIM JUMP ─────────────
// stepPlayer() does not run while the bubble is up, so its own record of
// "JUMP was held" went stale, and the press that closed the last card read as
// a fresh jump on the first live tick. Real key, real loop.
{
  const c3 = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p3 = await c3.newPage();
  await p3.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p3.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p3.evaluate(() => window.__startStage(0));
  await p3.waitForFunction(() => window.__game.dialogue, null, { timeout: 10000 });
  // To the last card, fully typed, by the hook; then close it with a real key.
  await p3.evaluate(() => {
    const d = window.__game.dialogue;
    d.page = d.pages.length - 1; d.pageT = 9999;
  });
  const y0 = await p3.evaluate(() => window.__game.player.y);
  await p3.keyboard.down('Space');
  await p3.waitForFunction(() => !window.__game.dialogue, null, { timeout: 3000 });
  let minY = y0;
  for (let i = 0; i < 20; i++) {
    minY = Math.min(minY, await p3.evaluate(() => window.__game.player.y));
    await p3.waitForTimeout(16);
  }
  await p3.keyboard.up('Space');
  check('the JUMP that closes the last card does not also make him jump',
    y0 - minY < 4, `rose ${Math.round(y0 - minY)}px`);
  await c3.close();
}

// ── STORAGE REFUSED: THE INTRO STILL ENDS, AND THE STAGE STILL PLAYS ─────
// Safari with "Block All Cookies" (and old iOS private mode) throws on
// localStorage. The latch could never be written, so after the last card the
// game kept taking the tutorial branch — no stomps, no pit deaths, a
// softlock. The latch is held in memory too now.
{
  const c4 = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p4 = await c4.newPage();
  await p4.addInitScript(() => {
    const no = () => { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.getItem = no; Storage.prototype.setItem = no; Storage.prototype.removeItem = no;
  });
  await p4.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p4.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p4.evaluate(() => window.__startStage(0));
  await p4.waitForFunction(() => window.__game.dialogue, null, { timeout: 10000 });
  await p4.evaluate(() => { let n = 0; while (window.__game.dialogue && n < 60) { window.__tutorialAdvance(); n++; } });
  // Lift him into the air: a live stage lets gravity bring him back down.
  const fell = await p4.evaluate(() => new Promise((done) => {
    const g = window.__game; const pl = g.player;
    const y0 = pl.y; pl.y -= 120; pl.vy = 0; pl.onGround = false;
    let n = 0;
    const tick = () => { if (++n < 90 && !pl.onGround) requestAnimationFrame(tick); else done({ landed: pl.onGround, back: Math.abs(pl.y - y0) < 4, dialogue: !!g.dialogue }); };
    requestAnimationFrame(tick);
  }));
  check('with storage blocked the intro still closes and the stage plays on', !fell.dialogue && fell.landed,
    JSON.stringify(fell));
  await c4.close();
}

// ── A RETURNING PLAYER STILL GETS THE NEW INTRO ──────────────────────────
// Two retired latches, both of which real phones are holding:
//   `wh_howto_seen` — set just by reaching the old HOW TO PLAY panel. Asked
//     whether those players should get the new intro anyway: "New intro."
//   `wh_intro_seen` — set by tapping through the FIRST script, the one that
//     ended "Help me make it to the show." When it became greeting → goal →
//     instructions → "Let's get it!": "clear everything out so everybody who
//     has the game will see the new intro now."
//   `wh_intro_v2` — that ten-card script, before it was cut to eight "in an
//     effort to reduce clicks".
//   `wh_intro_v3` — the eight cards with typed ◀ ▶ (blue emoji on a phone).
//   `wh_intro_v4` — the same cards before they had Will's voice on them.
// None may count.
{
  const c2 = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p2 = await c2.newPage();
  await p2.addInitScript(() => {
    localStorage.setItem('wh_howto_seen', '1');
    localStorage.setItem('wh_intro_seen', '1');
    localStorage.setItem('wh_intro_v2', '1');
    localStorage.setItem('wh_intro_v3', '1');
    localStorage.setItem('wh_intro_v4', '1');
    localStorage.setItem('wh_intro_v5', '1');
  });
  await p2.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p2.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p2.evaluate(() => window.__startStage(0));
  const got = await p2.waitForFunction(() => window.__game.dialogue, null, { timeout: 10000 })
    .then(() => true).catch(() => false);
  check('someone who saw the old screen AND both earlier scripts still gets this one', got);
  await c2.close();
}

await b.close();
console.log('');
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `${checks.length - bad.length}/${checks.length} passed` : `ALL ${checks.length} PASS`);
if (bad.length) {
  bad.forEach(([w]) => console.log('  FAILED: ' + w));
  process.exit(1);
}
