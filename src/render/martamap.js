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

// Station positions are LAID OUT IN ORDER along the east arm, not to
// scale-accurate lat/long — a transit diagram is topological, which is the
// whole reason transit diagrams work. Order and adjacency are what have to be
// right, and they are.
// Labels are STACKED, not one long string. The real station names are
// "Inman Park/Reynoldstown" and "Edgewood/Candler Park", and set on one line
// at 45 degrees they ran clean off the right edge of a 430px phone. Two lines
// keeps the real name intact and fits.
const EAST_ARM = [
  { id: 'fivepoints', label: ['FIVE POINTS'], stage: 'underground' },
  { id: 'gastate' },
  { id: 'king' },
  { id: 'inman', label: ['INMAN PARK', 'REYNOLDSTOWN'], stage: 'l5p' },
  { id: 'edgewood', label: ['EDGEWOOD', 'CANDLER PARK'], stage: 'edgewood' },
  { id: 'eastlake', label: ['EAST LAKE'], stage: 'eav' },
];

// PALETTE, SAMPLED FROM THE GAME rather than picked. Measured across all four
// cut backdrops: whole-game median luminance is 17 — these are night plates,
// and the first version of this screen was far too bright and clean against
// them. The warm practicals in the art (streetlight, neon) mean #9a7443; the
// cool shadow and sky mean #09152a. Everything here is drawn from that.
const INK = '#09152a';         // cool shadow, the plates' own blue-black
const INK_DEEP = '#050a14';
const LINE = '#3f7fd6';        // MARTA blue, the one true brand colour kept
const LINE_CROSS = '#8a6a34';  // north-south line, muted to the warm practical
const TILE = '#1a2130';        // station wall
const GROUT = '#0d1420';
const DIM = 'rgba(154,116,67,0.55)';   // #9a7443, the streetlight warm
const HOT = '#ffc46b';
const LAMP = 'rgba(255,196,107,0.16)';

// PIXEL GRID. The game is pixel art at a chunky scale, so this screen has to
// be too — smooth vector strokes are exactly what made it read as a debug
// overlay next to the backdrops. Everything snaps to PX.
const PX = 3;
const snap = (v) => Math.round(v / PX) * PX;

export function createMartaMap(ctx, canvas) {
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
    const bh = snap(Math.min(h * 0.34, 250));
    return { x: snap((w - bw) / 2), y: snap(h * 0.30), w: bw, h: bh };
  }

  // LEFT IS WEST — Five Points at the left, the line running east to the
  // right, which is how the real map reads. The line sits low in the board
  // because the station names climb up-right at 45 degrees and need the room
  // above them.
  function layout(b) {
    const cx = snap(b.x + b.w * 0.11);
    const cy = snap(b.y + b.h * 0.70);
    const span = b.w * 0.74;
    const step = span / (EAST_ARM.length - 1);
    return EAST_ARM.map((s, i) => ({
      ...s, x: snap(cx + i * step), y: cy, cx, cy, step,
    }));
  }

  function stationFor(stops, stageId) {
    return stops.find((s) => s.stage === stageId) || stops[0];
  }

  // `t` is 0..1 across the ride from `fromStage` to `toStage`.
  function draw(fromStage, toStage, t, stageName) {
    const w = canvas.width;
    const h = canvas.height;
    const b = board();
    const stops = layout(b);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = INK_DEEP;
    ctx.fillRect(0, 0, w, h);

    // STATION WALL. The map is a board on a tiled wall, not a UI panel — the
    // interstitial should read as somewhere Will Hill is standing. Tiles are
    // drawn on the PX grid with a grout line, then a warm lamp wash from
    // above, which is the same lighting logic the stage backdrops use.
    const TW = PX * 14;
    const TH = PX * 9;
    for (let ty = 0; ty < h; ty += TH) {
      for (let tx = -TW; tx < w + TW; tx += TW) {
        const off = (Math.floor(ty / TH) % 2) * (TW / 2);   // running bond
        const n = Math.abs(Math.sin((tx + off) * 0.13 + ty * 0.29)) * 10;
        ctx.fillStyle = n > 7 ? '#1e2536' : TILE;
        ctx.fillRect(tx + off, ty, TW - PX, TH - PX);
      }
    }
    ctx.fillStyle = GROUT;
    ctx.globalAlpha = 0.5;
    for (let ty = 0; ty < h; ty += TH) ctx.fillRect(0, ty + TH - PX, w, PX);
    ctx.globalAlpha = 1;

    // Lamp wash down the wall.
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, LAMP);
    wash.addColorStop(0.45, 'rgba(255,196,107,0.05)');
    wash.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    // THE BOARD the map is printed on, with a lit frame and a drop shadow so
    // it sits off the wall.
    const bx = b.x; const bw = b.w; const by = b.y; const bh = b.h;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx + PX * 2, by + PX * 2, bw, bh);
    ctx.fillStyle = INK;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(154,116,67,0.85)';          // warm metal frame
    ctx.fillRect(bx, by, bw, PX);
    ctx.fillRect(bx, by, PX, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by + bh - PX, bw, PX);
    ctx.fillRect(bx + bw - PX, by, PX, bh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + PX, by + PX, bw - PX * 2, bh - PX * 2);
    ctx.clip();   // nothing printed on the board may leave the board

    // Board header — a real transit board is titled, and it fills what was
    // dead navy at the top.
    ctx.textAlign = 'left';
    ctx.fillStyle = HOT;
    ctx.font = `bold ${PX * 4}px system-ui, sans-serif`;
    ctx.fillText('MARTA', bx + PX * 4, by + PX * 7);
    ctx.fillStyle = DIM;
    ctx.font = `${PX * 3}px system-ui, sans-serif`;
    ctx.fillText('RAIL SYSTEM', bx + PX * 4 + ctx.measureText('MARTA').width + PX * 12, by + PX * 7);
    ctx.fillStyle = 'rgba(63,127,214,0.35)';
    ctx.fillRect(bx + PX * 4, by + PX * 9, bw - PX * 8, PX);

    const a = stationFor(stops, fromStage);
    const dest = stationFor(stops, toStage);
    const first = stops[0];
    const last = stops[stops.length - 1];

    // North-south line through Five Points — drawn for the shape of the
    // system, deliberately not labelled.
    ctx.strokeStyle = LINE_CROSS;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(first.cx, by);
    ctx.lineTo(first.cx, by + bh);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The east-west line.
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, first.y);
    ctx.lineTo(bx + bw, last.y);
    ctx.stroke();

    // Stations.
    for (const s of stops) {
      const isStage = !!s.stage;
      const isHub = s.id === 'fivepoints';
      ctx.beginPath();
      ctx.arc(s.x, s.y, isHub ? 11 : isStage ? 8 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isStage ? '#f2f4f8' : 'rgba(180,190,210,0.55)';
      ctx.fill();
      if (isStage) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = s.stage === toStage ? HOT : LINE;
        ctx.stroke();
      }

      // Only the four stage stations get a name.
      if (!isStage) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(-Math.PI / 4);          // angled, so names do not collide
      ctx.textAlign = 'left';
      const size = isHub ? 12 : 10;
      ctx.font = `${size}px system-ui, sans-serif`;
      ctx.fillStyle = s.stage === toStage ? HOT : DIM;
      s.label.forEach((ln, li) => ctx.fillText(ln, 15, 3 + li * (size + 2)));
      ctx.restore();
    }

    // The train, riding from a to b. Eased so it pulls away and arrives
    // rather than sliding at a constant rate.
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tx = snap(a.x + (dest.x - a.x) * e);
    ctx.fillStyle = HOT;
    ctx.beginPath();
    ctx.roundRect(tx - 13, a.y - 9, 26, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#1b1d24';
    ctx.fillRect(tx - 8, a.y - 5, 16, 6);

    ctx.restore();   // end board clip

    // Heading — on the WALL above the board, not on the board.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('NOW ARRIVING', w / 2, h * 0.18);
    ctx.fillStyle = HOT;
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(stageName.toUpperCase(), w / 2, h * 0.18 + 28);
    ctx.restore();
  }

  return { draw };
}
