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
import { PLANT_DEPTH } from '../world/scale.js';

// Shared with the renderer so shadows sink with the feet. This used to be a
// hand-copied duplicate and it drifted (2 here against 3 there), which is
// exactly what docs/HANDOFF.md warns about — now there is only one.
const FOOTPLANT = PLANT_DEPTH;

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
    // In day the key light is the SUN (the stage's own day `light.key`),
    // never the first neon's colour — a noon figure rimmed in sign-pink was
    // part of what made day read as "night with the brightness up".
    if (stage.tod === 'day') return stage.light.key;
    const ls = stage.bg && stage.bg.lights;
    return ls && ls.length ? ls[0].rgb : stage.light.key;
  }

  // How lit a point is, 0..1, by its distance from the nearest lamp.
  function litness(x) {
    if (isDay()) return DAY_LIT;
    const d = Math.abs(x - nearestLampX(x));
    return Math.max(0, 1 - d / (LAMP_SPACING * 0.62));
  }

  // ── NO STREETLAMPS AT MIDDAY ─────────────────────────────────────────
  //
  // The pools, the shafts and the bloom are all one lamp being simulated, and
  // a lamp on a sunlit pavement is the single thing that most makes a day
  // scene read as "night with the brightness turned up" — which is the exact
  // note that got the day plates' practicals removed in the first place. The
  // client, again: "no spotlights are needed on any day screens."
  //
  // Gated on `stage.tod` rather than on four nulled-out colours in the stage
  // table, because it is ONE rule and four values are four chances to drift.
  // `light.key`, `light.bounce` and `light.shadowRgb` are NOT gated: the sun
  // is still a key with a direction and things still cast shadows at noon.
  const lampsLit = (stage) => stage.tod !== 'day';

  // ⚠️ AND THE LAMPS' GEOMETRY HAS TO DIE AT MIDDAY TOO, NOT JUST THEIR GLOW.
  //
  // Gating the pools/shafts/bloom (above) turned off the light you could SEE,
  // but litness() kept modulating the sprite key-light and both shadow
  // functions by distance to the nearest lamp on the 420-unit grid — lamps
  // that no longer exist in daylight. So Will Hill brightened and dimmed
  // every 420 units as he ran, and his shadow swung around as if something
  // overhead were passing. Client, from the live game: "there is beam of
  // light coming down on him in the daytime... he walks shining on and not
  // shining on him... even though it's daytime — that's only for nighttime."
  //
  // At midday the key is the SUN: one direction, one intensity, everywhere.
  // So in day litness() returns a constant and the shadows drop the
  // lamp-relative skew/stretch. The colours still come from the stage's own
  // day `light` block — the line above about key/bounce/shadowRgb staying
  // ungated remains true; it is only the per-lamp VARIATION that dies.
  //
  // DAY_LIT is the constant. 0.5 keeps him readable without the hot top-light
  // a lamp would give: head key alpha lands at 0.23, foot shade at 0.28.
  const DAY_LIT = 0.5;
  // drawCastShadow/drawPropShadow take no stage — rather than churn every
  // call site, the stage is captured once per frame by drawGroundPools,
  // which main.js already calls (with the stage in hand) before any entity
  // is drawn. drawLitSprite has its own stage param and does not need this.
  let curStage = null;
  const isDay = () => !!curStage && curStage.tod === 'day';

  // Pools on the street surface. Call inside the camera transform, before
  // entities are drawn.
  function drawGroundPools(camera, stage) {
    curStage = stage;              // captured before the gate — see DAY_LIT
    if (!lampsLit(stage)) return;
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
    // Noon sun: straight overhead, so dx=0 kills the skew and the stretch
    // and litness() is already constant — a steady contact shadow underfoot
    // instead of one that swings lamp-to-lamp in daylight.
    const dx = isDay() ? 0 : cx - nearestLampX(cx);
    const lit = litness(cx);

    // airborne characters cast a smaller, fainter, offset shadow
    const groundWorldY = FLOOR_R * T + FOOTPLANT;
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

    const lit = stage && stage.tod === 'day' ? DAY_LIT : litness(worldX);

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
    if (!lampsLit(stage)) return;
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
  // How far above the ground counts as AIRBORNE for the shadow test. A
  // resting pickup sits within a few units of the floor; a thrown bag is
  // tens of units up within a frame or two of leaving him.
  const AIRBORNE = 26;

  function drawPropShadow(item, drawY, lift) {
    const cx = item.x + item.w / 2;
    const groundWorldY = FLOOR_R * T + FOOTPLANT;
    // where the prop actually sits, ignoring the bob
    const rest = item.y + item.h + FOOTPLANT;
    if (rest > groundWorldY + 40) return; // on a ledge we don't model — skip
    // NOTHING IN THE AIR CASTS A SHADOW UNDER ITSELF. A bag knocked loose by
    // an enemy arcs across the street, and this was drawing its shadow pinned
    // to the bag rather than to the ground — a shadow travelling with the
    // object it belongs to reads as the object being stuck to the floor.
    // Client: "money bags that are in the air shouldn't have shadows
    // underneath them." `lift` (the bob) is deliberately not counted: a bag
    // bobbing 3px on the pavement is resting, not airborne, and its shadow is
    // already softened by `hover` below.
    if (rest < groundWorldY - AIRBORNE) return;

    const dx = isDay() ? 0 : cx - nearestLampX(cx);   // noon: no lamp to lean from
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
