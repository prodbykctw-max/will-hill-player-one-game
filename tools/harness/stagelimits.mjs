// The Worker's per-stage limits (STAGE_LIMITS in cloudflare/leaderboard-worker.js)
// are numbers copied out of the levels. Copies drift, and a drifted limit is
// worse than none: too low and it refuses honest runs, too high and it lets a
// forgery through. So this re-derives every one from the shipping generator and
// the physics constants and fails if the Worker's table disagrees.
//
//   node tools/harness/stagelimits.mjs
//
// No browser. esbuild (already a dependency of vite) bundles the generator with
// its image imports stubbed out, because the generator only needs the stage
// recipes and never looks at a pixel.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stagelimits-'));
const entry = path.join(tmp, 'entry.mjs');
const out = path.join(tmp, 'out.mjs');
const root = path.resolve('.');
fs.writeFileSync(entry, `
import { createLevel, buildRunway, genAhead } from ${JSON.stringify(root + '/src/world/generator.js')};
import { resolveStages } from ${JSON.stringify(root + '/src/world/stages.js')};
export { resolveStages, createLevel, buildRunway, genAhead };
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm',
  loader: { '.webp': 'empty', '.png': 'empty', '.jpg': 'empty', '.mp3': 'empty', '.ogg': 'empty' },
  logLevel: 'error',
});
const { resolveStages, createLevel, buildRunway, genAhead } = await import(pathToFileURL(out).href);
const { STAGE_LIMITS, MAX_CONTINUES } = await import('../../cloudflare/leaderboard-worker.js');

const src = (f) => fs.readFileSync(f, 'utf8');
const num = (text, re) => Number((text.match(re) || [])[1]);

// physics, read from the files that define it
const phys = src('src/core/physics.js');
const DASH_VX = num(phys, /export const DASH_VX = ([\d.]+)/);
const DASH_TICKS = num(phys, /export const DASH_TICKS = ([\d.]+)/);
const DASH_CD = num(phys, /export const DASH_COOLDOWN = ([\d.]+)/);
const RUN = num(phys, /export const RUN_SPEED = ([\d.]+)/);
const fastest = (DASH_TICKS * DASH_VX + (DASH_CD - DASH_TICKS) * RUN) / DASH_CD;
const champMs = num(src('src/entities/player.js'), /export const CHAMPAGNE_SECONDS = (\d+)/) * 1000;
const tickMs = num(src('src/core/loop.js'), /const STEP_MS = ([\d.]+)/);
const window = Math.ceil((champMs / tickMs) * 9.12);
console.log(`  fastest travel ${fastest.toFixed(4)} px/tick (worker uses 9.12), window ${window} px`);
check('9.12 px/tick covers the fastest possible travel (dash chain)', fastest <= 9.12, String(fastest));
check('the Worker\'s 9 s champagne window and 16.6 ms tick match the game', champMs === 9000 && tickMs === 16.6);
check('MAX_CONTINUES matches CONTINUES_PER_RUN in src/main.js',
  MAX_CONTINUES === num(src('src/main.js'), /const CONTINUES_PER_RUN = (\d+)/));
check('the player spawns at column 3 (SPAWN_COL)', /createPlayer\(3 \* T,/.test(src('src/main.js')));

const stages = resolveStages('day');
check('same number of stages as the Worker table', stages.length === STAGE_LIMITS.length, String(stages.length));
stages.forEach((S, i) => {
  const L = STAGE_LIMITS[i] || {};
  for (const tod of ['day', 'night']) {
    const st = resolveStages(tod)[i];
    const lv = createLevel(st, i); buildRunway(lv); genAhead(lv, st.stageEnd + 60);
    const xs = lv.bags.map((b) => b.x).sort((a, b) => a - b);
    let win = 0;
    for (const s of xs) win = Math.max(win, xs.filter((x) => x >= s && x <= s + window).length);
    const got = { id: st.id, end: st.stageEnd, bags: lv.bags.length, enemies: lv.enemies.length,
      bottles: lv.champagnes.length, windowBags: win };
    check(`${st.id} (${tod}) matches the Worker table`,
      JSON.stringify(got) === JSON.stringify({ id: L.id, end: L.end, bags: L.bags, enemies: L.enemies,
        bottles: L.bottles, windowBags: L.windowBags }), JSON.stringify(got));
  }
});
fs.rmSync(tmp, { recursive: true, force: true });
const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `\nFAILED: ${bad.length} of ${checks.length}` : `\nALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
