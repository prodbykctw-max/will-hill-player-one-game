// WHAT IS THE HIGHEST SCORE THAT ACTUALLY EXISTS IN THIS GAME?
//
// The client: "on a mathematical sense what are the chances of people getting
// 50,000 points with the multiplier and the bag count as what it is."
//
// Will Hill is pinned at 50,000. That number is only defensible if the ceiling
// above it is real, so this walks the shipping levels and MEASURES it rather
// than reasoning about it:
//
//   - every bag, every masked enemy, every bottle, per stage, at their real x
//     (ENEMIES, not rats. `level.enemies` is the masked hoodie figures, the
//     only thing here worth 50. The undercroft rats in render/undercroft.js
//     are scenery under the street, cannot be touched and score nothing.)
//   - the doubler's real yield: the champagne window is 9s, and he runs at a
//     measured 4.80 px/tick on a 16.6ms tick, so the window covers a fixed
//     stretch of road. Count the bags that ACTUALLY fall in that stretch
//     downstream of each bottle's real position — not an average density.
//   - the same count for the best five stretches on the map, which is the
//     answer to "what if the bottles were placed perfectly", i.e. the true
//     upper bound on what the multiplier can ever be worth.
//
// It also reads the rendered board, because a pinned score that does not reach
// the screen is not pinned.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
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

const RUN_PX_PER_TICK = 4.80;   // measured, see docs/HANDOFF.md
const STEP_MS = 16.6;
const CHAMP_MS = 9000;
const WINDOW_PX = Math.round((CHAMP_MS / STEP_MS) * RUN_PX_PER_TICK);

const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

// ── 1. walk the stages ───────────────────────────────────────────────────
const stages = [];
for (let i = 0; i < 4; i++) {
  stages.push(await p.evaluate(async (idx) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const g = window.__game;
    window.__startStage(idx);
    for (let k = 0; k < 3; k++) await frame();
    const { genAhead } = await import('/src/world/generator.js');
    genAhead(g.level, g.level.stage.stageEnd + 60);
    await frame();
    return {
      id: g.level.stage.id,
      end: g.level.stage.stageEnd,
      quota: g.level.bagQuota,
      bags: g.level.bags.map((x) => Math.round(x.x)).sort((a, c) => a - c),
      champagnes: g.level.champagnes.map((x) => Math.round(x.x)).sort((a, c) => a - c),
      enemies: g.level.enemies.length,
    };
  }, i));
}

const BAG_VALUE = 100, STOMP = 50, MULT = 2;
let totalBags = 0, totalEnemies = 0, totalBottles = 0, totalLen = 0;
let realDoubled = 0, bestDoubled = 0;

console.log(`\n  champagne window = ${CHAMP_MS}ms at ${RUN_PX_PER_TICK}px/tick = ${WINDOW_PX}px of road\n`);
console.log('  stage          length   bags  enemy  bottles   bags doubled (real placement / best possible)');
for (const s of stages) {
  totalBags += s.bags.length;
  totalEnemies += s.enemies;
  totalBottles += s.champagnes.length;
  totalLen += s.end;

  // REAL: the bags that fall inside the window opened by each actual bottle.
  // Overlapping windows are unioned — a bag cannot be doubled twice.
  const doubled = new Set();
  for (const cx of s.champagnes) {
    for (const bx of s.bags) if (bx >= cx && bx <= cx + WINDOW_PX) doubled.add(bx);
  }
  // BEST: slide the same number of windows to wherever they pay most. Greedy
  // over every candidate start (each bag's x), taking the densest remaining
  // window each round — the upper bound on what better bottle placement buys.
  const taken = new Set();
  for (let n = 0; n < s.champagnes.length; n++) {
    let bestStart = null, bestGain = -1;
    for (const start of s.bags) {
      let gain = 0;
      for (const bx of s.bags) if (bx >= start && bx <= start + WINDOW_PX && !taken.has(bx)) gain++;
      if (gain > bestGain) { bestGain = gain; bestStart = start; }
    }
    if (bestGain <= 0) break;
    for (const bx of s.bags) if (bx >= bestStart && bx <= bestStart + WINDOW_PX) taken.add(bx);
  }
  realDoubled += doubled.size;
  bestDoubled += taken.size;
  console.log(`  ${s.id.padEnd(12)} ${String(s.end).padStart(7)} ${String(s.bags.length).padStart(6)}`
    + ` ${String(s.enemies).padStart(6)} ${String(s.champagnes.length).padStart(8)}`
    + `   ${String(doubled.size).padStart(4)} / ${String(taken.size).padStart(4)}`);
}

const flawless = totalBags * BAG_VALUE + totalEnemies * STOMP;
const realCeil = flawless + realDoubled * BAG_VALUE * (MULT - 1);
const bestCeil = flawless + bestDoubled * BAG_VALUE * (MULT - 1);

console.log('  ' + '-'.repeat(88));
console.log(`  TOTAL        ${String(totalLen).padStart(7)} ${String(totalBags).padStart(6)}`
  + ` ${String(totalEnemies).padStart(6)} ${String(totalBottles).padStart(8)}`
  + `   ${String(realDoubled).padStart(4)} / ${String(bestDoubled).padStart(4)}`);
console.log('');
console.log(`  every bag                    ${String(totalBags * BAG_VALUE).padStart(7)}`);
console.log(`  every enemy stomped         +${String(totalEnemies * STOMP).padStart(6)}`);
console.log(`  doubler, bottles where they are +${String(realDoubled * BAG_VALUE).padStart(6)}`);
console.log(`  ── perfect run, as the map is built   ${String(realCeil).padStart(6)}`);
console.log(`  doubler, if the bottles sat on the densest stretches +${String(bestDoubled * BAG_VALUE).padStart(6)}`);
console.log(`  ── absolute ceiling if bottles were re-placed  ${String(bestCeil).padStart(6)}`);
console.log('');
console.log(`  Will Hill at 50,000 is ${(50000 / realCeil * 100).toFixed(1)}% of the perfect run as built,`);
console.log(`  and ${(50000 / bestCeil * 100).toFixed(1)}% of the re-placed ceiling.`);
console.log(`  bags needed at flat rate to reach 50,000: ${Math.ceil(50000 / BAG_VALUE)} of ${totalBags}`
  + ` (${(Math.ceil(50000 / BAG_VALUE) / totalBags * 100).toFixed(1)}% of every bag in the game)`);
console.log('');

// ── THE QUOTA IS A GUARANTEE, SO PROVE IT ────────────────────────────────
//
// Client: "make it 400 bags total." That number is only worth stating if the
// generator cannot miss it, so both halves get checked: every stage lands on
// its own quota, and the four sum to 400.
console.log('=== THE BAG QUOTA ===');
for (const s of stages) {
  check(`${s.id} placed exactly its quota of ${s.quota}`,
    s.bags.length === s.quota, `placed ${s.bags.length}`);
}
check('400 bags in the game, so every bag is 40,000',
  totalBags === 400 && totalBags * BAG_VALUE === 40000, `${totalBags} bags = ${totalBags * BAG_VALUE}`);

// SPREAD, not just count. Selection sampling hits the number by construction
// even if it does it badly — an under-tuned CANDIDATE_FRACTION would coast
// through the stage and then dump the shortfall on the run-in to the finish,
// which is exactly the same 400 bags and a completely different game. So
// compare the halves: a stage is fine if neither half holds more than 60%.
console.log('');
for (const s of stages) {
  const mid = s.end * 32 / 2;
  const first = s.bags.filter((x) => x < mid).length;
  const share = first / s.bags.length;
  check(`${s.id} spreads its bags across the stage`,
    share >= 0.40 && share <= 0.60,
    `${first} in the first half, ${s.bags.length - first} in the second (${(share * 100).toFixed(0)}%)`);
}
console.log('');

check('50,000 is reachable — the perfect run clears it', realCeil > 50000, `${realCeil}`);
check('50,000 is not trivially reachable — bags alone fall short',
  totalBags * BAG_VALUE < 50000, `${totalBags * BAG_VALUE} from bags alone`);
check('the doubler is what closes the gap',
  totalBags * BAG_VALUE + totalEnemies * STOMP < 50000 && realCeil > 50000,
  `no-doubler flawless ${flawless}`);

// ── 2. the board actually shows him at 50,000 ────────────────────────────
console.log('=== THE BOARD ===');
await p.evaluate(() => localStorage.removeItem('wh_local_runs'));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(2600);
const opt = await p.evaluate(() => window.__title.optionsRect(window.__game.titleBox));
await p.touchscreen.tap(opt.x + opt.w / 2, opt.y + opt.h / 2);
await p.waitForTimeout(900);
const board = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#board li')].map((li) => ({
    r: li.querySelector('.r').textContent,
    n: li.querySelector('.n').textContent,
    s: li.querySelector('.s').textContent,
  }));
  return { rows, note: document.getElementById('boardNote').textContent,
    open: !document.getElementById('panel').hidden };
});
console.log('  ' + JSON.stringify(board.rows));
console.log('  note: ' + board.note);
await p.screenshot({ path: `${OUT}/board-50k.png` });
check('the panel opened on the board', board.open);
check('row 1 is WILL HILL at 50,000',
  board.rows[0] && board.rows[0].n === 'WILL HILL' && board.rows[0].s === '50,000',
  JSON.stringify(board.rows[0]));
check('only Will Hill is listed — the other slots are empty until live',
  board.rows.length === 1, `${board.rows.length} rows`);

console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w).join(', ')}`);
await b.close();
