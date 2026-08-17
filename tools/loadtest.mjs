// LOAD TEST — what happens when a party finishes their runs at the same moment.
//
// Client: "Go ahead and pressure test that bitch, see what 100 or 1000
// motherfuckers at once will do."
//
// ⚠️ THIS WRITES TO THE LIVE CONTEST DATABASE. Everything it creates is named
// LOADTEST-nnnn and keyed to 555-01xx phone numbers, so it can all be deleted
// again by that marker — and it must be, before the contest opens, or his
// board launches with a thousand fake people on it. `--clean` does exactly
// that and nothing else. Run it. Then check the board.
//
// WHAT IS ACTUALLY BEING TESTED, in order of how much it would cost to get
// wrong:
//
//   1. THE RACE. One player, N runs landing at once. Cloudflare KV lost this
//      outright — read-modify-write, so the second writer erased the first —
//      which is why the store is D1 and why "keep the highest" lives inside
//      MAX() in an upsert. If that guarantee is real, the board shows the true
//      best of N simultaneous runs and counts every one of them as a play. If
//      it is not, somebody's winning run quietly disappears and the first
//      anyone knows is a payout argument.
//   2. THROUGHPUT. M distinct players at concurrency C: latency percentiles,
//      error rate, and whether D1 or the worker starts refusing.
//   3. THE READ PATH under that write load — /top is edge-cached 2s, so the
//      question is whether the cache actually holds when a crowd is watching
//      the board while another crowd submits to it.
//   4. REPLAY. The same run id posted twice must be refused, under load, every
//      time — that is the cheapest cheat available and it costs no skill.
//
// Payloads are REAL, not junk: valid origin, monotonic event log, duration
// over the floor, score under the ceiling and under the per-second bound. A
// flood of malformed requests would only measure the reject path, which is
// the cheap half.
//
// Usage:
//   node tools/loadtest.mjs --race 100
//   node tools/loadtest.mjs --flood 1000 --conc 50
//   node tools/loadtest.mjs --clean
const BASE = process.env.LB_BASE
  || 'https://will-hill-leaderboard.prodbykctw.workers.dev';
const ORIGIN = 'https://prodbykctw-max.github.io';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf('--' + n);
  return i === -1 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};

// ── A RUN THAT WOULD SURVIVE THE VALIDATOR ───────────────────────────────
// bag=100, stomp=50, and the server refuses anything over 400 points a second
// or under a 60s run. 150s with a few hundred events lands where a real good
// run lands.
function makeRun(seed, targetScore) {
  const durationMs = 150000;
  const events = [];
  let t = 500;
  let score = 0;
  while (score + 100 <= targetScore && t < durationMs - 2000) {
    events.push({ t, type: 'bag' });
    score += 100;
    t += Math.max(120, Math.floor((durationMs - 3000) / (targetScore / 100 + 8)));
  }
  while (score + 50 <= targetScore && t < durationMs - 1000) {
    events.push({ t, type: 'stomp' });
    score += 50;
    t += 130;
  }
  return { durationMs, events, score };
}

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16);
  const v = c === 'x' ? r : ((r & 0x3) | 0x8);
  return v.toString(16);
});

async function submit({ phone, name, score, runId }) {
  const run = makeRun(phone, score);
  const t0 = Date.now();
  let res;
  let body = null;
  try {
    res = await fetch(BASE + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        name,
        phone,
        email: name.toLowerCase() + '@loadtest.invalid',
        runId: runId || uuid(),
        durationMs: run.durationMs,
        events: run.events,
      }),
    });
    try { body = await res.json(); } catch (_e) { body = null; }
  } catch (e) {
    return { ms: Date.now() - t0, status: 0, err: e.message, want: run.score };
  }
  return { ms: Date.now() - t0, status: res.status, body, want: run.score };
}

// Bounded concurrency — a thousand sockets at once measures the runner, not
// the worker.
async function pool(items, conc, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const stat = (name, ms) => `${name}: n=${ms.length} p50=${pct(ms, 50)}ms `
  + `p95=${pct(ms, 95)}ms p99=${pct(ms, 99)}ms max=${Math.max(...ms)}ms`;

function tally(rs) {
  const by = {};
  rs.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
  return by;
}

// ── 1. THE RACE ──────────────────────────────────────────────────────────
async function race(n) {
  const phone = '5550109999';
  const name = 'LOADTEST-RACE';
  // Distinct known scores so the true maximum is not in doubt afterwards.
  const scores = Array.from({ length: n }, (_, i) => 1000 + i * 100);
  const want = Math.max(...scores);
  console.log(`\n── RACE: ${n} runs from ONE player, all at once ─────────────`);
  console.log(`   scores ${Math.min(...scores)}..${want}, true best = ${want}`);
  const t0 = Date.now();
  const rs = await pool(scores, n, (s) => submit({ phone, name, score: s }));
  const wall = Date.now() - t0;
  const okRs = rs.filter((r) => r.status === 200);
  console.log(`   ${stat('   latency', rs.map((r) => r.ms))}`);
  console.log(`   statuses ${JSON.stringify(tally(rs))}  wall ${wall}ms`
    + `  ${(rs.length / (wall / 1000)).toFixed(1)} req/s`);
  const best = okRs.reduce((m, r) => Math.max(m, (r.body && r.body.best) || 0), 0);
  console.log(`   worker's last reported best: ${best}  (expected ${want})`);
  console.log(`   VERDICT: check runs.score for LOADTEST-RACE — it must be ${want}`);
  return { want, sent: rs.length, ok: okRs.length };
}

// ── 2. THROUGHPUT, and 3. THE READ PATH UNDER IT ─────────────────────────
async function flood(n, conc) {
  console.log(`\n── FLOOD: ${n} distinct players, concurrency ${conc} ────────`);
  const people = Array.from({ length: n }, (_, i) => ({
    // ⚠️ TEN DIGITS. The first version built '55501' + a 4-digit tail and
    // produced NINE, so every one of the thousand was refused with "phone
    // required" and the flood measured the reject path instead of the write
    // path. The validator was right and the test was wrong — which is the
    // good version of that mistake, but it still cost a run.
    phone: String(5550100000 + i),
    name: 'LOADTEST-' + String(i).padStart(4, '0'),
    score: 2000 + ((i * 137) % 26000),
  }));

  // Readers run for the whole flood, because a board screen open during a
  // rush is the normal case, not an edge case.
  let reading = true;
  const reads = [];
  const readers = Array.from({ length: 8 }, async () => {
    while (reading) {
      const t0 = Date.now();
      try {
        const r = await fetch(BASE + '/top?n=20', { headers: { Origin: ORIGIN } });
        await r.text();
        reads.push({ ms: Date.now() - t0, status: r.status, cache: r.headers.get('X-Cache') });
      } catch (e) { reads.push({ ms: Date.now() - t0, status: 0, cache: null }); }
    }
  });

  const t0 = Date.now();
  const rs = await pool(people, conc, (p) => submit(p));
  const wall = Date.now() - t0;
  reading = false;
  await Promise.all(readers);

  console.log(`   ${stat('   write latency', rs.map((r) => r.ms))}`);
  console.log(`   statuses ${JSON.stringify(tally(rs))}`);
  console.log(`   wall ${wall}ms  →  ${(n / (wall / 1000)).toFixed(1)} submits/s`);
  const bad = rs.filter((r) => r.status !== 200).slice(0, 3);
  bad.forEach((b) => console.log(`   !! ${b.status} ${JSON.stringify(b.body || b.err).slice(0, 120)}`));
  if (reads.length) {
    const hits = reads.filter((r) => r.cache === 'HIT').length;
    console.log(`   ${stat('   read  latency', reads.map((r) => r.ms))}`);
    console.log(`   reads ${reads.length}, cache HIT ${hits} `
      + `(${((hits / reads.length) * 100).toFixed(0)}%), statuses `
      + JSON.stringify(tally(reads)));
  }
  return { sent: n, ok: rs.filter((r) => r.status === 200).length };
}

// ── 4. REPLAY ────────────────────────────────────────────────────────────
async function replay(n) {
  console.log(`\n── REPLAY: one run id, ${n} simultaneous posts ─────────────`);
  const runId = uuid();
  const rs = await pool(Array.from({ length: n }, (_, i) => i), n,
    () => submit({ phone: '5550108888', name: 'LOADTEST-DUPE', score: 5000, runId }));
  const t = tally(rs);
  console.log(`   statuses ${JSON.stringify(t)}`);
  console.log(`   VERDICT: exactly one 200 and ${n - 1} refusals is correct.`
    + `  Got ${t['200'] || 0} accepted.`);
  return t;
}

// ── CLEANUP ──────────────────────────────────────────────────────────────
function cleanupSql() {
  return [
    "DELETE FROM run_stats WHERE id IN (SELECT id FROM runs WHERE name LIKE 'LOADTEST%')",
    "DELETE FROM seen_runs WHERE id IN (SELECT id FROM runs WHERE name LIKE 'LOADTEST%')",
    "DELETE FROM entrants WHERE id IN (SELECT id FROM runs WHERE name LIKE 'LOADTEST%')",
    "DELETE FROM runs WHERE name LIKE 'LOADTEST%'",
    "DELETE FROM rejects WHERE detail LIKE '%LOADTEST%'",
  ];
}

if (flag('clean', false)) {
  console.log('Run these against the D1 database, in this order:\n');
  cleanupSql().forEach((s) => console.log('  ' + s + ';'));
  process.exit(0);
}

console.log(`target ${BASE}`);
const results = {};
if (flag('race', false)) results.race = await race(Number(flag('race', 100)) || 100);
if (flag('replay', false)) results.replay = await replay(Number(flag('replay', 20)) || 20);
if (flag('flood', false)) {
  results.flood = await flood(Number(flag('flood', 200)) || 200, Number(flag('conc', 50)) || 50);
}
console.log('\n⚠️  Now clean up:  node tools/loadtest.mjs --clean');
