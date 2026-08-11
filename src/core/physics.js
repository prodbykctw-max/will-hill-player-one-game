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

export const RUN_SPEED = 6.4; // target horizontal velocity, px/tick
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
export const AIR_ACCEL_MUL = 0.55; // steering authority while airborne
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
