// Camera — ported from Jandé's FINAL production framing (once-upon-a-time,
// ref origin/claude/hand-painted-architecture-bg-0MAiy, index.html:941-962 +
// 1743-1785, and docs/GROUND_LINE_UNDERCROFT.md).
//
// GROUNDF=0.65 is client-calibrated and letterbox-measured, not picked: an
// SMB1 256x240 frame width-fit into a 19.5:9 phone puts its ground line at
// 66% of the PHYSICAL screen, so 0.65 IS "Mario on a phone". The raw-NES
// 86.7% figure people quote is the wrong number for this form factor.
//
// Portrait is the primary case (Jandé's constants were all measured on
// 390x844). Landscape is supported and resolves to the SAME ground-line
// fraction by construction — see the two branches in follow().

import { T, FLOOR_R, LH } from '../world/tilemap.js';

const VIEW_W = 520; // world units the viewport is designed around
const VIEW_H = 320;
const BASE_ZOOM = 0.78;
const MIN_ZOOM = 0.5;

export const GROUNDF = 0.65; // ground surface as a share of viewport height
const CLIMB_CEIL = 0.18; // landscape: follow only pulls up once she climbs past this

export function createCamera() {
  return {
    x: 0,
    y: 0,
    zoom: BASE_ZOOM,
    vw: 0,
    vh: 0,

    resize(canvasW, canvasH) {
      let z = Math.min(BASE_ZOOM, (canvasW / VIEW_W) * BASE_ZOOM, (canvasH / VIEW_H) * BASE_ZOOM);
      z = Math.max(MIN_ZOOM, z);
      this.zoom = z;
      this.vw = canvasW / z;
      this.vh = canvasH / z;
    },

    follow(p) {
      // Horizontal: lead in the direction she's facing.
      const lead = p.faceL ? 0.62 : 0.38;
      this.x += (p.x - this.vw * lead - this.x) * 0.1;
      this.x = Math.max(0, this.x);

      // Vertical: the branch is a WORLD-HEIGHT test, not a media query.
      // "Portrait" here means the visible world height exceeds the entire
      // level, which is what actually happens on a phone held upright.
      const anchor = FLOOR_R * T - this.vh * GROUNDF;
      if (this.vh > LH * T) {
        // No clamp — camY goes negative and that's correct, it's sky.
        this.y += (anchor - this.y) * 0.14;
      } else {
        // Anchor first, follow second. The follow term may only pull the
        // camera UP as she climbs; it must never override the ground anchor
        // downward (that was the bug Jandé shipped for months — the follow
        // target silently won and GROUNDF did nothing).
        const target = Math.min(anchor, p.y - this.vh * CLIMB_CEIL);
        this.y += (target - this.y) * 0.09;
        const cyMax = Math.max(0, Math.min(LH * T - this.vh, anchor));
        this.y = Math.max(0, Math.min(this.y, cyMax));
      }
    },

    // Screen-space y of the world floor surface. THE anchor every backdrop
    // and undercroft layer references so painted ground can never tear away
    // from the tile floor. Deliberately unclamped, matching Jandé:4260.
    groundScreenY() {
      return (FLOOR_R * T - this.y) * this.zoom;
    },

    visibleRight() {
      return this.x + this.vw;
    },
  };
}
