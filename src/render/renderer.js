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

  function drawTiles(map, camera, isSolidAt) {
    const c0 = Math.floor(camera.x / T) - 1;
    const c1 = Math.floor((camera.x + camera.vw) / T) + 1;

    for (const t of map.tiles) {
      if (t.t !== 'G' && t.t !== 'P') continue;
      if (t.c < c0 || t.c > c1) continue;
      // Below the drawn slab the undercroft shows through.
      if (t.t === 'G' && t.r >= FLOOR_R + SLAB_R) continue;

      const x = t.c * T;
      const y = t.r * T;
      const isTop = !isSolidAt(t.c, t.r - 1);
      const isL = !isSolidAt(t.c - 1, t.r);
      const isR = !isSolidAt(t.c + 1, t.r);
      const isBtm = !isSolidAt(t.c, t.r + 1);

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
  function drawSprite(image, atlas, entity, colliderH, charScaleH, flipX, alpha, stage) {
    const anim = atlas.animations[entity.anim];
    if (!anim || !image) return;
    const [cellW, cellH] = atlas.frameSize;
    const fit = atlas.fitRef || { h: 1, b: 1 };

    const drawH = charScaleH / fit.h; // cell height such that the character reads at charScaleH
    const scale = drawH / cellH;
    const drawW = cellW * scale; // aspect preserved

    // Anchor on the lowest pixel for a true side profile, on the two-foot
    // midpoint for the isometric sheets. See PLANT_DEPTH in world/scale.js.
    const plant = atlas.anchor === 'low' ? (fit.bLow || fit.b) : fit.b;
    // What this sheet's own anchor already sinks the contact pixel by, and
    // the top-up needed to reach PLANT_DEPTH exactly.
    const anchorSink = drawH * ((fit.bLow || fit.b) - plant);
    const feetY = entity.y + colliderH + (PLANT_DEPTH - anchorSink);
    const dx = entity.x + entity.w / 2 - drawW / 2;
    const dy = feetY - drawH * plant;

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

  // Champagne aura. Thirty seconds of invulnerability is a long time to leave
  // the player guessing about, and the HUD timer alone is not enough — your
  // eyes are on the character, not the corner of the screen. So the state is
  // drawn ON him: a warm pulsing bloom, a brighter core, and a few motes
  // orbiting. It fades out over the last two seconds so the power running out
  // is something you see coming rather than something you discover by dying.
  function drawPowerAura(p, tick, msLeft) {
    const fade = Math.min(1, msLeft / 2000);
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h * 0.45;
    const pulse = 0.82 + 0.18 * Math.sin(tick * 0.13);
    const r = p.h * 0.95 * pulse;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    g.addColorStop(0, `rgba(255,236,170,${(0.42 * fade).toFixed(3)})`);
    g.addColorStop(0.45, `rgba(255,196,90,${(0.17 * fade).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Motes on their own orbits — different radii and speeds, so they read as
    // circling him rather than as a spinning rigid ring.
    for (let i = 0; i < 5; i++) {
      const a = tick * (0.05 + i * 0.012) + i * 1.9;
      const orx = p.w * (0.85 + 0.22 * Math.sin(tick * 0.03 + i));
      const ory = p.h * 0.30;
      const mx = cx + Math.cos(a) * orx;
      const my = cy + Math.sin(a * 1.3) * ory;
      const mr = 1.6 + 0.9 * Math.sin(tick * 0.2 + i);
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3);
      mg.addColorStop(0, `rgba(255,248,210,${(0.85 * fade).toFixed(3)})`);
      mg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    }
    ctx.restore();
  }

  function drawPlayer(p, image, atlas, stage, tick = 0) {
    lighting.drawCastShadow(p, p.h, 17);
    const msLeft = p.invulnerableUntil - Date.now();
    if (msLeft > 0) drawPowerAura(p, tick, msLeft);
    if (p.inv > 0 && Math.floor(p.inv / 4) % 2 === 0) return; // i-frame flicker
    drawSprite(image, atlas, p, p.h, CHAR_DRAW_H, p.faceL, null, stage);
  }

  function drawEnemy(e, image, atlas, stage) {
    lighting.drawCastShadow(e, e.h, 15);
    // Enemies are people too — scale them off their own collider by the
    // same character ratio so they read as human-sized next to Will Hill.
    drawSprite(image, atlas, e, e.h, e.charDrawH, e.vx < 0, e.alive ? null : 0.9, stage);
  }

  // ── pickups / hazards ────────────────────────────────────────────────
  // Pickups are AutoSprite-generated art (tools/compose_props.py), drawn
  // with a soft glow so they read against the dark street.
  function drawPickup(item, img, tick, glow) {
    if (item.got || !img) return;
    const bob = Math.sin(tick * 0.055 + item.x * 0.01) * 3;
    const y = item.y + bob;

    // Anything that occludes light casts a shadow — pickups included. Same
    // practical drives it as the characters', so a bag's shadow leans away
    // from the same lamp theirs does, and the bob lifts the shadow off the
    // ground the way a real one would.
    lighting.drawPropShadow(item, y, bob);

    ctx.save();
    const g = ctx.createRadialGradient(
      item.x + item.w / 2, y + item.h / 2, 1,
      item.x + item.w / 2, y + item.h / 2, item.h * 0.85,
    );
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(item.x - item.h, y - item.h * 0.4, item.w + item.h * 2, item.h * 1.8);
    ctx.drawImage(img, item.x, y, item.w, item.h);
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
  function drawCarriedBag(e, img, tick = 0) {
    if (!img) return;
    const h = e.charDrawH * 0.26;
    const w = h * (162 / 168);
    const side = e.vx < 0 ? -1 : 1;
    const bob = Math.sin((tick + e.x) * 0.28) * 1.6;
    ctx.drawImage(img,
      e.x + e.w / 2 + side * (e.w * 0.42) - w / 2,
      e.y + e.h * 0.46 + bob, w, h);
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
    drawPlayer,
    drawEnemy,
    drawPickup,
    drawHazard,
    drawDust,
    drawCarriedBag,
    drawFinishLine,
  };
}
