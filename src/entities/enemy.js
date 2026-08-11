// Street enemy — masked-hoodie archetype, generated via the autosprite MCP
// (see docs/GDD.md "Enemy design" + tools/compose_enemy_sheet.py). General
// variety across all 4 stages, no unique per-stage bosses.
//
// Behavior is the classic Mario ruleset (docs/GDD.md "Story & core loop"):
// bounded patrol (simpler than Jandé's ledge-detection ground-walker —
// deliberate choice, see PHASE 2 plan), stomp-from-above defeats it,
// side/head-on contact damages the player instead. Collision resolution
// below is a direct port of Jandé's foe-collision branch (once-upon-a-time
// index.html ~line 1631-1638) MINUS the strike and dash-kill branches — no
// combat here, stomp is the only way to defeat an enemy.

import sheetA from '../assets/sprites/enemy-a.webp';
import atlasA from '../assets/sprites/enemy-a.atlas.json';
import sheetB from '../assets/sprites/enemy-b.webp';
import atlasB from '../assets/sprites/enemy-b.atlas.json';
import sheetC from '../assets/sprites/enemy-c.webp';
import atlasC from '../assets/sprites/enemy-c.atlas.json';
import { damage as damagePlayer } from './player.js';
import { metersToWorld, CHAR_SCALE } from '../world/scale.js';
import { T, isSolid } from '../world/tilemap.js';

// One generated sheet per palette variant. Stages 1-3 each field a single
// variant; the Underground finale mixes all three (docs/GDD.md "Enemy
// design"). Each was generated through the same AutoSprite pipeline with
// matching prompts, so they read as the same archetype in different colours.
export const ENEMY_SPRITES = {
  a: { url: sheetA, atlas: atlasA },
  b: { url: sheetB, atlas: atlasB },
  c: { url: sheetC, atlas: atlasC },
};
const atlas = atlasA; // shared timing metadata — all variants have identical frame counts

const PATROL_SPEED = 1.4; // px/tick — slower than the player's 6.4 run speed
const STOMP_BOUNCE_VY = -10.5; // matches Jandé's post-stomp pogo bounce
const DEFEAT_TICKS = atlas.animations.defeat.frameCount * 3; // ~3 ticks/frame, one full play-through

// These are people, so they're sized in real-world terms like everything
// else (src/world/scale.js) — shorter than Will Hill's 2.02m so he reads as
// the bigger presence, but unmistakably human-scaled rather than the squat
// 40x48 box the first pass used.
//
// DROPPED 1.94 -> 1.58 SO THEY ARE EASIER TO LAND ON, and the measurement
// behind that is worse than "fiddly". A ground jump rises JUMP_V^2/(2*GRAV)
// = 158 world units above its launch point. A 1.94m enemy stands 163 units
// tall. From flat ground you could not get over one AT ALL — six units
// short, every time — so every successful stomp was coming off a platform,
// a double jump, or luck. The stomp is the only offence in the game and it
// was mathematically unavailable on level street.
//
// At 1.58m the head is at 133, leaving 25 units of slack to come down
// through. Re-derive this if JUMP_V or GRAV ever move.
export const ENEMY_HEIGHT_M = 1.58;
export const ENEMY_H = Math.round(metersToWorld(ENEMY_HEIGHT_M) / CHAR_SCALE); // collider height
export const ENEMY_DRAW_H = metersToWorld(ENEMY_HEIGHT_M); // drawn character height
const ENEMY_W = 30;

// Is there floor under the LEADING edge at `nx`, and no wall in the way?
// Probing the leading edge rather than the centre is what makes the enemy
// stop with its feet on the last solid tile instead of half over the drop.
function canStand(map, enemy, nx) {
  const lead = enemy.vx > 0 ? nx + enemy.w : nx;
  const c = Math.floor(lead / T);
  const rFloor = Math.floor((enemy.y + enemy.h + 2) / T); // tile beneath the feet
  const rBody = Math.floor((enemy.y + enemy.h - 6) / T);  // tile at shin height
  return isSolid(map, c, rFloor) && !isSolid(map, c, rBody);
}

export function createEnemy(x, y, patrolRange = 96, variant = 'a') {
  return {
    x,
    y,
    vx: PATROL_SPEED,
    w: ENEMY_W,
    h: ENEMY_H,
    charDrawH: ENEMY_DRAW_H,
    variant,
    originX: x,
    patrolRange,
    alive: true,
    defeatT: 0, // ticks since defeat; counts up to DEFEAT_TICKS then the entity is removed
    anim: 'idle',
    frame: 0,
  };
}

// Per-tick update: patrol while alive, count down the defeat animation once
// stomped. Returns true once the entity should be removed from the level.
//
// LEDGE DETECTION. This used to be a pure bounded patrol with no ground test
// at all — the enemy simply added vx every tick — so it strolled straight out
// over the pits, hanging in mid-air above the exact gap that kills the player.
// That reads as the enemy walking on the background, and it destroys the one
// thing the player needs from the level: a reliable read on what is standing
// room and what is a hole. An enemy that turns at the edge is a SIGNAL — it
// marks the safe strip for you.
//
// `map` is optional so the unit tests can still step an enemy in isolation.
export function updateEnemy(enemy, map) {
  if (enemy.alive) {
    if (map && !canStand(map, enemy, enemy.x + enemy.vx)) {
      // Turn at the brink rather than after stepping off it.
      enemy.vx *= -1;
    }
    enemy.x += enemy.vx;
    if (Math.abs(enemy.x - enemy.originX) > enemy.patrolRange) enemy.vx *= -1;
    enemy.anim = Math.abs(enemy.vx) > 0 ? 'walk' : 'idle';
    return false;
  }
  enemy.anim = 'defeat';
  enemy.defeatT++;
  return enemy.defeatT >= DEFEAT_TICKS;
}

// Checks + resolves an overlap between the player and this (living) enemy.
// Returns 'stomp' | 'contact' | null. Mutates enemy.alive and player state
// as a side effect (matches Jandé's inline resolution, not split into a
// separate "detect then apply" pass).
export function resolveEnemyCollision(enemy, player, now) {
  if (!enemy.alive) return null;

  const overlap =
    player.x < enemy.x + enemy.w - 4 &&
    player.x + player.w > enemy.x + 4 &&
    player.y < enemy.y + enemy.h - 6 &&
    player.y + player.h > enemy.y + 6;
  if (!overlap) return null;

  // Stomp: falling onto the enemy from above (Jandé: `p.vy>3 && p.y+PH<fo.y+28`,
  // generalized here to the enemy's own height rather than a hardcoded offset).
  const stomping = player.vy > 3 && player.y + player.h < enemy.y + enemy.h * 0.55;
  if (stomping) {
    enemy.alive = false;
    player.vy = STOMP_BOUNCE_VY;
    player.airJumps = 1;
    return 'stomp';
  }

  const hit = damagePlayer(player, now, enemy.x);
  return hit ? 'contact' : null;
}
