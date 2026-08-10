// Will Hill — player entity. See docs/GDD.md "Character asset pipeline" for
// the sprite source and which animations are in scope.
//
// Composed game-ready spritesheet + atlas (built by tools/compose_player_sheet.py
// from assets/raw-sprites/will-hill/, see that script for regeneration):
//   9 animations x 24 frames, 256x256 cells: idle (base walk/idle loop,
//   despite being sourced from the "Sword Idle" export), jog, sprintEnter,
//   sprintExit, roll, jumpStart, jumpLand, hit, death.
//
// No combat moveset (Sword Attack/Block/Enter/Exit, Slash A/B/C, Combo,
// Kick, Punch, and both "Street Ninja" attack sheets) — archived, not wired
// in. Will Hill defeats enemies by jumping on them (Mario-style stomp), not
// by attacking.

import spriteSheetUrl from '../assets/sprites/will-hill.png';
import atlas from '../assets/sprites/will-hill.atlas.json';

export const PLAYER_SPRITE = { url: spriteSheetUrl, atlas };

export function createPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    w: 32,
    h: 48,
    grounded: false,
    invulnerableUntil: 0, // set by champagne-bottle pickup: now + 30s
    anim: 'idle', // key into PLAYER_SPRITE.atlas.animations
    frame: 0,
  };
}

export function isInvulnerable(player, now) {
  return now < player.invulnerableUntil;
}

export function grantInvulnerability(player, now, seconds = 30) {
  player.invulnerableUntil = now + seconds * 1000;
}
