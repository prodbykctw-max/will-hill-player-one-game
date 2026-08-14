// NO STREETLAMP BEHAVIOUR AT MIDDAY — on any stage, in any of its forms.
//
// Client, from the live game: "there is beam of light coming down on him in
// the daytime that look like street lights... he walks shining on and not
// shining on him... even though it's daytime — that's only for nighttime.
// Can we check and make sure that NONE of the daytime stages have that."
//
// The glow (pools/shafts/bloom) was already gated on tod. What was NOT gated
// was the lamps' GEOMETRY: litness() modulated the sprite key-light and both
// shadow functions by distance to the nearest lamp on the 420-unit grid, so
// in daylight he brightened and dimmed every 420 units — the exact symptom —
// and the backdrop's practicals (neon halos, relight, wet-street glow) drew
// over the sunlit plates because all four day bg variants still DECLARE
// their lights.
//
// So the proof is by measurement, per stage, day AND night:
//   1. Teleport him across 2x the lamp spacing and read the mean luminance
//      of his own sprite box at each stop. Day: flat (no invisible lamps).
//      Night: it must still swing — the night look is load-bearing and this
//      file must catch a regression in EITHER direction.
//   2. Watch a declared practical's screen box across frames. Night: it
//      buzzes (flicker is written into the data). Day: static plate (only
//      card sway moves, which is far smaller).
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/daylamps.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// The lamp grid the code uses; sampling at eighth-spacing steps across two
// full periods guarantees stops both under and between lamps.
const LAMP_SPACING = 420;

for (const tod of ['day', 'night']) {
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

  for (let si = 0; si < 4; si++) {
    const r = await p.evaluate(async ([stageIdx, SPACING]) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const g = window.__game;
      const cam = window.__camera;
      window.__startStage(stageIdx);
      for (let k = 0; k < 6; k++) await frame();

      const { T, FLOOR_R } = await import('/src/world/tilemap.js');
      const cv = document.querySelector('canvas');
      const c2 = cv.getContext('2d');
      const groundW = FLOOR_R * T;

      const lum = (x, y, w, h) => {
        x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
        w = Math.round(w); h = Math.round(h);
        if (w < 2 || h < 2 || x + w > cv.width || y + h > cv.height) return null;
        const d = c2.getImageData(x, y, w, h).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return s / (d.length / 4);
      };

      // ── 1. him, across the lamp grid ────────────────────────────────
      //
      // ⚠️ A STOP IS ONLY VALID IF NOTHING ELSE IS IN THE BOX. The first run
      // failed day-EAV on a single 30-luminance stop that was equally dark
      // at NIGHT — a pit / passing enemy at that x, not lighting. Lamps only
      // ever BRIGHTEN (litness raises the key alpha; the night span on clean
      // stages is 9-12 levels), so a 50-level crater is occlusion by
      // construction. Guard: he must be alive, on the street, and no enemy
      // near; and the reported span still drops the single darkest stop so
      // one un-modelled prop cannot fail a flat day or rescue a flat night.
      const sprite = [];
      const start = 220;
      for (let i = 0; i < 9; i++) {
        const px = start + i * (SPACING / 4);
        g.player.x = px;
        g.player.y = groundW - g.player.h;   // feet on the street
        g.player.vy = 0;
        for (let k = 0; k < 30; k++) await frame();   // let the camera settle
        if (g.player.dead || g.player.y > groundW - g.player.h + 6) continue;
        const near = g.level.enemies.some((e) =>
          Math.abs((e.x + e.w / 2) - (g.player.x + g.player.w / 2)) < 140);
        if (near) continue;
        const z = cam.zoom;
        const sx = (g.player.x - cam.x) * z;
        const sy = (g.player.y - cam.y) * z;
        const v = lum(sx + 2, sy + 2, g.player.w * z - 4, g.player.h * z - 4);
        if (v != null) sprite.push(+v.toFixed(2));
      }
      // Trimmed: drop the single darkest stop (see the guard note above).
      const trimmed = sprite.length > 4
        ? [...sprite].sort((a, b) => a - b).slice(1) : sprite;

      // ── 2. does anything BUZZ over the plate? (day only is asserted) ─
      //
      // The first probe aimed a 30px box at a guessed screen position and
      // read static sky — 0.00 even at night, where the flicker is written
      // into the data. Aiming precisely needs the plate geometry backdrop.js
      // keeps private, so instead: full-width strips across the upper frame,
      // max frame-to-frame delta anywhere. A gated day is near-still (only
      // card sway); an un-gated practical buzzing at 'lighter' alpha 0.16-0.36
      // is far louder. Night is NOT asserted this way — rain streaks make
      // night motion unconditionally, which would pass vacuously.
      // ⚠️ AND THE CAPTURE ITSELF MUST BE QUIET. The walk above parks the
      // player wherever its last stop was — once, an enemy closed the gap
      // DURING these 8 frames, the hit flash landed on a capture frame, and
      // edgewood-day "buzzed" at 95. That is the player's own feedback, not
      // the plate. So: retreat to a stop with no enemy anywhere near, and if
      // anything still reaches him mid-capture (hearts change), move on and
      // recapture rather than reporting his damage flash as backdrop light.
      let buzz = Infinity;
      for (let attempt = 0; attempt < 4 && buzz === Infinity; attempt++) {
        let placed = false;
        for (let i = attempt; i < 12 && !placed; i++) {
          const px = start + i * (SPACING / 4);
          const clear = !g.level.enemies.some((e) =>
            Math.abs((e.x + e.w / 2) - px) < 320);
          if (!clear) continue;
          g.player.x = px;
          g.player.y = groundW - g.player.h;
          g.player.vy = 0;
          placed = true;
        }
        for (let k = 0; k < 20; k++) await frame();
        const h0 = g.player.hearts;
        const strips = [];
        for (let k = 0; k < 8; k++) {
          await frame();
          const row = [];
          for (let sYf = 0.10; sYf <= 0.55; sYf += 0.15) {
            const v = lum(0, cv.height * sYf, cv.width, 14);
            if (v != null) row.push(v);
          }
          strips.push(row);
        }
        if (g.player.hearts !== h0 || g.player.dead) continue; // he got hit — retry
        buzz = 0;
        for (let k = 1; k < strips.length; k++) {
          for (let j = 0; j < strips[k].length; j++) {
            buzz = Math.max(buzz, Math.abs(strips[k][j] - strips[k - 1][j]));
          }
        }
      }
      if (buzz === Infinity) buzz = -1; // never got a quiet capture — visible in output
      const span = (a) => (a.length ? Math.max(...a) - Math.min(...a) : null);
      return {
        id: g.level.stage.id, tod: g.level.stage.tod,
        sprite, kept: trimmed.length, spriteSpan: span(trimmed),
        buzz: +buzz.toFixed(3),
      };
    }, [si, LAMP_SPACING]);

    console.log(`\n  [${tod}] ${r.id}  sprite luminance (${r.kept} clean stops): ${r.sprite.join(' ')}`);
    if (tod === 'day') {
      check(`[day] ${r.id}: he does NOT pulse crossing the lamp grid`,
        r.kept >= 4 && r.spriteSpan < 7, `trimmed span ${r.spriteSpan}`);
      check(`[day] ${r.id}: nothing buzzes over the sunlit plate`,
        r.buzz < 2.5, `worst frame-to-frame strip delta ${r.buzz}`);
    } else {
      check(`[night] ${r.id}: the lamps still light him unevenly`,
        r.kept >= 4 && r.spriteSpan > 6, `trimmed span ${r.spriteSpan}`);
    }
  }
  await p.context().close();
}

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
