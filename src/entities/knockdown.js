// KNOCKDOWN — the run-over beat when an enemy is what put you down.
//
// HE IS NOT DEAD. The client was explicit: this is a KNOCKDOWN, not a death.
// Will Hill is a real artist and this is a fun arcade game, not a game about
// killing him. He gets jumped, they take his money, they run. Keep that in
// the language and keep the beat SHORT — it is a quick sting on the way to
// the score screen, not a cutscene. Nothing here should linger and nothing
// should look final.
//
// It came out of a BUG: the enemy defeat sheet had a corpse welded into every
// frame, so a stomped enemy appeared to stand over its own body stomping it,
// and the client looked at that and said do that to ME. See docs/HANDOFF.md
// "the DOUBLE-BODY trap" for the bug itself.
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
//
// MEASURED OFF THE BODY, not chosen. These were ±46 while the knockdown had
// no clip of its own and fell back to `hit`, which is a man standing up — a
// narrow silhouette that three enemies could crowd without hiding. The real
// downed clip is a man lying flat: 162 world units end to end, half-width 81.
// At ±46 the two side stompers stood inside his own footprint and, being
// drawn after him, covered him completely. Three men appeared to stomp an
// empty pavement.
//
// ±78 puts each of them just inside an end of the body, so their boots come
// down at his head and his feet and the middle of him stays visible.
const BODY_HALF_W = 81;
const SLOTS = [
  { dx: -(BODY_HALF_W - 3), dy: 0, flip: false, behind: false },
  { dx: BODY_HALF_W - 3, dy: 0, flip: true, behind: false },
  // Set back far enough to clear the body. At dy -12 this one's boots landed
  // on his chest and its legs cut the torso in half; -30 lifts it clear so
  // the body reads whole between the three of them.
  { dx: 8, dy: -30, flip: false, behind: true },
];

// Ticks: in, a couple of stomps, gone. 98 ticks is ~1.6s at 60fps — a sting.
// The first cut ran 196 ticks (3.3s) and that is a cutscene, not a beat; long
// enough for it to read as grim, which is exactly the wrong tone.
//
// The getaway is the POINT of it: they are robbing him, which is the same
// thing a contact hit does while he is on his feet. He loses the money, not
// his life.
export const GATHER_TICKS = 24;
export const STOMP_TICKS = 44;   // ~2 stomps at the clip's cadence
export const FLEE_TICKS = 30;
export const TOTAL_TICKS = GATHER_TICKS + STOMP_TICKS + FLEE_TICKS;

const FLEE_RATE = 4.4;    // faster than their patrol — they are leaving
const DUST_EVERY = 14;    // ticks between puffs per stomper, ~one per stomp

// Dust — CHARLIE BROWN puffs. Small, fast, gone.
//
// The reference is the newspaper-cartoon scuffle cloud, and it is specific:
// not a smoke plume but little round lobed puffs that pop into existence,
// drift barely at all, and vanish inside a beat. So these are small (r
// 2.5-5), short-lived (14-22 ticks, a third of a second), and they barely
// rise — a big slow expanding cloud reads as an explosion, which is the wrong
// note under a boot.
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
