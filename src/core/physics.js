// Physics constants — ported from Jandé (once-upon-a-time/index.html
// ~line 947-948, 1526-1553, 1537-1541). Tuned for the fixed 16.6ms tick in
// core/loop.js; don't scale these by a variable dt.
//
// Movement/jump/dash *logic* using these constants lives in
// entities/player.js (matches Jandé's own structure — physics.js here is
// just the tuned numbers, same role as Jandé's top-of-file constants).
// Tile-grid collision (collideH/collideV) lives in world/tilemap.js, since
// it's intrinsically tied to the tile grid it sweeps against.

export const GRAV = 0.52;
export const TERMINAL_VY = 16;

export const PW = 30; // player collision box width
export const PH = 86; // player collision box height

// TWO GEARS. He used to reach RUN_SPEED in about two ticks, so the walk clip
// was effectively unreachable and he sprinted everywhere from a standstill.
// Holding a direction now starts him walking and breaks into a run only if
// you keep holding it.
// 1.9 px/tick is 1.36 m/s through world/scale.js — textbook walking pace.
// 2.9 worked out at 2.07 m/s, a power-walk, and it read as too much motion in
// too little time. Tuned by eye, not derived: two attempts to measure the
// gait off the sheet both hit noise (the feet overlap in a side view, and the
// head bob is 6px with dithering on top of it).
export const WALK_SPEED = 1.9;      // target while easing off the line
export const RUN_SPEED = 6.4;       // target once he has committed
// HALVED, because 42 ticks of wind-up was getting the player killed. He now
// commits by the second footfall instead of somewhere in the third stride.
//
// The walk clip is 17 frames at 3.85 ticks, so one full stride is 65 ticks and
// a single step lands every ~33. The old 22 + 20 = 42 ticks meant full speed
// arrived AFTER the second step and most of the way to the third — you asked
// for a run, watched him stroll into the hazard, and died. 11 + 10 = 21 ticks
// puts him at RUN_SPEED before the second step comes down.
//
// This does not bring back the old problem. That one was reaching RUN_SPEED in
// about two ticks from a standstill, which made the walk clip unreachable; 11
// ticks of hold is still 0.18s, so a tap is still unambiguously a walk.
export const RUN_HOLD_TICKS = 11;   // ~0.18s of walking before he winds up
export const RUN_RAMP_TICKS = 10;   // ~0.17s spent winding up to full speed
export const RUN_ANIM_AT = 4.6;     // |vx| at which the run clip takes over
// ONE TAP IS ONE STEP. A press shorter than this still gets this many ticks of
// walk target, so a tap always travels a definite, repeatable distance instead
// of whatever the thumb happened to hold for. Without it the shortest taps
// produce a jitter — you press, he twitches, and it reads as the button not
// working. 14 ticks is ~0.23s, about 25 world units at WALK_SPEED: a visible
// single step, and short enough that you are never locked out of stopping.
//
// It sits BELOW RUN_HOLD_TICKS (11 + 10 to full speed) on purpose, so nothing
// about the hold-to-run wind-up changes: tap for a step, hold to run.
export const STEP_TICKS = 14;
export const ACCEL = 0.5; // lerp rate toward target velocity while holding a direction
export const DECEL = 0.62; // lerp rate toward zero when releasing

// AIR CONTROL. Ground accel/decel are deliberately snappy — DECEL 0.62 sheds
// most of your speed in a couple of ticks, which is what makes stopping on a
// ledge feel precise. Applying that same figure in the air was wrong: leave
// the run key for an instant mid-jump and your horizontal momentum vanished,
// so a running jump turned into a standing one and you dropped short. A body
// in the air does not stop because you stopped asking it to.
//
// So the ground feel is untouched and only the airborne rates are scaled:
// you keep steering authority, but almost none of the braking.
// 0.55 -> 0.85. The client's note was that the jump reads as going "straight
// up in the air and not kind of like at an angle", and the trace says he is
// half right in a way that matters: at full run speed a jump carries 450
// world units (5.36m) horizontally, which is a big arc — but you only reach
// run speed after 21 ticks of holding a direction, so a jump taken from a
// standstill or a walk goes nearly straight up and CANNOT BE CORRECTED once
// you are in the air.
//
// That second half is the real complaint. Landing on someone is a two-part
// judgement — when to jump and where to aim — and at 0.55 the second part
// barely worked, so a jump that left the ground slightly wrong stayed wrong.
// 0.85 gives enough authority to steer INTO an enemy mid-flight, which is
// what "aiming" a jump means in a platformer.
export const AIR_ACCEL_MUL = 0.85; // steering authority while airborne
export const AIR_DRAG_MUL = 0.06;  // speed shed per tick with no input

export const JUMP_V = -12.8; // ground jump impulse
export const DOUBLE_JUMP_V = -11.2; // air (double) jump impulse
export const JUMP_CUT_VY = -4.5; // releasing jump early clamps vy to at least this (variable jump height)
export const COYOTE_TICKS = 8; // ticks after leaving ground a jump still counts as grounded
export const JUMP_BUFFER_TICKS = 12; // ticks a jump press is remembered before landing

export const DASH_VX = 13.5; // dash burst speed (roll animation)
export const DASH_TICKS = 13; // dash duration
export const DASH_IFRAMES = 14; // invulnerability window granted by a dash
export const DASH_COOLDOWN = 34; // ticks before another dash is allowed
