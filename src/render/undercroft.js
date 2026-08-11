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
    const y = y0 + bh * 0.56;
    const r = Math.max(11, bh * 0.10);
    ctx.save();
    run(px, 0.8, 260, (x) => {
      ctx.fillStyle = u.brick;
      ctx.fillRect(x, y - r, 260, r * 2);
      // brick courses
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.lineWidth = 1;
      for (let by = y - r + 4; by < y + r; by += 5) {
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x + 260, by);
        ctx.stroke();
      }
      // the void inside, with standing water catching a highlight
      ctx.fillStyle = u.void_;
      ctx.fillRect(x, y - r * 0.55, 260, r * 1.1);
      ctx.fillStyle = 'rgba(120,150,170,0.22)';
      ctx.fillRect(x, y + r * 0.34, 260, 2);
      // arch shading
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(x, y - r, 260, 3);
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
    const depth = bh * 0.56;
    ctx.save();
    run(px, 0.8, 760, (x, i) => {
      if (hash01(i * 6.7) > 0.62) return;
      const w = 26;
      ctx.fillStyle = u.concrete;
      ctx.fillRect(x, y0, w, depth);
      ctx.fillStyle = u.void_;
      ctx.fillRect(x + 4, y0, w - 8, depth);
      // step irons
      ctx.fillStyle = u.metal;
      for (let sy = y0 + 14; sy < y0 + depth - 6; sy += 16) {
        ctx.fillRect(x + 6, sy, w - 12, 1.6);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + w - 4, y0, 4, depth);
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

  const KINDS = { sewer, water, conduit, manhole, footings, roots, tunnel };

  /**
   * @param stage    stage object (reads stage.under)
   * @param groundY  screen y of the world floor (camera.groundScreenY())
   * @param slabPx   drawn thickness of the street slab in screen px — the
   *                 section starts BELOW it, not at the ground line
   * @param camera   for parallax
   */
  function draw(stage, groundY, slabPx, camera) {
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
      if (fn) fn(px, y0, bh, u);
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
