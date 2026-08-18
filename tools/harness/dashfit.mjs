// DOES THE NUMBER FIT THE BOX HE PAINTED? — every value on the dashboard,
// at the scale the contest will actually reach.
//
// Client, looking at the DEATHS tile: "that three is just a little too tall
// for the space it occupied, and generally speaking there's gonna be multiple
// digits there — maybe millions of kills once this competition starts... it
// does have to fit in that space, and maybe a six digit number needs to be
// able to fit in that space also."
//
// ⚠️ EVERY BOX ON THAT PAGE IS A RECT MEASURED OFF HIS PAINTING, AND
// `#plate>*` IS `overflow:hidden`. So a value that outgrows its rect is not
// wrapped or shrunk — it is SHEARED, and the dashboard prints a wrong number
// with total confidence. At four million deaths the total rendered as
// ".237.89" and the three sub-numbers ran through each other. Nothing in the
// existing suite could see it: dashload.mjs grades the page under a crowd of
// ROWS, and the row count is not what breaks these boxes — the digit count is.
//
// It fills the page from the worker itself, so it grades what ships, and it
// measures the RENDERED text with a Range over each element's own text node.
// ⚠️ Do NOT measure by cloning computed style: `getComputedStyle(el).font`
// comes back empty in Chromium, the clone silently falls back to 16px, and
// every single box reports a comfortable pass while the page is visibly torn.
// That is the bug this harness was written after being fooled by once.
//
// Run:  PLAYWRIGHT=... CHROMIUM=... node tools/harness/dashfit.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;

const mod = await import('../../cloudflare/dashboard-worker.js');
const res = await mod.default.fetch(new Request('https://d.example/?k=t'), { DASH_TOKEN: 't' });
const html = await res.text();
const dir = mkdtempSync(join(tmpdir(), 'dashfit-'));
const page_path = join(dir, 'dash.html');
writeFileSync(page_path, html);

const now = 1755400000000;
// ⚠️ THE NUMBERS ARE DELIBERATELY ABSURD. The point is not to predict the
// contest, it is to find the width at which his painting tears. Seven figures
// in every column is past anything three days in Atlanta will produce, which
// is exactly why a pass here means the real thing never gets close.
const payload = (D) => ({
  ok: true,
  rows: [{ id: 'x', name: 'KCTW', score: D.best, plays: D.plays, phone: '4045550000',
    email: 'a@b.c', updated: now, created: now, best_ms: 248000 }],
  geo: [{ city: 'Atlanta', region: 'GA', country: 'US', lat: 33.7, lon: -84.4,
    runs: 9, players: 4, best: D.best }],
  counts: { entrants: D.entrants, plays: D.plays },
  rejects: [{ t: now, reason: 'phone', detail: '0' }],
  totals: { runs: D.plays, kills: D.kills, deaths: D.deaths, bags: D.bags,
    continues: D.continues, best: D.best, ms: 4e8 },
  funnel: { runs: D.plays, s1: D.plays, s2: 4, s3: 3, s4: 2,
    d_enemy: D.d_enemy, d_pothole: D.d_pothole, d_fall: D.d_fall,
    bottles: D.bottles, bags_lost: D.bags_lost, max_combo: D.combo,
    avg_ms: 221000 },
  spark: [{ hour: 20, n: 3 }],
  contest: { start: 0, end: 0, now },
});
const SCALES = [
  ['today', payload({ deaths: 3, kills: 161, bags: 1966, bags_lost: 2003,
    bottles: 15, combo: 7, d_enemy: 2, d_pothole: 0, d_fall: 1, entrants: 1,
    plays: 4, continues: 2, best: 29750 })],
  ['contest', payload({ deaths: 4237891, kills: 9218477, bags: 88214537,
    bags_lost: 47219883, bottles: 918273, combo: 284617, d_enemy: 2841773,
    d_pothole: 918441, d_fall: 477677, entrants: 51234, plays: 812445,
    continues: 412339, best: 4182750 })],
];

// ⚠️ FOUR BOXES ARE KNOWN NOT TO FIT, AND THEY ARE LISTED HERE RATHER THAN
// FIXED OR EXCLUDED. The STAGE PROGRESSION values print "N (P%)". His bar
// track ends at x353 and the panel ends at x418, so there are 62px there for
// a string that wants 107px at six figures — it starts overflowing at a
// three-digit run count. No font size fixes that: the string has to lose
// either the count or the percent.
//
// ⚠️ AND THAT PANEL WAS NOT TOUCHED, ON HIS INSTRUCTION. "Why did you mess
// with the stage progression? I wasn't even asking you to edit stage
// progression." A one-line CSS change went in here while the DEATHS tile was
// being fixed and was reverted the moment he asked. What is left is a
// MEASUREMENT, which is this harness's job — the panel is untouched and the
// call about the string is his. Listing them means the day it is decided,
// the entry is deleted and the check tightens by itself.
const KNOWN = {
  f1v: 'STAGE PROGRESSION value — reported, not changed; see docs/STATUS.md',
  f2v: 'same', f3v: 'same', f4v: 'same',
};

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let fail = 0, checks = 0, warned = 0;
// Both ends of the range the plate is ever drawn at: his phone, and the 760px
// the stylesheet caps it to. The type is all in cqw, so a box that fits at one
// width fits at the other — but that is a claim, and this measures it.
for (const [W, H] of [[430, 932], [900, 1400]]) {
  for (const [label, data] of SCALES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { fail += 1; console.log('  THROWN ' + e.message); });
    await p.route('**/data*', (r) => r.fulfill({
      contentType: 'application/json', body: JSON.stringify(data) }));
    await p.goto('file://' + page_path + '?k=x', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.getElementById('tDeaths').textContent !== '');

    const seen = await p.evaluate(() => {
      // Everything is reported in HIS units — the 853px plate he painted —
      // so a number in this output can be compared straight to a rect in the
      // stylesheet or a pixel in assets/ui-concept/dashboard-empty.png.
      const k = 853 / document.getElementById('plate').getBoundingClientRect().width;
      const out = [];
      document.querySelectorAll('#plate>.v').forEach((el) => {
        if (!el.firstChild) return;
        const r = document.createRange();
        r.selectNodeContents(el);
        const t = r.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push({
          id: el.id, text: el.textContent,
          boxW: +(b.width * k).toFixed(1), textW: +(t.width * k).toFixed(1),
          boxH: +(b.height * k).toFixed(1), lineH: +(t.height * k).toFixed(1),
          px: +(parseFloat(cs.fontSize) * k).toFixed(1),
          // A value that wrapped is torn in half, not merely clipped: the box
          // is one line tall, so BOTH lines lose their top or their bottom.
          // ⚠️ COUNTED FROM THE RANGE'S OWN RECTS, one per line box. Derived
          // from height / line-height it is always NaN, because computed
          // `line-height` on these elements is the string "normal" —
          // parseFloat gives NaN, NaN > 1 is false, and the harness reported
          // a value it could see wrapping as a comfortable pass. Measuring
          // the wrong thing reads exactly like measuring nothing.
          lines: r.getClientRects().length,
        });
      });
      return out;
    });

    console.log(`\n${W}x${H} — ${label}`);
    for (const v of seen) {
      checks += 1;
      const overW = v.textW > v.boxW;
      const wrapped = v.lines > 1;
      if (!overW && !wrapped) continue;
      const why = [overW ? `${v.textW}px of text in a ${v.boxW}px box` : '',
        wrapped ? `wrapped onto ${v.lines} lines` : ''].filter(Boolean).join(', ');
      if (KNOWN[v.id]) {
        warned += 1;
        console.log(`  KNOWN  ${v.id} "${v.text}" — ${why}`);
        console.log(`         ${KNOWN[v.id]}`);
      } else {
        fail += 1;
        console.log(`  FAIL   ${v.id} "${v.text}" — ${why} at ${v.px}px`);
      }
    }
    // The one label this page draws rather than crops out of his painting.
    // It has to keep sitting on the three he painted above it, so its left
    // edge and its width are graded against them, not eyeballed.
    const lab = await p.evaluate(() => {
      const el = document.getElementById('mComboL');
      const k = 853 / document.getElementById('plate').getBoundingClientRect().width;
      const r = document.createRange();
      r.selectNodeContents(el);
      const t = r.getBoundingClientRect();
      const plate = document.getElementById('plate').getBoundingClientRect();
      return { x: +((t.left - plate.left) * k).toFixed(1), w: +(t.width * k).toFixed(1) };
    });
    checks += 1;
    // His labels start at x443 and BAGS LOST — also nine characters — is 65px
    // of ink wide. Measured off assets/ui-concept/dashboard-empty.png.
    const labOff = Math.abs(lab.x - 443) > 2 || Math.abs(lab.w - 67) > 6;
    if (labOff) {
      fail += 1;
      console.log(`  FAIL   MAX COMBO label at x${lab.x} w${lab.w} — his are x443 w65`);
    }
    await ctx.close();
  }
}
console.log(`\n${checks} checks, ${warned} known-open`);
console.log(fail === 0 ? `ALL ${checks} PASS` : `FAILED: ${fail} checks`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
