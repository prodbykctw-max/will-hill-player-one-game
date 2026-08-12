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
// 1.94 -> 1.58 -> 1.80, and the round trip is worth understanding before
// anyone moves it again.
//
// 1.94 WAS BROKEN. A ground jump rises JUMP_V^2/(2*GRAV) = 158 world units;
// a 1.94m enemy stood 163 tall. From flat street you could not clear one at
// all — six units short, every time — so every stomp came off a platform, a
// double jump, or luck.
//
// 1.58 FIXED THAT AND OVERSHOT. It bought the clearance by making them look
// like teenagers next to Will Hill's 2.02m, and the client's note was exactly
// that: "the enemies are either too small or he is too tall".
//
// 1.80 -> 1.85, AND THE HEIGHT WAS NEVER THE REAL CONSTRAINT. What made
// stomping hard was the shape of the hit test, not the size of the target —
// see the STOMP BOX note below, where a three-tick window came from the stomp
// being a sub-case of body overlap. With that fixed, the height is free to be
// whatever reads right.
//
// THE SPEC AND THE INTENT DISAGREED, AND THE INTENT WON. The client asked for
// the top of their head to reach "row 36, the top line of Will Hill's
// glasses", pointing at a line on a marked-up crop of the sheet. Measured
// back through the renderer's own box — row 36 of his 251-row cell lands
// 151.8 world units above his feet — and the enemy's walking head at 1.80m
// was ALREADY at 152.0. The line he picked was where they already stood, so
// following it literally would have changed nothing, while the sentence next
// to it was "he needs to be a little bit bigger".
//
// THEN THE TARGET MOVED FROM THEIR HEAD TO THEIR EYE LINE, and that is a
// bigger change than it sounds. A balaclava and a hood carry a lot of bulk
// ABOVE the eyes: their eye top sits 10.8% down from their crown while Will
// Hill's row 36 is 9.8% down from his. Aligning the two therefore needs them
// slightly TALLER than him overall, not shorter — the hood pokes above his
// cap even though they are looking at each other level.
//
// Solved against the renderer's own box at 2.01m: eye line within half a unit
// of row 36. Their collider lands on 86, the same as the player's.
//
// This is also where the client started — "can you make the enemies Will
// Hill's height" — before walking it back mid-sentence. It came back round.
//
// MEASURE, DO NOT SCALE FROM THE METRES. The two sheets carry different
// amounts of empty space in their cells and different `fit.h`, so equal metre
// figures do NOT render as equal heights. The number that matters is the
// renderer's own box (`entity.__box` in DEV), not the arithmetic. Three
// attempts to derive this off the atlas disagreed with the screen before that
// hook existed.
//
// CLEARANCE IS THE THING THAT BREAKS AT THIS SIZE, so it is measured rather
// than assumed. An 86-unit collider against a 130-unit tapped apex leaves 44
// units of room over their heads; a held jump gets 158. This is the height
// that killed the game once before — at 1.94m the collider was 163 against a
// 158 apex and stomping was mathematically impossible — so if JUMP_V, GRAV or
// either sheet ever move, re-run scratchpad/hitrate.mjs before believing it.
export const ENEMY_HEIGHT_M = 2.01;
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
// ── THE STOMP BOX ────────────────────────────────────────────────────────
//
// THE STOMP IS THE ONLY OFFENCE IN THIS GAME and it had a THREE TICK window.
// Measured, not estimated: traced against the live physics, a descending
// player passed through the band where the old rule would fire in 3 ticks —
// FIFTY MILLISECONDS. That is not a skill check, it is a coin toss, and it is
// why landing on someone felt like luck.
//
// The cause was structural rather than a bad constant. The stomp was a
// SUB-CASE of the body-overlap test, so before it could be considered the
// player's feet had to already be inside the enemy's box (`feet > enemy.y+6`)
// while also being above its middle (`feet < enemy.y + h*0.55`). Those two
// together leave a 31-unit band, and a falling body crosses 31 units in three
// ticks. Every knob you could turn inside that shape — the 0.55, the insets —
// buys single ticks.
//
// So the stomp gets its OWN box, tested first, and it starts well above the
// enemy's head. If you are coming down and you are over them, you meant to
// land on them. That is the whole rule.
//
// REACH is how far above the head still counts. Deliberately generous, and
// deliberately not unlimited: it is roughly half a metre, so it forgives a
// jump timed slightly early without vacuuming up anybody you are sailing over
// with three metres to spare.
// 95, and the number comes off the trace rather than taste. At 46 there was
// a HOLE IN THE MIDDLE of the timing sweep: jump at the right moment and you
// arrived at the apex, where the feet sit 53 units above a 77-unit enemy's
// head — past the reach — so the most natural timing of all was the one that
// did not connect, and the player got a heart taken off for it. 95 covers the
// apex of a full-hold jump (81 above the head) with margin, and still lets a
// DOUBLE jump sail over without killing anyone, which is the one case where
// passing over is the actual intent.
const STOMP_REACH = 95;   // world units above the enemy's head
const STOMP_DEPTH = 0.62; // how far down into the enemy the feet may go
const STOMP_SIDE = 6;     // horizontal slop, per side, beyond the two boxes
// NOT "must be falling". The old rule needed vy > 3, which is six ticks past
// the apex — so the top of the arc, the part of a jump a player actually aims
// with, did not count. Worse, a jump timed slightly LATE arrives at the enemy
// still rising, and a rising player with his feet over someone's shoulders was
// being read as walking into them and taking a heart for it.
//
// The rule is now: airborne, over him, feet above his waist. If you got your
// feet up there, you meant it. The only thing still excluded is rocketing
// upward THROUGH him from below, which is a genuinely different move and
// should still hurt.
const STOMP_MAX_RISE = -5.5;

export function resolveEnemyCollision(enemy, player, now) {
  if (!enemy.alive) return null;

  const feet = player.y + player.h;
  const overHim =
    player.x < enemy.x + enemy.w + STOMP_SIDE &&
    player.x + player.w > enemy.x - STOMP_SIDE;

  if (overHim && !player.onGround && player.vy > STOMP_MAX_RISE
      && feet > enemy.y - STOMP_REACH
      && feet < enemy.y + enemy.h * STOMP_DEPTH) {
    enemy.alive = false;
    player.vy = STOMP_BOUNCE_VY;
    player.airJumps = 1;
    return 'stomp';
  }

  // Only now, and on the tight box, does touching one cost you. Checked
  // second so a descent that was ALMOST a clean stomp reads as a stomp rather
  // than as walking into him — the forgiving case has to win the tie.
  const overlap =
    player.x < enemy.x + enemy.w - 4 &&
    player.x + player.w > enemy.x + 4 &&
    player.y < enemy.y + enemy.h - 6 &&
    feet > enemy.y + 6;
  if (!overlap) return null;

  const hit = damagePlayer(player, now, enemy.x);
  return hit ? 'contact' : null;
}
