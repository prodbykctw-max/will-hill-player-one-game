// ON THE DASHBOARD: WHICH BOXES DO SOMETHING, AND CAN YOU TELL?
//
// Client: "The dashboard also needs to have the buttons that are actual
// working buttons more noticeably apparent."
//
// The same measurement btnglow.mjs makes on the game, against the same failure
// modes — a rect that moved in the worker's stylesheet and not in the cutter, a
// painted frame lighting up instead of the words in it, a layer that eats taps,
// a layer that never resolves — but on a page whose plate is base64 inside the
// worker, so this builds the page from the worker itself and grades what ships.
//
// ⚠️ THE PLATE HAS SIX READOUTS FOR EVERY CONTROL. Lighting the right things is
// only half of it: the ENTRANTS tile, the heatmap frame, STAGE PROGRESSION and
// the MARTA console at the foot must all stay dark, or the glow says nothing.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/dashglow.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// Straight from the worker, so this grades the page he actually opens.
const mod = await import('../../cloudflare/dashboard-worker.js');
const res = await mod.default.fetch(new Request('https://d.example/?k=t'), { DASH_TOKEN: 't' });
const html = await res.text();
const dir = mkdtempSync(join(tmpdir(), 'dashglow-'));
const page_path = join(dir, 'dash.html');
writeFileSync(page_path, html);
console.log(`page ${(html.length / 1024).toFixed(0)}KB`);

const now = 1755400000000;
const data = {
  ok: true,
  rows: Array.from({ length: 12 }, (_, i) => ({
    id: 'x' + i, name: 'PLAYER' + i, score: 60000 - i * 5, plays: 1 + (i % 6),
    phone: String(4045550000 + i), email: 'p' + i + '@example.com',
    updated: now - i * 60000, created: now, best_ms: 150000 + i * 11,
  })),
  geo: [{ city: 'ATLANTA', region: 'GA', country: 'US', lat: 33.78, lon: -84.39, runs: 9, players: 4, best: 29750 }],
  counts: { entrants: 12, plays: 36 },
  rejects: [{ t: now, reason: 'implausible-rate', detail: 'score 9000 in 12000ms' }],
  totals: { runs: 36, kills: 90, deaths: 40, bags: 520, continues: 6, best: 60000, ms: 4e6 },
  funnel: { runs: 36, s1: 36, s2: 12, s3: 6, s4: 2, d_enemy: 20, d_pothole: 15, d_fall: 5, bottles: 9, bags_lost: 120, avg_ms: 240000 },
  spark: Array.from({ length: 72 }, (_, i) => ({ hour: i, n: 10 + i })),
  contest: { start: 0, end: 0, now },
};

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => check('no exception', false, e.message));
await p.route('**/data*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
await p.goto('file://' + page_path + '?k=x', { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.querySelectorAll('#entrants .row').length > 0, { timeout: 40000 });

const NAMES = ['glyphglow', 'glyphglowcalm', 'textglow'];
const freeze = (t) => p.evaluate(([names, tt]) => {
  document.getAnimations().forEach((a) => {
    if (!names.includes(a.animationName)) return;
    const d = a.effect.getTiming().duration;
    a.pause();
    a.currentTime = tt * (typeof d === 'number' ? d : 3600);
  });
}, [NAMES, t]);

// The trough and the peak of one cycle; the difference is the glow.
async function litMap() {
  await freeze(0);
  await p.waitForTimeout(60);
  const dim = await p.screenshot();
  await freeze(0.5);
  await p.waitForTimeout(60);
  const lit = await p.screenshot();
  return p.evaluate(async ([a, c]) => {
    const grid = async (bytes) => {
      const im = new Image();
      await new Promise((res2, rej) => {
        im.onload = res2; im.onerror = rej;
        im.src = 'data:image/png;base64,' + bytes;
      });
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const out = new Float32Array(cv.width * cv.height);
      for (let i = 0; i < out.length; i += 1) {
        out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      }
      return { w: cv.width, h: cv.height, v: out };
    };
    const A = await grid(a);
    const B = await grid(c);
    const diff = new Float32Array(A.v.length);
    for (let i = 0; i < diff.length; i += 1) diff[i] = B.v[i] - A.v[i];
    return { w: A.w, h: A.h, diff: Array.from(diff) };
  }, [dim.toString('base64'), lit.toString('base64')]);
}

function inRect(map, r, cssW) {
  const s = map.w / cssW;
  const x0 = Math.max(0, Math.round(r.x * s));
  const y0 = Math.max(0, Math.round(r.y * s));
  const x1 = Math.min(map.w, Math.round((r.x + r.width) * s));
  const y1 = Math.min(map.h, Math.round((r.y + r.height) * s));
  let n = 0; let hit = 0; let sum = 0; let max = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const d = map.diff[y * map.w + x];
      n += 1;
      if (d > 3) { hit += 1; sum += d; }
      if (d > max) max = d;
    }
  }
  return { cover: n ? hit / n : 0, mean: hit ? sum / hit : 0, max, px: n };
}

// ⚠️ THE WHOLE PLATE FITS ON A PHONE, and that is why there are only two
// passes. 853/1844 at 430px wide is 930px tall against a 932px viewport, so one
// scroll position has every control on screen at once — a third pass measured
// byte-identical numbers and only printed each result twice. The second pass
// stays because the plate is capped at max-width 760px, so on a wider screen it
// is 1642px tall and nothing below the heatmap would be in the first frame.
const CONTROLS = ['q', 'csv', 'mWorld', 'mUS', 'mATL', 'xEnt', 'xRej'];
// Readouts, in the same bands as the controls — the comparison that makes the
// glow mean something.
const READOUTS = ['tEntrants', 'tRuns', 'map', 'spark', 'stage'];

const rectsOf = (ids) => p.evaluate((list) => {
  const out = {};
  for (const id of list) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    out[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return out;
}, ids);

const cssW = await p.evaluate(() => innerWidth);

// Take it in two passes down the page, so every control is on screen for one.
for (const [tag, y] of [['top', 0], ['lower', 0.42]]) {
  await p.evaluate((f) => {
    const pl = document.getElementById('plate').getBoundingClientRect();
    scrollTo(0, Math.max(0, scrollY + pl.top + pl.height * f - innerHeight * 0.35));
  }, y);
  await p.waitForTimeout(120);
  const map = await litMap();
  const rs = await rectsOf([...CONTROLS, ...READOUTS]);
  for (const [id, r] of Object.entries(rs)) {
    // Only judge something fully inside the viewport on this pass.
    if (r.y < 4 || r.y + r.height > 928) continue;
    const m = inRect(map, r, cssW);
    if (CONTROLS.includes(id)) {
      check(`${tag}: #${id} lights up`, m.max > 10 && m.cover > 0.01,
        `cover ${(m.cover * 100).toFixed(1)}% mean +${m.mean.toFixed(0)} max +${m.max.toFixed(0)}`);
    } else {
      check(`${tag}: the #${id} readout stays dark`, m.cover < 0.02,
        `cover ${(m.cover * 100).toFixed(2)}%`);
    }
  }
}

// Nothing may be swallowed by the layer.
const eaten = await p.evaluate((ids) => {
  const out = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) { out.push(id + ' MISSING'); continue; }
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (hit && hit.id !== id && !el.contains(hit)) out.push(`${id}->${hit.id || hit.tagName}`);
  }
  return out;
}, CONTROLS);
check('the glow layer eats no taps', eaten.length === 0, eaten.join(' '));

// The pulse is real, slow, and survives motion-reduced as a slower breath.
const anims = await p.evaluate((names) => document.getAnimations()
  .filter((a) => names.includes(a.animationName))
  .map((a) => ({ n: a.animationName, d: a.effect.getTiming().duration })), NAMES);
const pulse = anims.find((a) => a.n === 'glyphglow');
check('the pulse is running', !!pulse, JSON.stringify(anims));
check('and it is a slow breath, not a blink',
  !!pulse && pulse.d >= 3000 && pulse.d <= 6000, pulse ? `${pulse.d}ms` : 'absent');

const still = await ctx.newPage();
await still.emulateMedia({ reducedMotion: 'reduce' });
await still.route('**/data*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
await still.goto('file://' + page_path + '?k=x', { waitUntil: 'networkidle' });
await still.waitForTimeout(400);
const reduced = await still.evaluate(() => {
  const a = document.getAnimations().find((x) => x.animationName === 'glyphglowcalm');
  const fast = document.getAnimations().filter((x) => x.animationName === 'glyphglow').length;
  if (!a) return { missing: true, fast };
  const at = (t) => {
    a.pause(); a.currentTime = t * a.effect.getTiming().duration;
    return parseFloat(getComputedStyle(document.getElementById('plate'), '::after').opacity);
  };
  return { dur: a.effect.getTiming().duration, low: at(0), high: at(0.5), fast };
});
check('reduced motion still breathes, slower and shallower',
  !reduced.missing && reduced.fast === 0 && reduced.dur >= 6000
  && reduced.low >= 0.5 && reduced.high > reduced.low + 0.15, JSON.stringify(reduced));

const bad = checks.filter(([, ok]) => !ok).length;
console.log('\n' + (bad === 0 ? `ALL ${checks.length} PASS` : `${bad} of ${checks.length} FAIL`));
await b.close();
process.exit(bad === 0 ? 0 : 1);
