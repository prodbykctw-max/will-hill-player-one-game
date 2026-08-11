// Sparse tile-grid — direct port of Jandé's tilemap approach
// (once-upon-a-time/index.html ~line 983-987, 1315-1322): a hashmap keyed by
// "col,row" rather than a dense 2D array, since RPG levels are sparse
// (mostly air). Tile size matches Jandé's T=32.
//
// Tile-type chars: 'G' = ground, 'P' = platform (rendered as asphalt per
// docs/GDD.md), 'B' = breakable (not currently used, kept for parity/future
// use). No 'GATE' tile — Jandé used that for the boss-arena gate; Will Hill
// has no bosses, the finish line is a plain trigger (see world/generator.js).

export const T = 32;

// Level vertical bounds — ported from Jandé's FINAL production values
// (once-upon-a-time, branch claude/hand-painted-architecture-bg-0MAiy,
// docs/GROUND_LINE_UNDERCROFT.md, shipped 2026-08-10 — NOT the earlier
// 0.82/LH:18 values, which were superseded before this port and must not be
// used). FLOOR_R is the tile row the ground surface sits on; LH is derived
// from it and camera.js's GROUNDF, not guessed independently — see the
// derivation in that doc: `LH >= FLOOR_R / GROUNDF` (14 / 0.65 = 21.5 -> 22).
// If GROUNDF in camera.js ever changes, recompute LH the same way or the
// landscape camera silently pins to the world's bottom edge instead of its
// intended anchor.
export const FLOOR_R = 14;
export const LH = 22;

// How many ground rows are actually DRAWN. Collision is unaffected — every
// row still exists in `solid` and pit() still carves them — this only caps
// what the renderer paints, so the undercroft cross-section below is not
// simply buried by opaque tiles (Jandé's SLAB_R, index.html:989/4685).
// 3 rows = 96 world units ≈ 1.3 m of street section: enough to stack the
// sidewalk cap, curb and asphalt courses the reference image shows.
export const SLAB_R = 3;

// Player falls below this world-y -> instant death, regardless of hearts
// (ported from Jandé's `p.y > LH*T+150` fall-through check).
export const FALL_DEATH_Y = LH * T + 150;

export function key(c, r) {
  return c + ',' + r;
}

export function createTilemap() {
  return {
    solid: {}, // key(c,r) -> tile char
    tiles: [], // [{c,r,t}] — authoring order, mainly for rendering/debug
  };
}

export function setT(map, c, r, t) {
  map.tiles.push({ c, r, t });
  map.solid[key(c, r)] = t;
}

export function isSolid(map, c, r) {
  const t = map.solid[key(c, r)];
  return t === 'G' || t === 'P' || t === 'B';
}

// Fill a full ground column from `floorRow` down to `bottomRow` (inclusive).
export function groundCol(map, c, floorRow, bottomRow) {
  for (let r = floorRow; r <= bottomRow; r++) setT(map, c, r, 'G');
}

// An elevated platform strip `width` columns wide, starting at column `c`.
export function plat(map, c, r, width) {
  for (let i = 0; i < width; i++) setT(map, c + i, r, 'P');
}

// A gap: remove any tiles in columns [c, c+width) at the given rows (used to
// carve a pit out of an already-filled ground column range).
export function pit(map, c, width, floorRow, bottomRow) {
  for (let i = 0; i < width; i++) {
    for (let r = floorRow; r <= bottomRow; r++) {
      delete map.solid[key(c + i, r)];
    }
  }
}

// Tile-grid AABB sweep, separate-axis resolution — direct port of Jandé's
// collideH/collideV. Call collideH then move+collideV (or vice versa) each
// physics tick; o must have {x,y,vx,vy,onGround,onWall,wallDir}.
export function collideH(map, o, w, h) {
  o.onWall = false;
  const top = Math.floor(o.y / T);
  const bot = Math.floor((o.y + h - 1) / T);
  if (o.vx > 0) {
    const cR = Math.floor((o.x + w) / T);
    for (let r = top; r <= bot; r++) {
      if (isSolid(map, cR, r)) {
        o.x = cR * T - w;
        o.vx = 0;
        o.onWall = true;
        o.wallDir = 1;
        break;
      }
    }
  } else if (o.vx < 0) {
    const cL = Math.floor(o.x / T);
    for (let r = top; r <= bot; r++) {
      if (isSolid(map, cL, r)) {
        o.x = (cL + 1) * T;
        o.vx = 0;
        o.onWall = true;
        o.wallDir = -1;
        break;
      }
    }
  }
}

export function collideV(map, o, w, h) {
  o.onGround = false;
  const lft = Math.floor((o.x + 2) / T);
  const rgt = Math.floor((o.x + w - 2) / T);
  if (o.vy > 0) {
    const cB = Math.floor((o.y + h) / T);
    for (let c = lft; c <= rgt; c++) {
      if (isSolid(map, c, cB)) {
        o.y = cB * T - h;
        o.vy = 0;
        o.onGround = true;
        break;
      }
    }
  } else if (o.vy < 0) {
    const cT = Math.floor(o.y / T);
    for (let c = lft; c <= rgt; c++) {
      if (isSolid(map, c, cT)) {
        o.y = (cT + 1) * T;
        o.vy = 0;
        break;
      }
    }
  }
}
