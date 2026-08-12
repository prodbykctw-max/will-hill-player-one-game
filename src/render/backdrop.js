// Layered backdrop — ported from Jandé's drawMansionBG model
// (once-upon-a-time index.html:4236-4522 + _lbTile:3831-3839), with one
// deliberate departure: the painted plate is sized in REAL-WORLD METRES
// rather than fitted to the screen.
//
// WHY: these are real Atlanta neighbourhoods Will Hill walks through. A
// storefront has to read as a building he could walk into — door taller
// than him, sign band above his head — and it has to read that way
// identically on every device. Jandé fits its paintings to ~94% of screen
// height, which is fine for a stylised fairytale interior but would make
// the same Edgewood facade a different size on a phone than on a desktop.
// Each stage instead declares how many metres of real-world height its
// source image spans (`bg.meters`) and where its ground line sits in the
// source (`bg.groundFrac`); src/world/scale.js converts through the
// character's own height.
//
// SCREEN SPACE vs WORLD SPACE — the recurring bug of the Jandé project
// ("seven instances so far", its CLAUDE.md:161). EVERYTHING in this file is
// screen space with a hand-rolled `camera.x * zoom * parallax` offset. Only
// the world block in renderer.js sits inside the camera transform. The one
// thing shared across that boundary is `camera.groundScreenY()` — the
// single anchor that keeps painted ground welded to the tile floor.

import { metersToWorld } from '../world/scale.js';

// Parallax factors are TRUE world-relative rates: 1.0 would track the world
// exactly, 0 is nailed to the screen. The user asked for pronounced depth,
// so the spread here is wide (0.10 -> 0.75) rather than Jandé's subtle
// 0.045 -> 0.157.
const PLATE_PARALLAX = 0.1;

// ── Multiplane ────────────────────────────────────────────────────────────
// A stage may ship a set of CARDS instead of one flat plate: the backdrop cut
// into its individual items by tools/cut_planes.py, each drawn at its own
// rate. It is the Disney multiplane camera — cut-outs on separate planes,
// moved at different speeds — and the effect it buys is that the backdrop
// reads as a space you are walking through rather than a picture sliding past.
//
// THE SPREAD IS TINY, AND THAT IS THE ENTIRE TRICK.
// Every card scrolls at PLATE_PARALLAX. Depth adds only a small DIFFERENCE on
// top, and that difference is all the eye needs. Two earlier attempts failed
// in opposite directions and both are worth remembering:
//
//   * Wide rates (an early cut ran 0.02 -> 0.62) do not read as depth. They
//     read as the set falling over: cards slide clean off one another and the
//     empty base plate shows through the gaps between them.
//   * Worse, each card wraps on its own phase, so a fast card drifts a whole
//     plate width over a stage — the tree that starts the level on the left
//     finishes it on the right. Items have to STAY WHERE THEY ARE.
//
// At a 0.010 spread the tree stays within ~77px of home across the whole
// 7680px stage. It stays its tree, in front of its bit of fence, and merely
// floats in front of it. MAX_SEPARATION is the hard backstop that makes
// migration impossible even if the spread is later dialled up.
const DEPTH_SPREAD = 0.010;
const MAX_SEPARATION = 90; // px at zoom 1

// GROUND STRIPS ARE THE EXCEPTION, and it is worth being precise about why.
//
// MAX_SEPARATION exists to stop a DISCRETE OBJECT migrating: the tree that
// starts the stage on the left and ends it on the right is not parallax, it is
// the set falling over. But that failure needs a landmark to be visible on.
// A ground strip — the grass verge, the kerb, the wet street at the bottom of
// the plate — is a continuous featureless band running the full width. Slide
// it 300px and there is nothing in it to notice having moved; all you see is
// that it is travelling faster than the buildings behind it, which is exactly
// the cue that the street is nearer than the storefronts.
//
// So a card may opt into a real rate and a looser clamp. Only ground strips
// should. Anything with an identifiable feature in it keeps the tight default.
const STRIP_MAX_SEPARATION = 400; // px at zoom 1

// WEATHER MOVES ON ITS OWN. Parallax is a function of where the CAMERA is, so
// a cloud card only ever slides while the player runs — stand still and the
// sky is a photograph. The client, on the day stages: "the sky is up there and
// the clouds are moving too… every daytime stage where you can see the sky and
// clouds, we need clouds moving."
//
// `drift` is source pixels per tick added on top of the parallax, and because
// the plate is already mirror-tiled and wrapped by `pmod` at the draw site, a
// card can drift forever without a seam — the same property the title screen's
// travelling clouds rely on. Kept SLOW: these read as weather at a distance,
// not as a screensaver, and a cloud that visibly races the buildings breaks
// the depth the rest of the multiplane set is buying.
function cardParallax(camX, depth, card, tick) {
  const drift = card && card.drift ? card.drift * (tick || 0) : 0;
  const common = camX * PLATE_PARALLAX + drift;
  if (card && card.rate !== undefined) {
    const diff = camX * (card.rate - PLATE_PARALLAX);
    const cap = card.maxSep === undefined ? STRIP_MAX_SEPARATION : card.maxSep;
    return common + Math.max(-cap, Math.min(cap, diff));
  }
  const diff = camX * (depth - 0.5) * DEPTH_SPREAD;
  return common + Math.max(-MAX_SEPARATION, Math.min(MAX_SEPARATION, diff));
}
const RAIN_TIERS = [
  { n: 26, len: 26, speed: 5.2, alpha: 0.1, width: 1.0, par: 0.18 },
  { n: 20, len: 40, speed: 8.5, alpha: 0.16, width: 1.4, par: 0.4 },
  { n: 12, len: 62, speed: 13.0, alpha: 0.22, width: 2.0, par: 0.75 },
];

// Deterministic hash — same trick as Jandé's _uh (index.html:4051): stable
// placement frame to frame with no stored state.
function hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pmod(a, m) {
  return ((a % m) + m) % m;
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Colour of the sky gradient at a given screen y — used to dissolve the
// plate's hard top edge into the sky behind it. Must stay in step with the
// stops in drawSky().
function skyAt(stage, y, groundY) {
  const t = Math.max(0, Math.min(1, y / Math.max(1, groundY)));
  const [a, b, c] = [hexRgb(stage.bg.sky[0]), hexRgb(stage.bg.sky[1]), hexRgb(stage.bg.horizon)];
  const [p, q, f] = t < 0.55 ? [a, b, t / 0.55] : [b, c, (t - 0.55) / 0.45];
  return [
    Math.round(p[0] + (q[0] - p[0]) * f),
    Math.round(p[1] + (q[1] - p[1]) * f),
    Math.round(p[2] + (q[2] - p[2]) * f),
  ];
}

// Wind is applied by slicing the plate into vertical spans and shearing each
// one — a direct port of Jandé's _lbWind/_lbWindDraw (index.html:3902-3952,
// docs/LIVING_BACKDROPS.md). Jandé pinned LB_SPANS at 16 after measuring:
// 24 spans still fit in a 16.7ms frame, 49 spans blew the budget. Same
// number here for the same reason.
// Sections are subdivided WITHIN each foliage window rather than across the
// whole canvas. Slicing the canvas meant a narrow window (the tree is ~10%
// of the plate) only ever covered 2-3 spans, so the crown lurched as a few
// rigid blocks. Subdividing the window itself gives the same fine motion no
// matter how narrow it is, and costs nothing on the stages that barely have
// foliage — we only ever draw sections we're actually shearing.
const SECTIONS_PER_RANGE = 14;
const WIND_OVERLAP = 3; // px, so sheared sections never leave a visible gap

export function createBackdrop(ctx, canvas) {
  // Scratch buffer the plate is composed into before the wind shear blits
  // it back in slices.
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');

  // The plate's current parallax offset, stashed by drawPlate so the wind
  // and practical passes can map screen x back to plate-local coordinates.
  let _par = 0;

  function drawSky(stage, groundY) {
    const [top, upper] = stage.bg.sky;
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, groundY));
    g.addColorStop(0, top);
    g.addColorStop(0.55, upper);
    g.addColorStop(1, stage.bg.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // The painted plate, at real-world scale, mirror-tiled, welded to the
  // world floor.
  function drawPlate(g, img, stage, camera, groundY) {
    if (!img) return;

    // Crop off everything at/below the source image's own ground line — the
    // game draws its own street there, and leaving the photo's street in
    // would read as two grounds stacked.
    const srcH = Math.max(1, Math.round(img.height * stage.bg.groundFrac));

    const drawH = metersToWorld(stage.bg.meters) * camera.zoom;
    const drawW = drawH * (img.width / srcH);
    if (drawW < 1 || drawH < 1) return;

    // Tuck a few px behind the ground cap so no seam shows at the join.
    const bottom = groundY + 4 * camera.zoom;
    const by = bottom - drawH;

    // The base plate sits at depth 0 — the far wall the cards stand in front
    // of. On a stage with no cards this is just the old flat plate.
    const par = cardParallax(camera.x * camera.zoom, 0);
    _par = par;
    // Straight repeat, NOT mirrored. Mirroring hides the seam on a
    // non-tiling image, but these plates are real Atlanta streetscapes full
    // of real signage — a flipped copy renders CITGO and WELCOME TO EAST
    // ATLANTA as backwards text. Repeating the block instead is the classic
    // cartoon running-past-the-same-background gag, and it keeps every sign
    // readable.
    const period = drawW;
    let off = -pmod(par, period);

    g.save();
    for (let x = off; x < canvas.width + drawW; x += drawW) {
      const x0 = Math.round(x);
      const x1 = Math.round(x + drawW);
      const tw = x1 - x0;
      if (tw <= 0 || x1 < 0 || x0 > canvas.width) continue;
      // Blit only the columns that actually land on screen. At real-world
      // scale the plate is several times wider than the canvas, so blitting
      // the whole thing threw away most of the fill rate every frame.
      const s0 = Math.max(0, Math.floor((img.width * -x0) / tw));
      const s1 = Math.min(img.width, Math.ceil((img.width * (canvas.width - x0)) / tw));
      if (s1 <= s0) continue;
      g.drawImage(img, s0, 0, s1 - s0, srcH,
        x0 + (tw * s0) / img.width, by, (tw * (s1 - s0)) / img.width, drawH);
    }
    g.restore();

    // Dissolve the plate's top edge into the sky. Without this the crop
    // leaves a hard horizontal line across the frame wherever the building
    // tops don't reach the top of the source image — very visible on the
    // low-rise stages, where a 1-storey facade at true scale leaves real sky
    // above it.
    const feather = Math.min(drawH * 0.3, Math.max(40, drawH * 0.16));
    if (by + feather > 0 && by < canvas.height) {
      const [r, gg, b] = skyAt(stage, Math.max(0, by), groundY);
      const fg = g.createLinearGradient(0, by, 0, by + feather);
      fg.addColorStop(0, `rgb(${r},${gg},${b})`);
      fg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = fg;
      g.fillRect(0, by, canvas.width, feather);
    }
    return { by, drawH, drawW };
  }

  // ── Cards ───────────────────────────────────────────────────────────────
  // One item of the backdrop, cut out by tools/cut_planes.py and drawn at its
  // own rate. Geometry is shared with the base plate — every card is a
  // full-frame RGBA image of the same source, so the cutout is already in the
  // right place and only the horizontal offset differs.

  // Blit only the horizontal slice [u0,u1] of a card, in plate fractions.
  // Cards are full-frame so a cutout is already in position, but blitting the
  // whole frame for an item covering 8% of it is pure waste — and with three
  // swaying cards re-blitting the full frame once per section it was enough
  // to visibly stutter the whole game.
  function drawSlice(g, img, plate, srcH, x0, u0, u1) {
    // Clamp to the card AND to the screen: a card wider than the viewport
    // would otherwise pay for columns nobody can see.
    const vis0 = (0 - x0) / plate.drawW;
    const vis1 = (canvas.width - x0) / plate.drawW;
    const a = Math.max(0, Math.min(1, Math.max(u0, vis0)));
    const b = Math.max(0, Math.min(1, Math.min(u1, vis1)));
    if (b <= a) return;
    const s0 = Math.floor(img.width * a);
    const s1 = Math.ceil(img.width * b);
    if (s1 <= s0) return;
    g.drawImage(img, s0, 0, s1 - s0, srcH,
      x0 + plate.drawW * (s0 / img.width), plate.by,
      plate.drawW * ((s1 - s0) / img.width), plate.drawH);
  }

  function drawCardAt(g, img, plate, srcH, x0, card, tick, seed) {
    const { by, drawH, drawW } = plate;
    const [sx0, sx1] = card.span || [0, 1];
    const bands = card.sway;
    if (!bands || !bands.length) {
      drawSlice(g, img, plate, srcH, x0, sx0, sx1);
      return;
    }

    // Rigid everywhere the sway windows do not reach. Punched out with an
    // even-odd clip rather than drawn over, because a card has a soft alpha
    // edge: drawing the sheared copy on top of a rigid one would composite
    // that edge onto itself, and the rigid copy would still show through
    // wherever the shear moved content away.
    g.save();
    g.beginPath();
    g.rect(x0 + drawW * sx0, by, drawW * (sx1 - sx0), drawH);
    for (const bd of bands) {
      const t = by + drawH * (bd.top || 0);
      for (const [a, b] of bd.xRanges) {
        g.rect(x0 + a * drawW, t, (b - a) * drawW, drawH * bd.pivot - drawH * (bd.top || 0));
      }
    }
    g.clip('evenodd');
    drawSlice(g, img, plate, srcH, x0, sx0, sx1);
    g.restore();

    for (const bd of bands) {
      const bandTop = by + drawH * (bd.top || 0);
      const pivotY = by + drawH * bd.pivot;
      const bandH = Math.max(1, pivotY - bandTop);

      for (const [a, b] of bd.xRanges) {
        const rangeW = (b - a) * drawW;
        if (rangeW <= 0) continue;
        const secW = rangeW / SECTIONS_PER_RANGE;

        for (let i = 0; i < SECTIONS_PER_RANGE; i++) {
          const dx = x0 + a * drawW + i * secW;
          if (dx + secW < 0 || dx > canvas.width) continue;

          // Phase keyed to position on the plate plus the repeat index, so
          // neighbouring sections drift out of step instead of the whole
          // crown pulsing as one — and a given branch sways the same way on
          // every repeat.
          const phase = (a * drawW + i * secW) * 2.7 + seed + (bd.top || 0) * 900;
          const k = bd.amp * gustAt(tick, phase, bd.freq);

          g.save();
          g.beginPath();
          // Clip rects butt together exactly. The old plate version overlapped
          // them by a few px to avoid gaps, but that would composite a card's
          // alpha edge twice and print a seam. Instead the clip tiles cleanly
          // and the SOURCE slice is widened to cover the shear.
          g.rect(dx, bandTop, secW, bandH);
          g.clip();
          g.transform(1, 0, -k / bandH, 1, (k * pivotY) / bandH, 0);
          const m = (Math.abs(k) + WIND_OVERLAP) / drawW;
          drawSlice(g, img, plate, srcH, x0,
            a + (i * secW) / drawW - m, a + ((i + 1) * secW) / drawW + m);
          g.restore();
        }
      }
    }
  }

  function drawCards(g, images, stage, camera, tick, plate) {
    const cards = stage.bg.cards;
    if (!cards || !plate) return;
    const period = plate.drawW;
    const reps = Math.ceil(canvas.width / period) + 1;
    for (const card of cards) {
      const img = images[card.key];
      if (!img) continue;
      const srcH = Math.max(1, Math.round(img.height * stage.bg.groundFrac));
      const par = cardParallax(camera.x * camera.zoom, card.depth, card, tick);
      const off = pmod(par, period);
      const [sx0, sx1] = card.span || [0, 1];
      for (let rep = -1; rep <= reps; rep++) {
        const x0 = rep * period - off;
        // Cull on the card's own extent, not the plate's — most cards are a
        // small part of the frame and are off screen most of the time.
        if (x0 + sx1 * period < 0 || x0 + sx0 * period > canvas.width) continue;
        drawCardAt(g, img, plate, srcH, x0, card, tick, rep * 211);
      }
    }
  }

  // Where a practical sits horizontally, given the card it is bolted to — so
  // the glow travels with the thing that emits it rather than sliding off it.
  function lightParallax(stage, camera, light) {
    const card = (stage.bg.cards || []).find((c) => c.key === light.layer);
    return cardParallax(camera.x * camera.zoom, card ? card.depth : 0, card, tick);
  }

  // Gust curve — two sines beaten together with a squared envelope, so the
  // foliage surges and settles instead of oscillating mechanically.
  function gustAt(t, x, freq) {
    const env = 0.30 + 0.70 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.0062 + x * 0.0007 * freq), 2);
    return env * (Math.sin(t * 0.030 + x * 0.0013 * freq) + 0.40 * Math.sin(t * 0.071 + x * 0.0032 * freq));
  }

  // Blit the composed plate back in vertical spans, shearing each above the
  // pivot line. Only the band the stage declares as foliage moves — the
  // buildings behind it must stay rigid or the whole frame looks liquid.
  function blitWithWind(stage, tick, plate) {
    const bands = stage.bg.windBands;
    if (!bands || !bands.length || !plate) {
      ctx.drawImage(buf, 0, 0);
      return;
    }

    // Rigid base first, then each sway section re-drawn sheared on top.
    ctx.drawImage(buf, 0, 0);

    const period = plate.drawW;
    const offset = pmod(_par, period);
    const reps = Math.ceil(canvas.width / period) + 2;

    for (const band of bands) {
      const bandTop = plate.by + plate.drawH * band.top;
      const pivotY = plate.by + plate.drawH * band.pivot;
      const bandH = Math.max(1, pivotY - bandTop);

      for (const [a, b] of band.xRanges) {
        const rangeW = (b - a) * plate.drawW;
        if (rangeW <= 0) continue;
        const secW = rangeW / SECTIONS_PER_RANGE;

        for (let rep = -1; rep < reps; rep++) {
          const base = rep * period + a * plate.drawW - offset;
          for (let i = 0; i < SECTIONS_PER_RANGE; i++) {
            const sx = base + i * secW;
            if (sx + secW < 0 || sx > canvas.width) continue;

            // Phase is keyed to the section's position ON THE PLATE (plus the
            // repeat index), so neighbouring sections drift out of step with
            // each other instead of the whole crown pulsing as one — and a
            // given branch always sways the same way on every repeat.
            const phase = (a * plate.drawW + i * secW) * 2.7 + rep * 211 + band.top * 900;
            const k = band.amp * gustAt(tick, phase, band.freq);

            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, bandTop, secW + WIND_OVERLAP, bandH);
            ctx.clip();
            // shear grows with height above the pivot -> tips travel, base doesn't
            ctx.transform(1, 0, -k / bandH, 1, (k * pivotY) / bandH, 0);
            ctx.drawImage(buf, 0, 0);
            ctx.restore();
          }
        }
      }
    }
  }

  // Neon relight — a second, tighter pass in 'overlay' so the painted sign
  // itself brightens and dims, not just the halo around it. A glow alone
  // reads as fog lit from behind; the tube has to visibly change too.
  function drawNeonRelight(stage, camera, tick, plate) {
    const lights = stage.bg.lights;
    if (!lights || !plate) return;
    const period = plate.drawW;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    for (let li = 0; li < lights.length; li++) {
      const L = lights[li];
      if (!L.flicker) continue;
      const b = 0.5 + 0.5 * Math.sin(tick * L.flicker * 1.7 + li * 2.3);
      const stutter = Math.sin(tick * L.flicker * 0.11 + li * 4.7) > 0.985;
      const a = (stutter ? 0.06 : 0.16 + b * 0.20) * (L.relight || 1);
      const ly = plate.by + plate.drawH * L.y;
      const r = L.r * plate.drawH * 0.55;
      const par = lightParallax(stage, camera, L);
      for (let rep = -1; rep <= Math.ceil(canvas.width / period) + 1; rep++) {
        const lx = rep * period + L.x * plate.drawW - pmod(par, period);
        if (lx < -r || lx > canvas.width + r) continue;
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, r);
        g.addColorStop(0, `rgba(${L.rgb},${a.toFixed(3)})`);
        g.addColorStop(1, `rgba(${L.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  // Make the lighting that's PAINTED INTO the backdrop actually emit: each
  // stage declares where its practicals sit as fractions of the plate, and
  // they bloom, flicker and (via render/lighting.js) light the street and
  // the characters standing under them.
  function drawPractical(stage, camera, tick, plate) {
    const lights = stage.bg.lights;
    if (!lights || !plate) return;
    const period = plate.drawW;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < lights.length; li++) {
      const L = lights[li];
      // neon/sodium practicals never sit perfectly steady
      // Neon doesn't dim smoothly — it buzzes, and a tired tube stutters.
      // Two beating sines give the buzz; a rare, brief dropout gives the
      // stutter. Without the dropout a flickering sign reads as a slow pulse,
      // which is what a lamp does, not a gas tube.
      let flick = 1;
      if (L.flicker) {
        const buzz = 0.80 + 0.20
          * Math.sin(tick * L.flicker + li * 2.1)
          * Math.sin(tick * L.flicker * 0.37 + li);
        const stutter = Math.sin(tick * L.flicker * 0.11 + li * 4.7);
        flick = stutter > 0.985 ? buzz * 0.35 : buzz;   // brief cut-out
      }
      const ly = plate.by + plate.drawH * L.y;
      const r = L.r * plate.drawH;
      // Repeat on the plate's period, but at the RATE of the card this light
      // is bolted to, so it stays glued to the thing that emits it.
      const par = lightParallax(stage, camera, L);
      for (let rep = -1; rep <= Math.ceil(canvas.width / period) + 1; rep++) {
        const lx = rep * period + L.x * plate.drawW - pmod(par, period);
        if (lx < -r || lx > canvas.width + r) continue;
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, r);
        g.addColorStop(0, `rgba(${L.rgb},${(L.a * flick).toFixed(3)})`);
        g.addColorStop(1, `rgba(${L.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  // Depth haze toward the ground line — pushes the plate back behind the
  // gameplay plane so platforms and enemies stay readable against it.
  function drawAerialWash(groundY) {
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, groundY + 30));
    g.addColorStop(0, 'rgba(6,3,12,0.05)');
    g.addColorStop(1, 'rgba(6,3,12,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, Math.max(0, groundY + 30));
  }

  // Rain at three depths. Every reference background is a rain-slicked
  // night street, so this is our equivalent of Jandé's LIVEBG ambient
  // (petals / motes / embers) — same 3-tier parallax idea, different weather.
  function drawRain(stage, camera, tick, groundY) {
    const intensity = stage.bg.rain;
    if (!intensity) return;
    const clipH = Math.max(0, groundY);
    if (clipH < 4) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, clipH); // rain does not fall underground
    ctx.clip();
    ctx.lineCap = 'round';

    const spanX = canvas.width + 240;
    const spanY = clipH + 200;
    for (let ti = 0; ti < RAIN_TIERS.length; ti++) {
      const t = RAIN_TIERS[ti];
      const n = Math.round(t.n * intensity);
      ctx.strokeStyle = `rgba(198,214,240,${t.alpha})`;
      ctx.lineWidth = t.width;
      ctx.beginPath();
      const drift = camera.x * camera.zoom * t.par;
      for (let i = 0; i < n; i++) {
        const seed = i + ti * 131;
        const x = pmod(hash01(seed) * spanX - drift, spanX) - 120;
        const y = pmod(hash01(seed + 0.37) * spanY + tick * t.speed, spanY) - 100;
        ctx.moveTo(x, y);
        ctx.lineTo(x - t.len * 0.34, y + t.len);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Wet-street glow gathering right at the floor line.
  // RECESSION BAND — the ground falling away between the backdrop and the
  // street. Without it the two are coplanar: drawPlate puts the plate bottom
  // at groundY + 4px, tucked behind the street cap, so there is literally no
  // air between the painted grass and the asphalt you stand on and the eye
  // gets no cue that one is nearer than the other.
  //
  // It is a shadow, not a shape. Darkest right where the street's far edge
  // meets it and fading upward into the plate, which is what the underside of
  // a kerb does to the ground behind it.
  function drawRecession(groundY) {
    const h = 26;
    if (groundY < -h || groundY > canvas.height + h) return;
    const g = ctx.createLinearGradient(0, groundY - h, 0, groundY + 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY - h, canvas.width, h + 2);
  }

  function drawFloorFog(stage, groundY) {
    const h = 70;
    if (groundY < -h || groundY > canvas.height + h) return;
    const g = ctx.createLinearGradient(0, groundY - h, 0, groundY + h * 0.4);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, stage.bg.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY - h, canvas.width, h * 1.4);
  }

  let vignette = null;
  let vignetteKey = '';
  function drawVignette() {
    const key = canvas.width + 'x' + canvas.height;
    if (key !== vignetteKey) {
      vignetteKey = key;
      const g = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.28,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.88,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.48)');
      vignette = g;
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return {
    // Everything above the gameplay plane, in paint order.
    // `images` is the stage's image set: `base` plus one entry per card. A
    // stage with no cards just gets `base` and behaves exactly as before.
    drawFar(images, stage, camera, tick) {
      const groundY = camera.groundScreenY();
      if (buf.width !== canvas.width || buf.height !== canvas.height) {
        buf.width = canvas.width;
        buf.height = canvas.height;
      }
      drawSky(stage, groundY);
      // Plate goes to the scratch buffer first so the wind pass can shear it
      // back in slices without re-deriving the tiling maths.
      bctx.clearRect(0, 0, buf.width, buf.height);
      const plate = drawPlate(bctx, images.base, stage, camera, groundY);
      drawCards(bctx, images, stage, camera, tick, plate);
      // Cards carry their own sway, so the plate-wide wind pass is only for
      // stages that have not been cut into a multiplane set yet.
      if (stage.bg.cards) ctx.drawImage(buf, 0, 0);
      else blitWithWind(stage, tick, plate);
      drawNeonRelight(stage, camera, tick, plate);
      drawPractical(stage, camera, tick, plate);
      drawAerialWash(groundY);
      // Before the fog, so the fog's warm glow sits ON the receding ground
      // rather than being darkened by it.
      drawRecession(groundY);
      drawRain(stage, camera, tick, groundY);
      drawFloorFog(stage, groundY);
    },
    // Applied last, over the world — kept separate so gameplay sits under it.
    drawVignette,
  };
}
