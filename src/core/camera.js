// Camera — ported from Jandé's FINAL production camera logic (once-upon-a-time,
// branch claude/hand-painted-architecture-bg-0MAiy, docs/GROUND_LINE_UNDERCROFT.md,
// shipped 2026-08-10). This corrects an earlier draft of this file that used
// Jandé's *pre-fix* vertical formula (`camY += (p.y - VH*0.55 - camY)*0.09`)
// — that formula was a known bug in Jandé's own history: the client wanted a
// centered, Mario-like framing ("she's too far at the bottom, it's not like
// Mario — Mario is kind of like center screen"), and the 0.55 follow-target
// silently won over the intended ground anchor, so the constant did nothing.
// Fixed version below is "anchor first, follow second."
//
// GROUNDF=0.65 is Jandé's client-calibrated, phone-letterbox-measured
// constant (ground surface at 65% of viewport height, player's head at 56%
// — see the doc for the SMB1-letterboxed-to-phone math that derived it).
// Horizontal headroom (wider view + facing-direction lookahead) is this
// project's own addition on top of that, per docs/GDD.md's "headroom"
// requirement — Jandé's own viewport is narrower (VIEW_W=520).

const BASE_ZOOM = 0.78;
const MIN_ZOOM = 0.5;
const GROUNDF = 0.65; // ground-surface anchor as a share of viewport height
const CLIMB_CEIL = 0.18; // follow term only pulls the camera up past this share when climbing

export function createCamera({ headroom = true } = {}) {
  const viewW = headroom ? 820 : 520; // world units visible, width
  const viewH = headroom ? 460 : 320; // world units visible, height
  const lead = { faceLeft: headroom ? 0.72 : 0.62, faceRight: headroom ? 0.28 : 0.38 };

  return {
    x: 0,
    y: 0,
    zoom: BASE_ZOOM,
    vw: 0,
    vh: 0,

    resize(canvasW, canvasH) {
      let z = Math.min(BASE_ZOOM, (canvasW / viewW) * BASE_ZOOM, (canvasH / viewH) * BASE_ZOOM);
      z = Math.max(MIN_ZOOM, z);
      this.zoom = z;
      this.vw = canvasW / z;
      this.vh = canvasH / z;
    },

    // p: player body with {x, y, faceL}. groundWorldY: world-y of the
    // ground row (FLOOR_R * T from world/tilemap.js) — the vertical anchor
    // point this level's floor sits on.
    follow(p, groundWorldY) {
      const l = p.faceL ? lead.faceLeft : lead.faceRight;
      this.x += (p.x - this.vw * l - this.x) * 0.1;
      this.x = Math.max(0, this.x);

      // Anchor first: resting camera position when standing on the ground.
      // Follow second: only pulls the camera UP as the player climbs above
      // the anchor, never down below it (matches Jandé's fixed landscape
      // branch — the old bug let the follow term override the anchor).
      const anchor = groundWorldY - this.vh * GROUNDF;
      const target = Math.min(anchor, p.y - this.vh * CLIMB_CEIL);
      this.y += (target - this.y) * 0.09;
    },

    // World-space rect currently visible — useful for generator streaming
    // distance and culling (mirrors Jandé's camX/VW-based culling).
    visibleRight() {
      return this.x + this.vw;
    },
  };
}
