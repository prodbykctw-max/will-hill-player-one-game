// Procedural level generator — reskinned port of Jandé's genAhead()
// (once-upon-a-time/index.html ~line 1053-1108): streams tiles/hazards/
// enemies/pickups column-by-column, ahead of the camera, using a per-column
// seeded pseudo-random roll against the stage's recipe thresholds (gap <
// gap+plat < gap+plat+haz < flat-fallback). Structure is ported; content is
// reskinned per docs/GDD.md — platforms are asphalt (rendered in
// render/renderer.js), the single enemy archetype replaces Jandé's 6-type
// foe roster, money bags + champagne bottles replace notes + 4 power-ups,
// and generation simply stops at `stage.stageEnd` (a finish line) instead
// of opening a boss arena.

import { T, FLOOR_R, LH, groundCol, plat, pit, createTilemap } from './tilemap.js';
import { createEnemy, ENEMY_H } from '../entities/enemy.js';
import { createMoneyBag, createChampagneBottle, champagneTopFor } from '../entities/collectibles.js';
import { isRelay } from '../core/relay.js';

const RUNWAY_COLS = 26; // safe flat start, same length as Jandé's buildRunner()
const MIN_ENEMY_SPACING_COLS = 8;
// A real street is mostly continuous street. The first pass fired a feature
// roll on nearly every column, which produced a jumble of small disconnected
// slabs — the ground has to read as an actual road with things ON it, not as
// scattered floating chunks. These enforce breathing room between features.
// 7 -> 9, and this is what actually delivers the 10% difficulty cut.
//
// Cutting the recipe rates by 10% was not enough on its own, because the
// generator-skip fix changed the sampling underneath them: the hazard branch
// used to advance genC by 2 and now advances by 1, so nearly twice as many
// columns get a feature roll. Measured on EAV, rates-only came out at 27
// hazard features against the old 23 — a 17% INCREASE while the config said
// -10%. Spacing them 9 columns apart instead of 7 removes 22% of the
// opportunities and lands the realised count where it was asked to be.
// How far past its mark a bottle will wait for a raised slab before settling
// for flat ground. Platforms come roughly every 1-in-5 eligible columns, so
// this is many times the expected wait — it is a backstop, not a schedule.
const CHAMPAGNE_WAIT_COLS = 26;
const MIN_FEATURE_GAP_COLS = 9;
// Columns of clean street before every finish line — see the `runIn` comment
// in the generation loop. Wider than the widest thing that can be placed.
const FINISH_CLEAR_COLS = 6;
// A feature is placed at its START column and grows rightward, so reserving
// six columns is not the same as keeping six columns clear: the widest
// pothole is 168px — 5.25 columns — and one starting just outside the zone
// still reaches into it. Measured: with only the start gated, L5P's pothole
// at column 439 still overlapped the zone by 8px. The gate therefore holds
// back by the clearance PLUS the widest thing that can be placed.
const MAX_FEATURE_COLS = 6;
// Platform width, down 10% with the rest of the difficulty pass: w was
// 5 + [0..4] (mean 7.0), now 5 + [0..3] (mean 6.5). A narrower stoop is a
// tighter landing. Note these no longer punch holes in the street — see the
// plat branch below for the bug that used to make every one of them a pit.
const PLATFORM_MIN_W = 5;
const PLATFORM_EXTRA_W = 4;

// Sine-hash pseudo-random in [0,1) — same trick as Jandé's rnd01(seed):
// deterministic per (column, stage) so the same stage always generates the
// same layout, without needing to store a full RNG state.
function rnd01(seed) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

// HOW HIGH A BAG HANGS, and why it is not always the same height.
//
// A pothole is 112-168px wide — three to five columns — but the generator
// only books it against the single column it started on, and genC then moves
// on one column at a time. So the flat runs immediately after a pothole are
// STILL OVER IT, and a bag placed there at the usual ankle height sat inside
// the hole: money you could not tell was reachable, over the one thing you
// are supposed to be jumping.
//
// Anything over a hole hangs at jump height instead. 96 world units above the
// street, against a jump that rises JUMP_V^2/(2*GRAV) = 158 — high enough to
// read as airborne and to have to be jumped for, with enough headroom that it
// is never a trick shot.
// HOW FAR AN ENEMY WALKS BEFORE TURNING. 96 -> 170.
//
// The client's note was that "the enemies are on a tight patrol", and a tight
// patrol is harder to attack for a reason that is not obvious: at 96 units an
// enemy reverses every 69 ticks, so by the time you have committed to a jump
// he has often already turned and is walking back under you. You are not
// aiming at a moving target, you are aiming at a target that changes its mind
// mid-flight. 170 units is about 12 seconds of walking each way, long enough
// that his direction holds for the whole of your approach and the jump becomes
// a judgement you can actually make.
//
// Still bounded, and still ledge-aware, so he never strolls out over a pit —
// see updateEnemy in entities/enemy.js for why that matters as a signal.
const PATROL_RANGE = 170;

const BAG_REST_Y = (FLOOR_R - 1) * T - 20;   // resting on the pavement
const BAG_AIR_LIFT = 96;                     // when it is over a hole

function overHole(level, x) {
  const w = 20;   // a bag's own width, near enough
  for (const o of level.obstacles) {
    if (x + w > o.x && x < o.x + o.w) return true;
  }
  const c0 = Math.floor(x / T);
  const c1 = Math.floor((x + w) / T);
  for (let c = c0; c <= c1; c++) {
    if (!level.map.solid[c + ',' + FLOOR_R]) return true;
  }
  return false;
}

function bagY(level, x) {
  return overHole(level, x) ? BAG_REST_Y - BAG_AIR_LIFT : BAG_REST_Y;
}

// ── EXACTLY `recipe.bags` A STAGE — 400 in the game, so every bag is 40,000 ──
//
// Client's number, so it has to be a guarantee, not an outcome. `bag: 0.34`
// was a per-column dice roll that happened to land on 379 and would have
// drifted the next time a stage got longer. Same trap the bottles were pulled
// out of: you cannot balance against a supply you do not control.
//
// Selection sampling — take each candidate with probability (owed / left), so
// it stops dead at zero and takes everything if it falls behind. Not every
// column CAN hold a bag (hazards, and a slab that drew a bottle gives up its
// bag to it), hence the fraction; topUpBags() covers the rest.
//
// bagsPlaced is its own counter, not bags.length: a player taking a hit
// scatters dropped bags into that same array while the stage is still
// streaming, and counting those would let a beating rewrite the economy.
const CANDIDATE_FRACTION = 0.74;

function wantsBag(level, c, salt) {
  const owed = level.bagQuota - level.bagsPlaced;
  if (owed <= 0) return false;
  const left = level.stage.stageEnd - c;
  if (owed >= left) return true;
  return rnd01(c * salt + level.seed) < owed / (left * CANDIDATE_FRACTION);
}

function placeBag(level, bag) {
  level.bags.push(bag);
  level.bagsPlaced++;
}

// Measured first time out: 89/90 on EAV, 109/110 on L5P. The tail can run out
// of flat road before it runs out of owed bags. So put the stragglers down —
// spread through the flat columns the sampler skipped, not dumped at the end.
function topUpBags(level) {
  const owed = level.bagQuota - level.bagsPlaced;
  const spare = level.spareFlat;
  for (let i = 0; i < Math.min(owed, spare.length); i++) {
    const x = spare[Math.floor(((i + 0.5) / owed) * spare.length)] * T + 8;
    placeBag(level, createMoneyBag(x, bagY(level, x)));
  }
}

export function createLevel(stage, stageIndex = 0) {
  return {
    stage,
    seed: stageIndex * 97 + 13,
    map: createTilemap(),
    enemies: [],
    bags: [],
    champagnes: [],
    obstacles: [], // static hazards: {x,y,w,h}
    // The stage's bag budget, and the generator's own tally against it. See
    // wantsBag() — the tally is separate from bags.length on purpose, because
    // a player taking a hit scatters dropped bags into that same array.
    bagQuota: stage.recipe.bags,
    bagsPlaced: 0,
    spareFlat: [],     // flat columns the sampler passed over — topUpBags()
    toppedUp: false,
    genC: 0,
    lastEnemyCol: -999,
    lastFeatureCol: -999,
    // Where this stage's two champagne bottles go, as columns. A third and
    // two thirds of the way in: far enough past the start that you have met
    // something first, and far enough from the finish that the power is worth
    // spending rather than expiring on the line.
    champagneMarks: [
      Math.round(stage.stageEnd * 0.34),
      Math.round(stage.stageEnd * 0.68),
    ],
  };
}

export function buildRunway(level) {
  for (let c = 0; c < RUNWAY_COLS; c++) groundCol(level.map, c, FLOOR_R, LH - 1);
  level.genC = RUNWAY_COLS;
}

// Which palette walks this stage. Stages 1-3 are single-variant; the finale
// mixes all three, chosen deterministically per column so a given stage
// always lays out identically.
function pickVariant(level, c) {
  const vs = level.stage.enemyVariants;
  return vs.length === 1 ? vs[0] : vs[Math.floor(rnd01(c * 13.7 + level.seed) * vs.length) % vs.length];
}

// How far past the finish line the flat plaza keeps being laid.
//
// IT HAS TO OUTRUN THE CAMERA, and 8 did not. The player stops AT the line but
// the camera keeps looking past it, and the tile bakery draws nothing for a
// column that was never generated — so the STAGE CLEAR card came up over a
// street that stopped mid-frame, with the undercroft section beyond it in
// hard grey rectangles. The client: "the edges of each stage should still look
// neat and clean as if they're still gonna repeat continuously."
//
// 48 columns is 1536 world units, wider than the visible frame at any zoom
// this game runs at, plus the 24-column streaming lookahead on top. Flat
// ground is cheap — it is one groundCol per column with no features, no
// spawns and no hazards — so overshooting costs nothing and running short
// costs a visible hole in the last screenshot of every stage.
const PLAZA_COLS = 48;

export function genAhead(level, untilCol) {
  const { recipe, stageEnd } = level.stage;
  const cap = Math.min(untilCol, stageEnd + PLAZA_COLS);

  while (level.genC < cap) {
    const c = level.genC;

    // Past the finish line: flat safe plaza, no more hazards/spawns.
    if (c >= stageEnd) {
      // The stage's road is fully laid at this point, so this is the moment
      // the bag count is final and the last moment it can still be corrected
      // ON the route rather than out in the plaza. Once only.
      if (!level.toppedUp) {
        level.toppedUp = true;
        topUpBags(level);
      }
      groundCol(level.map, c, FLOOR_R, LH - 1);
      level.genC++;
      continue;
    }

    const roll = rnd01(c * 1.7 + level.seed);
    // Enforce a run of plain street between features so the ground reads as
    // a continuous road rather than a chain of disconnected slabs.
    // ── THE APPROACH TO A FINISH LINE IS KEPT CLEAR ────────────────────────
    //
    // Client: "the finish line of criminal records is in a pothole. Is it
    // always gonna be there or did it just spawn there this time?"
    //
    // ALWAYS. `createLevel` seeds with `stageIndex * 97 + 13` — a pure
    // function of the stage number, no clock, no entropy — so every stage
    // lays out identically for every player on every run. Measured across all
    // four: EAV, Edgewood and the Underground are clear for eight columns
    // before their line, and Little 5 Points has an obstacle at columns
    // 449-454 straddling a finish line at 450. Every player who reaches that
    // finish walks into it, forever.
    //
    // The loop already refuses to place features AT or past `stageEnd`. What
    // it never checked is whether a feature placed just BEFORE the line
    // EXTENDS across it — and a pothole is 112-168px, up to 5.25 columns
    // wide, so one starting at 449 lands squarely on the finish.
    //
    // Six columns, because that is wider than anything that can be placed: a
    // pothole caps at 5.25 columns and a gap at 4, so the last feature that
    // can start does so at stageEnd-7 and ends by stageEnd-1.75. The plaza
    // past the line is already kept flat; this is the same courtesy on the
    // near side, and it is the difference between crossing the line and
    // tripping over it.
    // ⚠️ `__finishClearOff` is a harness door, not a game flag: it restores
    // the old behaviour so tools/harness/finishrun.mjs can prove the check
    // catches the bug. A break-test that only moves its own threshold, and
    // not the product, passes on a broken build — the first cut of that
    // harness did exactly that and reported 12/12 on a level it had not
    // changed. Inert in play.
    const clearCols = (typeof window !== 'undefined' && window.__finishClearOff)
      ? 0 : FINISH_CLEAR_COLS + MAX_FEATURE_COLS;
    const runIn = c >= stageEnd - clearCols;
    const featureOk = !runIn && c - level.lastFeatureCol >= MIN_FEATURE_GAP_COLS;

    if (featureOk && roll < recipe.gap) {
      // GAP — jump-only pit, guaranteed landing strip after.
      const w = 2 + Math.floor(rnd01(c * 3.1 + level.seed) * recipe.gapMax);
      pit(level.map, c, w, FLOOR_R, LH - 1);
      groundCol(level.map, c + w, FLOOR_R, LH - 1);
      level.lastFeatureCol = c + w;
      // c+w+1 ONWARDS, not c+w+3. Skipping ahead left two columns that the
      // loop never visited and therefore never grounded — so every designed
      // gap was followed by a one-column landing strip and then a second,
      // undesigned two-column hole. See the note at the head of this file.
      level.genC = c + w + 1;
      continue;
    }

    if (featureOk && roll < recipe.gap + recipe.plat) {
      // RAISED STREET FEATURE — a wide slab (stoop, loading dock, awning
      // ledge). Deliberately long: short floating chunks look like debris.
      const w = PLATFORM_MIN_W + Math.floor(rnd01(c * 2.3 + level.seed) * PLATFORM_EXTRA_W);
      // ── A SLAB A BOTTLE SITS ON IS BUILT TALLER ─────────────────────────
      //
      // Client, after the bottles first moved off the floor: "champagne bottle
      // more difficult." Moving them onto the slabs was not enough on its own,
      // because the slabs vary — 2 to 6 rows — and the short ones are a step
      // up rather than a jump.
      //
      // MEASURED AGAINST THE REAL PHYSICS. Integrating the fixed step at
      // JUMP_V -12.8 and GRAV 0.52, a single jump peaks at 151px and a double
      // at 266. A row is 32px, so a 4-row slab (128) is a single jump and a
      // 5-row one (160) is not. Bottle slabs are therefore 5 or 6 rows — 160
      // or 192 — which is over the single-jump ceiling every time and still
      // comfortably inside the double.
      const bottleHere = level.champagneMarks.length && c >= level.champagneMarks[0];
      const heightRows = bottleHere
        ? 5 + Math.floor(rnd01(c * 4.7 + level.seed) * 2)
        : 2 + Math.floor(rnd01(c * 4.7 + level.seed) * recipe.vert * 10);
      // GROUND THE WHOLE SPAN, not just the first column. This grounded c and
      // then jumped genC to c+w, so columns c+1..c+w-1 were never visited:
      // the raised slab was drawn with NO STREET UNDERNEATH IT. A stoop you
      // were meant to hop onto for a money bag was a 4-to-8 column death pit
      // with a platform floating over it, and that single line was the source
      // of eight of EAV's twenty-one holes.
      for (let k = 0; k < w; k++) groundCol(level.map, c + k, FLOOR_R, LH - 1);
      plat(level.map, c, FLOOR_R - heightRows, w);
      // ── A BOTTLE IS SOMETHING YOU JUMP FOR ──────────────────────────────
      //
      // Client: "the champagne bottle shouldn't be so easy to get."
      //
      // He is right, and the placement was the whole problem: it sat at ankle
      // height on flat ground in the middle of the running lane, so nine
      // seconds of invulnerability cost exactly nothing — you collected it by
      // not stopping. A power-up you get for free is not a power-up, it is a
      // timer that starts when you walk past a point.
      //
      // So a mark that comes due takes the next RAISED SLAB instead, and the
      // bottle goes on top of it: 2 to 6 rows up, which is a committed jump
      // rather than a step. The slab is the right home for it — the generator
      // already grounds the whole span, so there is somewhere to land, and it
      // is already where the bags worth reaching for live.
      //
      // ONE PRIZE PER SLAB. If the bottle takes it, the bag does not also
      // spawn — they would sit on the same centre line and overlap.
      if (bottleHere) {
        level.champagneMarks.shift();
        level.champagnes.push(createChampagneBottle(
          c * T + w * T * 0.5 - 12, champagneTopFor((FLOOR_R - heightRows) * T)));
      } else if (wantsBag(level, c, 5.3)) {
        placeBag(level, createMoneyBag(
          c * T + w * T * 0.5 - 12, (FLOOR_R - heightRows) * T - 26));
      }
      level.lastFeatureCol = c + w;
      level.genC = c + w;
      continue;
    }

    if (featureOk && roll < recipe.gap + recipe.plat + recipe.haz) {
      // POTHOLE or an enemy — ground continues straight through either way.
      groundCol(level.map, c, FLOOR_R, LH - 1);
      // CHAMPAGNE RELAY LEAVES THE COLUMN EMPTY, IT DOES NOT FALL THROUGH.
      //
      // This branch is enemy-OR-pothole, so gating only the push would turn
      // every enemy spot into a hole in the road — he asked for the game as
      // is minus the enemies, and that would have handed him a stage with
      // more gaps than players get. Decide first, then act on the decision:
      // the column stays flat and empty, and `lastEnemyCol` still advances so
      // the spacing rule plays out exactly as it does in the real build.
      const wantsEnemy = rnd01(c * 6.1 + level.seed) < recipe.enemy
        && c - level.lastEnemyCol > MIN_ENEMY_SPACING_COLS;
      if (wantsEnemy) {
        level.lastEnemyCol = c;
        if (!isRelay()) {
          level.enemies.push(createEnemy(c * T, FLOOR_R * T - ENEMY_H, PATROL_RANGE, pickVariant(level, c)));
        }
      } else {
        // Sunk into the street surface, not perched on top of it. Wide and
        // shallow so it reads as a hole in the road at a glance.
        //
        // SIZED AGAINST THE JUMP, not picked. A jump hangs for 2*JUMP_V/GRAV
        // = 49 ticks, which carries 315 world units at RUN_SPEED but only 128
        // at WALK_SPEED. This has been asked for twice, so: 52-86 -> 76-120
        // -> 112-168, more than three times the original area, and about five
        // player-widths across at the top end.
        //
        // Past 128 the widest ones no longer clear from a standing walk, and
        // that is accepted rather than overlooked: a pothole TRIPS you, it
        // does not drop you (see the foot test in main.js). The cost of
        // walking into one is a stumble and a heart, so a hole big enough to
        // demand a jog is a reason to move, not a death sentence. The holes
        // that DO kill you are the pits, and those are drawn to be
        // unmistakable — see drawPitMouth in render/renderer.js.
        const pw = 112 + Math.floor(rnd01(c * 8.3 + level.seed) * 56);
        level.obstacles.push({ x: c * T, y: FLOOR_R * T + 1, w: pw, h: 30 });
      }
      level.lastFeatureCol = c;
      // c+1, not c+2 — the skipped column was never grounded, which put a
      // one-column hole immediately beside every pothole and every enemy.
      // Eleven of EAV's twenty-one holes were this line. Nothing needs the
      // skip: MIN_FEATURE_GAP_COLS already keeps features apart.
      level.genC = c + 1;
      continue;
    }

    // FLAT run — plain ground, sprinkled bags/champagne/rare enemy.
    groundCol(level.map, c, FLOOR_R, LH - 1);
    if (wantsBag(level, c, 7.9)) {
      placeBag(level, createMoneyBag(c * T + 8, bagY(level, c * T + 8)));
    } else {
      // Passed over, but it IS a valid bag site — remembered in case the
      // sampler comes up short at the finish. See topUpBags().
      level.spareFlat.push(c);
    }
    // EXACTLY TWO BOTTLES PER STAGE, and they are PLACED, not rolled for.
    //
    // This used to be a per-column dice roll at `recipe.champagne`, which over
    // a 240-300 column stage means the count is whatever chance hands you —
    // anywhere from none to a dozen, differing per stage and per seed. You
    // cannot balance a 9-second invulnerability against a supply you do not
    // control, and a run that happens to roll four bottles is a different game
    // from one that rolls none.
    //
    // So each stage gets two, at fixed fractions of its length, and the
    // generator drops one at the first FLAT column at or past each mark —
    // flat, because a bottle needs ground under it and this branch is the only
    // one that guarantees that. `champagneMarks` is consumed in order, so a
    // mark that falls inside a long feature simply lands just after it.
    // THE FALLBACK BUILDS ITS OWN SLAB. It has to exist — two bottles a stage
    // is a guarantee the whole 9-second balance rests on, so a mark that never
    // meets a platform cannot simply go missing.
    //
    // ⚠️ IT USED TO DROP THE BOTTLE ON THE FLOOR, which quietly undid the
    // change it was the fallback for: measured, it fires on two of the eight
    // bottles — Underground's first and L5P's first — so a quarter of them
    // were still free. (I read it as zero at first, because the probe walked
    // up from row 13 and groundCol fills from row 14 DOWN, so flat ground
    // reads as "nothing found" rather than as zero. The classifier said 8 of 8
    // were on slabs when it was 6.)
    //
    // So it puts one up instead: same 5-or-6 rows the platform branch uses for
    // a bottle, grounded underneath the whole way like every other slab here.
    // Every bottle in the game is now a double jump, by construction rather
    // than by luck.
    if (level.champagneMarks.length
        && c >= level.champagneMarks[0] + CHAMPAGNE_WAIT_COLS) {
      level.champagneMarks.shift();
      const w = PLATFORM_MIN_W;
      const heightRows = 5 + Math.floor(rnd01(c * 4.7 + level.seed) * 2);
      for (let k = 0; k < w; k++) groundCol(level.map, c + k, FLOOR_R, LH - 1);
      plat(level.map, c, FLOOR_R - heightRows, w);
      level.champagnes.push(createChampagneBottle(
        c * T + w * T * 0.5 - 12, champagneTopFor((FLOOR_R - heightRows) * T)));
      level.lastFeatureCol = c + w;
      level.genC = c + w;
      continue;
    }
    if (!isRelay() && rnd01(c * 11.1 + level.seed) < recipe.enemy * 0.6 && c - level.lastEnemyCol > MIN_ENEMY_SPACING_COLS) {
      level.enemies.push(createEnemy(c * T, FLOOR_R * T - ENEMY_H, PATROL_RANGE, pickVariant(level, c)));
      level.lastEnemyCol = c;
    }
    level.genC = c + 1;
  }
}

// World-x of the finish line, for the "reached the end of the stage" check
// in main.js.
export function finishLineX(level) {
  return level.stage.stageEnd * T;
}
