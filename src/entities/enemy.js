// Street enemy — masked-hoodie archetype, 3 palette variants (see
// docs/GDD.md "Enemy design"). General variety across all 4 stages, no
// unique per-stage bosses. Behavior is the classic Mario ruleset: bounded
// patrol, stomp-from-above defeats it, side/head-on contact damages the
// player instead.

export const ENEMY_VARIANTS = ['A', 'B', 'C']; // black/blue, grey/blue, brown/charcoal

export function createEnemy(x, y, variant = 'A', patrolRange = 96) {
  return {
    x,
    y,
    vx: 40,
    w: 28,
    h: 44,
    variant,
    originX: x,
    patrolRange,
    alive: true,
  };
}

export function updatePatrol(enemy, dt) {
  if (!enemy.alive) return;
  enemy.x += enemy.vx * dt;
  if (Math.abs(enemy.x - enemy.originX) > enemy.patrolRange) {
    enemy.vx *= -1;
  }
}

// Called when the player's bounding box overlaps the enemy from above.
export function stomp(enemy) {
  enemy.alive = false;
}
