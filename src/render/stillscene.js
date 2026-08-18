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
  // ── COVER TO THE WIDTH, AND TAKE THE CROP OFF THE SKY ────────────────────
  //
  // Contain is right for a plate whose aspect is nothing like the window's —
  // the landscape title needed its black bars. The portrait plate does not: it
  // is 0.4626 against a phone's 0.4614, so at full height it already all but
  // fills the screen.
  //
  // "All but" stops being true the moment the browser keeps some height for
  // itself. Safari's URL bar turns a 430x932 window into about 430x830, and a
  // contain fit then goes HEIGHT-limited — 830 tall, 384 wide, 46px of black
  // down each side. Which is exactly what the client photographed: "needs to be
  // wider and fit the screen."
  //
  // `safe` opts a caller into filling the WIDTH instead. It is the band of
  // SOURCE rows that must stay on screen — { top, bottom } — and everything
  // outside it is the budget the crop may spend.
  //
  // ⚠️ THE CROP IS SPLIT BETWEEN TOP AND BOTTOM. It used to be bottom-anchored,
  // spending the whole budget on sky, and that is why this never worked on the
  // phone the client was actually holding. Measured on the title plate:
  //
  //   topmost title ink (black outline and all)   row  165
  //   bottom-most painted UI (OPTIONS)            row 1635
  //   spare                                       165 above, 208 below = 373
  //
  // A full-width zoom on his screen needs 350 rows. Off the top alone that is
  // 185 rows into his name — impossible, so it fell back to bars, which is what
  // he photographed. Split across BOTH ends the same 350 fits inside 373 with
  // room to spare, and every phone measured clears it:
  //
  //   iPhone SE 375x667          327 of 373
  //   iPhone 12 w/ URL bar       182
  //   15 Pro Max w/ URL bar      178
  //   his screenshot ~471x825    350
  //   12 / 15 Pro Max / Pixel 7  already fill, no crop at all
  //
  // Only tablets still bar (an iPad mini wants 545), and nothing is demoed on
  // one. NO STRETCH AND NO INVENTED PIXELS — the client turned both of those
  // down and he was right: "I want one solid image, I don't want that blurry
  // looking shit." This is his painting, whole, zoomed until it fills.
  //
  // The split is PROPORTIONAL to the spare at each end, so neither margin runs
  // out before the other and the framing stays balanced as the window changes.
  // ── THE INSTALLED APP HAS NO STATUS BAR TO SIT UNDER ─────────────────────
  //
  // Client, with a screenshot of the PWA: the top of WILL HILL: is cut off
  // behind the Dynamic Island. In the browser the same build frames
  // correctly, which is the whole clue — index.html sets
  // `apple-mobile-web-app-status-bar-style: black-translucent`, so a
  // home-screen launch puts the canvas UNDER the island and the clock, while
  // Safari does not. The fit had no idea any of the frame was obscured.
  //
  // So the obscured strip is reserved, and ONLY where it is real: in
  // standalone display mode. Applying it in the browser as well would
  // double-count an inset Safari has already accounted for and push the
  // painting down for no reason.
  //
  // Cached, because reading env() means creating a node and forcing layout,
  // and this is called every frame. Invalidated on resize, which is also when
  // a rotation or a bar appearing would change it.
  let insetCache = null;
  let insetFor = -1;
  function reservedTop() {
    if (insetFor === window.innerHeight && insetCache != null) return insetCache;
    let px = 0;
    try {
      // A dev override, so the installed-app path can be PROVED in a harness
      // instead of asserted. Playwright cannot emulate a Dynamic Island or a
      // home-screen launch, and "it should be fine now" is exactly the kind of
      // claim this project does not accept.
      if (typeof window.__safeTopOverride === 'number') {
        insetCache = window.__safeTopOverride;
        insetFor = window.innerHeight;
        return insetCache;
      }
      const standalone = (window.matchMedia
        && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true;
      if (standalone) {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;top:0;left:0;width:0;'
          + 'height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden';
        document.body.appendChild(probe);
        px = probe.getBoundingClientRect().height || 0;
        probe.remove();
      }
    } catch (_e) { px = 0; }
    insetCache = px;
    insetFor = window.innerHeight;
    return px;
  }

  function fit(img, zoom = 1, bias = 0, safe = null) {
    // ⚠️ THE RESERVED STRIP IS NOT DRAWABLE AREA — IN EITHER MODE.
    //
    // The first attempt only clamped the COVER crop, and the iPhone SE proved
    // that half-measure wrong: at 375x667 the plate fits the height exactly,
    // so the code takes the contain path, there is zero slack to give, and
    // his name still landed at y=59.7 under a 62px bar. Subtracting the
    // reserve from the available height instead makes it one rule that both
    // paths obey — cover crops against the smaller box, contain scales to the
    // smaller box, and everything is offset down past the strip.
    const reserve = safe ? reservedTop() : 0;
    const availH = Math.max(1, canvas.height - reserve);
    const contain = Math.min(canvas.width / img.width, availH / img.height);
    // ⚠️ COVER ON BOTH AXES, NOT WIDTH ALONE.
    //
    // Width-anchored cover leaves the plate SHORTER than the canvas whenever
    // the screen is proportionally taller than the painting: at 430x932 the
    // 853x1844 plate draws 929.6 tall, so 2.4px could never be covered no
    // matter where it sat, and the reserve + the 25% top margin turned that
    // into 8.8px of dead background at the head. Once #game became full-bleed
    // (index.html) that would simply have moved the client's black band from
    // the foot to the crown. Scaling by the larger of the two ratios lets the
    // painting meet both edges; the cost is horizontal crop, 1.1px on his
    // phone.
    //
    // CAPPED AT 6% over the width fit, because that cost is not bounded in
    // general — a 2.5:1 window would want 15% more scale and start eating the
    // stars, which reach to x-frac 0.035 and 0.968. Six percent closes any
    // gap up to ~56px on a phone this size, far more than the 34pt indicator
    // strip this is here for, while never trimming more than ~25px of width.
    const coverW = canvas.width / img.width;
    const coverH = canvas.height / img.height;
    const cover = Math.max(coverW, Math.min(coverH, coverW * 1.06));
    // Rows the cover crop must spend, measured against the WHOLE canvas now
    // that the plate is required to fill it — not against availH, which was
    // the old way of keeping the reserve empty. The reserve is honoured
    // below by where the safe band lands, not by leaving a strip unpainted.
    const cropRows = (img.height * cover - canvas.height) / cover;
    const spareTop = safe ? safe.top : 0;
    const spareBot = safe ? img.height - safe.bottom : 0;
    const budget = spareTop + spareBot;
    const useCover = budget > 0 && cover >= contain && cropRows <= budget;
    const s = (useCover ? cover : contain) * zoom;
    const dw = img.width * s;
    const dh = img.height * s;
    if (useCover) {
      // ⚠️ NOT A STRAIGHT spareTop:spareBot SPLIT ANY MORE. That gave the
      // margin above WILL HILL: and the margin below OPTIONS roughly equal
      // shares (44/56 on the tightest phone measured) — reasonable for the
      // sky, wrong for OPTIONS, because MUSIC has to fit ENTIRELY inside
      // whatever margin is left below it. Client, from a live screenshot on
      // his own phone: "OPTIONS needs to be up a little bit above the music
      // section." Same crop budget, same no-bars guarantee (this only moves
      // which END the existing slack is spent on, never how much of it
      // there is), just weighted so the bottom keeps most of it: whatever
      // margin survives the crop is split 25% top / 75% bottom instead of
      // proportionally, which on the tightest shape measured moves OPTIONS
      // up enough to roughly double the room musicRect has to work with.
      // ⚠️ ALL OF THE SLACK GOES TO THE BOTTOM, NOT 75% OF IT.
      //
      // This used to be a 25/75 split, bought to give the old MUSIC control a
      // few more pixels. The home page now carries a banner and a 44px control
      // row laid out from the bottom of the screen (title.js homeLayout), and
      // on an iPhone SE the measurement is unforgiving: PRESS START's painted
      // foot landed at screen y627 with only 40px of canvas below it, against
      // 98px of controls. The stack ended up drawn straight over his
      // lettering.
      //
      // Every row of slack spent above WILL HILL: is a row of pavement not
      // shown below PRESS START, and the sky above the wordmark is the one
      // part of this painting with nothing in it to lose. So the top margin
      // is zero: crop from the top as hard as the budget allows, and the
      // controls get the room.
      const leftover = Math.max(0, budget - cropRows);
      const topMargin = 0;
      const offTop = Math.max(0, Math.min(spareTop, cropRows, spareTop - topMargin));
      let dy = -offTop * s;
      // Keep the top of the safe band clear of the status bar / island. This
      // used to be done by starting the plate at `reserve`, which is no longer
      // available — the plate has to touch y=0 — so it is expressed directly:
      // move the painting DOWN until row `safe.top` clears the inset.
      if (safe && dy + safe.top * s < reserve) dy = reserve - safe.top * s;
      // ⚠️ AND THIS CLAMP IS THE WHOLE POINT: never a row of background above
      // the painting, never one below it. It runs last so it outranks the
      // inset preference — the client's instruction was "no black space", and
      // an inset that cannot be honoured without opening a gap loses.
      dy = Math.min(0, Math.max(canvas.height - dh, dy));
      return { s, dw, dh, dx: (canvas.width - dw) / 2, dy };
    }
    const slack = (availH - dh) / 2;
    return { s, dw, dh, dx: (canvas.width - dw) / 2, dy: reserve + slack + slack * bias };
  }

  // `cards`: [{ img, sway: [{ top, pivot, amp, freq, xRanges: [[a,b],...] }] }]
  // in the painting's own 0..1 coordinates.
  // `fx`, when given, is { base: {x,y,a}, cards: [{x,y,a}, ...] } indexed to
  // `cards` — a per-layer translate and fade laid over the normal draw. It
  // exists for the title's assembly intro (see title.js drawIntro): the whole
  // point of a multiplane card set is that the layers are separable, so they
  // can arrive separately too. Nothing else passes it, and with it absent this
  // function behaves exactly as it always has.
  // `underlay` is a full-frame image painted directly ON the base and UNDER
  // every card. The title's sky-fill needs exactly that slot — see the note
  // at its call site in render/title.js.
  function draw(base, cards, tick, zoom = 1, bias = 0, fx = null, safe = null,
    underlay = null) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, w, h);
    if (!base || !base.width) { ctx.restore(); return null; }

    const box = fit(base, zoom, bias, safe);

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
    if (underlay && underlay.width) {
      ctx.drawImage(underlay, box.dx, box.dy, box.dw, box.dh);
    }
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
