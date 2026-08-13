// THE WHOLE STAGE AS ONE LONG STRIP, DAY ABOVE NIGHT.
//
// The client: "show me all of the day and night side-by-side of each stage to
// confirm that there is no issues, basically a side-scroll version of the full
// stage so I can look at it and tell you."
//
// Walks the camera across the entire stage in screen-width steps and stitches
// the backdrop band from each step. Both halves are sampled at the SAME camera
// positions, so a tile in the day strip and the tile above it in the night
// strip are the same piece of street and can be compared directly.
//
// The player is parked far above the canvas rather than left in shot — the
// camera's vertical follow clamps to the level, so he leaves the frame and the
// camera does not chase him. The HUD and the pads are outside the band.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/stagestrip.mjs [scale]
import { writeFileSync } from 'fs';
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const SP = process.env.SEAM_OUT || 'tools/captures';
const SCALE = Number(process.argv[2] || 0.5);

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const tiles = {};   // `${tod}:${stage}` -> [dataURL,...]
const meta = {};

for (const tod of ['night', 'day']) {
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log(`THROWN(${tod}):`, e.message));
  await p.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

  for (let i = 0; i < 4; i++) {
    const r = await p.evaluate(async ([idx, scale]) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const g = window.__game; const cam = window.__camera;
      window.__startStage(idx);
      await frame();
      const cv = document.querySelector('canvas');
      const W = cv.width;
      const endX = g.level.stage.stageEnd * 32;

      // One frame to learn where the band is, then park the player off-screen.
      const pl0 = window.__plate;
      // Below the HUD. The portrait, bars and pause button live in the top
      // ~78px and would be stamped into every tile of the strip, which makes
      // the two halves harder to compare rather than easier.
      const HUD = 82;
      const y0 = Math.max(HUD, Math.round(pl0.by));
      const y1 = Math.min(cv.height, Math.round(pl0.groundY + 40));
      const h = y1 - y0;

      const out = [];
      const scratch = document.createElement('canvas');
      scratch.width = Math.round(W * scale);
      scratch.height = Math.round(h * scale);
      const sctx = scratch.getContext('2d');

      for (let x = 0; x < endX; x += W) {
        g.player.x = x; g.player.vx = 0;
        g.player.y = -40000; g.player.vy = 0;      // out of frame; camera clamps
        g.hearts = 3; g.player.hearts = 3;
        if (g.screen !== 'playing') g.screen = 'playing';
        cam.x = x; cam.y = 0;
        await frame();
        sctx.clearRect(0, 0, scratch.width, scratch.height);
        sctx.drawImage(cv, 0, y0, W, h, 0, 0, scratch.width, scratch.height);
        out.push(scratch.toDataURL('image/webp', 0.82));
      }
      return { id: g.level.stage.id, tiles: out,
               tw: scratch.width, th: scratch.height, n: out.length };
    }, [i, SCALE]);
    tiles[`${tod}:${r.id}`] = r.tiles;
    meta[`${tod}:${r.id}`] = { tw: r.tw, th: r.th, n: r.n };
    console.log(`${tod.padEnd(6)} ${r.id.padEnd(12)} ${r.n} tiles of ${r.tw}x${r.th}`);
  }
  await c.close();
}
writeFileSync(`${SP}/stagestrip.json`, JSON.stringify({ tiles, meta }));
console.log(`\nwritten to ${SP}/stagestrip.json`);
await b.close();
