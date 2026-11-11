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
// schema.sql's own contest_state row starts CLOSED (see its comment: nothing
// is live until someone flips the dashboard's switch) — correct for a real
// database, wrong for this file, whose whole job is testing every OTHER
// guard. Opened here so the rest of this suite exercises what it always did;
// the switch itself gets its own section below, using the same table
// POST /toggle writes.
db.exec('UPDATE contest_state SET open = 1;');
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
// ⚠️ THERE IS NO SCORE CEILING. A 70,000 cap threw away two real contest runs
// (78,750 and 72,400) on day two. A big score at an honest rate is a big score.
//
// The fixture below is that run, rebuilt from the figures docs/STATUS.md
// records for it: 19m17s, knocked out in Little 5 Points with a continue spent,
// 354 plain bags + 175 doubled = 529 bag events (394 + 110 + 25: the L5P
// stage played twice), 167 stomps, 12 champagne, 4 potholes. It is built the
// way the game builds a log — an attempt at each stage between the clears and
// the continue, bottles a third of the way in, doubled bags only inside the 9 s
// after a bottle — so it exercises the validator on a log a real player made.
//   [stage index, bags, doubled, stomps, ends], one row per attempt
const LANI = [
  [0, 90, 35, 21, 'clear'], [1, 97, 35, 24, 'clear'], [2, 103, 35, 27, 'clear'],
  [3, 104, 30, 27, 'death'], [3, 110, 30, 33, 'clear'], [4, 25, 10, 35, 'clear'],
];
const ATTEMPT_MS = [190000, 190000, 190000, 250000, 190000, 130000];
const realisticRun = (plan = LANI, attemptMs = ATTEMPT_MS) => {
  const ev = [];
  let t0 = 0;
  plan.forEach(([stage, nBags, nDoubled, nStomps, end], i) => {
    const len = attemptMs[i];
    const at = (f) => Math.floor(t0 + len * f);
    // two bottles a third and two thirds of the way in
    ev.push({ t: at(0.34), type: 'champagne' }, { t: at(0.68), type: 'champagne' });
    const plain = nBags - nDoubled;
    for (let k = 0; k < plain; k++) ev.push({ t: at(0.02 + 0.9 * (k / plain)), type: 'bag' });
    // doubled bags inside the 8 s after a bottle, split across the two
    for (let k = 0; k < nDoubled; k++) {
      const bottle = k % 2 === 0 ? 0.34 : 0.68;
      ev.push({ t: Math.floor(at(bottle) + 200 + (7500 * k) / nDoubled), type: 'bagx2' });
    }
    for (let k = 0; k < nStomps; k++) ev.push({ t: at(0.05 + 0.85 * (k / nStomps)), type: 'stomp' });
    ev.push({ t: at(0.5), type: 'pothole' });
    t0 += len;
    ev.push({ t: t0 - 5, type: end === 'clear' ? `stage_clear_${stage + 1}` : 'death_enemy' });
    if (end === 'death') ev.push({ t: t0, type: 'continue' });
  });
  return { events: ev.sort((x, y) => x.t - y.t), durationMs: t0 + 2000 };
};
const lani = realisticRun();
const laniOut = await submit(lani);
check('a real 19-minute, 78,750-point run (continue spent, L5P played twice) is ACCEPTED',
  laniOut.status === 200 && laniOut.body.score === 78750, `${laniOut.status} ${JSON.stringify(laniOut.body)}`);
check('and the refusals so far are rate, nothing as a ceiling',
  rejectReasons().filter((r) => r === 'implausible-rate').length === 2
  && !rejectReasons().includes('over-ceiling'), rejectReasons().join(','));

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

// ── ⚠️ THE FIX: a switch on the dashboard, not a date in the source ──────
// Client: "there should be a switch on the dashboard that allows them to
// turn the contest on or off." contest_state is the one row both Workers
// read; this drives the same table POST /toggle writes, not a re-
// implementation of it.
db.exec('UPDATE contest_state SET open = 0;');
const closedRun = await submit({ durationMs: 30000, events: bags(20, 30000) });
check('closing the switch refuses a real, otherwise-valid run',
  closedRun.status === 403 && closedRun.body.ok === false, JSON.stringify(closedRun.body));
check('and the refusal reads as the contest being closed, not a broken run',
  closedRun.body.err === 'contest closed', closedRun.body.err);
db.exec('UPDATE contest_state SET open = 1;');
const reopened = await submit({ durationMs: 30000, events: bags(20, 30000) });
check('opening it again lets the exact same shape of run through',
  reopened.status === 200 && reopened.body.ok === true, JSON.stringify(reopened.body));
// The switch is the primary gate; CONTEST_START/CONTEST_END stay a second,
// optional one. Both unconfigured (0) is the shipped default, which
// inContestWindow() already treats as "not configured — dev/testing", i.e.
// permissive — so the switch is the only thing a closed contest depends on
// today. This just asserts that reading holds rather than re-deriving it.
check('with no scheduled window configured, the switch alone decides it',
  reopened.status === 200,
  'CONTEST_START/END are 0 in the shipped worker — inContestWindow() is permissive by design');

// ── the prize contact: validated, and never re-pointed by a stranger ─────
// The entrant id is a hash of the phone, so anybody who knows a number could
// post a run under it. Before this fix that run's email REPLACED the stored
// one — whoever knew your number could move your prize contact to their own
// inbox. The email is now validated server-side (same pattern as the form,
// src/ui/panel.js emailProblem) and only ever fills an empty one.
const emailOf = (digits) => db.prepare('SELECT email FROM entrants WHERE phone = ?').get(digits)?.email;
const badEmail = await submit({ durationMs: 30000, events: bags(20, 30000), phone: '4045550177', email: 'not an email' });
check('a malformed email is refused server-side', badEmail.status === 400, String(badEmail.status));
check('and is in the abuse log', rejectReasons().includes('email'));
check('and no entrant row was written for it', emailOf('4045550177') === undefined);
const noEmail = await submit({ durationMs: 30000, events: bags(20, 30000), phone: '4045550177', email: '' });
check('an empty email still enters (old registrations carry none)', noEmail.status === 200, String(noEmail.status));
const fill = await submit({ durationMs: 30000, events: bags(20, 30000), phone: '4045550177', email: 'owner@example.com' });
check('a first email fills an empty one', fill.status === 200 && emailOf('4045550177') === 'owner@example.com', emailOf('4045550177'));
const hijack = await submit({ durationMs: 30000, events: bags(20, 30000), phone: '(404) 555-0177', email: 'attacker@example.net', name: 'NEWNAME' });
check('a later run under the same phone cannot replace the email', hijack.status === 200
  && emailOf('4045550177') === 'owner@example.com', emailOf('4045550177'));
const blank = await submit({ durationMs: 30000, events: bags(20, 30000), phone: '4045550177', email: '' });
check('nor can an empty one erase it', blank.status === 200 && emailOf('4045550177') === 'owner@example.com', emailOf('4045550177'));

const heldOut = (await submit({ ...realisticRun([[0, 90, 35, 21, 'death']], [60000]), phone: '4045550314' })).status;
check('and so is an early death on stage one', heldOut === 200, String(heldOut));

// ── ⚠️ W1: a log somebody BUILT is refused ───────────────────────────────
// The audit's forgery, verbatim: 5,000 doubled bags spread over 2,600 s, from
// an Origin the script simply sets. 400 points a second is the rate bound's
// whole job and 1,000,000 / 2,600 s is 385/s, so only the levels can refuse it.
const forged = await submit({ durationMs: 2600000, phone: '4045550301',
  events: Array.from({ length: 5000 }, (_, i) => ({ t: Math.floor((i * 2599000) / 5000), type: 'bagx2' })) });
check('the audit forgery (5,000 doubled bags, no bottle, 2,600 s) is REFUSED',
  forged.status === 400, `${forged.status} ${JSON.stringify(forged.body)}`);
check('and nothing from it reached the board',
  !(await board()).some((r) => r.score >= 1000000));
const why = () => db.prepare("SELECT detail FROM rejects WHERE reason = 'impossible-log' ORDER BY rowid DESC LIMIT 1").get()?.detail || '';
const forge = async (events, durationMs, phone) => {
  const r = await submit({ durationMs, events, phone });
  return { status: r.status, why: why() };
};
const spread = (n, type, ms, from = 0) => Array.from({ length: n }, (_, i) => ({ t: Math.floor(from + ((i + 1) * ms) / (n + 1)), type }));
let f;
f = await forge(spread(787, 'bag', 1157000), 1157000, '4045550302');
check('787 plain bags with no stage cleared and no continue (more than a stage holds) is REFUSED',
  f.status === 400 && f.why.startsWith('bags>'), f.why);
f = await forge(spread(200, 'bagx2', 600000), 600000, '4045550303');
check('doubled bags with no bottle picked up are REFUSED',
  f.status === 400 && f.why.startsWith('bagx2-no-champagne'), f.why);
f = await forge([{ t: 1000, type: 'champagne' }, ...spread(60, 'bagx2', 8000, 1000)], 12000, '4045550304');
check('more doubled bags than fit in one champagne window are REFUSED',
  f.status === 400 && f.why.startsWith('bagx2>'), f.why);
f = await forge([{ t: 1000, type: 'champagne' }, { t: 20000, type: 'bagx2' }], 30000, '4045550305');
check('a doubled bag 19 s after the bottle (window is 9 s) is REFUSED',
  f.status === 400 && f.why.startsWith('bagx2-no-champagne'), f.why);
f = await forge(spread(22, 'stomp', 300000), 300000, '4045550306');
check('more stomps than the stage has enemies (22 on a 21-enemy stage) are REFUSED',
  f.status === 400 && f.why.startsWith('stomps>'), f.why);
f = await forge([...spread(5, 'champagne', 100000), ...spread(5, 'bag', 100000)], 100000, '4045550307');
check('more than two bottles on one stage are REFUSED',
  f.status === 400 && f.why.startsWith('bottles>'), f.why);
f = await forge([...spread(3, 'bag', 50000), { t: 60000, type: 'continue' }, { t: 70000, type: 'continue' }, ...spread(5, 'bag', 100000, 70000)], 100000, '4045550308');
check('a second continue (the game gives one) is REFUSED',
  f.status === 400 && f.why.startsWith('continues'), f.why);
f = await forge([...spread(60, 'bag', 20000), ...[1, 2, 3, 4, 5].map((n, i) => ({ t: 20000 + i * 1000, type: `stage_clear_${n}` }))], 30000, '4045550309');
check('five stages cleared in five seconds is REFUSED — a stage cannot be crossed that fast',
  f.status === 400 && f.why.startsWith('too-fast'), f.why);
f = await forge([...spread(10, 'bag', 100000), { t: 100000, type: 'stage_clear_3' }], 110000, '4045550310');
check('clearing stage three without one and two is REFUSED',
  f.status === 400 && f.why.startsWith('stage-order'), f.why);
// The loop the pocket rule closes: spill bags, pick them up doubled, repeat.
f = await forge([...spread(90, 'bag', 100000), ...spread(90, 'bagLost', 100000, 100000), ...spread(200, 'bag', 100000, 200000)], 300000, '4045550311');
check('losing bags that were never held, then "recollecting" them, is REFUSED',
  f.status === 400 && /^(lost-more-than-held|bags>)/.test(f.why), f.why);
f = await forge([...spread(5, 'bag', 20000), ...spread(6, 'bagLost', 20000, 20000), ...spread(30, 'bag', 20000, 30000)], 60000, '4045550312');
check('knocking loose more money than the pocket holds is REFUSED',
  f.status === 400 && f.why.startsWith('lost-more-than-held'), f.why);
// ...and the honest versions of the same moves are fine.
const spill = await submit({ durationMs: 60000, phone: '4045550313', events: [
  ...spread(10, 'bag', 20000), ...spread(10, 'bagLost', 5000, 20000),
  ...spread(10, 'bag', 20000, 26000), { t: 50000, type: 'stage_clear_1' }] });
check('a knockdown that spills the pocket, then picking it back up, is ACCEPTED', spill.status === 200, String(spill.status));
check('the refusals are logged as impossible-log, apart from the rate refusals',
  rejectReasons().filter((r) => r === 'implausible-rate').length === 2
  && rejectReasons().filter((r) => r === 'impossible-log').length === 12
  && !rejectReasons().includes('over-ceiling'), rejectReasons().join(','));

// ── ⚠️ W3: /submit is rate limited ───────────────────────────────────────
// The real limiter is a Cloudflare binding, so this stands in a counter with
// the same `limit({ key }) -> { success }` shape and drives the real Worker
// with it as env.
const limiter = (max) => {
  const seen = new Map();
  return { keys: seen, limit: async ({ key }) => {
    const n = (seen.get(key) || 0) + 1; seen.set(key, n); return { success: n <= max };
  } };
};
const withEnv = async (extra, phone, ip) => {
  const req = new Request('https://lb.test/submit', { method: 'POST',
    headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: runId(), name: 'HARNESS', phone, durationMs: 30000, events: bags(20, 30000) }) });
  const res = await worker.fetch(req, { DB, ...extra }, ctx);
  return { status: res.status, retry: res.headers.get('Retry-After') };
};
const byIp = { SUBMIT_LIMIT_IP: limiter(3) };
const ipRes = [];
for (let i = 0; i < 5; i++) ipRes.push((await withEnv(byIp, `40455504${String(i).padStart(2, '0')}`, '198.51.100.9')).status);
check('the 4th and 5th submit from one IP in the window are 429', ipRes.join(',') === '200,200,200,429,429', ipRes.join(','));
const limited = await withEnv(byIp, '4045550450', '198.51.100.9');
check('a 429 carries Retry-After', limited.status === 429 && limited.retry === '60', JSON.stringify(limited));
const other = await withEnv(byIp, '4045550451', '198.51.100.10');
check('another IP is not affected', other.status === 200, String(other.status));
const byPhone = { SUBMIT_LIMIT_PHONE: limiter(2) };
const phRes = [];
for (let i = 0; i < 4; i++) phRes.push((await withEnv(byPhone, '4045550460', `198.51.100.${20 + i}`)).status);
check('one phone number is limited across different IPs', phRes.join(',') === '200,200,429,429', phRes.join(','));
check('the limiter key for a phone is its opaque id, never the number',
  [...byPhone.SUBMIT_LIMIT_PHONE.keys.keys()].every((k) => !k.includes('4045550460')));
const before429 = db.prepare('SELECT COUNT(*) n FROM rejects').get().n;
await withEnv(byIp, '4045550470', '198.51.100.9');
check('a rate-limited submit writes nothing to D1 (a flood must not be a write flood)',
  db.prepare('SELECT COUNT(*) n FROM rejects').get().n === before429);
const broken = { SUBMIT_LIMIT_IP: { limit: async () => { throw new Error('down'); } } };
check('a failing limiter fails OPEN — real players are not refused for a Cloudflare hiccup',
  (await withEnv(broken, '4045550480', '198.51.100.30')).status === 200);

const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `\nFAILED: ${bad.length} of ${checks.length}` : `\nALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
