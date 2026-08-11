// UNDERCROFT — the cross-section under the street.
//
// Ported from Jandé's drawUndercroft/drawUCLayer (once-upon-a-time
// index.html:4055-4235). This band is ~30% of the portrait screen and is a
// large part of why Jandé doesn't read as a flat Mario platformer: raising
// the ground line is what EXPOSES the space beneath, and something has to
// live there or the framing change reads as a bug.
//
// Reskinned to a real Atlanta street section — what's genuinely under a
// city street, in the order you'd actually hit it digging down:
//   asphalt wearing course -> aggregate base -> compacted fill ->
//   Georgia red clay -> weathered bedrock
// with utilities threaded through at their real depths (shallow conduit and
// gas, mid-depth water, deep sewer), building footings, tree roots, and —
// for Five Points — the MARTA tunnel the neighbourhood is named around.
//
// SCREEN SPACE, like every backdrop layer. Parallax is deliberately SLOW
// (BASE_PARALLAX well under 1) so the underground drifts against the street
// above it: the deeper something is, the less it should shift as you run,
// which is what sells it as being far below rather than painted on.
// Placement is a deterministic sin-hash so it's stable frame to frame with
// no stored state (Jandé's _uh/_uw trick, index.html:4051-4054).

// Well below the street's 1.0 — the section reads as deep, distant mass
// rather than something scrolling along with the pavement.
const BASE_PARALLAX = 0.26;

function hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pmod(a, m) {
  return ((a % m) + m) % m;
}

export function createUndercroft(ctx, canvas) {
  // Repeating horizontal run of shapes at a given sub-parallax (deeper
  // things get a smaller multiplier, so strata separate as you move).
  function run(px, sub, spacing, fn) {
    const p = px * sub;
    const n = Math.ceil(canvas.width / spacing) + 3;
    const start = -pmod(p, spacing) - spacing;
    for (let i = 0; i < n; i++) fn(start + i * spacing, i + Math.floor(p / spacing));
  }

  // ── strata ───────────────────────────────────────────────────────────
  // Real construction section, with hard boundaries between courses rather
  // than one soft gradient — that separation is what makes it read as
  // layered ground instead of a murky wash.
  function drawStrata(u, y0, bh) {
    const courses = [
      { f: 0.00, h: 0.055, c: u.asphalt }, // wearing course
      { f: 0.055, h: 0.075, c: u.base }, // aggregate base
      { f: 0.13, h: 0.20, c: u.fill }, // compacted fill
      { f: 0.33, h: 0.42, c: u.mid }, // Georgia red clay
      { f: 0.75, h: 0.25, c: u.bottom }, // weathered bedrock
    ];
    for (const cs of courses) {
      ctx.fillStyle = cs.c;
      ctx.fillRect(0, y0 + bh * cs.f, canvas.width, bh * cs.h + 1);
    }

    // Boundary lines, slightly wavered so they don't read as CAD.
    ctx.lineWidth = 1;
    for (let i = 1; i < courses.length; i++) {
      const sy = y0 + bh * courses[i].f;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(0, sy);
      for (let x = 0; x <= canvas.width; x += 24) {
        ctx.lineTo(x, sy + Math.sin(x * 0.011 + i * 2.3) * 2.5 + Math.sin(x * 0.037 + i) * 1.2);
      }
      ctx.stroke();
    }

    // Aggregate in the base course — angular chips, not round pebbles.
    const baseTop = y0 + bh * 0.055;
    const baseH = bh * 0.075;
    for (let i = 0; i < 90; i++) {
      const gx = hash01(i * 3.1) * canvas.width;
      const gy = baseTop + hash01(i * 7.7) * baseH;
      const r = 1 + hash01(i * 5.3) * 1.8;
      ctx.fillStyle = hash01(i * 9.1) > 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.30)';
      ctx.fillRect(gx, gy, r, r);
    }

    // Stones and old brick rubble suspended in the clay.
    const clayTop = y0 + bh * 0.33;
    const clayH = bh * 0.42;
    for (let i = 0; i < 40; i++) {
      const gx = hash01(i * 4.7) * canvas.width;
      const gy = clayTop + hash01(i * 8.3) * clayH;
      const w = 3 + hash01(i * 2.2) * 7;
      const h = 2 + hash01(i * 6.4) * 4;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate((hash01(i * 1.9) - 0.5) * 1.2);
      ctx.fillStyle = hash01(i * 5.5) > 0.65 ? u.brick : 'rgba(0,0,0,0.26)';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(-w / 2, -h / 2, w, 1);
      ctx.restore();
    }

    // Mottling across every course — flat colour bands read as a diagram,
    // not as dug earth. This is the cheapest thing that breaks that up.
    for (let i = 0; i < 150; i++) {
      const mx = hash01(i * 1.7) * canvas.width;
      const my = y0 + bh * (0.06 + hash01(i * 2.3) * 0.94);
      const mw = 6 + hash01(i * 3.7) * 26;
      const mh = 3 + hash01(i * 4.9) * 10;
      const dark = hash01(i * 6.1) > 0.45;
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.13)' : 'rgba(255,225,190,0.055)';
      ctx.beginPath();
      ctx.ellipse(mx, my, mw, mh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bedrock fracturing at the very bottom.
    const rockTop = y0 + bh * 0.75;
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    for (let i = 0; i < 14; i++) {
      const rx = hash01(i * 11.3) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(rx, rockTop + hash01(i * 2.7) * bh * 0.06);
      ctx.lineTo(rx + (hash01(i * 3.3) - 0.5) * 60, y0 + bh);
      ctx.stroke();
    }
  }

  // ── utilities ────────────────────────────────────────────────────────

  // Cylindrical shading — the thing that makes a pipe read as round.
  function pipeGradient(y, r, lit, dark) {
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, dark);
    g.addColorStop(0.32, lit);
    g.addColorStop(0.55, lit);
    g.addColorStop(1, dark);
    return g;
  }

  // Deep sewer main — brick barrel arch, the oldest thing down here.
  function sewer(px, y0, bh, u) {
    // This is the thing that has to say "sewer" at a glance on every stage
    // except Five Points. It is a LONGITUDINAL cut down the barrel, so the
    // bore is a horizontal void — the same silhouette a subway tunnel has.
    // Silhouette alone therefore cannot carry it, and an earlier version that
    // relied on it (a flat brick rectangle with evenly spaced horizontal
    // lines) read as tiled tunnel wall. What separates the two is masonry and
    // water: running-bond brick, ring joints where one length of barrel meets
    // the next, and a flowing invert.
    // Sized to be the thing you notice down here. It sits below the water
    // main (which runs to 0.44) and stops just short of the bedrock course at
    // 0.75, so it dominates the section without burying the other services.
    const SEG = 240;
    const y = y0 + bh * 0.60;
    const r = Math.max(15, bh * 0.155);
    const course = Math.max(4, r * 0.30);   // brick course height
    const brickW = course * 2.4;            // roughly 2:1 brick, plus joint

    ctx.save();
    run(px, 0.8, SEG, (x, i) => {
      ctx.fillStyle = u.brick;
      ctx.fillRect(x, y - r, SEG, r * 2);

      // Running bond: every other course offset by half a brick. Staggered
      // joints are what the eye reads as brickwork — a stack of unbroken
      // horizontal lines reads as tile, which is exactly the wrong building.
      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.lineWidth = 1;
      let row = 0;
      for (let by = y - r; by < y + r; by += course, row++) {
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x + SEG, by);
        ctx.stroke();
        const shift = (row % 2) * brickW * 0.5;
        for (let bx = x + shift; bx < x + SEG; bx += brickW) {
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx, Math.min(by + course, y + r));
          ctx.stroke();
        }
      }

      // Ring joint — a raised collar of header bricks where one length of
      // barrel butts the next. Periodic structure like this is the other
      // thing tunnels do not have.
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(x - 3, y - r, 6, r * 2);
      ctx.fillStyle = 'rgba(255,225,190,0.10)';
      ctx.fillRect(x + 3, y - r, 2, r * 2);

      // The bore, arched: the crown curves rather than cutting straight, so
      // the barrel reads as round even in section.
      ctx.fillStyle = u.void_;
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.62);
      ctx.lineTo(x, y - r * 0.30);
      ctx.quadraticCurveTo(x + SEG * 0.5, y - r * 0.86, x + SEG, y - r * 0.30);
      ctx.lineTo(x + SEG, y + r * 0.62);
      ctx.closePath();
      ctx.fill();

      // Soot and damp staining up the haunches, heaviest at the crown.
      const sg = ctx.createLinearGradient(0, y - r * 0.86, 0, y + r * 0.62);
      sg.addColorStop(0, 'rgba(0,0,0,0.45)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x, y - r * 0.86, SEG, r * 1.48);

      // Flowing sewage in the invert, with a lit surface and a slow ripple.
      // Standing water is the single clearest sewer tell.
      const wl = y + r * 0.30;
      ctx.fillStyle = 'rgba(46,58,48,0.92)';
      ctx.fillRect(x, wl, SEG, y + r * 0.62 - wl);
      ctx.fillStyle = 'rgba(150,178,170,0.30)';
      ctx.fillRect(x, wl, SEG, 1.6);
      ctx.fillStyle = 'rgba(190,215,205,0.16)';
      for (let k = 0; k < 5; k++) {
        const rx = x + hash01(i * 3.7 + k * 1.9) * SEG;
        ctx.fillRect(rx, wl + 1 + hash01(k * 5.3) * 2, 10 + hash01(k * 2.1) * 22, 1);
      }

      // Benching either side of the channel, and the crown shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(x, y - r, SEG, 3);
      ctx.fillRect(x, y + r * 0.62 - 2, SEG, 2);
    });
    ctx.restore();
  }

  // Mid-depth water main — ductile iron, joint collars.
  function water(px, y0, bh, u) {
    const y = y0 + bh * 0.40;
    const r = Math.max(5, bh * 0.042);
    ctx.save();
    run(px, 0.95, 190, (x) => {
      ctx.fillStyle = pipeGradient(y, r, u.metal, u.metalDark);
      ctx.fillRect(x, y - r, 190, r * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x, y - r * 0.45, 190, 1.5); // specular line
      ctx.fillStyle = u.metalDark;
      ctx.fillRect(x - 4, y - r - 2.5, 9, r * 2 + 5); // bell joint
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - 4, y + r, 9, 2.5);
    });
    ctx.restore();
  }

  // Shallow utility bank — telecom conduit, power, gas.
  function conduit(px, y0, bh, u) {
    const y = y0 + bh * 0.20;
    ctx.save();
    run(px, 1.1, 130, (x) => {
      // conduit duct bank in its concrete envelope
      ctx.fillStyle = u.concreteDark;
      ctx.fillRect(x, y - 3, 130, 15);
      for (let k = 0; k < 3; k++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = k === 0 && j === 0 ? u.accent : u.metalDark;
          ctx.beginPath();
          ctx.arc(x + 20 + k * 34, y + 1 + j * 6, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // gas line above it, yellow-jacketed
      ctx.fillStyle = u.gas;
      ctx.fillRect(x, y - 13, 130, 3.2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, y - 9.8, 130, 1.2);
    });
    ctx.restore();
  }

  // Manhole shaft dropping from the street down to the sewer.
  function manhole(px, y0, bh, u) {
    // Drops from the street cover all the way into the sewer. Depth is set
    // against the barrel below (crown 0.445, invert ~0.70 of bh) so the shaft
    // visibly breaks through into the bore rather than stopping in the clay
    // above it — a shaft to nowhere is what makes a section look diagrammatic.
    // Drawn after `sewer` in every stage's `kinds`, so it punches through.
    const depth = bh * 0.66;
    ctx.save();
    run(px, 0.8, 760, (x, i) => {
      if (hash01(i * 6.7) > 0.62) return;
      const w = 26;

      // Precast concrete rings, joints every ring.
      ctx.fillStyle = u.concrete;
      ctx.fillRect(x, y0, w, depth);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let ry = y0 + 21; ry < y0 + depth; ry += 21) ctx.fillRect(x, ry, w, 1.4);
      ctx.fillStyle = u.void_;
      ctx.fillRect(x + 4, y0, w - 8, depth);

      // The ladder. Two stiles and rungs the whole drop, so there is a way
      // down to the sewer rather than a bare hole.
      const lx = x + 7;
      const lw = w - 14;
      const bottom = y0 + depth - 3;
      ctx.fillStyle = u.metal;
      ctx.fillRect(lx, y0 + 2, 1.7, bottom - y0 - 2);
      ctx.fillRect(lx + lw - 1.7, y0 + 2, 1.7, bottom - y0 - 2);
      // Lit down one stile so it reads as round bar, not a painted line.
      ctx.fillStyle = 'rgba(255,240,210,0.20)';
      ctx.fillRect(lx, y0 + 2, 0.7, bottom - y0 - 2);
      for (let sy = y0 + 9; sy < bottom - 2; sy += 10) {
        ctx.fillStyle = u.metal;
        ctx.fillRect(lx, sy, lw, 1.7);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';   // rung shadow on the back wall
        ctx.fillRect(lx, sy + 1.7, lw, 1);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + w - 4, y0, 4, depth);
      // Daylight falling in at the top, dying a few rungs down.
      const lg = ctx.createLinearGradient(0, y0, 0, y0 + depth * 0.4);
      lg.addColorStop(0, 'rgba(255,226,170,0.16)');
      lg.addColorStop(1, 'rgba(255,226,170,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(x + 4, y0, w - 8, depth * 0.4);
    });
    ctx.restore();
  }

  // Building footings with form lines and rebar.
  function footings(px, y0, bh, u) {
    ctx.save();
    run(px, 0.68, 340, (x, i) => {
      const w = 52 + hash01(i * 4.4) * 34;
      const h = bh * (0.40 + hash01(i * 8.8) * 0.26);
      ctx.fillStyle = u.concrete;
      ctx.fillRect(x, y0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, y0, Math.max(1, w * 0.18), h);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + w - 5, y0, 5, h);
      // horizontal form-board lines
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let fy = y0 + 18; fy < y0 + h; fy += 18) {
        ctx.beginPath();
        ctx.moveTo(x, fy);
        ctx.lineTo(x + w, fy);
        ctx.stroke();
      }
      // spread footing
      ctx.fillStyle = u.concreteDark;
      ctx.fillRect(x - 9, y0 + h - 13, w + 18, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(x - 9, y0 + h, w + 18, 3);
    });
    ctx.restore();
  }

  // Tree roots threading down through the fill and clay.
  function roots(px, y0, bh, u) {
    ctx.save();
    ctx.strokeStyle = u.root;
    ctx.lineCap = 'round';
    run(px, 0.9, 300, (x, i) => {
      const top = y0 + bh * 0.10;
      const len = bh * (0.32 + hash01(i * 5.1) * 0.3);
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.bezierCurveTo(x + 16, top + len * 0.34, x - 14, top + len * 0.66, x + 8, top + len);
      ctx.stroke();
      // finer laterals
      ctx.lineWidth = 1.4;
      for (let k = 1; k <= 3; k++) {
        const ty = top + len * (k / 4);
        const dir = k % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x + dir * 2, ty);
        ctx.quadraticCurveTo(x + dir * 26, ty + 8, x + dir * 44, ty + 24);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // MARTA tunnel — the big engineered void under Five Points.
  function tunnel(px, y0, bh, u) {
    const top = y0 + bh * 0.34;
    const h = Math.max(30, bh * 0.42);
    ctx.save();
    // Deepest thing here, so it gets the slowest sub-rate of all.
    run(px, 0.45, 560, (x) => {
      // concrete box structure
      ctx.fillStyle = u.concrete;
      ctx.fillRect(x, top - 10, 560, 10);
      ctx.fillStyle = u.void_;
      ctx.fillRect(x, top, 560, h);

      // tiled tunnel wall at the back
      ctx.fillStyle = u.tile;
      ctx.fillRect(x, top + 4, 560, h * 0.42);
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = 1;
      for (let tx = 0; tx < 560; tx += 22) {
        ctx.beginPath();
        ctx.moveTo(x + tx, top + 4);
        ctx.lineTo(x + tx, top + 4 + h * 0.42);
        ctx.stroke();
      }
      for (let ty = top + 4; ty < top + 4 + h * 0.42; ty += 13) {
        ctx.beginPath();
        ctx.moveTo(x, ty);
        ctx.lineTo(x + 560, ty);
        ctx.stroke();
      }

      // trackbed, ballast, running rails
      const rail = top + h - 12;
      ctx.fillStyle = u.ballast;
      ctx.fillRect(x, rail - 6, 560, 18);
      ctx.fillStyle = u.metalDark;
      for (let sx = 0; sx < 560; sx += 26) ctx.fillRect(x + sx, rail - 2, 16, 5); // sleepers
      ctx.fillStyle = u.metal;
      ctx.fillRect(x, rail - 3, 560, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fillRect(x, rail - 3, 560, 1); // rail head catching light

      // tunnel lighting, warm and periodic
      for (let i = 0; i < 5; i++) {
        const lx = x + 60 + i * 112;
        ctx.fillStyle = u.lamp;
        ctx.fillRect(lx - 7, top + 6, 14, 3);
        const lg = ctx.createRadialGradient(lx, top + 8, 1, lx, top + 8, 62);
        lg.addColorStop(0, u.lamp);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(lx - 62, top, 124, h);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(x, top, 560, 4);
    });
    ctx.restore();
  }

  // Rats — the undercroft should feel inhabited, not like a diagram. They
  // scurry along the sewer crown and the tunnel floor, pause, then bolt.
  // Positions are time-driven rather than hashed so they genuinely move.
  //
  // DRAW ORDER MATTERS: the stage's `kinds` list places rats BEFORE
  // 'footings' (and before the train), so the concrete columns and passing
  // trains occlude them. A rat that slips behind a column and reappears the
  // other side reads as being down there in the space, rather than as a
  // sprite skating across the front of it.
  const RAT_COUNT = 1;

  function rats(px, y0, bh, u, tick) {
    const lanes = [y0 + bh * 0.455, y0 + bh * 0.70, y0 + bh * 0.30];
    ctx.save();
    // ONE rat, down from seven. Seven crossing the section at once read as an
    // infestation and pulled the eye off the street the whole time; a single
    // one darting through is the detail that was wanted. Client asked for a
    // 90% cut and 7 -> 1 is 86% — as close as whole rats allow.
    ctx.fillStyle = u.rat || '#241d1a';
    for (let i = 0; i < RAT_COUNT; i++) {
      const lane = lanes[i % lanes.length];
      const dir = i % 2 ? 1 : -1;
      const speed = 1.5 + (i % 3) * 0.65;
      const span = canvas.width + 260;
      // Bolt–pause–bolt: the sine term stalls them briefly, which reads far
      // more like vermin than a constant glide.
      const t = tick * speed + i * 400;
      const gait = t + Math.sin(t * 0.02 + i) * 26;
      const x = dir > 0 ? pmod(gait, span) - 130 : span - pmod(gait, span) - 130;
      const bob = Math.sin(t * 0.30 + i) * 0.9;
      const y = lane + bob;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.4, 2.3, 0, 0, Math.PI * 2); // body
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4.2, -0.5, 1.7, 0, Math.PI * 2); // head
      ctx.fill();
      ctx.strokeStyle = u.rat || '#241d1a';
      ctx.lineWidth = 1;
      ctx.beginPath(); // tail, whipping with the gait
      ctx.moveTo(-4, 0);
      ctx.quadraticCurveTo(-9, Math.sin(t * 0.3 + i) * 3, -13, 1.5);
      ctx.stroke();
      // eye catching the tunnel light
      ctx.fillStyle = 'rgba(255,190,140,0.5)';
      ctx.fillRect(4.8, -1.2, 1, 1);
      ctx.fillStyle = u.rat || '#241d1a';
      ctx.restore();
    }
    ctx.restore();
  }

  // MARTA train — Five Points is a station, so a train actually runs the
  // line under the street on a cycle: headlight sweep, lit windows, then
  // gone. This is the single most alive thing in the section.
  function train(px, y0, bh, u, tick) {
    const top = y0 + bh * 0.34;
    const h = Math.max(30, bh * 0.42);
    const rail = top + h - 12;

    const PERIOD = 760; // ticks between services
    const TRANSIT = 260; // ticks to cross
    const phase = pmod(tick, PERIOD);
    if (phase > TRANSIT) return; // between trains — empty tunnel

    const carH = Math.min(h * 0.52, 40);
    const carW = 150;
    const cars = 4;
    const trainLen = carW * cars;
    const p = phase / TRANSIT;
    // Alternate direction each service.
    const eastbound = Math.floor(tick / PERIOD) % 2 === 0;
    const travel = -trainLen - 120 + p * (canvas.width + trainLen + 240);
    const x0 = eastbound ? travel : canvas.width - travel - trainLen;
    const carTop = rail - carH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, canvas.width, h);
    ctx.clip();

    // headlight wash thrown down the tunnel ahead of the train
    const noseX = eastbound ? x0 + trainLen : x0;
    const hg = ctx.createRadialGradient(noseX, carTop + carH * 0.5, 2, noseX, carTop + carH * 0.5, 220);
    hg.addColorStop(0, 'rgba(255,240,200,0.42)');
    hg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(noseX - 220, top, 440, h);

    for (let i = 0; i < cars; i++) {
      const cx = x0 + i * carW;
      // body
      const bg = ctx.createLinearGradient(0, carTop, 0, carTop + carH);
      bg.addColorStop(0, '#9aa1a8');
      bg.addColorStop(0.5, '#6f767d');
      bg.addColorStop(1, '#3f4449');
      ctx.fillStyle = bg;
      ctx.fillRect(cx + 3, carTop, carW - 6, carH);
      // MARTA blue stripe
      ctx.fillStyle = '#2f5fa8';
      ctx.fillRect(cx + 3, carTop + carH * 0.60, carW - 6, carH * 0.13);
      // lit windows
      for (let w = 0; w < 5; w++) {
        ctx.fillStyle = 'rgba(255,238,190,0.92)';
        ctx.fillRect(cx + 16 + w * 25, carTop + carH * 0.18, 16, carH * 0.32);
      }
      // roof + skirt
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(cx + 3, carTop, carW - 6, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx + 3, carTop + carH - 3, carW - 6, 3);
      // coupling gap
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cx, carTop + carH * 0.2, 3, carH * 0.7);
    }

    // speed streaks
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const sy = carTop + (i / 10) * carH;
      ctx.beginPath();
      ctx.moveTo(x0 - 60 - i * 7, sy);
      ctx.lineTo(x0 - 6, sy);
      ctx.stroke();
    }

    // glow spill onto the trackbed
    const sg = ctx.createLinearGradient(0, rail - 6, 0, rail + 12);
    sg.addColorStop(0, 'rgba(255,235,190,0.20)');
    sg.addColorStop(1, 'rgba(255,235,190,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x0 - 40, rail - 6, trainLen + 80, 18);

    ctx.restore();
  }

  const KINDS = { sewer, water, conduit, manhole, footings, roots, tunnel, rats, train };

  /**
   * @param stage    stage object (reads stage.under)
   * @param groundY  screen y of the world floor (camera.groundScreenY())
   * @param slabPx   drawn thickness of the street slab in screen px — the
   *                 section starts BELOW it, not at the ground line
   * @param camera   for parallax
   * @param tick     frame counter — drives the rats and the train service
   */
  function draw(stage, groundY, slabPx, camera, tick) {
    const u = stage.under;
    const y0 = Math.max(0, groundY + slabPx);
    const bh = canvas.height - y0;
    if (bh <= 1) return;

    const px = -camera.x * camera.zoom * BASE_PARALLAX;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, canvas.width, bh);
    ctx.clip();

    drawStrata(u, y0, bh);
    for (const kind of u.kinds) {
      const fn = KINDS[kind];
      if (fn) fn(px, y0, bh, u, tick);
    }

    // Light falls off with depth.
    const dg = ctx.createLinearGradient(0, y0, 0, y0 + bh);
    dg.addColorStop(0, 'rgba(0,0,0,0)');
    dg.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    dg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, y0, canvas.width, bh);

    // The cut: hard dark line where the street was sliced, plus the lit lip
    // just under it. Without this the slab appears to float.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, y0, canvas.width, 3);
    ctx.fillStyle = 'rgba(255,214,140,0.10)';
    ctx.fillRect(0, y0 + 3, canvas.width, 3);

    ctx.restore();
  }

  return { draw };
}
