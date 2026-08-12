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

    // FILL THE LETTERBOX WITH THE PAINTING ITSELF. These are 3:2 landscape
    // images on a portrait phone, so contain-fitting leaves two thirds of the
    // screen empty — and a big black band above and below reads as a bug. A
    // cover-fit copy, blown out and pushed down into the dark, gives the
    // frame something to sit in that is made of the same picture. Cheap, and
    // it never competes with the art because it is barely visible.
    const cs = Math.max(w / base.width, h / base.height);
    ctx.save();
    ctx.filter = 'blur(18px) brightness(0.42) saturate(0.7)';
    ctx.drawImage(base, (w - base.width * cs) / 2, (h - base.height * cs) / 2,
      base.width * cs, base.height * cs);
    ctx.restore();
    ctx.fillStyle = 'rgba(7,6,10,0.45)';
    ctx.fillRect(0, 0, w, h);

    ctx.drawImage(base, box.dx, box.dy, box.dw, box.dh);

    for (const card of cards || []) {
      if (!card.img || !card.img.width) continue;
      drawCard(card, box, tick);
    }
    ctx.restore();
    return box;
  }

  function drawCard(card, box, tick) {
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

        for (let i = 0; i < SECTIONS; i++) {
          const dx = box.dx + a * box.dw + i * secW;
          const phase = (a * box.dw + i * secW) * 2.7 + (bd.top || 0) * 900;
          const k = bd.amp * gustAt(tick, phase, bd.freq);

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

  return { draw, fit };
}
