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

// Sized in real-world terms like everything else, then nudged up for
// readability — a pickup has to catch the eye at portrait scale.
const BAG_H = metersToWorld(0.62);
const BAG_W = BAG_H * (162 / 168); // source aspect
const BOTTLE_H = metersToWorld(0.66);
const BOTTLE_W = BOTTLE_H * (54 / 168);

export function createMoneyBag(x, y) {
  return { kind: 'bag', x, y, w: BAG_W, h: BAG_H, got: false, value: BAG_VALUE };
}

export function createChampagneBottle(x, y) {
  return { kind: 'champagne', x, y, w: BOTTLE_W, h: BOTTLE_H, got: false };
}

// p: player body with {x, y, w, h}. Same generous-margin AABB test as
// Jandé's note pickup (`p.x<s.x+20 && p.x+PW>s.x-4 && ...`).
export function overlapsPlayer(item, p) {
  if (item.got) return false;
  return (
    p.x < item.x + item.w + 4 &&
    p.x + p.w > item.x - 4 &&
    p.y < item.y + item.h + 4 &&
    p.y + p.h > item.y
  );
}
