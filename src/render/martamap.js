// THE MARTA MAP — the between-stage screen.
//
// THIS IS THE CLIENT'S OWN MAP. Not a diagram drawn to look like one.
//
// Two earlier versions of this screen were built out of canvas primitives —
// arcs for stations, a stroked line for the route, system-ui for the labels —
// and the verdict on the second was "the art map is horrible, it looks like
// AI slop". That was right, and the cause was structural rather than a matter
// of taste: every stage in this game is a real Atlanta photograph converted to
// pixel art, and vector shapes cannot sit next to that.
//
// So the screen no longer draws a map. It draws the stylized MARTA rail
// system map the client supplied (assets/refs/marta-map.webp), and everything
// added on top of it is a marker, a glow and a train — nothing that has to
// pretend to be cartography.
//
// STATION COORDINATES ARE MEASURED, IN THE MAP'S OWN PIXELS.
//
// Every one of these was found by locating the bright ring the map draws for a
// station and taking its centroid, not by eyeballing a grid. The check is in
// the history: each guess was snapped to the nearest ring and moved by at most
// three pixels, and each landed on a cluster of 55-63 ring pixels.
//
// GEOGRAPHY, from the map itself:
//
//   * FIVE POINTS is the centre of everything. Both lines cross there, it is
//     where you transfer, and it is the Underground stage. That crossing is
//     also why the game has a tunnel under the street on every stage — Five
//     Points sits on top of the MARTA tunnels.
//   * The EAST-WEST line runs out east from Five Points through, in order:
//     Georgia State, King Memorial, Inman Park/Reynoldstown, Edgewood/Candler
//     Park, East Lake, Decatur...
//
// STAGE -> STATION, and none of these are guesses:
//
//   eav          East Lake                    the nearest station to EAV
//   edgewood     Edgewood/Candler Park        the stage IS the station name
//   underground  FIVE POINTS                  the stage IS the station
//   l5p          Inman Park/Reynoldstown      the nearest station to L5P
//
// The route therefore runs east-to-west into downtown and then back out one
// stop: East Lake -> Edgewood/Candler Park -> Five Points (transfer) -> Inman
// Park/Reynoldstown for the show at Criminal Records. Doubling back through
// Five Points is not a mistake in the ordering; it is how you would actually
// make that trip, because Five Points is where you change trains.

// Map-space pixel positions, in the 1122x1402 source image.
const STATIONS = {
  fivepoints: { x: 470, y: 841, label: 'FIVE POINTS', stage: 'underground' },
  gastate: { x: 512, y: 834, label: 'GEORGIA STATE' },
  king: { x: 542, y: 822, label: 'KING MEMORIAL' },
  inman: { x: 565, y: 813, label: 'INMAN PARK', stage: 'l5p' },
  edgewood: { x: 598, y: 783, label: 'EDGEWOOD', stage: 'edgewood' },
  eastlake: { x: 685, y: 774, label: 'EAST LAKE', stage: 'eav' },
};

// The line, west to east. The train follows this POLYLINE rather than lerping
// straight from origin to destination — Edgewood to Five Points passes three
// intermediate stops and the real track bends at each one, so a straight
// interpolation would cut across the map and leave the rails behind.
const ARM = ['fivepoints', 'gastate', 'king', 'inman', 'edgewood', 'eastlake'];

const HOT = '#ffc46b';
const PALE = '#fff6e2';

export function createMartaMap(ctx, canvas) {
  function stationFor(stageId) {
    for (const k of ARM) if (STATIONS[k].stage === stageId) return k;
    return 'fivepoints';
  }

  // Walk the arm from `a` to `b` and return the ordered list of points, so a
  // ride in either direction follows the same rails.
  function route(aKey, bKey) {
    const i = ARM.indexOf(aKey);
    const j = ARM.indexOf(bKey);
    const step = j >= i ? 1 : -1;
    const out = [];
    for (let k = i; k !== j + step; k += step) out.push(STATIONS[ARM[k]]);
    return out;
  }

  // Position at 0..1 along a polyline, by arc length — so the train keeps a
  // constant speed across legs of different lengths instead of hurrying
  // through the short ones.
  function along(pts, t) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segs.push(d); total += d;
    }
    if (total === 0) return { x: pts[0].x, y: pts[0].y, a: 0 };
    let want = t * total;
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i] || i === segs.length - 1) {
        const f = segs[i] ? Math.min(1, want / segs[i]) : 0;
        const p0 = pts[i]; const p1 = pts[i + 1];
        return {
          x: p0.x + (p1.x - p0.x) * f,
          y: p0.y + (p1.y - p0.y) * f,
          a: Math.atan2(p1.y - p0.y, p1.x - p0.x),
        };
      }
      want -= segs[i];
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, a: 0 };
  }

  // `t` is 0..1 across the ride. `map` is the client's map image.
  function draw(fromStage, toStage, t, stageName, map) {
    const w = canvas.width;
    const h = canvas.height;
    const aKey = stationFor(fromStage);
    const bKey = stationFor(toStage);
    const pts = route(aKey, bKey);
    const dest = STATIONS[bKey];

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0d09';
    ctx.fillRect(0, 0, w, h);
    if (!map || !map.width) { ctx.restore(); return; }

    // ── FRAMING. The map is 1122x1402 of dense detail and the four stations
    // that matter occupy a 215x67 patch of it. Fitting the whole thing to a
    // phone would render that patch about forty pixels wide — unreadable, and
    // it would waste the client's art on a thumbnail. So the camera sits on
    // the ROUTE: centred on the midpoint of this particular journey, zoomed so
    // the leg fills a comfortable share of the screen, and eased along with
    // the train so the map drifts under it.
    const midT = 0.5;
    const head = along(pts, Math.min(1, t));
    const centre = along(pts, midT * 0.35 + Math.min(1, t) * 0.65);

    const legW = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const legH = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    // Enough room around the leg for the station names printed on the map.
    const wantW = Math.max(legW + 190, 260);
    const wantH = Math.max(legH + 150, 190);
    const zoom = Math.min(w / wantW, h / wantH);

    const camX = centre.x - w / (2 * zoom);
    const camY = centre.y - h / (2 * zoom);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);
    ctx.drawImage(map, 0, 0);

    // TRAVELLED TRACK, lit up behind the train. The map already draws the
    // line; this is the part of it he has covered, so the journey reads as
    // progress rather than as a dot sliding over a picture.
    const done = [];
    for (let i = 0; i < 24; i++) done.push(along(pts, (i / 23) * Math.min(1, t)));
    ctx.strokeStyle = 'rgba(255,196,107,0.85)';
    ctx.lineWidth = 4 / zoom * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    done.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    // DESTINATION, pulsing. Drawn in map space so it sits exactly on the ring
    // the map itself printed.
    const pulse = 0.6 + 0.4 * Math.sin(t * 22);
    ctx.strokeStyle = `rgba(255,196,107,${(0.55 + 0.45 * pulse).toFixed(3)})`;
    ctx.lineWidth = 3 / zoom * 2;
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, 9 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();

    // THE TRAIN. Small, because it is riding on a real map at real scale, and
    // rotated to the track so it never looks like it is sliding sideways.
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(head.a);
    ctx.fillStyle = PALE;
    ctx.fillRect(-9, -4, 18, 8);
    ctx.fillStyle = HOT;
    ctx.fillRect(-9, -4, 18, 3);
    ctx.fillStyle = '#12161f';
    ctx.fillRect(-5, -1, 10, 3);
    ctx.restore();

    // Headlamp wash on the rails ahead.
    ctx.globalCompositeOperation = 'lighter';
    const lamp = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 26);
    lamp.addColorStop(0, 'rgba(255,226,150,0.55)');
    lamp.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(head.x - 26, head.y - 26, 52, 52);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();   // end map transform

    // ── SCREEN-SPACE FURNITURE. Kept to a minimum: the map is the artwork and
    // anything laid over it competes with it. A dark band top and bottom so
    // the type has something to sit on, and nothing else.
    const bandH = Math.round(h * 0.16);
    const top = ctx.createLinearGradient(0, 0, 0, bandH);
    top.addColorStop(0, 'rgba(6,8,5,0.92)');
    top.addColorStop(1, 'rgba(6,8,5,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, bandH);
    const bot = ctx.createLinearGradient(0, h - bandH * 0.7, 0, h);
    bot.addColorStop(0, 'rgba(6,8,5,0)');
    bot.addColorStop(1, 'rgba(6,8,5,0.92)');
    ctx.fillStyle = bot;
    ctx.fillRect(0, h - bandH * 0.7, w, bandH * 0.7);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,246,226,0.66)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('NOW ARRIVING', w / 2, Math.round(h * 0.062));
    ctx.fillStyle = HOT;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(stageName.toUpperCase(), w / 2, Math.round(h * 0.062) + 30);
    ctx.fillStyle = 'rgba(255,246,226,0.55)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`${STATIONS[aKey].label}  →  ${dest.label}`, w / 2, Math.round(h * 0.062) + 52);

    ctx.restore();
  }

  return { draw };
}
