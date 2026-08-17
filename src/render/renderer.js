// Canvas 2D renderer.
//
// Structure ported from Jandé's final RPG draw path (once-upon-a-time ref
// origin/claude/hand-painted-architecture-bg-0MAiy): backdrop and undercroft
// in SCREEN space with hand-rolled parallax, then ONE world block inside
// `scale(zoom) / translate(-camX,-camY)`, then HUD back in screen space.
// Keeping that boundary explicit matters — mixing the two is the single
// most repeated bug in the Jandé codebase (its CLAUDE.md:161).
//
// Tiles are a multi-pass draw modelled on Jandé's drawTile
// (index.html:4678-4757) but reskinned to an Atlanta street per the
// reference image: sidewalk cap with panel joints, curb lip, asphalt
// courses, 2.5D front face on floating platforms, cut face on the lowest
// drawn row.

import { T, FLOOR_R, SLAB_R } from '../world/tilemap.js';
import { CHAR_DRAW_H, PLANT_DEPTH } from '../world/scale.js';
import { resolveClip } from '../core/animate.js';
import { CHAMPAGNE_SECONDS } from '../entities/player.js';
import { createLighting } from './lighting.js';

// Street palette, keyed off the reference image's night-street read.
const ASPHALT = '#33343a';
const ASPHALT_LIT = '#43454d';
const ASPHALT_DARK = '#212227';
const SIDEWALK = '#8d8b83';
const SIDEWALK_LIT = '#a8a69d';
const CURB = '#5c5a55';
const FRONT_FACE_H = 13; // world units of 2.5D depth on floating platforms

// Ground contact is governed by PLANT_DEPTH in src/world/scale.js — one
// number for every character. See the note there for why it cannot simply be
// a constant added to every sprite: the two projections disagree about what
// their lowest pixel means, so the renderer measures what each sheet's anchor
// already gives and makes up exactly the difference.

export function createRenderer(ctx, canvas) {
  const lighting = createLighting(ctx);

  function withCameraTransform(camera, fn) {
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    fn();
    ctx.restore();
  }

  // ── ground / platforms ───────────────────────────────────────────────
  // Deterministic per-tile variation: same tile always gets the same
  // speckle, cracks and wear, so nothing shimmers as the camera moves.
  function th(c, r, salt) {
    const x = Math.sin(c * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── THE TILE BAKERY ──────────────────────────────────────────────────
  //
  // Painting one street tile is about twenty canvas operations: a gradient
  // body, fourteen aggregate specks, cracks, joints, a sidewalk cap with its
  // own grain and expansion joint, a curb, sometimes a drain or a puddle.
  // Sixty-six tiles are on screen at once, so the street alone was issuing
  // ~1,100 fillRect and ~150 gradient constructions EVERY FRAME. Measured at
  // 430x932 that held the whole game at 33fps — and a game running at 33fps
  // feels stiff no matter how good the input layer is.
  //
  // None of it moves. Every one of those operations is a pure function of
  // (column, row, tile type, which sides are exposed) through the
  // deterministic hash `th` — that is the whole reason the speckle does not
  // shimmer as the camera scrolls. A pure function called with the same
  // arguments sixty times a second is a cache waiting to happen: each tile is
  // painted ONCE into its own little canvas and from then on it is a single
  // drawImage.
  //
  // IN CHUNKS OF SIXTEEN COLUMNS, NOT ONE TILE AT A TIME. Per-tile bakes were
  // the obvious first cut and they were measurably wrong: each little bitmap
  // gets resampled independently when the camera's zoom lands it on a
  // fractional pixel, so neighbouring tiles no longer agree at their shared
  // edge. A pixel diff against the vector renderer showed a seam on every
  // tile boundary — 7.2% of the street band off by more than 8 levels, and
  // the worst columns repeating at exactly the 20.6px tile pitch.
  //
  // A chunk is drawn as ONE continuous vector pass, so inside it the tiles
  // meet the way they always did, and the whole chunk is resampled as a unit.
  // Sixteen columns is a full screen and a half at this zoom, so in practice
  // two or three blits cover the street.
  //
  // BAKED AT 1:1 WORLD SCALE and blitted inside the camera transform, so the
  // zoom is applied once, to the finished bitmap, exactly as it was applied to
  // the vector drawing before.
  const MX = 12;   // side margin: cracks wander up to ~10 units outside a tile
  const MY = 2;    // top margin: the crack stroke starts on the tile's top edge
  const MB = FRONT_FACE_H + 6;   // bottom: 2.5D front face + its cast shadow
  const CHUNK_COLS = 16;
  const MAX_CHUNKS = 12;
  let chunks = new Map();

  // A chunk can only be baked once the columns it covers will not change
  // again. The world streams in ahead of the camera (genAhead), and a tile's
  // own drawing depends on whether its neighbours exist — the exposed-side
  // shading and the 2.5D front face both do — so a chunk baked while its
  // right-hand columns were still empty would bake edges that are about to
  // stop being edges. `genC` is the generator's write head; anything left of
  // it is finished. The one chunk straddling it draws live that frame.
  function bakedChunk(map, k, isSolidAt, genC) {
    let ch = chunks.get(k);
    if (ch) return ch;

    const cA = k * CHUNK_COLS;
    const cB = cA + CHUNK_COLS - 1;
    const mine = [];
    let rMin = Infinity;
    let rMax = -Infinity;
    for (const t of map.tiles) {
      if (t.t !== 'G' && t.t !== 'P') continue;
      if (t.c < cA || t.c > cB) continue;
      if (t.t === 'G' && t.r >= FLOOR_R + SLAB_R) continue;
      mine.push(t);
      if (t.r < rMin) rMin = t.r;
      if (t.r > rMax) rMax = t.r;
    }
    if (!mine.length) { ch = { empty: true }; chunks.set(k, ch); return ch; }

    // Only the rows this chunk actually uses. Most chunks are the ground
    // slab and at most one floating platform, so this is a few hundred
    // pixels rather than the level's full 22-row height.
    const ox = cA * T - MX;
    const oy = rMin * T - MY;
    const img = document.createElement('canvas');
    img.width = CHUNK_COLS * T + MX * 2;
    img.height = (rMax - rMin + 1) * T + MY + MB;
    const g = img.getContext('2d');
    for (const t of mine) {
      paintTile(g, t.c * T - ox, t.r * T - oy, t,
        !isSolidAt(t.c, t.r - 1), !isSolidAt(t.c - 1, t.r),
        !isSolidAt(t.c + 1, t.r), !isSolidAt(t.c, t.r + 1));
    }

    ch = { img, ox, oy, w: img.width, h: img.height };
    // Oldest-first eviction. Map keeps insertion order, so the first key is
    // the least recently baked — for a side-scroller, the furthest behind.
    if (chunks.size >= MAX_CHUNKS) chunks.delete(chunks.keys().next().value);
    chunks.set(k, ch);
    return ch;
  }

  // Dropped when the tiles behind them could have changed. Every stage
  // restarts at column 0, so without this a new stage blits the old one's
  // asphalt.
  function invalidateTiles() {
    chunks = new Map();
  }

  function drawTiles(map, camera, isSolidAt, genC = Infinity) {
    const c0 = Math.floor(camera.x / T) - 1;
    const c1 = Math.floor((camera.x + camera.vw) / T) + 1;
    const kA = Math.floor(c0 / CHUNK_COLS);
    const kB = Math.floor(c1 / CHUNK_COLS);

    // DEV A/B. The live path below is the original vector renderer, kept as
    // the fallback for chunks the generator is still writing into — which
    // makes it exactly the right thing to diff the baked path against. This
    // switch forces it for every chunk so a verification pass can shoot both
    // renderings of the SAME frame from one build, rather than trying to make
    // two builds land on the same camera position.
    const live = import.meta.env.DEV && typeof window !== 'undefined' && window.__noTileCache;

    for (let k = kA; k <= kB; k++) {
      if (k < 0) continue;
      // Settled? Then blit it. Still being written into? Draw it live.
      if (!live && (k + 1) * CHUNK_COLS < genC) {
        const ch = bakedChunk(map, k, isSolidAt, genC);
        if (!ch.empty) ctx.drawImage(ch.img, ch.ox, ch.oy, ch.w, ch.h);
        continue;
      }
      const cA = k * CHUNK_COLS;
      const cB = cA + CHUNK_COLS - 1;
      for (const t of map.tiles) {
        if (t.t !== 'G' && t.t !== 'P') continue;
        if (t.c < cA || t.c > cB) continue;
        if (t.t === 'G' && t.r >= FLOOR_R + SLAB_R) continue;
        paintTile(ctx, t.c * T, t.r * T, t,
          !isSolidAt(t.c, t.r - 1), !isSolidAt(t.c - 1, t.r),
          !isSolidAt(t.c + 1, t.r), !isSolidAt(t.c, t.r + 1));
      }
    }
  }

  // The actual painting. `ctx` here is the BAKE canvas's context, shadowing
  // the frame's on purpose so the body below is unchanged from when it drew
  // straight to the screen — (x, y) is the tile's top-left in that context.
  function paintTile(ctx, x, y, t, isTop, isL, isR, isBtm) {
    {
      // Base asphalt body + vertical tint so the slab has some depth.
      const g = ctx.createLinearGradient(x, y, x, y + T);
      g.addColorStop(0, ASPHALT_LIT);
      g.addColorStop(0.5, ASPHALT);
      g.addColorStop(1, ASPHALT_DARK);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, T, T);

      // Aggregate speckle — asphalt is stone in binder, not flat colour.
      for (let i = 0; i < 14; i++) {
        const px = x + th(t.c, t.r, i) * T;
        const py = y + th(t.c, t.r, i + 40) * T;
        const s = 0.8 + th(t.c, t.r, i + 80) * 1.5;
        const lit = th(t.c, t.r, i + 120);
        ctx.fillStyle = lit > 0.62
          ? `rgba(190,192,200,${0.10 + lit * 0.14})`
          : `rgba(0,0,0,${0.10 + lit * 0.20})`;
        ctx.fillRect(px, py, s, s);
      }

      // Patch seams — where the street was cut open and filled back in.
      if (th(t.c, t.r, 7) > 0.86) {
        ctx.strokeStyle = 'rgba(0,0,0,0.30)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2, y + 3, T - 5, T - 7);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x + 2, y + 3, T - 5, T - 7);
      }

      // Cracks.
      if (th(t.c, t.r, 3) > 0.78) {
        ctx.strokeStyle = 'rgba(0,0,0,0.34)';
        ctx.lineWidth = 1;
        const sxp = x + th(t.c, t.r, 4) * T;
        ctx.beginPath();
        ctx.moveTo(sxp, y);
        ctx.lineTo(sxp + (th(t.c, t.r, 5) - 0.5) * 12, y + T * 0.45);
        ctx.lineTo(sxp + (th(t.c, t.r, 6) - 0.5) * 20, y + T);
        ctx.stroke();
      }

      // Asphalt joints — row-alternating vertical offset so the courses
      // stagger like real paving (Jandé's `vo` trick, index.html:4713).
      ctx.strokeStyle = 'rgba(0,0,0,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + T * 0.5);
      ctx.lineTo(x + T, y + T * 0.5);
      const vo = t.r % 2 === 0 ? T * 0.5 : 0;
      ctx.moveTo(x + vo, y);
      ctx.lineTo(x + vo, y + T);
      ctx.stroke();

      if (isTop) {
        // SIDEWALK CAP — the light concrete band the reference shows at
        // street level, with panel joints and per-slab tonal variation.
        const cap = Math.round(T * 0.28);
        const wear = th(t.c, t.r, 11);
        const sg = ctx.createLinearGradient(x, y, x, y + cap);
        sg.addColorStop(0, wear > 0.5 ? SIDEWALK_LIT : SIDEWALK);
        sg.addColorStop(1, SIDEWALK);
        ctx.fillStyle = sg;
        ctx.fillRect(x, y, T, cap);

        // concrete grain
        for (let i = 0; i < 8; i++) {
          const px = x + th(t.c, t.r, i + 200) * T;
          const py = y + th(t.c, t.r, i + 240) * cap;
          ctx.fillStyle = th(t.c, t.r, i + 280) > 0.5
            ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
          ctx.fillRect(px, py, 1.2, 1.2);
        }

        // expansion joint every other slab
        if (t.c % 2 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.26)';
          ctx.fillRect(x, y, 1.5, cap);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(x + 1.5, y, 1, cap);
        }

        // storm drain grate set into the curb line, occasionally
        if (th(t.c, t.r, 17) > 0.93) {
          ctx.fillStyle = '#1c1d20';
          ctx.fillRect(x + 4, y + cap - 2, T - 8, 5);
          ctx.fillStyle = 'rgba(150,155,165,0.5)';
          for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 6, y + cap - 2, 2, 5);
        }

        // RAKED CAP — the street as a plane tilting toward camera, not a
        // flat band. The far edge of the sidewalk catches more of the sky and
        // sits in slightly cooler light than the near edge; the near edge is
        // warmer and darker because it is turning down toward the kerb. It is
        // a few pixels of gradient, and it is what stops the asphalt reading
        // as a painted stripe. It is also the surface a car would later have
        // to look like it is driving ALONG rather than across.
        const rake = ctx.createLinearGradient(x, y, x, y + cap);
        rake.addColorStop(0, 'rgba(188,204,226,0.16)');
        rake.addColorStop(0.35, 'rgba(255,255,255,0.03)');
        rake.addColorStop(1, 'rgba(0,0,0,0.16)');
        ctx.fillStyle = rake;
        ctx.fillRect(x, y, T, cap);

        // wet sheen along the top edge
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x, y, T, 1.5);

        // standing water catching the streetlight — these streets are wet
        // in every reference image
        if (th(t.c, t.r, 23) > 0.80) {
          const pw = T * (0.4 + th(t.c, t.r, 24) * 0.5);
          const pxo = x + th(t.c, t.r, 25) * (T - pw);
          const pg = ctx.createLinearGradient(pxo, y, pxo, y + cap);
          pg.addColorStop(0, 'rgba(180,205,235,0.22)');
          pg.addColorStop(1, 'rgba(180,205,235,0.04)');
          ctx.fillStyle = pg;
          ctx.fillRect(pxo, y + 1.5, pw, cap - 2);
        }

        // CURB lip under the sidewalk band
        ctx.fillStyle = CURB;
        ctx.fillRect(x, y + cap, T, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x, y + cap, T, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        ctx.fillRect(x, y + cap + 3, T, 2);
      }

      // 2.5D front face — floating platforms only (a tile with nothing
      // above AND nothing below).
      if (isTop && isBtm) {
        const fy = y + T;
        const fg = ctx.createLinearGradient(x, fy, x, fy + FRONT_FACE_H);
        fg.addColorStop(0, 'rgba(70,72,80,0.95)');
        fg.addColorStop(0.55, 'rgba(46,47,53,0.85)');
        fg.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = fg;
        ctx.fillRect(x, fy, T, FRONT_FACE_H);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, fy + FRONT_FACE_H, T, 4); // cast shadow
      }

      if (isTop && isL) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y, 4, T);
      }
      if (isTop && isR) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + T - 4, y, 4, T);
      }

      // CUT FACE on the lowest drawn ground row — without it the column
      // visibly hangs in mid-air over the undercroft.
      if (t.t === 'G' && t.r === FLOOR_R + SLAB_R - 1) {
        const cg = ctx.createLinearGradient(x, y + T - 12, x, y + T);
        cg.addColorStop(0, 'rgba(0,0,0,0)');
        cg.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = cg;
        ctx.fillRect(x, y + T - 12, T, 12);
      }
    }
  }

  // ── sprites ──────────────────────────────────────────────────────────
  // Size off the collision box and the MEASURED fit metadata in the atlas,
  // preserving the source aspect ratio. The previous version hardcoded
  // draw dimensions, which squashed Will Hill to 58% width and stretched
  // the enemy 15% too wide.
  // Missing-clip degradation lives in core/animate.js, so the frame the
  // renderer draws and the frame count the animator ticks against can never
  // come from different animations.

  // WHERE A SPRITE LANDS ON SCREEN, as one function.
  //
  // Split out of drawSprite because anything drawn ON a character — a bag in
  // a hand, and whatever comes after it — has to be placed against the DRAWN
  // figure, not against the collider. Those are very different boxes: an
  // enemy's collider is 30x67 while its sprite draws about 120x137, so a bag
  // positioned off `e.w`/`e.h` lands low and too near the centre line. That
  // is exactly why the carried money bags sat down by their legs.
  function spriteBox(atlas, entity, colliderH, charScaleH) {
    const [cellW, cellH] = atlas.frameSize;
    const fit = atlas.fitRef || { h: 1, b: 1 };
    const drawH = charScaleH / fit.h;
    const drawW = cellW * (drawH / cellH);
    const plant = atlas.anchor === 'low' ? (fit.bLow || fit.b) : fit.b;
    const feetY = entity.y + colliderH + PLANT_DEPTH;
    const box = { drawW, drawH, dx: entity.x + entity.w / 2 - drawW / 2,
                  dy: feetY - drawH * plant };
    // DEV ONLY — publish the rect actually used, so a verification pass can
    // read where a character IS rather than re-deriving it from the atlas and
    // hoping the two agree. Three attempts to compute "how tall does he look"
    // off the sheet disagreed with the screen, because the answer depends on
    // the clip's own fit, its anchor, and PLANT_DEPTH all at once — which is
    // exactly the sum this function already does.
    if (import.meta.env.DEV) entity.__box = box;
    return box;
  }

  function drawSprite(image, atlas, entity, colliderH, charScaleH, flipX, alpha, stage) {
    const anim = resolveClip(atlas, entity.anim);
    if (!anim || !image) return;
    const [cellW, cellH] = atlas.frameSize;
    const fit = atlas.fitRef || { h: 1, b: 1 };

    const drawH = charScaleH / fit.h; // cell height such that the character reads at charScaleH
    const scale = drawH / cellH;
    const drawW = cellW * scale; // aspect preserved

    // Anchor on the lowest pixel for a true side profile, on the two-foot
    // midpoint for the isometric sheets. See PLANT_DEPTH in world/scale.js.
    //
    // `ownFit` clips plant on their OWN lowest pixel rather than the standing
    // reference's — see the note on groundFit in tools/compose_player_sheet.py.
    // Only the size (drawH) still comes from fitRef, because it must: the
    // sheet is one camera at one distance, so a man lying down is drawn at the
    // same scale as the same man standing up, and reading his height off a
    // clip where he is horizontal would blow him up to twice life size.
    const anchorFit = anim.ownFit && anim.fit ? anim.fit : fit;
    const plant = atlas.anchor === 'low' ? (anchorFit.bLow || anchorFit.b) : anchorFit.b;
    // What this sheet's own anchor already sinks the contact pixel by, and
    // the top-up needed to reach PLANT_DEPTH exactly. Measured against the
    // SAME fit `plant` came from — mixing the two makes the term non-zero on
    // an anchor:'low' sheet, where by construction it must cancel, and the
    // clip ends up floating by exactly the amount this was meant to remove.
    const anchorSink = drawH * ((anchorFit.bLow || anchorFit.b) - plant);
    const feetY = entity.y + colliderH + (PLANT_DEPTH - anchorSink);
    const dx = entity.x + entity.w / 2 - drawW / 2;
    const dy = feetY - drawH * plant;
    // DEV ONLY — publish the rect actually used. Three separate attempts to
    // compute "how tall does this character look" off the atlas disagreed with
    // the screen, because the answer depends on the clip's own fit, the
    // anchor, anchorSink and PLANT_DEPTH all at once — which is exactly the
    // sum performed here. Reading it back beats re-deriving it.
    if (import.meta.env.DEV) entity.__box = { dx, dy, drawW, drawH, feetY };

    // Frames flow across the sheet as a grid rather than one row per clip, so
    // each animation can be its own length. `start` is the linear index the
    // clip begins at; `row` is the old uniform layout, still used by the
    // enemy sheets.
    const col = Math.floor(entity.frame) % anim.frameCount;
    const idx = anim.start !== undefined ? anim.start + col : anim.row * atlas.cols + col;
    const sx = (idx % atlas.cols) * cellW;
    const sy = Math.floor(idx / atlas.cols) * cellH;

    lighting.drawLitSprite(
      image, sx, sy, cellW, cellH,
      dx, dy, drawW, drawH,
      flipX, stage, entity.x + entity.w / 2, alpha,
    );
  }

  // Champagne aura. NINE seconds of invulnerability (CHAMPAGNE_SECONDS in
  // entities/player.js — it was thirty, which is a very long time to be
  // untouchable in a game whose whole tension is three touches) is still long
  // enough to leave
  // the player guessing about, and the HUD timer alone is not enough — your
  // eyes are on the character, not the corner of the screen. So the state is
  // drawn ON him: a warm pulsing bloom, a brighter core, and a few motes
  // orbiting. It fades out over the last two seconds so the power running out
  // is something you see coming rather than something you discover by dying.
  // How much taller he stands while the champagne is up. The brief was Goku
  // going Super Saiyan, and the thing that sells that transformation is not
  // the glow — it is that the character gets BIGGER. Exported so the draw
  // call can scale him by the same number the aura is sized against.
  const POWER_GROWTH = 0.30;   // +30% height at full power

  // ── THE GROW, AND WHY IT STUTTERS ────────────────────────────────────
  //
  // "I would like for them to kind of see the detail of him growing, almost
  // like Mario." A smooth 320ms ease is a perfectly good transition and it is
  // the wrong reference: what makes Mario's mushroom read is that he does NOT
  // ease. He snaps between the two sizes several times in a fifth of a second
  // each, and the flicker is what your eye reads as "something happened to
  // him" rather than "the camera moved a bit closer".
  //
  // So the first 560ms is four hard steps — small, big, small, big — and only
  // then does he settle. Hard, not eased: an interpolated stutter is a wobble,
  // and a wobble reads as a bug.
  //
  // The collapse at the far end stays smooth. Growing is an event you want
  // noticed; running out is a warning you want to feel coming, and the aura's
  // own FADE_MS is already doing that job beside it.
  const GROW_STEPS = [0, 1, 0, 1];   // small / big / small / big
  const GROW_STEP_MS = 140;          // 4 x 140 = 560ms of pop
  const GROW_MS = GROW_STEPS.length * GROW_STEP_MS;

  function powerScale(msLeft, totalMs = CHAMPAGNE_SECONDS * 1000) {
    if (msLeft <= 0) return 1;
    // CLAMPED, because `since` is a subtraction and callers do not all own
    // both ends of it. A window granted for longer than totalMs makes it
    // negative, the floor divide makes the index negative, GROW_STEPS returns
    // undefined and the scale comes out NaN — which is a sprite that vanishes,
    // not a sprite that looks wrong.
    const since = Math.max(0, totalMs - msLeft);
    const rampOut = Math.min(1, msLeft / 700);
    if (since < GROW_MS && rampOut >= 1) {
      const step = Math.min(GROW_STEPS.length - 1, Math.floor(since / GROW_STEP_MS));
      return 1 + POWER_GROWTH * GROW_STEPS[step];
    }
    return 1 + POWER_GROWTH * rampOut;
  }

  // CHAMPAGNE AURA — Super Saiyan.
  //
  // The first version was a modest bloom at 0.95 of his height with five
  // motes drifting around it. The champagne window is the
  // biggest thing that happens in this game and it looked like a warm
  // streetlight. This is the transformation read instead: a tall column of
  // flame licking UPWARD past his head, a hard white core, ground light
  // under his feet, and sparks rising rather than orbiting.
  // FADE_MS — how long before expiry the aura starts dying back, so running
  // out is something you SEE coming rather than discover by being hit. 2000
  // was right against a 30s power-up and is 22% of a 9s one; 1100 keeps the
  // warning without spending an eighth of the effect dimming.
  const FADE_MS = 1100;

  function drawPowerAura(p, tick, msLeft, drawH) {
    const fade = Math.min(1, msLeft / FADE_MS);
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;
    const pulse = 0.88 + 0.12 * Math.sin(tick * 0.19);
    // OFF THE DRAWN BODY, NOT THE COLLIDER. This was the whole bug behind
    // "it looks like he just added some sparkly shit behind him": every
    // measurement here was a multiple of p.h, the 86-unit COLLISION box,
    // while Will Hill is DRAWN 170 units tall. So the bright centre of the
    // column landed at feet-78 — mid-thigh on the figure you can actually
    // see — and the glow read as something happening down behind his legs
    // rather than something he is standing inside.
    const H = drawH || p.h * 1.97;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // THE COLUMN. Taller than it is wide and biased upward — an aura that is
    // as wide as it is tall reads as a lamp, and the vertical bias is the
    // whole silhouette of a power-up. Centred at chest height and running
    // well past the crown, which is what the client asked for: "high enough
    // to be a little above his head".
    const colH = H * 1.62 * pulse;
    const colW = p.w * 3.4;
    const ccy = feet - H * 0.66;
    const g = ctx.createRadialGradient(cx, ccy, colW * 0.06, cx, ccy, colH * 0.62);
    g.addColorStop(0, `rgba(255,254,240,${(0.95 * fade).toFixed(3)})`);
    g.addColorStop(0.18, `rgba(255,240,180,${(0.72 * fade).toFixed(3)})`);
    g.addColorStop(0.42, `rgba(255,206,96,${(0.40 * fade).toFixed(3)})`);
    g.addColorStop(0.72, `rgba(255,164,40,${(0.16 * fade).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.save();
    ctx.translate(cx, ccy);
    ctx.scale(colW / colH, 1);         // squeeze horizontally into a column
    ctx.fillStyle = g;
    ctx.translate(-cx, -ccy);
    ctx.fillRect(cx - colH, ccy - colH, colH * 2, colH * 2);
    ctx.restore();

    // FLAME LICKS climbing past his head. Each is a tapered spike whose
    // height beats on its own phase, so the top edge of the aura is always
    // moving — a static outline is what made the old one read as a gradient.
    const licks = 7;
    for (let i = 0; i < licks; i++) {
      const ph = tick * 0.16 + i * 2.1;
      const lx = cx + (i / (licks - 1) - 0.5) * p.w * 2.2;
      const baseY = feet - p.h * 0.12;
      // Reaching 1.3-2.4 body heights, so the top of the aura is well ABOVE
      // his head. At 0.55-1.1 they stopped at his shoulders and the whole
      // thing read as a lamp he was standing next to.
      const lh = p.h * (1.30 + 1.10 * Math.abs(Math.sin(ph)));
      const lw = p.w * (0.34 + 0.12 * Math.sin(ph * 1.7));
      ctx.beginPath();
      ctx.moveTo(lx - lw / 2, baseY);
      ctx.quadraticCurveTo(lx - lw * 0.18, baseY - lh * 0.6, lx, baseY - lh);
      ctx.quadraticCurveTo(lx + lw * 0.18, baseY - lh * 0.6, lx + lw / 2, baseY);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,236,166,${(0.30 * fade).toFixed(3)})`;
      ctx.fill();
    }

    // HARD CORE — a bright sheath hugging the body. This is what stops the
    // whole thing reading as fog: something in it has to be nearly white.
    const core = ctx.createRadialGradient(cx, p.y + p.h * 0.42, 0, cx, p.y + p.h * 0.42, p.h * 0.55);
    core.addColorStop(0, `rgba(255,255,250,${(0.55 * fade).toFixed(3)})`);
    core.addColorStop(0.5, `rgba(255,246,208,${(0.26 * fade).toFixed(3)})`);
    core.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = core;
    ctx.fillRect(cx - p.h * 0.55, p.y - p.h * 0.15, p.h * 1.1, p.h * 1.1);

    // GROUND LIGHT. He is a light source now, so the pavement under him has
    // to know about it — without this he floats in his own glow.
    const gl = ctx.createRadialGradient(cx, feet, 0, cx, feet, p.w * 2.6);
    gl.addColorStop(0, `rgba(255,222,140,${(0.52 * fade).toFixed(3)})`);
    gl.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(cx - p.w * 2.6, feet - p.w * 1.0, p.w * 5.2, p.w * 2.0);

    // SPARKS RISING, not orbiting. Debris pulled up off the ground by the
    // column is the other half of the Super Saiyan read; motes circling on
    // ellipses looked like fairy dust.
    for (let i = 0; i < 12; i++) {
      const life = ((tick * (1.7 + (i % 4) * 0.6) + i * 97) % 120) / 120;
      const sx = cx + Math.sin(i * 2.4 + tick * 0.04) * p.w * 1.5;
      const sy = feet - life * p.h * 2.0;
      const sr = (1.4 + (i % 3) * 0.7) * (1 - life * 0.6);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3.2);
      sg.addColorStop(0, `rgba(255,252,225,${((1 - life) * 0.9 * fade).toFixed(3)})`);
      sg.addColorStop(1, 'rgba(255,206,110,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - sr * 3.2, sy - sr * 3.2, sr * 6.4, sr * 6.4);
    }
    ctx.restore();
  }

  // The half of the aura that goes OVER him. Everything in drawPowerAura is
  // behind the sprite, and a glow that is entirely behind a character reads
  // as a light he is standing in front of, not one he is giving off. This is
  // the wrap: a hot sheath on the body itself and sparks crossing in front.
  function drawPowerAuraFront(p, tick, msLeft, drawH) {
    const fade = Math.min(1, msLeft / FADE_MS);
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;
    const H = drawH || p.h * 1.97;
    // Centred on the drawn torso for the same reason as the column above.
    const sy = feet - H * 0.55;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const sheath = ctx.createRadialGradient(cx, sy, 0, cx, sy, H * 0.5);
    sheath.addColorStop(0, `rgba(255,250,215,${(0.26 * fade).toFixed(3)})`);
    sheath.addColorStop(0.55, `rgba(255,224,130,${(0.12 * fade).toFixed(3)})`);
    sheath.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = sheath;
    ctx.fillRect(cx - H * 0.5, sy - H * 0.5, H, H);

    for (let i = 0; i < 6; i++) {
      const life = ((tick * (2.1 + (i % 3) * 0.8) + i * 61) % 100) / 100;
      const sx = cx + Math.sin(i * 3.1 + tick * 0.06) * p.w * 0.9;
      const sy = feet - life * p.h * 1.9;
      const sr = (1.2 + (i % 2) * 0.8) * (1 - life * 0.5);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3);
      sg.addColorStop(0, `rgba(255,255,240,${((1 - life) * 0.95 * fade).toFixed(3)})`);
      sg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
    }
    ctx.restore();
  }

  function drawPlayer(p, image, atlas, stage, tick = 0) {
    lighting.drawCastShadow(p, p.h, 17);
    const msLeft = p.invulnerableUntil - Date.now();
    // The aura is sized and placed off his DRAWN height, not his collider.
    // Same growth factor the sprite gets, so the two stay locked together.
    if (msLeft > 0) drawPowerAura(p, tick, msLeft, CHAR_DRAW_H * powerScale(msLeft));
    if (p.inv > 0 && Math.floor(p.inv / 4) % 2 === 0) return; // i-frame flicker
    // HE GROWS. Only the DRAWN height scales — the collider stays exactly as
    // it was, so the power-up changes how he reads and never how he fits
    // through a gap or where a hitbox lands. drawSprite anchors on the feet,
    // so the extra height goes upward off the pavement rather than sinking
    // him into it.
    drawSprite(image, atlas, p, p.h, CHAR_DRAW_H * powerScale(msLeft),
      p.faceL, null, stage);
    if (msLeft > 0) drawPowerAuraFront(p, tick, msLeft, CHAR_DRAW_H * powerScale(msLeft));
  }

  function drawEnemy(e, image, atlas, stage) {
    lighting.drawCastShadow(e, e.h, 15);
    // Enemies are people too — scale them off their own collider by the
    // same character ratio so they read as human-sized next to Will Hill.
    // Facing normally comes from travel direction, but a stomper who has
    // ARRIVED has vx 0, so everyone ends up facing right — including the one
    // standing to the RIGHT of the body, who then stomps away from him. While
    // he is stationary in a slot, the slot's side decides which way he looks.
    // Only while stationary: he still faces his travel direction walking in,
    // and again running off with the money, which is the way he is going.
    const flip = e.stomping && e.stompSlot && e.vx === 0 ? e.stompSlot.flip : e.vx < 0;
    drawSprite(image, atlas, e, e.h, e.charDrawH, flip, e.alive ? null : 0.9, stage);
  }

  // ── pickups / hazards ────────────────────────────────────────────────
  // Pickups are AutoSprite-generated art (tools/compose_props.py), drawn
  // with a soft glow so they read against the dark street.
  // `msLeft` is the champagne remaining, or 0. See the note on the scale below.
  function drawPickup(item, img, tick, glow, msLeft = 0) {
    if (item.got || !img) return;
    const bob = Math.sin(tick * 0.055 + item.x * 0.01) * 3;
    const y = item.y + bob;
    // ── THE BAGS GROW WITH HIM ──────────────────────────────────────────
    //
    // Client: "the bags should grow and downsize the same as Will Hill does."
    //
    // Same powerScale, so it is the same curve and not a copy of it — the
    // Mario stutter on the way in, the settle at +30%, the ramp out over the
    // last 700ms. They swell exactly when they start paying double and shrink
    // back exactly when that stops, which makes the multiplier something you
    // can SEE on the street rather than a number you notice afterwards on the
    // HUD.
    //
    // GROWN ABOUT THE FOOT, not the centre. Scaling around the middle lifts a
    // bag off the pavement by half the gain and it reads as floating; these
    // sit on the ground and the shadow under them is drawn to the same spot.
    const ps = powerScale(msLeft);
    const gw = item.w * ps;
    const gh = item.h * ps;
    const gx = item.x - (gw - item.w) / 2;
    const gy = y - (gh - item.h);

    // Anything that occludes light casts a shadow — pickups included. Same
    // practical drives it as the characters', so a bag's shadow leans away
    // from the same lamp theirs does, and the bob lifts the shadow off the
    // ground the way a real one would.
    lighting.drawPropShadow(item, y, bob);

    ctx.save();
    const g = ctx.createRadialGradient(
      gx + gw / 2, gy + gh / 2, 1,
      gx + gw / 2, gy + gh / 2, gh * 0.85,
    );
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - gh, gy - gh * 0.4, gw + gh * 2, gh * 1.8);
    ctx.drawImage(img, gx, gy, gw, gh);
    ctx.restore();
  }

  // CHARLIE BROWN DUST — the puff under a boot during the knockdown.
  //
  // Classic newspaper-cartoon scuffle dust: not a soft airbrushed cloud but a
  // LOBED outline, a few round bumps around a centre with a visible drawn
  // edge. So each puff is five overlapping circles in a rosette plus a
  // stroked rim, and the whole thing fades out in about a third of a second.
  // Drawn inside the camera transform, so these are world coordinates.
  function drawDust(dust) {
    for (const d of dust) {
      const k = d.life / d.max;          // 0 -> 1 over its life
      const a = (1 - k) * (1 - k) * 0.62; // fades off fast at the end
      if (a <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = a;
      // Lobes. The seed keeps each puff's bumps stable frame to frame, so a
      // puff does not shimmer as it expands.
      ctx.fillStyle = 'rgba(214,206,190,1)';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = d.seed + (i / 5) * Math.PI * 2;
        const lr = d.r * (0.52 + 0.16 * Math.sin(d.seed * 3 + i));
        ctx.moveTo(d.x + Math.cos(ang) * d.r * 0.5 + lr, d.y + Math.sin(ang) * d.r * 0.32);
        ctx.arc(d.x + Math.cos(ang) * d.r * 0.5, d.y + Math.sin(ang) * d.r * 0.32,
                lr, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = 'rgba(120,112,100,1)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // The getaway — a bag of your money in the fleeing enemy's hand. The bag is
  // the prop the game already uses for pickups, drawn small and bobbing with
  // the walk so it reads as carried rather than stuck to them.
  // IN THE HAND, not by the ankles.
  //
  // HAND_Y and HAND_X are measured off the enemy walk sprite, not guessed: the
  // figure occupies y 6..247 of a 252px cell, and scanning that silhouette
  // band by band puts the widest point below the shoulders — the wrist — at
  // 0.55 of the figure's height, reaching 52px out from centre in a 222px
  // cell. Everything here hangs off those two numbers and off spriteBox, so
  // the bag tracks the drawn figure at any scale.
  // 0.46, not the 0.552 the first scan suggested. The band scan reported its
  // widest point below the shoulders at 0.50-0.60, but that band is the hip;
  // the FIST is the 0.38-0.48 band, which measures nearly as wide (half-width
  // 54px against 55) because these sprites stand with their hands up in a
  // guard. Hanging the bag off the hip put it at his thigh, which is most of
  // the way back to the problem being fixed.
  const HAND_Y = 0.46;    // down the drawn cell, at the fist
  const HAND_X = 0.225;   // out from the cell's centre line
  function drawCarriedBag(e, img, atlas, tick = 0) {
    if (!img || !atlas) return;
    const box = spriteBox(atlas, e, e.h, e.charDrawH);
    const h = e.charDrawH * 0.24;
    const w = h * (162 / 168);
    const side = e.vx < 0 ? -1 : 1;
    // Swings a little as he runs, from the wrist rather than bobbing in place.
    const swing = Math.sin((tick + e.x) * 0.22) * 2.2;
    const handX = box.dx + box.drawW * (0.5 + side * HAND_X) + swing;
    const handY = box.dy + box.drawH * HAND_Y;
    // The grip: a couple of pixels of neck above the bag so it reads as held
    // rather than stuck to him.
    ctx.fillStyle = 'rgba(60,44,26,0.9)';
    ctx.fillRect(handX - 1.5, handY - 3, 3, 5);
    ctx.drawImage(img, handX - w / 2, handY + swing * 0.2, w, h);
  }

  // ── PIT MOUTHS ───────────────────────────────────────────────────────
  //
  // THE HOLES THAT KILL YOU MUST NOT LOOK LIKE THE STREET THAT DOESN'T.
  //
  // Until this existed, a pit was drawn by simply not drawing tiles. The
  // paving ran along and then stopped, with no lip, no edge, no warning —
  // and because the undercroft behind it is itself a dim brown-grey section,
  // the gap read as a slightly darker stretch of road. The client's note was
  // "make them very very apparent that it's separate from the street which is
  // safe to walk on", and the honest reading of that is that absence of
  // drawing is not a drawing. A hole needs to be rendered.
  //
  // Four cues, strongest first — any one of them alone can be missed at a
  // glance while running, and this has to survive a glance:
  //
  //   1. HAZARD CHEVRONS painted on the last safe slab either side. Yellow
  //      and black diagonals are the one marking every person alive reads as
  //      "not here" without thinking about it, and they sit ON the safe
  //      ground, which is precisely the distinction being drawn.
  //   2. A BROKEN LIP: the slab does not end, it SHEARS. Jagged concrete,
  //      exposed aggregate, rebar bent out over the void.
  //   3. A THROAT that goes to true black. The undercroft is visible below,
  //      so without this the eye reads "floor down there" instead of "drop".
  //   4. A RED WARNING GLOW licking the rim, because at night on a wet
  //      street that is what a barricade lamp does, and it separates the
  //      hole from every other dark thing in the frame.
  function drawPitMouths(map, camera, isSolidAt, genC, under) {
    const c0 = Math.max(0, Math.floor(camera.x / T) - 2);
    // Clamp to the generation frontier. A column beyond it has no tiles
    // simply because it does not exist yet, and treating that as a hole
    // paints a pit mouth across the whole un-generated world.
    const c1 = Math.min(genC - 1, Math.floor((camera.x + camera.vw) / T) + 2);

    let c = c0;
    while (c <= c1) {
      if (isSolidAt(c, FLOOR_R)) { c++; continue; }
      let end = c;
      while (end + 1 <= c1 && !isSolidAt(end + 1, FLOOR_R)) end++;
      drawOnePitMouth(c, end, under);
      c = end + 1;
    }
  }

  function drawOnePitMouth(cL, cR, under) {
    const x0 = cL * T;
    const x1 = (cR + 1) * T;
    const y = FLOOR_R * T;
    const slab = SLAB_R * T;
    const w = x1 - x0;

    ctx.save();

    // ── 0. THE SECTION, CARRIED UP INTO THE SLAB BAND ────────────────────
    //
    // ⚠️ WITHOUT THIS THE BOTTOM OF EVERY HOLE IS SKY, and in daylight it is
    // vivid. The undercroft is drawn from groundY + slabPx DOWNWARD, so the
    // thickness of the road itself is a band nothing behind the world covers.
    // On solid ground drawTiles fills it with paving. Over a hole nothing did,
    // and the only thing left behind the mouth was the backdrop — which down
    // there is the sky gradient. The throat below eases to 0.20 alpha by the
    // bottom of the slab precisely so the section reads through it, and there
    // was no section up here to read: measured on all four stages at midday,
    // the inside of a hole came out rgb(30,70,122), as blue as the sky above
    // it (tools/harness/pitsky.mjs, which reports it as blueness rather than
    // brightness because a hole is allowed to be dark and is not allowed to be
    // blue).
    //
    // The honest fix is not more black — it is the thing that is actually
    // there. A hole in a road is a hole through the road's own layers, so the
    // mouth is backed with the section's colours in the order you would hit
    // them digging: wearing course, aggregate base, compacted fill, clay. Same
    // palette the undercroft uses below the slab, so the two join instead of
    // meeting at a line, and OPAQUE, so no gradient's leftover alpha can let
    // the sky back in.
    if (under) {
      const sec = ctx.createLinearGradient(0, y - 2, 0, y + slab);
      sec.addColorStop(0, under.asphalt);
      sec.addColorStop(0.20, under.base);
      sec.addColorStop(0.58, under.fill);
      sec.addColorStop(1, under.mid);
      ctx.fillStyle = sec;
      ctx.fillRect(x0, y - 2, w, slab + 2);
    }

    // 3. THE THROAT. Opaque black at the top of the drop, easing out by the
    // bottom of the drawn slab so the section behind it reads below.
    const th_ = ctx.createLinearGradient(0, y - 2, 0, y + slab);
    th_.addColorStop(0, 'rgba(0,0,0,0.97)');
    th_.addColorStop(0.45, 'rgba(0,0,0,0.86)');
    th_.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = th_;
    ctx.fillRect(x0, y - 2, w, slab);

    // The far wall of the shaft, caught by what light gets in. Without one
    // vertical surface in there it is a flat black rectangle, not a hole.
    ctx.fillStyle = 'rgba(58,54,50,0.55)';
    ctx.fillRect(x0 + 3, y + 4, w - 6, Math.min(slab * 0.30, 22));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x0 + 3, y + 4 + Math.min(slab * 0.30, 22) - 3, w - 6, 3);

    // 2. BROKEN LIPS. Each side shears into the void: a jagged tongue of
    // concrete over darkness, aggregate along the fracture, and rebar.
    for (const side of [-1, 1]) {
      const lipX = side < 0 ? x0 : x1;
      const cap = Math.round(T * 0.28);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lipX, y);
      // Jagged overhang reaching OUT over the hole, deterministic per column
      // so it never shimmers as the camera moves.
      const reach = 9;
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const jx = lipX - side * t * reach;
        const jy = y + t * (cap + 5) + (th(cL + cR, i, side + 3) - 0.5) * 5;
        ctx.lineTo(jx, jy);
      }
      ctx.lineTo(lipX, y + cap + 7);
      ctx.closePath();
      ctx.fillStyle = SIDEWALK;
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(lipX - (side < 0 ? reach : 0), y + cap + 4, reach, 3);
      ctx.restore();

      // Exposed aggregate along the fracture face.
      for (let i = 0; i < 9; i++) {
        const ax = lipX - side * th(cL, i, 11) * reach;
        const ay = y + 2 + th(cR, i, 13) * (cap + 6);
        ctx.fillStyle = th(cL, i, 17) > 0.5
          ? 'rgba(214,212,204,0.75)' : 'rgba(0,0,0,0.5)';
        ctx.fillRect(ax, ay, 2, 2);
      }

      // Rebar, bent out over the drop. Two strands is enough to say the slab
      // was reinforced and has failed; more looks like a fence.
      ctx.strokeStyle = 'rgba(120,88,60,0.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const ry = y + 5 + i * 7;
        ctx.beginPath();
        ctx.moveTo(lipX, ry);
        ctx.quadraticCurveTo(lipX - side * 9, ry + 1, lipX - side * 15, ry + 7 + i * 3);
        ctx.stroke();
      }
    }

    // 4. WARNING GLOW on the rim.
    ctx.globalCompositeOperation = 'lighter';
    for (const gx of [x0, x1]) {
      const gg = ctx.createRadialGradient(gx, y, 0, gx, y, 26);
      gg.addColorStop(0, 'rgba(255,86,54,0.34)');
      gg.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(gx - 26, y - 26, 52, 52);
    }
    ctx.globalCompositeOperation = 'source-over';

    // 1. HAZARD CHEVRONS on the last SAFE slab either side — painted on the
    // ground you can stand on, pointing at the ground you cannot.
    for (const side of [-1, 1]) {
      const sx = side < 0 ? x0 - T : x1;
      // Down the KERB FACE as well as across the walking surface. The cap is
      // only 9 world units tall, and a 9px stripe seen at 0.645 zoom on a
      // phone is six screen pixels — present, but not the "very very
      // apparent" that was asked for. Carrying it onto the vertical face
      // roughly triples the painted area and, because the face is what you
      // see edge-on as you approach, it is the part that reads first.
      const cap = Math.round(T * 0.28) + 12;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, y, T, cap);
      ctx.clip();
      ctx.fillStyle = 'rgba(232,176,26,0.85)';
      ctx.fillRect(sx, y, T, cap);
      ctx.fillStyle = 'rgba(24,22,20,0.88)';
      const band = 9;
      for (let i = -2; i < 6; i++) {
        ctx.beginPath();
        const bx = sx + i * band * 2 + (side < 0 ? 0 : band);
        ctx.moveTo(bx, y + cap);
        ctx.lineTo(bx + band, y + cap);
        ctx.lineTo(bx + band + cap, y);
        ctx.lineTo(bx + cap, y);
        ctx.closePath();
        ctx.fill();
      }
      // Worn, not freshly painted — this is a street, and a pristine
      // marking would look like UI stuck on top of the art.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(sx + th(cL, i, 29) * T, y + th(cR, i, 31) * cap, 3, 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(sx, y, T, 1.5);
      ctx.restore();
    }

    ctx.restore();
  }

  // POTHOLE — a real street hazard, sunk into the asphalt rather than a
  // spike sitting on top of it. Broken rim, dark cavity, standing water.
  function drawHazard(o) {
    const cx = o.x + o.w / 2;
    const top = o.y;
    const rx = o.w / 2;
    const ry = o.h * 0.42;

    ctx.save();

    // crumbled asphalt rim, ragged rather than a clean ellipse
    ctx.beginPath();
    const pts = 14;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const wob = 0.82 + th(Math.round(o.x), i, 31) * 0.36;
      const px = cx + Math.cos(a) * rx * wob;
      const py = top + ry + Math.sin(a) * ry * wob;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#151517';
    ctx.fill();

    // Broken asphalt rim, lit from above — this is what actually reads as
    // "hole in the road" rather than a dark smudge on it.
    ctx.strokeStyle = 'rgba(196,198,206,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // exposed aggregate around the broken edge
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = cx + Math.cos(a) * rx * 1.04;
      const py = top + ry + Math.sin(a) * ry * 1.04;
      ctx.fillStyle = 'rgba(190,192,200,0.45)';
      ctx.fillRect(px - 1, py - 1, 2.2, 2.2);
    }

    // cavity depth — darker toward the far edge
    const dg = ctx.createLinearGradient(cx, top, cx, top + o.h);
    dg.addColorStop(0, 'rgba(0,0,0,0.85)');
    dg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(cx, top + ry, rx * 0.82, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    // standing water catching the streetlight
    ctx.fillStyle = 'rgba(150,185,220,0.20)';
    ctx.beginPath();
    ctx.ellipse(cx, top + ry * 1.22, rx * 0.56, ry * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFinishLine(x, tick) {
    ctx.save();
    const top = (FLOOR_R - 9) * T;
    const h = 9 * T;
    const pulse = 0.35 + Math.sin(tick * 0.08) * 0.15;
    const g = ctx.createLinearGradient(x, top, x, top + h);
    g.addColorStop(0, `rgba(255,214,110,0)`);
    g.addColorStop(1, `rgba(255,214,110,${pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, top, 8, h);
    ctx.restore();
  }

  return {
    lighting,
    withCameraTransform,
    drawTiles,
    invalidateTiles,
    drawPitMouths,
    drawPlayer,
    drawEnemy,
    drawPickup,
    drawHazard,
    drawDust,
    drawCarriedBag,
    drawFinishLine,
  };
}
