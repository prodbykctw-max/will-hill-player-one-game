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

const LINE = '#3f7fd6';        // MARTA blue
const LINE_CROSS = '#c8a03c';  // the north-south line, for shape only
const DIM = 'rgba(255,255,255,0.30)';
const HOT = '#ffd166';

export function createMartaMap(ctx, canvas) {
  // Where each station sits on screen. Recomputed on every draw so it tracks
  // a resize without keeping state.
  function layout() {
    const w = canvas.width;
    const h = canvas.height;
    // LEFT IS WEST. Five Points sits left of centre and the line runs east to
    // the right, which is how the real map reads. The right margin has to
    // clear the angled labels on the last station or they leave the screen —
    // that is what the first version got wrong on a 430px phone.
    const cx = w * 0.16;
    const cy = h * 0.50;
    const span = Math.min(w - cx - w * 0.22, 460);
    const step = span / (EAST_ARM.length - 1);
    return EAST_ARM.map((s, i) => ({ ...s, x: cx + i * step, y: cy, cx, cy, step }));
  }

  function stationFor(stops, stageId) {
    return stops.find((s) => s.stage === stageId) || stops[0];
  }

  // `t` is 0..1 across the ride from `fromStage` to `toStage`.
  function draw(fromStage, toStage, t, stageName) {
    const stops = layout();
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.fillStyle = 'rgba(8,9,14,0.94)';
    ctx.fillRect(0, 0, w, h);

    const a = stationFor(stops, fromStage);
    const b = stationFor(stops, toStage);
    const first = stops[0];
    const last = stops[stops.length - 1];

    // North-south line through Five Points — drawn for the shape of the
    // system, deliberately not labelled.
    ctx.strokeStyle = LINE_CROSS;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(first.cx, first.cy - h * 0.30);
    ctx.lineTo(first.cx, first.cy + h * 0.26);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The east-west line.
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(first.x - first.step * 0.45, first.y);
    ctx.lineTo(last.x + last.step * 0.45, last.y);
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
    const tx = a.x + (b.x - a.x) * e;
    ctx.fillStyle = HOT;
    ctx.beginPath();
    ctx.roundRect(tx - 13, a.y - 9, 26, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#1b1d24';
    ctx.fillRect(tx - 8, a.y - 5, 16, 6);

    // Heading.
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
