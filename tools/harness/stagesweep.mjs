// EVERY SCREEN OF EVERY STAGE, DAY AND NIGHT, AS ONE STRIP TO SCROLL.
//
// Client: "present to me the full layout of each stage, all four stages...
// basically a full strip of the stage for me to scroll through and look for
// errors and I'm gonna highlight those." (Four when he said it; buckhead
// makes it five and rides the same loop.)
//
// ⚠️ THIS IS NOT stagestrip.mjs, AND THE DIFFERENCE IS THE WHOLE POINT.
// That file steps the camera by one BACKDROP PERIOD (~6700px) because it is
// answering "what unique art is in this stage" — which comes out as 2-3 tiles
// and is the right answer to that question. It is the wrong answer to this
// one. The artefacts he is hunting — cards sliding off their copy on the base
// plate, seams, doubled edges — depend on where the CAMERA is, and they change
// continuously as he walks. Sampling once per period skips over essentially
// all of them.
//
// So this steps by one SCREEN, from the start of the stage to the finish
// line, and stitches every one. That is ~18 screens per stage: what he would
// actually see playing it, laid out end to end.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/stagesweep.mjs [scale]
import { writeFileSync } from 'fs';
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const OUT = process.env.SEAM_OUT || 'shots';
const SCALE = Number(process.argv[2] || 0.75);

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const tiles = {};
const meta = {};

for (const tod of ['day', 'night']) {
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log(`THROWN(${tod}):`, e.message));
  await p.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

  for (let i = 0; i < 5; i++) {
    const r = await p.evaluate(async ([idx, scale]) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const g = window.__game; const cam = window.__camera;
      window.__startStage(idx);
      for (let k = 0; k < 8; k++) await frame();

      const cv = document.querySelector('canvas');
      const W = cv.width;
      const endX = g.level.stage.stageEnd * 32;
      const pl0 = window.__plate;
      // Below the HUD — the portrait and bars would be stamped into every
      // screen of the strip and make the joins harder to read, not easier.
      const HUD = 84;
      const y0 = Math.max(HUD, Math.round(pl0.by));
      const y1 = Math.min(cv.height, Math.round(pl0.groundY) + 60);
      const h = y1 - y0;

      const scratch = document.createElement('canvas');
      scratch.width = Math.round(W * scale);
      scratch.height = Math.round(h * scale);
      const sctx = scratch.getContext('2d');

      const out = [];
      for (let x = 0; x < endX; x += W) {
        // Him parked above the level and the stage forced live: the camera
        // clamps vertically so it does not chase him, and re-stating hearts
        // and screen each step stops the fall-death loop from taking over
        // (see the note in tools/harness/cloudthread scratch work — at
        // y=-40000 he dies and respawns forever if left to it).
        g.player.x = x; g.player.vx = 0;
        g.player.y = -40000; g.player.vy = 0;
        g.hearts = 3; if (g.player.hearts !== undefined) g.player.hearts = 3;
        if (g.screen !== 'playing') g.screen = 'playing';
        cam.x = x; cam.y = 0;
        await frame();
        await frame();
        sctx.clearRect(0, 0, scratch.width, scratch.height);
        sctx.drawImage(cv, 0, y0, W, h, 0, 0, scratch.width, scratch.height);
        out.push(scratch.toDataURL('image/webp', 0.86));
      }
      return { id: g.level.stage.id, tiles: out, n: out.length,
        tw: scratch.width, th: scratch.height, endX, W };
    }, [i, SCALE]);

    tiles[`${tod}:${r.id}`] = r.tiles;
    meta[`${tod}:${r.id}`] = { tw: r.tw, th: r.th, n: r.n, endX: r.endX };
    console.log(`${tod.padEnd(6)} ${r.id.padEnd(12)} ${r.n} screens of ${r.tw}x${r.th}`
      + `  (${r.endX}px of stage at ${r.W}px a screen)`);
  }
  await c.close();
}
writeFileSync(`${OUT}/stagesweep.json`, JSON.stringify({ tiles, meta }));
console.log(`\nwritten to ${OUT}/stagesweep.json`);
await b.close();
