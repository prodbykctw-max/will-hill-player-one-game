// DO CLOUDS STILL PASS BEHIND THE BUILDINGS — ON EVERY DAY STAGE, EVERY TICK?
//
// This is the regression test for the longest-running bug on the project. The
// client reported clouds threading through the towers for a week and four
// diagnoses were wrong before the real one (a blue sky flood running down a
// building's shadowed face). It was fixed by sealing the sky band, and until
// now the proof lived only in a scratch script and a paragraph of prose — so
// the most expensive bug here had no way of telling anyone if it came back.
//
// ── HOW IT MEASURES ──────────────────────────────────────────────────────
//
// Draw each frame TWICE, with the clouds card and without it. The difference
// IS the weather — no colour-keying, no guessing which pixels are cloud. Then
// classify the clean frame into air and structure and a leak is: weather
// painted on structure.
//
// ⚠️ THREE THINGS THIS HAS TO GET RIGHT, each of which reported a false result
// while the method was being built.
//
//   1. NOISE. Even with the tick pinned, his idle animation and the HUD timer
//      move. Draw the clouds-off state TWICE and subtract what changes between
//      them. One pair is not enough for a cycling animation — take the UNION
//      across every tick sampled. Without this the harness reported 236 px of
//      "cloud on a building" that was Will Hill's own trousers.
//   2. SCOPE. Below the lowest sky pixel there is no weather, and a real
//      crossing always has cloud in open air right beside it. Without both
//      tests a flickering neon sign at the screen edge counts as a cloud.
//   3. DO NOT PARK HIM OFF-SCREEN to clear the frame. At y=-40000 he falls,
//      dies, respawns and the camera snaps — forever; pairs came back 279,503
//      px apart at some ticks and 3,000 at others, which is the phase of a
//      death loop and not a measurement. He is left at spawn here. (Where a
//      harness genuinely must move him — stagesweep.mjs does — the death loop
//      has to be defeated by re-stating hearts and screen EVERY step.)
//
// All of the pixel work happens in the page, so nothing depends on a PNG
// decoder or on files surviving between runs.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/cloudseal.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

const STAGES = ['eav', 'edgewood', 'underground', 'l5p'];
// ⚠️ PROVE THE TEST CAN FAIL. `CLOUDSEAL_BREAK=1` strips the skystruct seal
// back out, which is exactly the state the bug shipped in. A green harness
// that would also be green on the broken code is a comment, and this project
// has already been bitten by one. Run it both ways after touching this file.
const BREAK = process.env.CLOUDSEAL_BREAK === '1';
const TICKS = [400, 2000, 3600, 5200, 6800, 8400];

const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=day', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

for (let si = 0; si < 4; si++) {
  const r = await p.evaluate(async ([idx, ticks, brk]) => {
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const g = window.__game;
    window.__startStage(idx);
    for (let k = 0; k < 70; k++) await frame();   // let the camera converge
    const bg = g.level.stage.bg;
    const all = (bg.cards || []).filter((c) => !(brk && c.key === 'skystruct'));
    const cv = document.querySelector('canvas');
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const pl = window.__plate;
    const y0 = Math.max(0, Math.round(pl.by));
    const y1 = Math.min(cv.height, Math.round(pl.groundY));
    const W = cv.width; const H = Math.max(1, y1 - y0);

    const grab = async (cards, t) => {
      bg.cards = cards;
      for (let k = 0; k < 4; k++) { g.tick = t; await frame(); }
      g.tick = t; await frame();
      return c2.getImageData(0, y0, W, H).data;
    };
    const noClouds = all.filter((c) => c.key !== 'clouds');
    const differs = (a, c, i) => Math.abs(a[i] - c[i]) > 6
      || Math.abs(a[i + 1] - c[i + 1]) > 6 || Math.abs(a[i + 2] - c[i + 2]) > 6;

    // Pass one: the noise floor, unioned across every tick.
    const moving = new Uint8Array(W * H);
    const offs = {};
    for (const t of ticks) {
      const o1 = await grab(noClouds, t);
      const o2 = await grab(noClouds, t);
      offs[t] = o1;
      for (let px = 0; px < W * H; px++) if (differs(o1, o2, px * 4)) moving[px] = 1;
    }

    // Pass two: what the clouds paint, and where it lands.
    const out = [];
    for (const t of ticks) {
      const on = await grab(all, t);
      const off = offs[t];
      const air = new Uint8Array(W * H);
      let horizon = 0;
      for (let px = 0; px < W * H; px++) {
        const i = px * 4;
        const R = off[i]; const G = off[i + 1]; const B = off[i + 2];
        const mx = Math.max(R, G, B) / 255; const mn = Math.min(R, G, B) / 255;
        const sat = mx > 0 ? (mx - mn) / mx : 0;
        // Sky: blue-dominant AND bright enough. The brightness floor is the
        // whole fix — a building's shadowed face is painted dark blue.
        const sky = B > R + 12 && B > G + 4 && mx > 0.50;
        const cloudish = mx > 0.62 && sat < 0.30;
        if (sky || cloudish) { air[px] = 1; horizon = Math.max(horizon, (px / W) | 0); }
      }
      let painted = 0; let onAir = 0; const leakPx = [];
      for (let px = 0; px < W * H; px++) {
        if (moving[px]) continue;
        if (!differs(on, off, px * 4)) continue;
        painted++;
        if (air[px]) { onAir++; continue; }
        if (((px / W) | 0) > horizon) continue;      // below all sky: not weather
        leakPx.push(px);
      }
      // A crossing has cloud in open air beside it; an isolated blob does not.
      const cand = new Uint8Array(W * H);
      for (const px of leakPx) {
        const x = px % W; const y = (px / W) | 0;
        let near = false;
        for (let dy = -18; dy <= 18 && !near; dy += 6) {
          for (let dx = -18; dx <= 18; dx += 6) {
            const nx = x + dx; const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const q = ny * W + nx;
            if (air[q] && !moving[q] && differs(on, off, q * 4)) { near = true; break; }
          }
        }
        if (near) cand[px] = 1;
      }

      // ⚠️ ERODE, THEN DROP THE SPECKS — and this is not threshold-fiddling to
      // get a pass. A cloud's own soft edge always lands a pixel or two on the
      // silhouette it is passing BEHIND; that is anti-aliasing, and it is
      // present in a perfectly sealed frame. The verified offline measurement
      // that established "0 px on every stage" applied exactly these two
      // operators (a 2x2 erosion and an 8px blob floor) and this harness first
      // shipped without them, so it reported 68-257 px on all four stages —
      // evenly spread across every stage and every tick, which is the
      // signature of a fringe, not of a crossing. The real bug was 1,259 px
      // concentrated in a single 734 px blob on ONE stage. Erosion keeps that
      // and kills this.
      const eroded = new Uint8Array(W * H);
      for (let px = 0; px < W * H; px++) {
        if (!cand[px]) continue;
        const x = px % W; const y = (px / W) | 0;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
        if (cand[px - 1] && cand[px + 1] && cand[px - W] && cand[px + W]) eroded[px] = 1;
      }
      // Connected components, 4-way; only blobs of real size count.
      let leak = 0; let biggest = 0;
      const seenPx = new Uint8Array(W * H);
      for (let px = 0; px < W * H; px++) {
        if (!eroded[px] || seenPx[px]) continue;
        const stack = [px]; seenPx[px] = 1; const blob = [];
        while (stack.length) {
          const q = stack.pop(); blob.push(q);
          const x = q % W;
          for (const n of [q - 1, q + 1, q - W, q + W]) {
            if (n < 0 || n >= W * H || seenPx[n] || !eroded[n]) continue;
            if ((n === q - 1 && x === 0) || (n === q + 1 && x === W - 1)) continue;
            seenPx[n] = 1; stack.push(n);
          }
        }
        if (blob.length >= 8) { leak += blob.length; biggest = Math.max(biggest, blob.length); }
      }
      out.push({ t, painted, onAir, leak, biggest });
    }
    bg.cards = all;
    return { id: g.level.stage.id, out };
  }, [si, TICKS, BREAK]);

  const worst = Math.max(...r.out.map((o) => o.leak));
  const seen = Math.max(...r.out.map((o) => o.painted));
  console.log(`  ${r.id}: ` + r.out.map((o) => `t${o.t} ${o.painted}px/${o.leak}leak`).join('  '));
  // ⚠️ A SMALL TOLERANCE, NOT ZERO. A cloud's own soft edge lands a pixel or
  // two on the silhouette it passes behind; that is anti-aliasing, not a cloud
  // crossing a tower. The bug this guards against measured 1,259 px with a
  // 734 px blob, so 60 is far below anything that reads on screen and far
  // above the fringe.
  check(`${r.id}: weather stays off the buildings`, worst <= 60, `worst ${worst}px`);
  // The other half, and it is a real failure mode: sealing too hard hides the
  // weather. One stage went to 9px of visible cloud that way.
  check(`${r.id}: and the clouds are still VISIBLE`, seen >= 200, `max ${seen}px on screen`);
}

console.log('');
console.log(checks.every(([, o]) => o) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, o]) => !o).map(([w]) => w).join(', '));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
