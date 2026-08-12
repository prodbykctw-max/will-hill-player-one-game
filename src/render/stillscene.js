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
  function fit(img) {
    const s = Math.min(canvas.width / img.width, canvas.height / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    return { s, dw, dh, dx: (canvas.width - dw) / 2, dy: (canvas.height - dh) / 2 };
  }

  // Stretch the painting's outermost rows/columns out to the screen edge.
  // STRIP is deliberately a few rows rather than one: a single row of a
  // dithered pixel painting carries its dither pattern, and stretching that
  // gives vertical stripes. Averaging several by drawing them squashed into
  // a 1px-tall destination would need another buffer; taking six and letting
  // them stretch keeps the gradient the painting already has.
  const STRIP = 6;
  function extendEdges(base, box, w, h) {
    const topH = Math.ceil(box.dy) + 1;
    const btmY = Math.floor(box.dy + box.dh) - 1;
    if (topH > 0) {
      ctx.drawImage(base, 0, 0, base.width, STRIP, box.dx, -1, box.dw, topH + 1);
    }
    if (btmY < h) {
      ctx.drawImage(base, 0, base.height - STRIP, base.width, STRIP,
        box.dx, btmY, box.dw, h - btmY + 1);
    }
    // Landscape: the same on the sides.
    if (box.dx > 0) {
      const lw = Math.ceil(box.dx) + 1;
      ctx.drawImage(base, 0, 0, STRIP, base.height, -1, box.dy, lw + 1, box.dh);
      const rx = Math.floor(box.dx + box.dw) - 1;
      ctx.drawImage(base, base.width - STRIP, 0, STRIP, base.height,
        rx, box.dy, w - rx + 1, box.dh);
    }
    // Sink the extension away from the art so the eye reads the band as the
    // subject and the rest as its surround, not as part of the picture.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const mid0 = Math.max(0, box.dy / h);
    const mid1 = Math.min(1, (box.dy + box.dh) / h);
    g.addColorStop(0, 'rgba(7,6,10,0.72)');
    g.addColorStop(Math.max(0, mid0 - 0.001), 'rgba(7,6,10,0.10)');
    g.addColorStop(Math.min(1, mid1 + 0.001), 'rgba(7,6,10,0.10)');
    g.addColorStop(1, 'rgba(7,6,10,0.80)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // `cards`: [{ img, sway: [{ top, pivot, amp, freq, xRanges: [[a,b],...] }] }]
  // in the painting's own 0..1 coordinates.
  function draw(base, cards, tick) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, w, h);
    if (!base || !base.width) { ctx.restore(); return null; }

    const box = fit(base);

    // FILL THE LETTERBOX WITH THE PAINTING ITSELF, TWICE OVER.
    //
    // These are 3:2 landscape paintings and the game's screen is a 2.17:1
    // portrait phone, so a contain fit puts the art in a band across the
    // middle third and leaves two thirds of the display black. That is not a
    // framing choice, it reads as a broken screen. Cropping is not the way
    // out either: filling a 2.17:1 frame from a 1.5:1 image means throwing
    // away two thirds of the WIDTH, and the title's logo alone spans 60% of
    // it.
    //
    // So the band stays, and the space around it is made of the painting:
    //
    //   1. A cover-fit copy, blurred and pushed right down into the dark. It
    //      is barely visible and it never competes with the art; its job is
    //      to make sure the edge extension below has something to sit on
    //      other than flat black.
    //   2. THE PAINTING'S OWN EDGE ROWS, STRETCHED OUT. Both of these images
    //      end in something that continues naturally — the title in open sky
    //      at the top and wet asphalt at the bottom, the ending in its own
    //      frame border. Pulling those few rows out to the screen edge reads
    //      as more sky and more street rather than as a smear, and it is what
    //      turns the letterbox into a frame.
    const cs = Math.max(w / base.width, h / base.height);
    ctx.save();
    ctx.filter = 'blur(18px) brightness(0.42) saturate(0.7)';
    ctx.drawImage(base, (w - base.width * cs) / 2, (h - base.height * cs) / 2,
      base.width * cs, base.height * cs);
    ctx.restore();
    ctx.fillStyle = 'rgba(7,6,10,0.45)';
    ctx.fillRect(0, 0, w, h);
    extendEdges(base, box, w, h);

    ctx.drawImage(base, box.dx, box.dy, box.dw, box.dh);

    for (const card of cards || []) {
      if (!card.img || !card.img.width) continue;
      drawCard(card, box, tick);
    }
    ctx.restore();
    return box;
  }

  function drawCard(card, box, tick) {
    // DRIFT — the whole card translated, nothing clipped. This is what the
    // sky does: clouds do not bend in the wind, they travel across it. It is
    // deliberately applied to the entire card rather than to bands of it,
    // because a band boundary would cut any cloud that straddled it in half
    // and slide the two halves apart.
    if (card.drift) {
      const d = card.drift;
      const ax = ampOf(d, box);
      const ay = (d.ampFracY != null ? d.ampFracY * box.dw : 0);
      // A slow sine, not the gust field: gusts come in waves, which is right
      // for something anchored and bending and wrong for something adrift.
      const k = Math.sin(tick * (d.rate || 0.0016));
      const k2 = Math.sin(tick * (d.rate || 0.0016) * 0.61 + 1.2);
      ctx.drawImage(card.img, box.dx + ax * k, box.dy + ay * k2, box.dw, box.dh);
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
    const x = box.dx + rect.x * S;
    const y = box.dy + rect.y * S;
    const w = rect.w * S;
    const h = rect.h * S;
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

  return { draw, fit, pulsePrompt };
}
