// STOMP-OUT — the game-over beat when an enemy is what killed you.
//
// You go down, the nearest enemies walk over, and they stomp you out before
// the screen fades. It came out of a BUG: the enemy defeat sheet had a corpse
// welded into every frame, so a stomped enemy appeared to stand over its own
// body doing a stomping motion, and the client looked at that and said do that
// to ME. See docs/HANDOFF.md "the DOUBLE-BODY trap" for the bug itself.
//
// DELIBERATELY SIMPLE. The brief was "keep it simple stupid, we ship in days",
// so this is position + clip selection and nothing else. No pathfinding, no
// crowd steering, no new physics. Enemies slide to a slot at a fixed rate and
// play a looping stomp when they arrive.
//
// THREE SLOTS, and three is the cap for a reason beyond taste: they have to
// read as surrounding a body, and past three they just overlap into a smear at
// this sprite size.
//
//   left  — stands left of the body, faces right (unflipped)
//   right — stands right of the body, faces left  (flipped)
//   back  — stands behind the body, drawn FIRST so the other two overlap it,
//           and nudged up-screen so it reads as further away
//
// The `back` slot is the compromise worth knowing about. The client asked for
// one stomping camera-facing, and the sheets have no front-facing stomp — only
// the IDLE row is front-on. Rather than spend another generation (and another
// shot at the double-body trap) this slot uses the same side stomp, set back
// and partly occluded. With two nearer figures either side of it, nobody reads
// the third one's angle. If it ever matters, generate a front stomp and swap
// the clip here; nothing else changes.

const RECRUIT_RADIUS = 420; // px — "localized enemies near him", not the level
export const MAX_STOMPERS = 3;
const WALK_RATE = 2.6;      // px/tick closing on the slot
const ARRIVE_EPS = 3;

// Slot offsets from the body's centre x, and the y nudge for the back slot.
const SLOTS = [
  { dx: -46, dy: 0, flip: false, behind: false },
  { dx: 46, dy: 0, flip: true, behind: false },
  { dx: 8, dy: -12, flip: false, behind: true },
];

// Ticks: they walk in, stomp three times, then run off with your money.
// The getaway is the point of the beat — they are not just killing you, they
// are robbing you, which is the same thing a contact hit does while you are
// alive. It also gives the fade something to happen behind.
export const GATHER_TICKS = 46;
export const STOMP_TICKS = 96;   // ~3 stomps at the clip's cadence
export const FLEE_TICKS = 54;
export const TOTAL_TICKS = GATHER_TICKS + STOMP_TICKS + FLEE_TICKS;

const FLEE_RATE = 4.4;    // faster than their patrol — they are leaving
const DUST_EVERY = 16;    // ticks between puffs per stomper, ~one per stomp

// Dust — CHARLIE BROWN puffs. Small, fast, gone.
//
// The Peanuts read is specific and it is not a smoke plume: little round
// lobed clouds that pop into existence, drift barely at all, and vanish
// inside a beat. So these are small (r 2.5-5), short-lived (14-22 ticks, a
// third of a second), and they barely rise — a big slow expanding cloud reads
// as an explosion, which is the wrong note under a boot.
//
// Procedural on purpose: a puff of street grit is a few overlapping circles,
// and generating a sprite sheet for it would be silly.
export function spawnDust(dust, x, y, dir) {
  for (let i = 0; i < 3; i++) {
    dust.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y - Math.random() * 3,
      vx: dir * (0.7 + Math.random() * 1.6) + (Math.random() - 0.5),
      vy: -(0.5 + Math.random() * 0.9),
      r: 2.5 + Math.random() * 2.5,
      seed: Math.random() * 6.283,
      life: 0,
      max: 14 + Math.random() * 8,
    });
  }
}

export function stepDust(dust) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.x += d.vx;
    d.y += d.vy;
    d.vy += 0.055;      // settles back toward the ground almost at once
    d.vx *= 0.90;
    d.r += 0.30;        // spreads a little, never billows
    if (++d.life >= d.max) dust.splice(i, 1);
  }
}

// Pick the nearest living enemies and give each a slot. Called once, at death.
export function beginStompOut(player, enemies) {
  const bodyX = player.x + player.w / 2;
  const near = enemies
    .filter((e) => e.alive && Math.abs(e.x + e.w / 2 - bodyX) < RECRUIT_RADIUS)
    .sort((a, b) => Math.abs(a.x - bodyX) - Math.abs(b.x - bodyX))
    .slice(0, MAX_STOMPERS);

  // Nearest enemy takes the slot on its own side, so nobody crosses over the
  // body to reach a slot — crossing reads as a glitch, not a choice.
  const free = SLOTS.slice();
  for (const e of near) {
    const onLeft = e.x + e.w / 2 < bodyX;
    let idx = free.findIndex((s) => (onLeft ? s.dx < 0 : s.dx > 0));
    if (idx < 0) idx = 0;
    e.stompSlot = free.splice(idx, 1)[0];
    e.stomping = true;
  }
  return near;
}

// Per-tick. `t` counts up from 0. Returns true once the beat is over and the
// screen should change.
export function stepStompOut(t, player, enemies, dust) {
  const bodyX = player.x + player.w / 2;
  const fleeing = t >= GATHER_TICKS + STOMP_TICKS;

  for (const e of enemies) {
    if (!e.stompSlot) continue;
    const target = bodyX + e.stompSlot.dx - e.w / 2;

    if (fleeing) {
      // GETAWAY. Out the way they came, carrying the money.
      const away = e.stompSlot.dx < 0 ? -1 : 1;
      e.x += away * FLEE_RATE;
      e.vx = away * FLEE_RATE;
      e.anim = 'walk';
      e.carrying = true;
      continue;
    }

    const d = target - e.x;
    if (Math.abs(d) > ARRIVE_EPS && t < GATHER_TICKS) {
      e.x += Math.max(-WALK_RATE, Math.min(WALK_RATE, d));
      e.vx = Math.sign(d) * WALK_RATE; // keeps the walk clip playing and facing right
      e.anim = 'walk';
    } else {
      e.x = target;
      e.vx = 0;
      // `stomp` falls back to `idle` on a sheet that has not been regenerated
      // yet, so this cannot crash a stage mid-rollout.
      e.anim = 'stomp';
      // A puff under the boot on each stomp. Offset per slot so the three of
      // them are not landing on the same frame like a chorus line.
      const phase = (e.stompSlot.dx | 0) % DUST_EVERY;
      if (dust && (t - GATHER_TICKS - phase) % DUST_EVERY === 0) {
        spawnDust(dust, e.x + e.w / 2, player.y + player.h, e.stompSlot.dx < 0 ? -1 : 1);
      }
    }
  }
  if (dust) stepDust(dust);
  return t >= TOTAL_TICKS;
}

// Draw order: the back slot must go down before the body, the side slots
// after it. Returns [behind[], infront[]].
export function splitStompers(enemies) {
  const behind = [];
  const infront = [];
  for (const e of enemies) {
    if (!e.stompSlot) continue;
    (e.stompSlot.behind ? behind : infront).push(e);
  }
  return [behind, infront];
}
