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
import { createEnemy } from '../entities/enemy.js';
import { createMoneyBag, createChampagneBottle } from '../entities/collectibles.js';

const RUNWAY_COLS = 26; // safe flat start, same length as Jandé's buildRunner()
const MIN_ENEMY_SPACING_COLS = 6;

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
  };
}

export function buildRunway(level) {
  for (let c = 0; c < RUNWAY_COLS; c++) groundCol(level.map, c, FLOOR_R, LH - 1);
  level.genC = RUNWAY_COLS;
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

    if (roll < recipe.gap) {
      // GAP — jump-only pit, guaranteed landing strip after.
      const w = 2 + Math.floor(rnd01(c * 3.1 + level.seed) * recipe.gapMax);
      pit(level.map, c, w, FLOOR_R, LH - 1);
      groundCol(level.map, c + w, FLOOR_R, LH - 1);
      level.genC = c + w + 3;
      continue;
    }

    if (roll < recipe.gap + recipe.plat) {
      // BONUS PLATFORM — elevated asphalt strip, ground continues below it.
      const w = 3 + Math.floor(rnd01(c * 2.3 + level.seed) * 4);
      const heightRows = 2 + Math.floor(rnd01(c * 4.7 + level.seed) * recipe.vert * 10);
      groundCol(level.map, c, FLOOR_R, LH - 1);
      plat(level.map, c, FLOOR_R - heightRows, w);
      if (rnd01(c * 5.3 + level.seed) < recipe.bag) {
        level.bags.push(createMoneyBag(c * T + 8, (FLOOR_R - heightRows) * T - 24));
      }
      level.genC = c + w;
      continue;
    }

    if (roll < recipe.gap + recipe.plat + recipe.haz) {
      // OBSTACLE — ground continues; either an enemy ambush or a static hazard.
      groundCol(level.map, c, FLOOR_R, LH - 1);
      if (rnd01(c * 6.1 + level.seed) < recipe.enemy && c - level.lastEnemyCol > MIN_ENEMY_SPACING_COLS) {
        level.enemies.push(createEnemy(c * T, (FLOOR_R - 2) * T));
        level.lastEnemyCol = c;
      } else {
        level.obstacles.push({ x: c * T + 6, y: (FLOOR_R - 1) * T + 8, w: 20, h: 24 });
      }
      level.genC = c + 3;
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
      level.enemies.push(createEnemy(c * T, (FLOOR_R - 2) * T));
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
