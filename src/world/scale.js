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
export const CHAR_HEIGHT_M = 2.02;

// THE CONVERSION IS PINNED, NOT DERIVED.
//
// It used to be computed as CHAR_DRAW_H / CHAR_HEIGHT_M, which made the
// character's size self-cancelling: scaling him up scaled every background
// (they're sized in metres through this same constant) by exactly the same
// factor, so he never actually grew relative to the world — the whole scene
// just zoomed. Pinning the metre lets the cast be resized against a fixed
// world, which is the knob that actually does anything.
//
// The value is the one the tuned-and-approved framing resolved to, so
// backgrounds keep the scale that was signed off on.
export const WORLD_PER_M = 84.07; // world units per metre

// Cast heights. Raise these to make the characters read taller against the
// streets; the backgrounds do not move.
export const CHAR_DRAW_H = CHAR_HEIGHT_M * WORLD_PER_M;

// Kept for anything still reasoning in "multiples of the collision box".
export const CHAR_SCALE = CHAR_DRAW_H / PH;

export function metersToWorld(m) {
  return m * WORLD_PER_M;
}

export function worldToMeters(w) {
  return w / WORLD_PER_M;
}

// PLANT_DEPTH — how far below the collision floor a character's ground-contact
// pixel sits, in world units. ONE number for every character in the game.
//
// It has to be one number, and it has to be applied per-projection, because
// the sheets do not agree on what their lowest pixel means. An isometric 3/4
// sheet draws the far foot well above the near one, so it anchors on the
// MIDPOINT between the two and its lowest pixel (the near shoe) ends up well
// below the anchor. A true side profile has both feet level and anchors on the
// lowest pixel, so it gets no such offset for free. Left alone, that made Will
// Hill plant 2.33 units higher than the enemies stood next to him.
//
// src/render/renderer.js measures what each sheet's own anchor already gives
// and makes up exactly the difference, so every character's contact pixel
// lands on precisely this value — identical by construction, not by two
// numbers that happen to be close. Move this and everyone moves together.
//
// 5.33 is where the enemy sheets already sat, and they were the reference.
export const PLANT_DEPTH = 5.33;

// Sanity reference points, for anyone tuning level geometry:
//   1 tile (T=32)            = 0.44 m   — roughly a paving module / curb height
//   ground jump apex         ~ 2.2 m    — videogame-tall, deliberately
//   a 3-row platform         = 1.3 m    — stoop / low wall
//   a 6-row platform         = 2.6 m    — dumpster lid / fire escape landing
