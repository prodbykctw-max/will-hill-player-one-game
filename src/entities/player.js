// Will Hill — player entity + controller. See docs/GDD.md "Character asset
// pipeline" for the sprite source and which animations are in scope.
//
// Composed game-ready spritesheet + atlas (built by tools/compose_player_sheet.py
// from assets/raw-sprites/will-hill/, see that script for regeneration):
//   9 animations x 24 frames, trimmed 184x224 cells (cropped from the
//   original 256x256 AutoSprite cell to its union bounding box across all
//   frames — atlas.origin/sourceCellSize record the offset if you ever need
//   to map back to the original coordinate space): idle (base walk/idle
//   loop, despite being sourced from the "Sword Idle" export), jog,
//   sprintEnter, sprintExit, roll, jumpStart, jumpLand, hit, death.
//
// No combat moveset (Sword Attack/Block/Enter/Exit, Slash A/B/C, Combo,
// Kick, Punch, and both "Street Ninja" attack sheets) — archived, not wired
// in. Will Hill defeats enemies by jumping on them (Mario-style stomp), not
// by attacking.
//
// Movement controller (`stepPlayer`) is a direct port of Jandé's per-tick
// player physics (once-upon-a-time/index.html ~line 1526-1558, 1670-1673):
// lerp-toward-target horizontal movement, buffered+coyote-time jump with a
// double jump, dash (mapped here onto the `roll` animation since that's the
// clip Will Hill's spritesheet actually has — same role as Jandé's dash:
// speed burst + i-frames). No strike/attack branch — no combat.

import { GRAV, TERMINAL_VY, PW, PH, WALK_SPEED, RUN_SPEED, RUN_HOLD_TICKS, RUN_RAMP_TICKS, RUN_ANIM_AT, ACCEL, DECEL, AIR_ACCEL_MUL, AIR_DRAG_MUL, JUMP_V, DOUBLE_JUMP_V, JUMP_CUT_VY, COYOTE_TICKS, JUMP_BUFFER_TICKS, DASH_VX, DASH_TICKS, DASH_IFRAMES, DASH_COOLDOWN } from '../core/physics.js';
import { collideH, collideV } from '../world/tilemap.js';
import spriteSheetUrl from '../assets/sprites/will-hill.webp';
import atlas from '../assets/sprites/will-hill.atlas.json';

export const PLAYER_SPRITE = { url: spriteSheetUrl, atlas };

const CONTACT_IFRAMES = 75; // ticks, matches Jandé's p.inv=75 on taking a hit
// A caught toe, not a knockback. Long enough to feel like a loss of control,
// short enough that it never reads as a stun-lock.
const STUMBLE_TICKS = 26;

export function createPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    w: PW,
    h: PH,
    faceL: false,
    onGround: false,
    onWall: false,
    wallDir: 0,

    coyote: 0,
    jumpBuffer: 0,
    airJumps: 1,

    dashing: false,
    dashT: 0,
    dashVx: 0,
    dashCd: 0,

    holdDir: 0, // direction currently held, for the walk -> run wind-up
    holdT: 0,   // ticks it has been held
    stumble: 0, // ticks left of a pothole trip — steering is disabled
    inv: 0, // i-frame ticks remaining (dash / just-got-hit)
    invulnerableUntil: 0, // ms timestamp — champagne bottle 30s power-up, separate from i-frame ticks

    hearts: 3,
    maxHearts: 3,
    dead: false,

    anim: 'idle', // key into PLAYER_SPRITE.atlas.animations
    animT: 0,
    frame: 0,

    _lastJumpHeld: false,
  };
}

export function isInvulnerable(player, now) {
  return now < player.invulnerableUntil || player.inv > 0;
}

export function grantInvulnerability(player, now, seconds = 30) {
  player.invulnerableUntil = now + seconds * 1000;
}

// Contact with an enemy (not a stomp) — 1 heart, knockback, brief i-frames.
// Returns false if the hit was absorbed by invulnerability (champagne or
// still in post-hit i-frames). `sourceX` (optional) is the enemy's x, used
// to knock the player away from it; falls back to facing direction.
export function damage(p, now, sourceX) {
  if (isInvulnerable(p, now)) return false;
  p.hearts--;
  p.inv = CONTACT_IFRAMES;
  const dir = sourceX != null ? (p.x < sourceX ? -1 : 1) : p.faceL ? 1 : -1;
  p.vx = dir * 6;
  p.vy = -7;
  p.anim = 'hit';
  // WHO killed you decides whether the game-over gets the stomp-out beat. An
  // enemy stands over you; the street does not.
  if (p.hearts <= 0) { p.dead = true; p.deathCause = 'enemy'; }
  return true;
}

// Per-tick controller. Call once per fixed physics step (see core/loop.js).
// Catch a foot in a pothole. Deliberately NOT the same as taking a hit: you
// pitch forward and lose the ability to steer for a moment, which is what
// makes a hole in the road feel like a hole in the road rather than a
// damage box you walk through.
export function trip(p, now) {
  if (p.dead || p.stumble > 0 || isInvulnerable(p, now)) return false;
  p.stumble = STUMBLE_TICKS;
  p.hearts--;
  p.inv = CONTACT_IFRAMES;
  p.anim = 'hit';
  p.animT = 0;
  p.frame = 0;
  p.vx *= 0.22;   // momentum dies in the hole
  p.vy = -3.2;    // a short pitch forward, not the -6 bounce of a hit
  if (p.hearts <= 0) { p.dead = true; p.deathCause = 'pothole'; }
  return true;
}

export function stepPlayer(p, input, map) {
  if (p.dead) return;

  if (p.stumble > 0) p.stumble--;

  // Horizontal movement. No steering mid-stumble — you are going wherever the
  // trip sent you until you recover.
  const dir = p.stumble > 0 ? 0 : input.right() ? 1 : input.left() ? -1 : 0;
  if (dir !== 0 && dir === p.holdDir) p.holdT++;
  else { p.holdDir = dir; p.holdT = 0; }

  // Walk off the line, then wind up into a run if the direction stays held.
  // Releasing or turning resets the wind-up, so a tap is always a walk and
  // only a committed hold becomes a sprint.
  const ramp = Math.min(1, Math.max(0, (p.holdT - RUN_HOLD_TICKS) / RUN_RAMP_TICKS));
  const tgt = dir * (WALK_SPEED + (RUN_SPEED - WALK_SPEED) * ramp);
  // Ground rates as-is; airborne, keep the momentum you took off with.
  const base = tgt === 0 ? DECEL : ACCEL;
  const k = p.onGround ? base : base * (tgt === 0 ? AIR_DRAG_MUL : AIR_ACCEL_MUL);
  p.vx += (tgt - p.vx) * k;
  if (tgt === 0 && p.onGround && Math.abs(p.vx) < 0.6) p.vx = 0;
  if (tgt !== 0) p.faceL = tgt < 0;

  // coyote time
  if (p.onGround) p.coyote = COYOTE_TICKS;
  else if (p.coyote > 0) p.coyote--;

  // buffered jump input
  const jumpHeld = input.jump();
  if (jumpHeld && !p._lastJumpHeld) p.jumpBuffer = JUMP_BUFFER_TICKS;
  p._lastJumpHeld = jumpHeld;
  if (p.jumpBuffer > 0) {
    if (p.onGround || p.coyote > 0) {
      p.vy = JUMP_V;
      p.onGround = false;
      p.coyote = 0;
      p.airJumps = 1;
      p.jumpBuffer = 0;
    } else if (p.airJumps > 0) {
      p.vy = DOUBLE_JUMP_V;
      p.airJumps--;
      p.jumpBuffer = 0;
    } else {
      p.jumpBuffer--;
    }
  }
  if (!jumpHeld && p.vy < JUMP_CUT_VY) p.vy = JUMP_CUT_VY; // variable jump height

  // dash (roll)
  // No dashing out of a stumble — but jumping still works, so there is a way
  // to recover rather than just waiting it out.
  if (input.dash() && p.dashCd <= 0 && !p.dashing && p.stumble <= 0) {
    p.dashing = true;
    p.dashT = DASH_TICKS;
    p.dashVx = p.faceL ? -DASH_VX : DASH_VX;
    p.dashCd = DASH_COOLDOWN;
    p.inv = Math.max(p.inv, DASH_IFRAMES);
  }
  if (p.dashing) {
    p.vx = p.dashVx;
    p.vy *= 0.2;
    p.dashT--;
    if (p.dashT <= 0) p.dashing = false;
  }
  if (p.dashCd > 0) p.dashCd--;
  if (p.inv > 0) p.inv--;

  // gravity
  p.vy = Math.min(p.vy + GRAV, TERMINAL_VY);

  // move + collide, one axis at a time
  p.x += p.vx;
  collideH(map, p, p.w, p.h);
  const wasAirborne = !p.onGround;
  p.x = Math.max(0, p.x);
  p.y += p.vy;
  collideV(map, p, p.w, p.h);
  if (wasAirborne && p.onGround) p.airJumps = 1; // landed — refill double jump

  // animation state (frame advance is the renderer's job)
  if (p.inv > CONTACT_IFRAMES - 12) {
    p.anim = 'hit'; // brief hit-reaction window right after taking damage
  } else if (p.dashing) {
    p.anim = 'roll';
  } else if (!p.onGround) {
    // POSED BY PHYSICS, NOT BY A TIMER.
    //
    // The jump clip is six frames of one arc: 0-1 rising, 2-3 apex, 4-5
    // falling. Running that on a timer meant the pose drifted out of step
    // with the actual jump — the sprite could be landing while the body was
    // still going up. Mapping it to vertical velocity instead means the pose
    // is always the right one, the transitions happen exactly when the motion
    // does, and a long fall simply holds the falling frame rather than
    // looping back to a crouch.
    p.anim = p.vy < 0 ? 'jumpStart' : 'jumpLand';
    const APEX = 2.2;              // |vy| below this counts as hanging
    p.frame = p.vy < -APEX ? 0
      : p.vy < -0.4 ? 1
        : p.vy < APEX ? (p.vy < 0 ? 2 : 3)
          : p.vy < APEX * 2.6 ? 4
            : 5;
  } else if (Math.abs(p.vx) > RUN_ANIM_AT) {
    p.anim = 'run';
  } else if (Math.abs(p.vx) > 0.5) {
    p.anim = 'walk';
  } else {
    p.anim = 'idle';
  }
}
