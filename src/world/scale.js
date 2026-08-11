// REAL-WORLD SCALE — one constant chain, everything else derives from it.
//
// These are real Atlanta neighborhoods Will Hill is walking through, so the
// backgrounds have to read at true scale against him: a doorway taller than
// he is, a storefront sign above his head, an arch he could actually walk
// under. Fitting a background to the screen (the Phase 2 mistake) throws
// that away — the same building would be a different size on every device.
//
// The anchor is the character. Everything with a known real-world size
// declares its size IN METERS and converts through here.

import { PH } from '../core/physics.js';

// Will Hill's real-world height. Adult male, ~5'10".
export const CHAR_HEIGHT_M = 1.78;

// How tall the character is DRAWN, in world units, relative to his collision
// box. Ported from Jandé's effective hero scale (index.html:5389 —
// `PH * 1.55 * 0.974` = 1.51 x PH). PH is shared with Jandé at 86.
// Bumped from Jandé's 1.51 — at portrait framing the character read a touch
// small against the real-scale streets, so the whole cast (and the pickups,
// which size off the same metre conversion) sits slightly larger.
export const CHAR_SCALE = 1.74;
export const CHAR_DRAW_H = PH * CHAR_SCALE; // ~150 world units

// The conversion everything else hangs off.
export const WORLD_PER_M = CHAR_DRAW_H / CHAR_HEIGHT_M; // ~72.96 world units per metre

export function metersToWorld(m) {
  return m * WORLD_PER_M;
}

export function worldToMeters(w) {
  return w / WORLD_PER_M;
}

// Sanity reference points, for anyone tuning level geometry:
//   1 tile (T=32)            = 0.44 m   — roughly a paving module / curb height
//   ground jump apex         ~ 2.2 m    — videogame-tall, deliberately
//   a 3-row platform         = 1.3 m    — stoop / low wall
//   a 6-row platform         = 2.6 m    — dumpster lid / fire escape landing
