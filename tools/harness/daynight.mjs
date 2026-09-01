// DAY AGAINST NIGHT, SAME STAGE, SAME CAMERA. The client: "a lot of daytime
// errors on the scenery... compare and contrast all of the nighttime scenes
// with the daytime scenes and find the overlay errors."
//
// They are different paintings, so a pixel diff says nothing. What DOES carry
// across is structure: both halves of a stage are cut into cards with the same
// names, depths and spans, so a card that is misplaced, duplicated or missing
// in the day cut shows up as a hard edge or a hole where the night cut has
// continuous painting. This grabs matched pairs to look at, and scores each
// frame for the things a layering error actually produces.
import { writeFileSync } from 'fs';
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const SP = process.env.SEAM_OUT || 'tools/captures';

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const shots = {};
const scores = {};

for (const tod of ['night', 'day']) {
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log(`THROWN(${tod}):`, e.message));
  await p.goto(`http://localhost:5199/?tod=${tod}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

  for (let i = 0; i < 5; i++) {
    const meta = await p.evaluate(async (idx) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const g = window.__game;
      window.__startStage(idx);
      await frame();
      return { id: g.level.stage.id, end: g.level.stage.stageEnd * 32, spawnY: g.player.y,
               cards: (g.level.stage.bg.cards || []).length };
    }, i);

    // Five positions across the stage, the same fractions in both halves.
    for (const [k, f] of [[0, 0.02], [1, 0.25], [2, 0.5], [3, 0.75], [4, 0.95]].values()) {
      const s = await p.evaluate(async ([x, spawnY]) => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const g = window.__game; const cam = window.__camera;
        g.player.x = x; g.player.vx = 0; g.player.y = spawnY; g.player.vy = 0;
        g.hearts = 3; g.player.hearts = 3;
        if (g.screen !== 'playing') g.screen = 'playing';
        cam.x = x;
        await frame();
        const cv = document.querySelector('canvas');
        const pl = window.__plate;
        const y0 = Math.max(0, Math.round(pl.by));
        const y1 = Math.min(cv.height, Math.round(pl.groundY));
        const rows = y1 - y0, W = cv.width;
        const d = cv.getContext('2d').getImageData(0, y0, W, rows).data;

        // Two things a layering error produces that ordinary painting does not.
        // HARD COLUMNS: a full-height vertical step, which is a card edge or a
        // tile join rather than a painted corner (a real corner covers part of
        // the height, a misplaced card covers all of it).
        // FLAT HOLES: a run of near-identical pixels, which is a gap where a
        // card should have been and the sky or a clear colour is showing.
        let hardCols = 0, flat = 0;
        for (let cx = 1; cx < W; cx++) {
          let big = 0;
          for (let y = 0; y < rows; y++) {
            const a = (y * W + cx) * 4;
            const dv = Math.abs(d[a] - d[a - 4]) + Math.abs(d[a + 1] - d[a - 3]) + Math.abs(d[a + 2] - d[a - 2]);
            if (dv > 90) big++;
          }
          if (big > rows * 0.55) hardCols++;
        }
        for (let y = 0; y < rows; y += 4) {
          let run = 0;
          for (let cx = 1; cx < W; cx++) {
            const a = (y * W + cx) * 4;
            const dv = Math.abs(d[a] - d[a - 4]) + Math.abs(d[a + 1] - d[a - 3]) + Math.abs(d[a + 2] - d[a - 2]);
            run = dv < 3 ? run + 1 : 0;
            if (run > W * 0.55) { flat++; break; }
          }
        }
        return { hardCols, flat, band: rows };
      }, [Math.round(meta.end * f), meta.spawnY]);

      const key = `${meta.id}_${k}`;
      scores[`${tod}:${key}`] = s;
      const path = `${SP}/dn_${tod}_${meta.id}_${k}.png`;
      await p.screenshot({ path });
      shots[`${tod}:${key}`] = path;
    }
    console.log(`${tod.padEnd(6)} ${meta.id.padEnd(12)} ${String(meta.cards).padStart(2)} cards  `
      + [0, 1, 2, 3, 4].map((k) => {
        const s = scores[`${tod}:${meta.id}_${k}`];
        return `${String(s.hardCols).padStart(2)}/${String(s.flat).padStart(2)}`;
      }).join('  '));
  }
  await c.close();
}

console.log('\nhardColumns/flatRows per position (2%, 25%, 50%, 75%, 95% of the stage)');
console.log('\nDAY MINUS NIGHT — positive means the day cut has more of it:');
for (const id of ['eav', 'edgewood', 'underground', 'l5p', 'buckhead']) {
  const row = [0, 1, 2, 3, 4].map((k) => {
    const d = scores[`day:${id}_${k}`], n = scores[`night:${id}_${k}`];
    if (!d || !n) return '  ?  ';
    const hc = d.hardCols - n.hardCols, fl = d.flat - n.flat;
    return `${(hc >= 0 ? '+' : '') + hc}/${(fl >= 0 ? '+' : '') + fl}`;
  });
  console.log(`  ${id.padEnd(12)} ${row.map((r) => r.padStart(7)).join(' ')}`);
}
writeFileSync(`${SP}/daynight.json`, JSON.stringify(scores, null, 1));
await b.close();
