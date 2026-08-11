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
import { createMoneyBag, createChampagneBottle } from '../entities/collectibles.js';

const RUNWAY_COLS = 26; // safe flat start, same length as Jandé's buildRunner()
const MIN_ENEMY_SPACING_COLS = 8;
// A real street is mostly continuous street. The first pass fired a feature
// roll on nearly every column, which produced a jumble of small disconnected
// slabs — the ground has to read as an actual road with things ON it, not as
// scattered floating chunks. These enforce breathing room between features.
const MIN_FEATURE_GAP_COLS = 7;
const PLATFORM_MIN_W = 5;
const PLATFORM_EXTRA_W = 5;

// Sine-hash pseudo-random in [0,1) — same trick as Jandé's rnd01(seed):
// deterministic per (column, stage) so the same stage always generates the
// same layout, without needing to store a full RNG state.
function rnd01(seed) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
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
    genC: 0,
    lastEnemyCol: -999,
    lastFeatureCol: -999,
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

export function genAhead(level, untilCol) {
  const { recipe, stageEnd } = level.stage;
  const cap = Math.min(untilCol, stageEnd + 8);

  while (level.genC < cap) {
    const c = level.genC;

    // Past the finish line: flat safe plaza, no more hazards/spawns.
    if (c >= stageEnd) {
      groundCol(level.map, c, FLOOR_R, LH - 1);
      level.genC++;
      continue;
    }

    const roll = rnd01(c * 1.7 + level.seed);
    // Enforce a run of plain street between features so the ground reads as
    // a continuous road rather than a chain of disconnected slabs.
    const featureOk = c - level.lastFeatureCol >= MIN_FEATURE_GAP_COLS;

    if (featureOk && roll < recipe.gap) {
      // GAP — jump-only pit, guaranteed landing strip after.
      const w = 2 + Math.floor(rnd01(c * 3.1 + level.seed) * recipe.gapMax);
      pit(level.map, c, w, FLOOR_R, LH - 1);
      groundCol(level.map, c + w, FLOOR_R, LH - 1);
      level.lastFeatureCol = c + w;
      level.genC = c + w + 3;
      continue;
    }

    if (featureOk && roll < recipe.gap + recipe.plat) {
      // RAISED STREET FEATURE — a wide slab (stoop, loading dock, awning
      // ledge). Deliberately long: short floating chunks look like debris.
      const w = PLATFORM_MIN_W + Math.floor(rnd01(c * 2.3 + level.seed) * PLATFORM_EXTRA_W);
      const heightRows = 2 + Math.floor(rnd01(c * 4.7 + level.seed) * recipe.vert * 10);
      groundCol(level.map, c, FLOOR_R, LH - 1);
      plat(level.map, c, FLOOR_R - heightRows, w);
      if (rnd01(c * 5.3 + level.seed) < recipe.bag) {
        level.bags.push(createMoneyBag(c * T + w * T * 0.5 - 12, (FLOOR_R - heightRows) * T - 26));
      }
      level.lastFeatureCol = c + w;
      level.genC = c + w;
      continue;
    }

    if (featureOk && roll < recipe.gap + recipe.plat + recipe.haz) {
      // POTHOLE or an enemy — ground continues straight through either way.
      groundCol(level.map, c, FLOOR_R, LH - 1);
      if (rnd01(c * 6.1 + level.seed) < recipe.enemy && c - level.lastEnemyCol > MIN_ENEMY_SPACING_COLS) {
        level.enemies.push(createEnemy(c * T, FLOOR_R * T - ENEMY_H, 96, pickVariant(level, c)));
        level.lastEnemyCol = c;
      } else {
        // Sunk into the street surface, not perched on top of it. Wide and
        // shallow so it reads as a hole in the road at a glance.
        //
        // SIZED AGAINST THE JUMP, not picked. A jump hangs for 2*JUMP_V/GRAV
        // = 49 ticks, which carries 315 world units at RUN_SPEED but only 128
        // at WALK_SPEED. The old 52-86 was timid — the client asked for
        // bigger — so this is 76-120: half again as wide, and the widest one
        // still clears at a walk with margin rather than forcing a run-up.
        // Deeper too, 13 -> 20, since the renderer takes its cavity from h.
        const pw = 76 + Math.floor(rnd01(c * 8.3 + level.seed) * 44);
        level.obstacles.push({ x: c * T, y: FLOOR_R * T + 1, w: pw, h: 20 });
      }
      level.lastFeatureCol = c;
      level.genC = c + 2;
      continue;
    }

    // FLAT run — plain ground, sprinkled bags/champagne/rare enemy.
    groundCol(level.map, c, FLOOR_R, LH - 1);
    if (rnd01(c * 7.9 + level.seed) < recipe.bag) {
      level.bags.push(createMoneyBag(c * T + 8, (FLOOR_R - 1) * T - 20));
    }
    if (rnd01(c * 9.3 + level.seed) < recipe.champagne) {
      level.champagnes.push(createChampagneBottle(c * T + 8, (FLOOR_R - 1) * T - 26));
    }
    if (rnd01(c * 11.1 + level.seed) < recipe.enemy * 0.6 && c - level.lastEnemyCol > MIN_ENEMY_SPACING_COLS) {
      level.enemies.push(createEnemy(c * T, FLOOR_R * T - ENEMY_H, 96, pickVariant(level, c)));
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
