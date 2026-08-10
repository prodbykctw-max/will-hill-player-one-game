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

import spriteSheetUrl from '../assets/sprites/enemy.webp';
import atlas from '../assets/sprites/enemy.atlas.json';
import { damage as damagePlayer } from './player.js';

export const ENEMY_SPRITE = { url: spriteSheetUrl, atlas };

const PATROL_SPEED = 1.4; // px/tick — slower than the player's 6.4 run speed
const STOMP_BOUNCE_VY = -10.5; // matches Jandé's post-stomp pogo bounce
const DEFEAT_TICKS = atlas.animations.defeat.frameCount * 3; // ~3 ticks/frame, one full play-through

export function createEnemy(x, y, patrolRange = 96) {
  return {
    x,
    y,
    vx: PATROL_SPEED,
    w: 40,
    h: 48,
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
export function updateEnemy(enemy) {
  if (enemy.alive) {
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
