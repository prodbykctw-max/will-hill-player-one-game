// Money bags + champagne bottles — reskinned from Jandé's notes/power-up
// pickup pattern (once-upon-a-time/index.html ~line 1727-1732): same AABB
// overlap-on-pickup test, generous 4px pickup margin. Only 2 item kinds here
// (vs. Jandé's notes + 4 power-up types) per docs/GDD.md "Story & core loop".
//
// `value` on a bag matches the event-log scoring rule in
// cloudflare/leaderboard-worker.js's SCORE_RULES (bag: 100) — kept here too
// so the local/offline score display agrees with what the server will
// recompute from the run-event log.

import bagUrl from '../assets/props/moneybag.webp';
import bottleUrl from '../assets/props/champagne.webp';
import { metersToWorld } from '../world/scale.js';

export const PROP_SPRITES = { bag: bagUrl, champagne: bottleUrl };

export const BAG_VALUE = 100;

// ── WHAT THE CHAMPAGNE IS ACTUALLY FOR ───────────────────────────────────
// Client: "champagne bottle more difficult, and multiplies bag value until
// the champagne effect completes."
//
// Until now the bottle bought nine seconds of not-dying, which is worth
// something only if you were about to die — so on a clean run it was worth
// nothing at all, and the reward for finding one was "nothing bad happens".
// Doubling every bag for the duration turns it into a decision: nine seconds
// to grab as much as you can reach before it runs out.
//
// ⚠️ MIRRORED IN cloudflare/leaderboard-worker.js. The Worker recomputes a
// score from the event log to validate it, so if SCORE_RULES there does not
// know about the multiplier every boosted run is rejected as fraudulent. The
// run log records the boosted bags separately for exactly this reason.
export const CHAMPAGNE_MULT = 2;

// Sized in real-world terms like everything else, then nudged up for
// readability — a pickup has to catch the eye at portrait scale.
const BAG_H = metersToWorld(0.62);
const BAG_W = BAG_H * (162 / 168); // source aspect

// ── THE BOTTLE IS DELIBERATELY NOT A REAL BOTTLE ─────────────────────────
//
// A champagne bottle is about 0.32m tall. At true scale that is 27 world
// units on a street where Will Hill draws 181, and it would be a green speck.
// So it was already exaggerated to 0.66m — and measured against the game that
// was still not enough, in a way that only shows up as a RATIO:
//
//   bottle 17.8 x 55.5   money bag 50.3 x 52.1
//
// The bottle covered **0.38x the money bag's screen area**. The power-up —
// the only thing in the game that changes what you can do — was a third the
// size of the commonest pickup on the street, because a bottle's silhouette
// is narrow (54:168 in the source art) and height alone cannot make up for
// it. On the capture it reads as a sliver you walk past.
//
// 1.0m puts it at 84 x 27, which is 0.87x the bag's area and HALF Will
// Hill's drawn height. Now it out-reads the bag on silhouette — the one axis
// a narrow object can win on — rather than losing on both.
//
// The aspect ratio is untouched. Widening the bottle to match the bag would
// mean stretching the art, and a non-uniform scale on this project's pixel
// work has been rejected every time it has come up.
const BOTTLE_H = metersToWorld(1.0);
const BOTTLE_W = BOTTLE_H * (54 / 168);

// How far a bottle's base floats above the ground line before the bob is
// applied. The bob is +-3, so this keeps it from sinking into the pavement at
// the bottom of its travel.
const BOTTLE_FLOAT = 3;

export function createMoneyBag(x, y) {
  return { kind: 'bag', x, y, w: BAG_W, h: BAG_H, got: false, value: BAG_VALUE };
}

// A bag knocked out of the player by an enemy. Same pickup as any other bag
// once it settles, but it arcs out first and cannot be re-grabbed instantly —
// without `pickupAt` you would simply walk back into the whole payout on the
// frame it spawned and the hit would cost nothing.
// `worth` OVERRIDES the bag's value so one sprite can carry more than one
// bag. Sonic loses every ring you have but only ever draws a bounded burst of
// them. Same trick here: everything scatters, and a rich run still cannot
// spray four hundred physics objects across the street in one frame. It has
// to be `value`, which is the field the pickup actually credits.
export function createDroppedBag(x, y, vx, vy, now, worth = BAG_VALUE) {
  const b = createMoneyBag(x, y);
  b.vx = vx;
  b.vy = vy;
  b.dropped = true;
  b.value = worth;
  b.pickupAt = now + 750;
  return b;
}

export function createChampagneBottle(x, y) {
  return { kind: 'champagne', x, y, w: BOTTLE_W, h: BOTTLE_H, got: false };
}

// Where a bottle's TOP goes so that its base rests on `groundY`.
//
// The generator used to spell this out as `(FLOOR_R - 1) * T - 26`, which is
// the right answer for one specific bottle height and silently wrong for any
// other — grow the bottle and it grows downward into the pavement, because y
// is the top edge. Asking the module that owns the height is the only version
// of this that cannot drift.
export function champagneTopFor(groundY) {
  return groundY - BOTTLE_H - BOTTLE_FLOAT;
}

// p: player body with {x, y, w, h}. Same generous-margin AABB test as
// Jandé's note pickup (`p.x<s.x+20 && p.x+PW>s.x-4 && ...`).
export function overlapsPlayer(item, p, now) {
  if (item.got) return false;
  if (item.pickupAt && now != null && now < item.pickupAt) return false;
  return (
    p.x < item.x + item.w + 4 &&
    p.x + p.w > item.x - 4 &&
    p.y < item.y + item.h + 4 &&
    p.y + p.h > item.y
  );
}
