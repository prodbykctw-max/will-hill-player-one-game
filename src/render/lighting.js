// LIGHTING — street lamps, neon spill, and per-sprite shading.
//
// A night street is defined by its light sources, so this does three things
// rather than just tinting the frame:
//
//   1. GROUND POOLS  — warm elliptical pools cast on the street surface at
//      lamp spacing, drawn UNDER the entities so characters stand *in* the
//      light rather than having light painted over them.
//   2. SPRITE SHADING — each character is composited through an offscreen
//      buffer so a vertical light ramp and a warm rim can be applied
//      *inside the sprite's own silhouette* (source-atop). This is what
//      makes a figure sit in a scene instead of reading as a pasted cutout.
//   3. CAST SHADOWS  — direction and length follow the nearest lamp, so a
//      character's shadow swings as they run past one, and softens as they
//      leave its pool.
//
// World space for pools/shadows (inside the camera transform, alongside the
// tiles they fall on); the sprite buffer is its own local space.

import { T, FLOOR_R } from '../world/tilemap.js';

// Street-level practicals repeat at this spacing in WORLD units. It is
// deliberately tied to the backdrop plate's own tiling period so the pools
// on the road line up with the lit shopfronts/canopies painted behind them
// — "make the background lighting manifest" means the light on the street
// has to come from the thing in the picture, not an arbitrary grid.
const LAMP_SPACING = 420; // world units between street lamps (~5.8 m)
const LAMP_HEIGHT = 300; // world units above the street the source sits
const POOL_RX = 250;
const POOL_RY = 62;

export function createLighting(ctx) {
  // One reusable offscreen buffer for sprite shading. Sized on demand.
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');

  // World x of the practical nearest a given world x. Shadows and sprite
  // key-light both derive from this, so a character's shadow swings as they
  // pass under a canopy light and softens between them.
  function nearestLampX(x) {
    return Math.round(x / LAMP_SPACING) * LAMP_SPACING + LAMP_SPACING * 0.5;
  }

  // Colour of the light at a point, taken from the stage's declared
  // practicals rather than a fixed palette entry — so the street picks up
  // the neon of whatever is actually glowing on that block.
  function keyRgbFor(stage) {
    const ls = stage.bg && stage.bg.lights;
    return ls && ls.length ? ls[0].rgb : stage.light.key;
  }

  // How lit a point is, 0..1, by its distance from the nearest lamp.
  function litness(x) {
    const d = Math.abs(x - nearestLampX(x));
    return Math.max(0, 1 - d / (LAMP_SPACING * 0.62));
  }

  // Pools on the street surface. Call inside the camera transform, before
  // entities are drawn.
  function drawGroundPools(camera, stage) {
    const groundWorldY = FLOOR_R * T;
    const x0 = camera.x - LAMP_SPACING;
    const x1 = camera.x + camera.vw + LAMP_SPACING;
    const first = Math.floor(x0 / LAMP_SPACING) * LAMP_SPACING;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let lx = first; lx < x1; lx += LAMP_SPACING) {
      const cx = lx + LAMP_SPACING * 0.5;
      const g = ctx.createRadialGradient(cx, groundWorldY, 1, cx, groundWorldY, POOL_RX);
      g.addColorStop(0, stage.light.pool);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(cx, groundWorldY);
      ctx.scale(1, POOL_RY / POOL_RX);
      ctx.beginPath();
      ctx.arc(0, 0, POOL_RX, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // the shaft of light coming down from the (off-screen) lamp head
      const sg = ctx.createLinearGradient(cx, groundWorldY - LAMP_HEIGHT, cx, groundWorldY);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(1, stage.light.shaft);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(cx - 26, groundWorldY - LAMP_HEIGHT);
      ctx.lineTo(cx + 26, groundWorldY - LAMP_HEIGHT);
      ctx.lineTo(cx + 128, groundWorldY);
      ctx.lineTo(cx - 128, groundWorldY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Directional cast shadow — stretches away from the nearest lamp and
  // fades as the character leaves its pool.
  function drawCastShadow(entity, colliderH, baseW) {
    const cx = entity.x + entity.w / 2;
    const feet = entity.y + colliderH;
    const lamp = nearestLampX(cx);
    const dx = cx - lamp;
    const lit = litness(cx);

    // airborne characters cast a smaller, fainter, offset shadow
    const groundWorldY = FLOOR_R * T;
    const air = Math.max(0, Math.min(1, (groundWorldY - feet) / 260));
    const alpha = (0.14 + lit * 0.30) * (1 - air * 0.65);
    if (alpha <= 0.02) return;

    const stretch = 1 + Math.min(1.9, Math.abs(dx) / (LAMP_SPACING * 0.45));
    const w = baseW * (1 + air * 0.6);
    const skew = Math.max(-1.5, Math.min(1.5, dx / (LAMP_SPACING * 0.5)));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.translate(cx + skew * w * 0.8, groundWorldY);
    ctx.transform(1, 0, skew * 0.5, 1, 0, 0);
    ctx.scale(stretch, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, w * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw a sprite frame with lighting baked into its silhouette.
   * Same signature as a plain drawImage 9-arg call, plus lighting inputs.
   */
  function drawLitSprite(image, sx, sy, sw, sh, dx, dy, dw, dh, flipX, stage, worldX, alpha) {
    if (buf.width < sw || buf.height < sh) {
      buf.width = Math.ceil(sw);
      buf.height = Math.ceil(sh);
    }
    bctx.clearRect(0, 0, buf.width, buf.height);
    bctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

    const lit = litness(worldX);

    // Vertical light ramp: brighter toward the head (lamps are overhead),
    // falling into shadow at the feet. Applied INSIDE the silhouette.
    bctx.save();
    bctx.globalCompositeOperation = 'source-atop';
    const ramp = bctx.createLinearGradient(0, 0, 0, sh);
    const key = keyRgbFor(stage);
    ramp.addColorStop(0, `rgba(${key},${0.10 + lit * 0.26})`);
    ramp.addColorStop(0.45, `rgba(${key},${0.03 + lit * 0.10})`);
    ramp.addColorStop(1, `rgba(${stage.light.shadowRgb},${0.34 - lit * 0.12})`);
    bctx.fillStyle = ramp;
    bctx.fillRect(0, 0, sw, sh);

    // Ambient bounce from the wet street, up into the lower body.
    const bounce = bctx.createLinearGradient(0, sh * 0.62, 0, sh);
    bounce.addColorStop(0, 'rgba(0,0,0,0)');
    bounce.addColorStop(1, `rgba(${stage.light.bounce},${0.10 + lit * 0.14})`);
    bctx.fillStyle = bounce;
    bctx.fillRect(0, sh * 0.62, sw, sh * 0.38);
    bctx.restore();

    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    if (flipX) {
      ctx.translate(dx + dw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(buf, 0, 0, sw, sh, 0, dy, dw, dh);
    } else {
      ctx.drawImage(buf, 0, 0, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // Additive bloom over the scene — call AFTER entities, still in world
  // space. Keeps neon/lamps feeling hot without washing out gameplay.
  function drawBloom(camera, stage) {
    const groundWorldY = FLOOR_R * T;
    const x1 = camera.x + camera.vw + LAMP_SPACING;
    const first = Math.floor((camera.x - LAMP_SPACING) / LAMP_SPACING) * LAMP_SPACING;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let lx = first; lx < x1; lx += LAMP_SPACING) {
      const cx = lx + LAMP_SPACING * 0.5;
      const g = ctx.createRadialGradient(cx, groundWorldY - 6, 1, cx, groundWorldY - 6, 150);
      g.addColorStop(0, stage.light.bloom);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 150, groundWorldY - 156, 300, 200);
    }
    ctx.restore();
  }

  // Cast shadow for a static prop resting on (or bobbing just above) the
  // street. Direction and stretch come from the same practical the
  // characters use; `lift` is how far the prop is currently hovering, which
  // shrinks and softens the shadow exactly as it would in life.
  function drawPropShadow(item, drawY, lift) {
    const cx = item.x + item.w / 2;
    const groundWorldY = FLOOR_R * T;
    // where the prop actually sits, ignoring the bob
    const rest = item.y + item.h;
    if (rest > groundWorldY + 40) return; // on a ledge we don't model — skip

    const lamp = nearestLampX(cx);
    const dx = cx - lamp;
    const lit = litness(cx);
    const hover = Math.max(0, Math.abs(lift)) / 10;

    const w = item.w * 0.46 * (1 - hover * 0.12);
    const alpha = (0.16 + lit * 0.30) * (1 - hover * 0.18);
    const skew = Math.max(-1.5, Math.min(1.5, dx / (LAMP_SPACING * 0.5)));
    const stretch = 1 + Math.min(1.8, Math.abs(dx) / (LAMP_SPACING * 0.45));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.translate(cx + skew * w * 0.9, rest);
    ctx.transform(1, 0, skew * 0.5, 1, 0, 0);
    ctx.scale(stretch, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, w * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return { drawGroundPools, drawCastShadow, drawPropShadow, drawLitSprite, drawBloom, litness };
}
