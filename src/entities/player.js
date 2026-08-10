// Will Hill — player entity. Scaffold only; see docs/GDD.md "Character asset
// pipeline" for the sprite source and which animations are in scope.
//
// In-scope animations (from Will-Hill-spritesheet.zip, composed later into a
// game-ready sheet — see tools/README.md): Sword Idle (functions as the base
// walk/idle loop despite the name), Jog, Sprint Enter, Sprint Exit, Roll,
// Jump Start, Jump Land, Hit, Death.
//
// No combat moveset (Sword Attack/Block/Enter/Exit, Slash A/B/C, Combo,
// Kick, Punch, and both "Street Ninja" attack sheets) — archived, not wired
// in. Will Hill defeats enemies by jumping on them (Mario-style stomp), not
// by attacking.

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
    anim: 'idle', // one of the in-scope animation names above
  };
}

export function isInvulnerable(player, now) {
  return now < player.invulnerableUntil;
}

export function grantInvulnerability(player, now, seconds = 30) {
  player.invulnerableUntil = now + seconds * 1000;
}
