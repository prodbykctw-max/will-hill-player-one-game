// NOTHING IN THE BACKEND WAS TESTED. THAT IS HOW BOTH OF TODAY'S BUGS SHIPPED.
//
// Fifty-two harnesses in this directory and every one of them drives the game
// in a browser. The Worker — the thing holding the contest, the prize, and
// everybody's phone number — had no test of any kind, so its guarantees were
// only ever as good as the comment above each one. Two of those comments were
// wrong, in production, for weeks:
//
//   /top selected `id` alongside name and score, under a comment saying the
//   query "has no phone column available to leak". True. `id` IS the phone
//   number — SHA-256 of a fixed prefix plus ten digits, which is a rainbow
//   table an afternoon wide.
//
//   MIN_RUN_MS was 60s, from "four stages cannot be crossed in under two
//   minutes" — the time to CLEAR the game, applied to every run. Runs end in
//   death. 93 refusals in the live log against 2 accepted runs.
//
// So this drives THE REAL WORKER MODULE against THE REAL SCHEMA. Not a
// re-implementation and not a mock: `cloudflare/leaderboard-worker.js` is
// imported and its `fetch` is called, and `env.DB` is node:sqlite running
// `cloudflare/schema.sql` behind a D1-shaped adapter. Every SQL string in the
// worker is executed for real, so a query that breaks against the actual
// schema fails here rather than at the party.
//
// The two globals Workers have and Node does not are stubbed and only those:
// `caches` (always a miss, which is the path that reads the database) and the
// `ctx.waitUntil` that writes to it.
//
//   node tools/harness/workerguards.mjs
//
// No browser, no dev server — it is the one harness here that needs neither.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

// The worker's own identity derivation, re-stated here so the leak check can
// look for the ACTUAL value rather than for the word "id". If these two ever
// disagree the check below goes red, which is the right outcome: it means the
// thing being kept out of the response is not the thing being computed.
const idFor = async (digits) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('whp1:' + digits));
  return [...new Uint8Array(buf).slice(0, 10)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// ── D1, shaped over node:sqlite ─────────────────────────────────────────
// D1's surface is prepare().bind().run()/.first()/.all(); .all() answers
// { results }. Constraint violations THROW, which the worker depends on for
// replay protection — node:sqlite throws too, so that path is exercised
// rather than simulated.
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('cloudflare/schema.sql', 'utf8'));
const DB = {
  prepare(sql) {
    const st = db.prepare(sql);
    const wrap = (args) => ({
      run: async () => ({ success: true, ...st.run(...args) }),
      first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }),
    });
    return { bind: (...args) => wrap(args), ...wrap([]) };
  },
};

// Always a miss, so /top reads the database on every call — the branch worth
// grading. A hit just replays bytes this file already checked.
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const ctx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };

// package.json is type:module, so the worker imports directly.
const worker = (await import('../../cloudflare/leaderboard-worker.js')).default;

const ORIGIN = 'https://prodbykctw-max.github.io';
const call = async (url, init = {}) => {
  const headers = { Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.7', ...(init.headers || {}) };
  const req = new Request('https://lb.test' + url, { ...init, headers });
  const res = await worker.fetch(req, { DB }, ctx);
  let body = null;
  try { body = JSON.parse(await res.clone().text()); } catch (_e) {}
  return { status: res.status, body };
};

let uid = 0;
const runId = () => `${(++uid).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
// A log the real client would produce: bags spread evenly across the run, in
// ascending time, inside the claimed duration.
const bags = (n, durationMs) => Array.from({ length: n }, (_, i) => ({
  t: Math.floor(((i + 1) * durationMs) / (n + 2)), type: 'bag',
}));
const submit = (o) => call('/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ runId: runId(), name: 'HARNESS', phone: '4045550100', ...o }),
});
const board = async () => (await call('/top?n=20')).body.runs;
const rejectReasons = () => db.prepare('SELECT reason FROM rejects').all().map((r) => r.reason);

// ── ⚠️ THE FIX: a short run is a real run ────────────────────────────────
// Twenty seconds and 3,350 points is 167/s against a bound of 400 — the exact
// shape the live log refused six times over. Anybody who dies early plays this
// path, and it is the common path, not the edge.
const early = await submit({ durationMs: 20000, events: bags(33, 20000) });
check('a 20s run — an early death — is ACCEPTED', early.status === 200 && early.body.ok === true,
  `${early.status} ${JSON.stringify(early.body)}`);
check('and it is scored from the log, not from anything the client said',
  early.body.score === 3300, String(early.body.score));

// ── ⚠️ THE FIX: the board publishes a name and a number, and nothing else ─
// `id` is SHA-256 of the phone number. Fields leak by accretion — somebody
// adds a column to a SELECT while debugging — so this asserts the whole shape
// rather than asserting the absence of one name.
const rows = await board();
const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
check('/top carries ONLY name and score', keys.join(',') === 'name,score', keys.join(','));
const leaked = await idFor('4045550100');
check('and the entrant id is nowhere in the body, under any key name',
  !JSON.stringify(rows).includes(leaked), leaked);

// ── the floor still exists, it is just in the right place now ────────────
const tiny = await submit({ durationMs: 900, events: bags(1, 900) });
check('a sub-second run is still refused', tiny.status === 400);
const fast = await submit({ durationMs: 10000, events: bags(50, 10000) });
check('500 points a second is still refused — the rate bound does the work',
  fast.status === 400, String(fast.status));
const huge = await submit({ durationMs: 600000, events: bags(701, 600000) });
check('a score above the measured ceiling is still refused', huge.status === 400);
check('and all three are in the abuse log by reason',
  rejectReasons().filter((r) => r === 'implausible-rate').length === 2
  && rejectReasons().includes('over-ceiling'), rejectReasons().join(','));

// ── replay: the primary key is the lock ──────────────────────────────────
const id = runId();
const first = await call('/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ runId: id, name: 'HARNESS', phone: '4045550100',
    durationMs: 30000, events: bags(20, 30000) }),
});
const again = await call('/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ runId: id, name: 'HARNESS', phone: '4045550199',
    durationMs: 30000, events: bags(20, 30000) }),
});
check('a run id submits once', first.status === 200);
check('and the same log under a DIFFERENT phone is refused 409 — the cheapest cheat',
  again.status === 409, String(again.status));

// ── the honeypots answer like success and write nothing ──────────────────
const before = (await board()).length;
const decoy = await submit({ durationMs: 30000, events: bags(20, 30000), score: 999999 });
check('the decoy `score` field is answered as though it worked',
  decoy.status === 200 && decoy.body.ok === true);
const hidden = await submit({ durationMs: 30000, events: bags(20, 30000), website: 'x' });
check('so is the hidden form field', hidden.status === 200 && hidden.body.ok === true);
check('and neither one reached the board', (await board()).length === before);
check('both are in the abuse log',
  rejectReasons().includes('honeypot-score') && rejectReasons().includes('honeypot-field'));

// ── the rest of the door ─────────────────────────────────────────────────
const noPhone = await submit({ durationMs: 30000, events: bags(20, 30000), phone: '' });
check('no phone, no entry — the prize is claimed on that number', noPhone.status === 400);
const wrongOrigin = await call('/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
  body: JSON.stringify({ runId: runId(), phone: '4045550100', durationMs: 30000,
    events: bags(20, 30000) }),
});
check('another page on the internet cannot enter your contest', wrongOrigin.status === 403);
const junk = await call('/submit', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json',
});
check('malformed input is a 400, never a stack trace', junk.status === 400
  && !JSON.stringify(junk.body).toLowerCase().includes('unexpected'), JSON.stringify(junk.body));

// ── one person, one row, holding their best ──────────────────────────────
const lo = await submit({ durationMs: 40000, events: bags(5, 40000), phone: '404-555-0142' });
const hi = await submit({ durationMs: 40000, events: bags(60, 40000), phone: '(404) 555-0142' });
const back = await submit({ durationMs: 40000, events: bags(2, 40000), phone: '14045550142' });
check('the same number typed three ways is one entrant',
  lo.status === 200 && hi.status === 200 && back.status === 200
  && db.prepare('SELECT COUNT(*) n FROM entrants').get().n === 2,
  String(db.prepare('SELECT COUNT(*) n FROM entrants').get().n));
check('and their row keeps the BEST score, not the last one',
  back.body.best === 6000, `${back.body.best}`);
check('every play still counts as a play, even a worse one',
  db.prepare('SELECT plays FROM runs ORDER BY plays DESC').get().plays === 3);

// ── the wall between the board and the contact details ───────────────────
const runCols = db.prepare("SELECT * FROM runs LIMIT 1").get();
check('`runs` has no phone or email column to leak in the first place',
  !('phone' in runCols) && !('email' in runCols), Object.keys(runCols).join(','));
check('the phone is in `entrants`, which no public route selects from',
  !!db.prepare('SELECT phone FROM entrants LIMIT 1').get().phone);

const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `\nFAILED: ${bad.length} of ${checks.length}` : `\nALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
