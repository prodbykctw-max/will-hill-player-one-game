// THE MARTA MAP — the between-stage screen.
//
// Will Hill is travelling across Atlanta to his show, and the four stages are
// real places on a real transit system, so this is not an invented fantasy
// map. It is MARTA, drawn to the actual line topology, with only the four
// stations that matter picked out.
//
// GEOGRAPHY, from the real system map the client supplied:
//
//   * FIVE POINTS is the centre of everything. Both lines cross there, it is
//     where you transfer, and it is the Underground stage. That crossing is
//     also why the game has a tunnel under the street on every stage — Five
//     Points sits on top of the MARTA tunnels.
//   * The EAST-WEST line (blue/green) runs out east from Five Points through,
//     in order: Georgia State, King Memorial, Inman Park/Reynoldstown,
//     Edgewood/Candler Park, East Lake, Decatur...
//   * The NORTH-SOUTH line (red/gold) crosses at Five Points. Nothing in this
//     game is on it, so it is drawn for shape and left unlabelled.
//
// STAGE -> STATION, and none of these are guesses:
//
//   eav          East Lake                    the nearest station to EAV
//   edgewood     Edgewood/Candler Park        the stage IS the station name
//   underground  FIVE POINTS                  the stage IS the station
//   l5p          Inman Park/Reynoldstown      the nearest station to L5P
//
// The route the player takes therefore runs east-to-west into downtown and
// then back out one stop: East Lake -> Edgewood/Candler Park -> Five Points
// (transfer) -> Inman Park/Reynoldstown for the show at Criminal Records.
// Doubling back through Five Points is not a mistake in the ordering; it is
// how you would actually make that trip, because Five Points is where you
// change trains.
//
// Only the four stage stations are labelled. The client was explicit: nothing
// else needs highlighting. The intermediate stops are drawn as small dim dots
// so the line reads as a real route with distance along it rather than four
// beads on a wire.
//
// ── WHY THIS SCREEN LOOKS THE WAY IT DOES ────────────────────────────────
//
// The first version was drawn entirely out of canvas primitives: anti-aliased
// arcs for the stations, a smooth stroked line, `system-ui` for every label,
// and a tile wall generated from a sine function. The client's verdict was
// blunt and correct — "the art map is horrible, it looks like AI slop" — and
// the reason is structural, not a matter of taste. Every stage in this game
// is a real Atlanta photograph converted to night pixel art (docs/GDD.md,
// "Visual style & background references"). Vector shapes and smooth type
// cannot sit next to that; they read as a debug overlay pasted on top.
//
// So nothing here is invented artwork any more. Two rules:
//
//   1. THE BACKDROP IS THE GAME'S OWN ART. The interstitial is set at Five
//      Points, and the Underground stage plate IS Five Points, already in the
//      right style. It gets drawn as the wall of the station rather than a
//      procedural tile pattern, which makes the style match by construction
//      instead of by imitation.
//   2. EVERYTHING DRAWN ON TOP IS MADE OF PIXELS THE SAME SIZE AS THE PLATE'S.
//      Text goes through pxText() below; lines, dots and panels are whole
//      multiples of PX with hard edges and no anti-aliasing.

// Station positions are LAID OUT IN ORDER along the east arm, not to
// scale-accurate lat/long — a transit diagram is topological, which is the
// whole reason transit diagrams work. Order and adjacency are what have to be
// right, and they are.
// Labels are STACKED, not one long string. The real station names are
// "Inman Park/Reynoldstown" and "Edgewood/Candler Park", and set on one line
// they ran clean off the right edge of a 430px phone. Two lines keeps the
// real name intact and fits.
// `tier` is which height the name hangs at. The three eastern stops are
// adjacent — about 78px apart on a 430px phone — and "REYNOLDSTOWN" alone is
// wider than that, so at a single height the names overprint each other into
// an unreadable smear. Stacking them at different heights with a leader line
// down to the dot is what a real transit board does with crowded stops.
const EAST_ARM = [
  { id: 'fivepoints', label: ['FIVE POINTS'], stage: 'underground', tier: 0 },
  { id: 'gastate' },
  { id: 'king' },
  { id: 'inman', label: ['INMAN PARK', 'REYNOLDSTOWN'], stage: 'l5p', tier: 2 },
  { id: 'edgewood', label: ['EDGEWOOD', 'CANDLER PK'], stage: 'edgewood', tier: 1 },
  { id: 'eastlake', label: ['EAST LAKE'], stage: 'eav', tier: 0 },
];

// PALETTE, SAMPLED FROM THE GAME rather than picked. Measured across all four
// cut backdrops: whole-game median luminance is 17 — these are night plates,
// and the first version of this screen was far too bright and clean against
// them. The warm practicals in the art (streetlight, neon) mean #9a7443; the
// cool shadow and sky mean #09152a. Everything here is drawn from that.
const INK = '#09152a';         // cool shadow, the plates' own blue-black
const LINE = '#3f7fd6';        // MARTA blue, the one true brand colour kept
const LINE_CROSS = '#8a6a34';  // north-south line, muted to the warm practical
const DIM = '#9a7443';         // the streetlight warm
const HOT = '#ffc46b';
const PALE = '#e8eef7';

// PIXEL GRID. One "pixel" of this screen is PX device pixels, and every
// coordinate here snaps to it. Nothing may be drawn at a fractional offset —
// that is what produces the soft half-lit edges that give vector art away.
const PX = 3;
const snap = (v) => Math.round(v / PX) * PX;

export function createMartaMap(ctx, canvas) {
  // PIXEL TEXT.
  //
  // Canvas text is vector: at any size the glyph edges come out anti-aliased,
  // with grey fringes a third of a pixel wide. Against plates whose smallest
  // feature is a hard 3px block, that is the single loudest tell that this
  // screen was not drawn by the same hand as the rest of the game.
  //
  // The fix is to make the letters out of the same pixels everything else is
  // made of: render the string into an offscreen canvas at 1/PX the final
  // size, then blit it up with smoothing off. The glyph shapes come from the
  // system font, but every edge lands on the PX grid, so it reads as a
  // bitmap font cut for this screen. Alpha is thresholded on the way out,
  // because upscaling a half-transparent fringe just makes a bigger fringe.
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d', { willReadFrequently: true });

  // TEXT_SCALE is how many device pixels one text pixel is, and it is NOT PX.
  // Tying it to PX was the first attempt and it does not work: a 12px-tall
  // label divided by PX=3 asks the system font for 4px glyphs, and at 4px the
  // thin strokes of an A or an R fall below one pixel and simply vanish. The
  // rendered board read "NOW ARRI G" and "VE POINTS". Two device pixels per
  // text pixel keeps source glyphs at a legible 7px and up while still
  // producing visibly chunky, hard-edged letters.
  const TEXT_SCALE = 2;
  const MIN_SRC = 7;   // below this the font loses strokes, measured

  function pxText(str, x, y, finalH, color, align = 'left', weight = '700') {
    const src = Math.max(MIN_SRC, Math.round(finalH / TEXT_SCALE));
    const font = `${weight} ${src}px system-ui, sans-serif`;
    bctx.font = font;
    const w = Math.max(1, Math.ceil(bctx.measureText(str).width) + 2);
    const h = src + 4;
    buf.width = w; buf.height = h;
    bctx.font = font;              // resizing the canvas resets the context
    bctx.textBaseline = 'top';
    bctx.fillStyle = color;
    bctx.fillText(str, 1, 2);

    // Threshold the anti-aliasing away: faint becomes nothing, the rest
    // becomes fully solid, so upscaling cannot smear a grey fringe into a
    // three-pixel-wide one. 72 rather than 96 — the higher cut was eating
    // the thin diagonal of an N along with the fringe.
    const img = bctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 72 ? 0 : 255;
    bctx.putImageData(img, 0, 0);

    const dw = w * TEXT_SCALE;
    const dx = align === 'center' ? snap(x - dw / 2) : align === 'right' ? snap(x - dw) : snap(x);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, dx, snap(y), dw, h * TEXT_SCALE);
    return dw;
  }

  function textW(str, finalH, weight = '700') {
    const src = Math.max(MIN_SRC, Math.round(finalH / TEXT_SCALE));
    bctx.font = `${weight} ${src}px system-ui, sans-serif`;
    return (Math.ceil(bctx.measureText(str).width) + 2) * TEXT_SCALE;
  }

  // A hard-edged panel with a one-pixel bevel: lit on the top-left, shadowed
  // on the bottom-right. This is how every sign in the plates is shaded, and
  // it is the whole reason they read as objects rather than rectangles.
  function panel(x, y, w, h, fill, lit, dark) {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = lit; ctx.fillRect(x, y, w, PX); ctx.fillRect(x, y, PX, h);
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h - PX, w, PX); ctx.fillRect(x + w - PX, y, PX, h);
  }

  // Where each station sits on screen. Recomputed on every draw so it tracks
  // a resize without keeping state.
  // The BOARD rect is the single source of truth for this screen. Everything
  // else derives from it, because the first version laid the map out against
  // the canvas and the stations then ran straight off the edge of the board
  // they are supposed to be printed on.
  function board() {
    const w = canvas.width;
    const h = canvas.height;
    const bw = snap(Math.min(w * 0.92, 520));
    const bh = snap(Math.min(h * 0.31, 235));
    // Hung just BELOW the arch. At 0.30 the board's top edge cut straight
    // through the word UNDERGROUND on the plate, covering the one piece of
    // signage that says where you are.
    return { x: snap((w - bw) / 2), y: snap(h * 0.345), w: bw, h: bh };
  }

  // LEFT IS WEST — Five Points at the left, the line running east to the
  // right, which is how the real map reads. The line sits low in the board
  // because the station names sit above it and need the room.
  function layout(b) {
    const cx = snap(b.x + b.w * 0.10);
    const cy = snap(b.y + b.h * 0.74);
    const span = b.w * 0.78;
    const step = span / (EAST_ARM.length - 1);
    return EAST_ARM.map((s, i) => ({
      ...s, x: snap(cx + i * step), y: cy, cx, cy, step,
    }));
  }

  function stationFor(stops, stageId) {
    return stops.find((s) => s.stage === stageId) || stops[0];
  }

  // `t` is 0..1 across the ride from `fromStage` to `toStage`. `plate` is the
  // Underground stage backdrop — the real Five Points art. It is passed in
  // rather than imported so this module never loads an image of its own; the
  // plate is already decoded and in memory for the stage that uses it.
  function draw(fromStage, toStage, t, stageName, plate) {
    const w = canvas.width;
    const h = canvas.height;
    const b = board();
    const stops = layout(b);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // ── THE STATION ITSELF, drawn from the game's own Five Points plate.
    // Cover-fit and anchored to the TOP, because the plate's sky is at the
    // top and its street furniture at the bottom; centring it crops the
    // recognisable signage out. Then pushed down into shadow so the board in
    // front of it is the brightest thing on screen.
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, w, h);
    if (plate && plate.width) {
      const s = Math.max(w / plate.width, h / plate.height);
      const dw = Math.ceil(plate.width * s);
      const dh = Math.ceil(plate.height * s);
      ctx.drawImage(plate, Math.round((w - dw) / 2), 0, dw, dh);
      ctx.fillStyle = 'rgba(5,10,20,0.46)';
      ctx.fillRect(0, 0, w, h);
    }

    // Warm lamp wash from above and a heavy foot, the same lighting logic
    // every stage backdrop uses.
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, 'rgba(255,196,107,0.14)');
    wash.addColorStop(0.45, 'rgba(255,196,107,0.03)');
    wash.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    // ── THE BOARD, a lit sign hung on the platform wall.
    const bx = b.x; const bw = b.w; const by = b.y; const bh = b.h;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx + PX * 2, by + PX * 3, bw, bh);
    panel(bx, by, bw, bh, INK, 'rgba(154,116,67,0.85)', 'rgba(0,0,0,0.55)');

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + PX, by + PX, bw - PX * 2, bh - PX * 2);
    ctx.clip();   // nothing printed on the board may leave the board

    // Board header — a real transit board is titled, and it fills what was
    // dead navy at the top.
    const hx = bx + PX * 4;
    const hw = pxText('MARTA', hx, by + PX * 2, 20, HOT);
    pxText('RAIL SYSTEM', hx + hw + PX * 3, by + PX * 4, 13, DIM, 'left', '600');
    ctx.fillStyle = 'rgba(63,127,214,0.40)';
    ctx.fillRect(hx, by + PX * 10, bw - PX * 8, PX);

    const a = stationFor(stops, fromStage);
    const dest = stationFor(stops, toStage);
    const first = stops[0];

    // North-south line through Five Points — drawn for the shape of the
    // system, deliberately not labelled. A column of blocks, not a stroke.
    ctx.fillStyle = LINE_CROSS;
    ctx.globalAlpha = 0.30;
    ctx.fillRect(first.cx - PX, by, PX * 2, bh);
    ctx.globalAlpha = 1;

    // The east-west line. Two courses: the rail and a darker shadow under it,
    // which is what stops a flat bar reading as a UI divider.
    const ly = first.y;
    ctx.fillStyle = LINE;
    ctx.fillRect(bx, ly - PX, bw, PX * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(bx, ly + PX, bw, PX);

    // Stations — squares on the grid, not arcs.
    for (const s of stops) {
      const isStage = !!s.stage;
      const isHub = s.id === 'fivepoints';
      const r = isHub ? PX * 4 : isStage ? PX * 3 : PX * 2;
      if (isStage) {
        ctx.fillStyle = s.stage === toStage ? HOT : LINE;
        ctx.fillRect(s.x - r - PX, ly - r - PX, (r + PX) * 2, (r + PX) * 2);
      }
      ctx.fillStyle = isStage ? PALE : 'rgba(180,190,210,0.6)';
      ctx.fillRect(s.x - r, ly - r, r * 2, r * 2);

      // Only the four stage stations get a name, hung at its tier with a
      // leader line down to the dot so you can still tell which name belongs
      // to which station once they are at different heights.
      if (!isStage) continue;
      const size = isHub ? 15 : 13;
      const lineH = size + PX;
      const col = s.stage === toStage ? HOT : DIM;
      const tierH = lineH * 2 + PX * 4;
      const bottom = ly - r - PX * 3 - s.tier * tierH;

      ctx.fillStyle = col;
      ctx.fillRect(s.x - PX / 2, bottom, PX, ly - r - PX - bottom);

      s.label.forEach((ln, li) => {
        const ty = bottom - (s.label.length - li) * lineH;
        // Keep the name on the board. FIVE POINTS sits at 10% of the width
        // and centring it hung half the word off the left edge.
        const half = textW(ln, size) / 2;
        const lx = Math.min(bx + bw - PX * 3 - half, Math.max(bx + PX * 3 + half, s.x));
        pxText(ln, lx, ty, size, col, 'center');
      });
    }

    // The train, riding from a to b. Eased so it pulls away and arrives
    // rather than sliding at a constant rate. Built from blocks: a body, a
    // lit window band, and a warm headlamp on the nose.
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tx = snap(a.x + (dest.x - a.x) * e);
    const dir = dest.x >= a.x ? 1 : -1;
    const tw = PX * 10; const th = PX * 6;
    panel(tx - tw / 2, ly - th / 2, tw, th, HOT, '#ffe0a8', 'rgba(90,50,0,0.6)');
    ctx.fillStyle = '#17202e';
    ctx.fillRect(tx - tw / 2 + PX * 2, ly - PX * 2, tw - PX * 4, PX * 2);
    ctx.fillStyle = PALE;
    ctx.fillRect(tx + dir * (tw / 2 - PX * 2), ly - PX, PX * 2, PX * 2);

    ctx.restore();   // end board clip

    // Heading — on the WALL above the board, not on the board.
    pxText('NOW ARRIVING', w / 2, snap(h * 0.14), 14, '#c3ccdb', 'center', '600');
    pxText(stageName.toUpperCase(), w / 2, snap(h * 0.14) + 26, 30, HOT, 'center');

    // NO DRAWN PLATFORM STRIP. There was one here — a flat grey band with a
    // dashed tactile edge — and it was the last thing on screen that had been
    // invented rather than photographed. The plate already has a rain-slicked
    // plaza in the bottom third, in the game's own style, and painting a
    // rectangle over it was strictly a downgrade. The plate runs to the floor.

    ctx.restore();
  }

  return { draw };
}
