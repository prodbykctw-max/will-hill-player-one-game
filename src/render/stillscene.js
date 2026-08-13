// STILL SCENES — the title screen and the ending screen.
//
// Both are one painting the client supplied, shown whole, with parts of it
// lifted onto cards so they can MOVE. Same idea as the stage backdrops and
// the same wind maths, but without a camera: nothing here scrolls, so there
// is no parallax to compute. The only motion is sway.
//
// WHY THE SWAY IS THE SAME FUNCTION AS THE TREES. The client asked for the
// crowd to move "like the trees", and the EAV canopy sway is already tuned to
// the thing he liked: a gust envelope on top of two out-of-phase sines, so it
// breathes rather than ticking, and a phase keyed to x so neighbouring
// sections drift out of step instead of the whole card pulsing as one mass.
// Copying the numbers would have drifted; this shares the function.
//
// A band shears ABOVE ITS PIVOT. For a tree the pivot is the trunk; for a
// crowd it is the floor they are standing on, so heads and raised arms travel
// and feet do not. That is what makes it read as people swaying rather than
// as the picture wobbling.

// One gust field, shared with render/backdrop.js's foliage pass. Two sines at
// different rates under a slow squared envelope: the envelope is what makes
// it come in waves instead of running at a constant amplitude.
export function gustAt(t, x, freq) {
  const env = 0.30 + 0.70 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.0062 + x * 0.0007 * freq), 2);
  return env * (Math.sin(t * 0.030 + x * 0.0013 * freq) + 0.40 * Math.sin(t * 0.071 + x * 0.0032 * freq));
}

const SECTIONS = 10;   // vertical slices per sway range

// Amplitudes are given as a FRACTION OF THE PAINTING'S DRAWN WIDTH, not in
// pixels. These scenes contain-fit a 1536px painting into anything from a
// 390px phone to a desktop window, so a fixed pixel amplitude that reads as a
// breath on one is a lurch on the other. `amp` in raw pixels is still honoured
// for anything that wants it.
function ampOf(bd, box) {
  return bd.ampFrac != null ? bd.ampFrac * box.dw : (bd.amp || 0);
}

export function createStillScene(ctx, canvas) {
  // Fit the whole painting on screen. CONTAIN, not cover — these images carry
  // their own layout (a title, a stats panel, a PRESS START button) and
  // cropping to fill would throw part of that off the side of the phone.
  //
  // `zoom` scales past that fit, which on a portrait phone means trimming the
  // left and right edges. Used by the title card, where the two controls
  // painted into the art land 13 screen pixels apart at plain contain-fit — a
  // gap a thumb cannot aim inside. (Zoom alone never closed that; see
  // render/title.js, where the OPTIONS word is cut off the plate and moved.)
  // `bias` slides the result vertically, -1 top to +1 bottom; the title leaves
  // it at 0 and the space below the card is the OPTIONS zone regardless.
  function fit(img, zoom = 1, bias = 0) {
    const s = Math.min(canvas.width / img.width, canvas.height / img.height) * zoom;
    const dw = img.width * s;
    const dh = img.height * s;
    const slack = (canvas.height - dh) / 2;
    return { s, dw, dh, dx: (canvas.width - dw) / 2, dy: slack + slack * bias };
  }

  // `cards`: [{ img, sway: [{ top, pivot, amp, freq, xRanges: [[a,b],...] }] }]
  // in the painting's own 0..1 coordinates.
  // `fx`, when given, is { base: {x,y,a}, cards: [{x,y,a}, ...] } indexed to
  // `cards` — a per-layer translate and fade laid over the normal draw. It
  // exists for the title's assembly intro (see title.js drawIntro): the whole
  // point of a multiplane card set is that the layers are separable, so they
  // can arrive separately too. Nothing else passes it, and with it absent this
  // function behaves exactly as it always has.
  function draw(base, cards, tick, zoom = 1, bias = 0, fx = null) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, w, h);
    if (!base || !base.width) { ctx.restore(); return null; }

    const box = fit(base, zoom, bias);

    // THE LETTERBOX IS BLACK, and that is the client's call after seeing the
    // alternative. These are 3:2 landscape paintings on a 2.17:1 portrait
    // phone, so a contain fit leaves a lot of empty screen, and two goes at
    // filling it with the painting itself — a blurred cover-fit copy, then
    // the plate's own edge rows stretched out to the frame — both failed the
    // only test that matters, which is looking at it: "it has lines in it,
    // isn't smooth, you can easily see it. It'll be better off this black."
    // He is right. Stretching six rows of a DITHERED pixel painting carries
    // the dither with it, and dither stretched vertically is a set of
    // stripes. Flat black has no artefacts to notice.
    const bfx = fx && fx.base;
    if (bfx) {
      ctx.save();
      ctx.globalAlpha = bfx.a;
      ctx.translate(bfx.x, bfx.y);
    }
    ctx.drawImage(base, box.dx, box.dy, box.dw, box.dh);
    if (bfx) ctx.restore();

    (cards || []).forEach((card, i) => {
      if (!card.sprites && (!card.img || !card.img.width)) return;
      const c = fx && fx.cards && fx.cards[i];
      // Translate rather than offset `box`: drawCard derives its sway bands and
      // its sprite wrap from the box, so moving the box would move the pivots
      // and the wrap period with it and the layer would deform on the way in.
      if (c) { ctx.save(); ctx.globalAlpha = c.a; ctx.translate(c.x, c.y); }
      drawCard(card, box, tick);
      if (c) ctx.restore();
    });
    ctx.restore();
    return box;
  }

  function drawCard(card, box, tick) {
    // TRAVELLING SPRITES — each its own cropped image, crossing the frame at
    // its own speed and wrapping round.
    //
    // This replaced a whole-card drift, which was the wrong model twice over.
    // Physically: one card can only be shifted as a unit, so the entire sky
    // slid back and forth as a sheet. And practically it barely moved — the
    // note back was that clouds should "move across the sky", travelling, not
    // breathing in place.
    //
    // The cycle is srcW + w long and the sprite's own painted x is its phase,
    // so at tick 0 every cloud is exactly where the painting put it and it
    // goes on from there. It is never in two places at once: x runs from -w
    // (just off the left) continuously to srcW (just off the right), so one
    // draw covers the whole crossing with no seam to hide.
    if (card.sprites) {
      const S = box.dw / card.srcW;
      for (const s of card.sprites) {
        if (!s.img || !s.img.width) continue;
        const P = card.srcW + s.w;
        const x = (((s.x + s.w + tick * s.speed) % P) + P) % P - s.w;
        ctx.drawImage(s.img, box.dx + x * S, box.dy + s.y * S, s.w * S, s.h * S);
      }
      return;
    }

    const bands = card.sway;
    if (!bands || !bands.length) {
      ctx.drawImage(card.img, box.dx, box.dy, box.dw, box.dh);
      return;
    }

    // Everything the sway windows do NOT reach, drawn rigid. Punched out with
    // an even-odd clip rather than drawn over: these cards have soft alpha
    // edges, and drawing a sheared copy on top of a rigid one composites that
    // edge onto itself and leaves the rigid copy showing wherever the shear
    // moved content away. Same reason the stage cards do it this way.
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.dx, box.dy, box.dw, box.dh);
    for (const bd of bands) {
      const t = box.dy + box.dh * (bd.top || 0);
      for (const [a, b] of bd.xRanges) {
        ctx.rect(box.dx + a * box.dw, t,
          (b - a) * box.dw, box.dh * bd.pivot - box.dh * (bd.top || 0));
      }
    }
    ctx.clip('evenodd');
    ctx.drawImage(card.img, box.dx, box.dy, box.dw, box.dh);
    ctx.restore();

    for (const bd of bands) {
      const bandTop = box.dy + box.dh * (bd.top || 0);
      const pivotY = box.dy + box.dh * bd.pivot;
      const bandH = Math.max(1, pivotY - bandTop);

      for (const [a, b] of bd.xRanges) {
        const rangeW = (b - a) * box.dw;
        if (rangeW <= 0) continue;
        const secW = rangeW / SECTIONS;

        const amp = ampOf(bd, box);
        for (let i = 0; i < SECTIONS; i++) {
          const dx = box.dx + a * box.dw + i * secW;
          const phase = (a * box.dw + i * secW) * 2.7 + (bd.top || 0) * 900;
          const k = amp * gustAt(tick, phase, bd.freq);

          ctx.save();
          ctx.beginPath();
          ctx.rect(dx, bandTop, secW, bandH);
          ctx.clip();
          // Shear about the pivot: zero movement at the pivot line, full `k`
          // at the top of the band, linear between. transform() takes the
          // skew as b/c terms; this is the c term (x shifted by y).
          ctx.transform(1, 0, -k / bandH, 1, (k / bandH) * pivotY, 0);
          ctx.drawImage(card.img, box.dx, box.dy, box.dw, box.dh);
          ctx.restore();
        }
      }
    }
  }

  // A PRESS START THAT BREATHES, WITHOUT REDRAWING IT.
  //
  // Both paintings carry their own PRESS START and the client asked for his
  // to be the one used, so there is no text drawn here — this is a warm
  // additive glow over the lettering he already painted, rising and falling.
  // A hard on/off blink would need the text COVERED on the off beat, which
  // means painting a rectangle of guessed background over his art; a throb
  // needs nothing but light, and reads as alive from across a room.
  //
  // `rect` is in the painting's own pixels, `srcW`/`srcH` its dimensions, so
  // the caller states where the words are in the file rather than working out
  // where they landed on screen.
  function pulsePrompt(box, rect, srcW, srcH, tick, colour = '255,206,110') {
    if (!box) return;
    const S = box.dw / srcW;
    pulseRect(box.dx + rect.x * S, box.dy + rect.y * S,
      rect.w * S, rect.h * S, tick, colour);
  }

  // The same throb, given a rect in SCREEN pixels. The title's OPTIONS is cut
  // out of the painting and re-placed below it (see render/title.js), so its
  // glow cannot be expressed as a rectangle of the plate any more.
  function pulseRect(x, y, w, h, tick, colour = '255,206,110') {
    const b = 0.5 + 0.5 * Math.sin(tick * 0.055);
    const a = 0.06 + 0.62 * b * b;   // squared, so it dwells dark and flares
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // AN ELLIPSE, NOT A DISC. These prompts are long and short — 548x62 on
    // the title — and a circular gradient sized to the longer edge spreads the
    // light over nine times the area of the words, which is how the first
    // version came out invisible: measured at a peak delta of 6 levels
    // against a 0..255 channel. Squashing the space by the box's own aspect
    // puts the falloff on the lettering.
    ctx.translate(cx, cy);
    ctx.scale(1, Math.max(0.08, h / w));
    const r = w * 0.62;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${colour},${a})`);
    g.addColorStop(0.45, `rgba(${colour},${a * 0.5})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  return { draw, fit, pulsePrompt, pulseRect };
}
