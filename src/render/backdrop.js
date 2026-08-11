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
const WIND_SPANS = 16;
const WIND_OVERLAP = 3; // px, so sheared spans never leave a visible gap

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

    const par = camera.x * camera.zoom * PLATE_PARALLAX;
    _par = par;
    const period = drawW * 2;
    let off = -pmod(par, period);

    g.save();
    for (let x = off; x < canvas.width + drawW; x += drawW) {
      const x0 = Math.round(x);
      const x1 = Math.round(x + drawW);
      const tw = x1 - x0;
      if (tw <= 0) continue;
      // Mirror alternate copies so a non-tiling "postcard" image (which all
      // four of ours are) repeats without a hard vertical seam.
      const k = Math.round((x + par) / drawW);
      if (k & 1) {
        g.save();
        g.translate(x0 + tw, 0);
        g.scale(-1, 1);
        g.drawImage(img, 0, 0, img.width, srcH, 0, by, tw, drawH);
        g.restore();
      } else {
        g.drawImage(img, 0, 0, img.width, srcH, x0, by, tw, drawH);
      }
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

    // Rigid base: draw the whole plate, then re-draw each sway band sheared
    // on top of it. Bands are independent, so a tall crown and low shrubs
    // move at different amplitudes and rates.
    ctx.drawImage(buf, 0, 0);

    const period = plate.drawW * 2;
    const plateU = (screenX) => {
      const local = pmod(screenX + _par, period);
      return local < plate.drawW
        ? local / plate.drawW
        : 1 - (local - plate.drawW) / plate.drawW;
    };

    const spanW = canvas.width / WIND_SPANS;
    for (const band of bands) {
      const bandTop = plate.by + plate.drawH * band.top;
      const pivotY = plate.by + plate.drawH * band.pivot;
      const bandH = Math.max(1, pivotY - bandTop);
      const inFoliage = (u) => band.xRanges.some(([a, b]) => u >= a && u <= b);

      for (let i = 0; i < WIND_SPANS; i++) {
        const sx = i * spanW;
        if (!inFoliage(plateU(sx + spanW * 0.5))) continue;
        const k = band.amp * gustAt(tick, sx + band.freq * 97, band.freq);
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, bandTop, spanW + WIND_OVERLAP, bandH);
        ctx.clip();
        // shear grows with height above the pivot -> foliage sways, trunk doesn't
        ctx.transform(1, 0, -k / bandH, 1, (k * pivotY) / bandH, 0);
        ctx.drawImage(buf, 0, 0);
        ctx.restore();
      }
    }
  }

  // Make the lighting that's PAINTED INTO the backdrop actually emit: each
  // stage declares where its practicals sit as fractions of the plate, and
  // they bloom, flicker and (via render/lighting.js) light the street and
  // the characters standing under them.
  function drawPractical(stage, camera, tick, plate) {
    const lights = stage.bg.lights;
    if (!lights || !plate) return;
    const par = camera.x * camera.zoom * PLATE_PARALLAX;
    const period = plate.drawW * 2;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < lights.length; li++) {
      const L = lights[li];
      // neon/sodium practicals never sit perfectly steady
      const flick = L.flicker
        ? 0.78 + 0.22 * Math.sin(tick * L.flicker + li * 2.1) * Math.sin(tick * L.flicker * 0.37 + li)
        : 1;
      const ly = plate.by + plate.drawH * L.y;
      const r = L.r * plate.drawH;
      // repeat with the plate's mirror tiling so a light stays glued to the
      // thing that emits it
      for (let rep = -1; rep <= Math.ceil(canvas.width / period) + 1; rep++) {
        for (const mirror of [0, 1]) {
          const base = rep * period + (mirror ? plate.drawW * 2 - L.x * plate.drawW : L.x * plate.drawW);
          const lx = base - pmod(par, period);
          if (lx < -r || lx > canvas.width + r) continue;
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, r);
          g.addColorStop(0, `rgba(${L.rgb},${(L.a * flick).toFixed(3)})`);
          g.addColorStop(1, `rgba(${L.rgb},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
        }
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
    drawFar(img, stage, camera, tick) {
      const groundY = camera.groundScreenY();
      if (buf.width !== canvas.width || buf.height !== canvas.height) {
        buf.width = canvas.width;
        buf.height = canvas.height;
      }
      drawSky(stage, groundY);
      // Plate goes to the scratch buffer first so the wind pass can shear it
      // back in slices without re-deriving the mirror-tiling maths.
      bctx.clearRect(0, 0, buf.width, buf.height);
      const plate = drawPlate(bctx, img, stage, camera, groundY);
      blitWithWind(stage, tick, plate);
      drawPractical(stage, camera, tick, plate);
      drawAerialWash(groundY);
      drawRain(stage, camera, tick, groundY);
      drawFloorFog(stage, groundY);
    },
    // Applied last, over the world — kept separate so gameplay sits under it.
    drawVignette,
  };
}
