// DASHBOARD UNDER LOAD — what a full contest does to the page he reads.
//
// ⚠️ IN tools/, NOT THE SCRATCHPAD. This started as a scratch file and two
// container rollbacks deleted it mid-session. Anything worth running twice
// belongs in the repo.
//
// The load test (tools/loadtest.mjs) proves the WORKER survives a crowd. This
// proves the PAGE does, which is a different question with different answers:
// the worker is fast at 10,000 rows and the browser is not automatically.
//
// It stubs /data rather than using the live one, because the interesting
// variable is row count and the token is not in this container.
//
// WHAT IT MEASURES, and why each one is the thing that would actually hurt:
//   first paint   how long he stares at an empty cabinet
//   redraw        the 5-second poll — this one runs forever, so a slow redraw
//                 is a permanent stutter, not a one-off wait
//   open          tapping ALL ENTRANTS with the whole contest behind it
//   DOM nodes     the number that decides whether a phone can hold it at all
//   scroll        must be zero sideways at any size: "portrait lock this shit"
//
// Run:  N=10000 PLAYWRIGHT=... CHROMIUM=... node tools/harness/dashload.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const N = Number(process.env.N || 1000);
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;

// Build the page straight from the worker, so this grades what ships.
const mod = await import('../../cloudflare/dashboard-worker.js');
const res = await mod.default.fetch(new Request('https://d.example/?k=t'), { DASH_TOKEN: 't' });
const html = await res.text();
const dir = mkdtempSync(join(tmpdir(), 'dashload-'));
const page_path = join(dir, 'dash.html');
writeFileSync(page_path, html);
console.log(`page ${(html.length / 1024).toFixed(0)}KB, ${N} entrants`);

const now = 1755400000000;
const rows = Array.from({ length: N }, (_, i) => ({
  id: 'x' + i, name: 'PLAYER' + i, score: 60000 - i * 5, plays: 1 + (i % 6),
  phone: String(4045550000 + i), email: 'player' + i + '@example.com',
  updated: now - i * 60000, created: now, best_ms: 150000 + i * 11,
}));
const geo = Array.from({ length: 60 }, (_, i) => ({
  city: 'CITY' + i, region: 'GA', country: 'US',
  lat: 25 + ((i * 1.1) % 30), lon: -125 + ((i * 2.3) % 55),
  runs: 90 - i, players: 60 - i, best: 60000 - i * 700,
}));
const data = {
  ok: true, rows, geo, counts: { entrants: N, plays: N * 3 },
  rejects: Array.from({ length: 500 }, (_, i) => ({
    t: now - i * 6e4, reason: 'implausible-rate', detail: 'score 9000 in 12000ms',
  })),
  totals: { runs: N * 3, kills: 90000, deaths: 4000, bags: 520000, continues: 600, best: 60000, ms: 4e8 },
  funnel: {
    runs: N * 3, s1: N * 3, s2: 1200, s3: 600, s4: 200, d_enemy: 2000,
    d_pothole: 1500, d_fall: 500, bottles: 9000, bags_lost: 120000, avg_ms: 240000,
  },
  spark: Array.from({ length: 72 }, (_, i) => ({ hour: i, n: Math.round(50 + 90 * Math.sin(i / 6)) })),
  contest: { start: 0, end: 0, now },
};

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let fail = 0;
for (const [W, H] of [[430, 932], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { fail += 1; console.log('  THROWN ' + e.message); });
  await p.route('**/data*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));

  const t0 = Date.now();
  await p.goto('file://' + page_path + '?k=x', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.querySelectorAll('#entrants .row').length > 0, { timeout: 40000 });
  const first = Date.now() - t0;

  const m = await p.evaluate(() => ({
    inlineRows: document.querySelectorAll('#entrants .row').length,
    dom: document.getElementsByTagName('*').length,
    dots: document.querySelectorAll('#map circle').length,
    hscroll: document.documentElement.scrollWidth - innerWidth,
  }));
  // The poll, twice — the second is the one that matters, because by then the
  // signature check should be short-circuiting an unchanged repaint.
  const redraw1 = await p.evaluate(() => {
    const t = performance.now(); window.draw(); return Math.round(performance.now() - t);
  });
  const t1 = Date.now();
  await p.click('#xEnt');
  await p.waitForFunction(() => document.querySelectorAll('#expRows .row').length > 0, { timeout: 40000 });
  const open = Date.now() - t1;
  const openRows = await p.evaluate(() => document.querySelectorAll('#expRows .row').length);
  const redrawOpen = await p.evaluate(() => {
    const t = performance.now(); window.draw(); return Math.round(performance.now() - t);
  });
  const expScroll = await p.evaluate(() => {
    const e = document.getElementById('exp');
    return { x: e.scrollWidth - e.clientWidth, y: e.scrollHeight - e.clientHeight };
  });

  console.log(`\n${W}x${H}`);
  console.log(`  first paint      ${first}ms`);
  console.log(`  poll redraw      ${redraw1}ms   (runs every 5s, forever)`);
  console.log(`  open full table  ${open}ms with ${openRows} rows`);
  console.log(`  poll while open  ${redrawOpen}ms   (must not rebuild an unchanged table)`);
  console.log(`  DOM nodes        ${m.dom}   inline rows ${m.inlineRows}   map dots ${m.dots}`);
  console.log(`  sideways scroll  page ${m.hscroll}px, table ${expScroll.x}px   (both must be 0)`);
  if (m.hscroll !== 0 || expScroll.x !== 0) { fail += 1; console.log('  FAIL sideways scroll'); }
  if (redrawOpen > 60) { fail += 1; console.log('  FAIL the open table repaints when nothing changed'); }
  await ctx.close();
}
console.log('\n' + (fail === 0 ? 'ALL PASS' : `${fail} FAIL`));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
