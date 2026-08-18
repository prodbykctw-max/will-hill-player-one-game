// ONE LOG, BOTH TALLIES, SAME ANSWER.
//
// `cloudflare/leaderboard-worker.js` has said this for weeks:
//
//   "Two implementations of one rule is a risk worth naming: if either side
//    gains an event type, both change, and the pair are cross-checked by
//    tools/harness/statsync.mjs feeding one log to both."
//
// ⚠️ THAT FILE DID NOT EXIST. The comment described a safeguard nobody had
// written, and `statsFromEvents` was not even exported, so nothing COULD have
// reached it. The risk it names is real and it is live: the device's lifetime
// stats come from `tallyLog` in src/net/leaderboard.js, the contest dashboard's
// numbers come from `statsFromEvents` in the Worker, and both walk the same
// event log with separately-written arithmetic. When they drift, nothing
// throws — the phone and the dashboard simply disagree about the same run, and
// the first person to notice is whoever compares two numbers on payout day.
//
// The risk got wider the day MAX COMBO shipped: `max_combo` was added to both
// sides by hand, in the same session, with no check that they agreed.
//
// ⚠️ THE FIELD NAMES DIFFER ON PURPOSE — the client is camelCase, the Worker
// is snake_case because its columns are. So a comparison needs a map, and the
// MAP IS THE PART THAT ROTS: add a field to one side and a hand-written pair
// list quietly ignores it. So the map is asserted COMPLETE against both key
// sets before any value is compared. A new field on either side fails this
// harness until it is paired.
//
//   node tools/harness/statsync.mjs
//
// No browser and no dev server: both tallies are pure functions of the log.

const { tallyLog } = await import('../../src/net/leaderboard.js');
const { statsFromEvents } = await import('../../cloudflare/leaderboard-worker.js');

const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// client field -> worker field. Every key on both sides must appear here.
const PAIRS = {
  bags: 'bags',
  bagsX2: 'bags_x2',
  bagsLost: 'bags_lost',
  kills: 'kills',
  bottles: 'bottles',
  potholes: 'potholes',
  continues: 'continues',
  deaths: 'deaths',
  deathsEnemy: 'death_enemy',
  deathsPothole: 'death_pothole',
  deathsFall: 'death_fall',
  stagesCleared: 'stages',
  bestStage: 'best_stage',
  maxCombo: 'max_combo',
};

// ── A RUN, WRITTEN THE WAY THE GAME WRITES ONE ───────────────────────────
// Monotonic timestamps, because src/net/leaderboard.js's record() stamps every
// event from performance.now() and cannot emit them out of order. Every event
// type either tally knows about appears at least once, including the ones that
// score nothing, so a field that is only touched by a rare event is still
// covered.
let t = 0;
const ev = (type, extra) => ({ t: (t += 137), type, ...(extra || {}) });
const LOG = [
  ev('bag'), ev('bag'), ev('bagx2'), ev('bag'), ev('bagx2'),
  ev('champagne'),
  ev('stomp'), ev('combo', { n: 2 }), ev('stomp'), ev('combo', { n: 3 }),
  ev('stomp'),
  ev('pothole'),
  ev('bagLost'), ev('bagLost'),
  ev('death_enemy'),
  ev('continue'),
  ev('stage_clear_1'),
  ev('bag'), ev('stomp'),
  ev('death_fall'),
  ev('stage_clear_2'),
  ev('death_pothole'),
  ev('stage_clear_3'),
];
const DURATION = t + 1000;

console.log('\n=== the map covers both sides ===');
const c0 = tallyLog({ events: [] });
const w0 = statsFromEvents([], 0);
const clientKeys = Object.keys(c0).sort();
const workerKeys = Object.keys(w0).sort();
const mappedClient = Object.keys(PAIRS).sort();
const mappedWorker = Object.values(PAIRS).sort();
const missingClient = clientKeys.filter((k) => !mappedClient.includes(k));
const missingWorker = workerKeys.filter((k) => !mappedWorker.includes(k));
// ⚠️ THIS IS THE CHECK THAT SURVIVES THE NEXT FEATURE. Comparing only the
// pairs somebody remembered to list is exactly how the two sides drifted in
// the first place.
check('every CLIENT field is paired', missingClient.length === 0,
  missingClient.length ? 'unpaired: ' + missingClient.join(', ') : `${clientKeys.length} fields`);
check('every WORKER field is paired', missingWorker.length === 0,
  missingWorker.length ? 'unpaired: ' + missingWorker.join(', ') : `${workerKeys.length} fields`);

console.log('\n=== one log, both tallies ===');
const c = tallyLog({ events: LOG });
const w = statsFromEvents(LOG, DURATION);
let agreed = 0;
const disagreed = [];
for (const [ck, wk] of Object.entries(PAIRS)) {
  const a = c[ck];
  const b = w[wk];
  if (a === b) { agreed += 1; continue; }
  disagreed.push(`${ck}/${wk}: client ${a} vs worker ${b}`);
}
console.log(`  ${String(agreed).padStart(2)} of ${Object.keys(PAIRS).length} fields agree`);
for (const d of disagreed) console.log(`     ${d}`);
check('THE TWO TALLIES AGREE ON A REAL RUN', disagreed.length === 0,
  disagreed.length ? `${disagreed.length} disagree` : '');

// Spot-check the arithmetic itself, so a pair that agrees because BOTH are
// wrong still gets caught. Counted by hand off the log above.
console.log('\n=== and the numbers are right, not just equal ===');
const expect = {
  bags: 6, bagsX2: 2, bagsLost: 2, kills: 4, bottles: 1, potholes: 1,
  continues: 1, deaths: 3, deathsEnemy: 1, deathsPothole: 1, deathsFall: 1,
  stagesCleared: 3, bestStage: 3, maxCombo: 3,
};
const wrong = Object.entries(expect).filter(([k, v]) => c[k] !== v)
  .map(([k, v]) => `${k}: expected ${v}, got ${c[k]}`);
check('the hand-counted totals match', wrong.length === 0, wrong.join('; '));

// ── WHERE THEY DIVERGE ON PURPOSE ────────────────────────────────────────
// Two differences are real, intended, and must not be "fixed" by making the
// pair identical. They are asserted here so they stay deliberate rather than
// becoming folklore — and so that if either side loses its rule, this notices.
console.log('\n=== the two intended differences ===');

// 1. THE WORKER DROPS WHAT THE SCORER WOULD DROP. Its loop skips an event that
//    goes backwards in time or lands past the run's duration, because "an
//    event the score would not count must not be counted here either". The
//    client has no such filter: it is the device's own record of what it saw,
//    and it wrote those timestamps itself so they cannot be out of order.
//    A real log never triggers this. A forged one does, and only the Worker
//    is defending anything.
const FORGED = [
  { t: 1000, type: 'bag' },
  { t: 500, type: 'bag' },            // backwards
  { t: 9e9, type: 'bag' },            // past the end of the run
];
const cf = tallyLog({ events: FORGED });
const wf = statsFromEvents(FORGED, 2000);
check('the worker refuses out-of-window events and the client does not',
  cf.bags === 3 && wf.bags === 1, `client ${cf.bags}, worker ${wf.bags}`);

// 2. THE WORKER CAPS A CLAIMED COMBO. `n` is player-supplied and cannot be
//    revalidated the way a score can, so the Worker clamps it; the client is
//    reporting the chain it just watched happen and has nothing to clamp.
const HUGE = [{ t: 10, type: 'combo', n: 10 ** 9 }];
const ch = tallyLog({ events: HUGE });
const wh = statsFromEvents(HUGE, 1000);
check('the worker caps a claimed combo and the client does not',
  wh.max_combo === 9999 && ch.maxCombo === 10 ** 9,
  `client ${ch.maxCombo}, worker ${wh.max_combo}`);

// A combo event carrying nothing usable must not poison either side.
const JUNK = [{ t: 10, type: 'combo' }, { t: 20, type: 'combo', n: 'x' },
  { t: 30, type: 'combo', n: -5 }];
check('a malformed combo event counts as zero on both sides',
  tallyLog({ events: JUNK }).maxCombo === 0 && statsFromEvents(JUNK, 1000).max_combo === 0);

console.log('');
const bad = checks.filter(([, ok]) => !ok).length;
console.log(bad === 0 ? `ALL ${checks.length} PASS` : `FAILED: ${bad} checks`);
process.exit(bad === 0 ? 0 : 1);
