// Leaderboard client — see docs/GDD.md "Leaderboard & contest" for the full
// design. UI/UX mirrors the Jandé game's pattern (once-upon-a-time/index.html
// #overlay/#ovName/#ovBoard + saveRun/lbSubmit/lbTop/fillGlobalBoard):
//   - display name entered once, persisted, not re-asked every run
//   - top-N list rendered on the end-of-run screen, current player highlighted
//   - silent graceful fallback to a local top-10 if the Worker is unreachable
//
// Differs from Jandé's backend shape because this is a real 3-day contest
// with a real-world prize, not a promo high-score board:
//   - score is NOT submitted as a bare number. The client builds a compact
//     run-event log (collectibles picked up + timing) and the Worker
//     recomputes the score server-side from that log before accepting the
//     entry (see cloudflare/leaderboard-worker.js).
//   - contact info (phone/email) is captured once via a separate
//     registration step, not on this per-run overlay, and is never returned
//     by the public /top endpoint — only name + score are public.

// ✅ LIVE. Deployed 2026-08-16 from his own machine, bound to the D1 database
// `will-hill-contest`. Verified from here before this line was set: GET /top
// answers {"ok":true,"runs":[]}, the CORS preflight is 200, and a submit from
// the wrong origin is refused with `forbidden` rather than crashing.
//
// ⚠️ SETTING THIS TURNS THE BOARD ON FOR EVERY PLAYER. Until now `lbOn()` was
// false and nothing was ever sent, which is why the game has been safe to ship
// unconfigured. From here, a finished run with a registered phone POSTs to the
// Worker, which recomputes the score from the event log and writes the row.
const LB_BASE = 'https://will-hill-leaderboard.prodbykctw.workers.dev';

// ⚠️ `?lb=` IS DEV-ONLY, AND THE GUARD IS THE POINT. Until the Worker is
// deployed LB_BASE is empty, `lbOn()` is false and nothing is ever sent — which
// also meant the submit path could not be tested AT ALL, and that is precisely
// how the "entering after a run loses the run" bug survived. This lets a
// harness point the client at a stub.
//
// `import.meta.env.DEV` is folded to `false` by Vite in the production build,
// so the whole branch is dead code in what ships: nobody can aim the live game
// at a leaderboard of their own with a query string.
const LB_URL = (import.meta.env && import.meta.env.DEV
  && typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('lb')) || LB_BASE;

function lbOn() {
  return !!LB_URL;
}

// ── display name (public, shown on the leaderboard) ──
export function lbName() {
  try {
    const n = localStorage.getItem('wh_name');
    if (n && n.trim()) return n.trim().slice(0, 16);
  } catch (_e) {}
  return 'PLAYER ONE';
}

export function setLbName(v) {
  v = String(v || '').replace(/[^\p{L}\p{N} .!'-]/gu, '').trim().slice(0, 16);
  try {
    localStorage.setItem('wh_name', v);
  } catch (_e) {}
  return v || lbName();
}

// ── contest registration (private — phone/email, captured once) ──
//
// THE PHONE NUMBER IS THE IDENTITY, and there is no SMS verification. That is
// a decision, not an omission. A web page cannot stop somebody typing a
// made-up number, and the usual substitutes — device fingerprints, a flag in
// localStorage — are both weak and clearable by reinstalling. What actually
// protects a contest is that the prize is CLAIMED on the number and address
// given, so a fake entry wins nothing and costs nothing to allow. The Worker
// keys entries on the number so a player's later runs update their line
// instead of filling the board.
export function contestRegistration() {
  try {
    return JSON.parse(localStorage.getItem('wh_contest_reg') || 'null');
  } catch (_e) {
    return null;
  }
}

// ── ASKED ONCE, EVER ─────────────────────────────────────────────────────
//
// Client: "people need to be able to sign up and never have to sign up
// again — they never should even have to sign in once they go there and
// start playing, that shit already have their information stored."
//
// Registration itself is already permanent on the device (wh_contest_reg
// below). This is the other half: remembering that the OFFER was made, so
// somebody who taps NOT NOW is not asked again on their next visit either.
// localStorage rather than memory for exactly that reason — a session flag
// would re-ask every time the tab is reopened, which over a three-day
// contest is the nagging he is describing.
export function signupOffered() {
  try {
    return localStorage.getItem('wh_signup_asked') === '1';
  } catch (_e) {
    return false;
  }
}

export function markSignupOffered() {
  try {
    localStorage.setItem('wh_signup_asked', '1');
  } catch (_e) { /* private mode: the offer simply repeats */ }
}

export function isRegistered() {
  const r = contestRegistration();
  return !!(r && phoneDigits(r.phone).length >= 10);
}

// Digits only, and a leading US 1 dropped, so "+1 (404) 555-0100" and
// "4045550100" are the same person on both sides of the wire. The Worker
// normalises identically — if you change one, change the other.
export function phoneDigits(v) {
  return String(v == null ? '' : v).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
}

export function setContestRegistration({ phone, email }) {
  const reg = { phone: phoneDigits(phone), email: String(email || '').trim().slice(0, 128) };
  try {
    localStorage.setItem('wh_contest_reg', JSON.stringify(reg));
  } catch (_e) {}
  return reg;
}

// ── run-event log (what actually gets submitted for score validation) ──
// Each event: { t: msSinceRunStart, type: 'bag' | 'champagne' | 'stomp' | ... }
// The Worker recomputes score from this log server-side — see
// cloudflare/leaderboard-worker.js for the scoring rules it applies.
export function createRunLog() {
  const events = [];
  let startedAt = 0;
  let runId = '';
  // The id this run replaces, set by renew() when a continue is spent.
  let supersedes = '';
  return {
    // ⚠️ A CONTINUED RUN NEEDS A NEW ID, OR ITS REAL SCORE IS REFUSED.
    //
    // Caught in the live contest database. A death with a continue still in
    // hand submits the run there and then; the player taps JUMP, keeps
    // playing, and the true end submits the SAME runId — which the Worker
    // rejects as a replay, exactly as designed. The board therefore kept the
    // score at his FIRST death and threw away the run he actually finished:
    // 18,300 recorded against 25,800 played, with two `replay` entries in the
    // abuse log as the only trace.
    //
    // Renewing the id at the continue makes the finished run a distinct
    // submission, so it lands and the best score wins. `supersedes` carries
    // the id it replaces, so the Worker can drop the partial row rather than
    // counting that stretch of play twice.
    renew() {
      const prev = runId;
      runId = (crypto.randomUUID && crypto.randomUUID())
        || `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e16).toString(16)}`;
      supersedes = prev;
      return prev;
    },
    start() {
      startedAt = performance.now();
      events.length = 0;
      supersedes = '';
      // ⚠️ A UUID PER RUN, MINTED AT THE START, AND THE SERVER REFUSES A
      // REPEAT. Without it a finished event log can simply be posted twice —
      // or worse, somebody else's good log posted under your own phone
      // number, which is the cheapest way to cheat this contest and takes no
      // skill at all. The Worker's `seen_runs` primary key is the lock.
      runId = (crypto.randomUUID && crypto.randomUUID())
        || `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e16).toString(16)}`;
    },
    record(type) {
      events.push({ t: Math.round(performance.now() - startedAt), type });
    },
    finish() {
      return {
        runId,
        supersedes,
        events: events.slice(),
        durationMs: Math.round(performance.now() - startedAt),
      };
    },
  };
}

// ── THE LOCAL BOARD ──────────────────────────────────────────────────────
//
// Every run is banked on the device whether or not the Worker is up. This is
// what the board shows while `LB_URL` is empty — which is right now, and will
// be right up until the D1 database is created and the Worker deployed (it is
// D1, not KV; see cloudflare/README.md) — and it is also the fallback
// when a phone is on a bad connection at a party, which is exactly where this
// game gets played. A board that says "could not load" is worse than a board
// showing your own last ten runs.
const LOCAL_KEY = 'wh_local_runs';

// ── WILL HILL HOLDS FIRST PLACE, AT 50,000 ──────────────────────────────
//
// Client: "we're gonna put 50,000 points next to Will Hill."
//
// It began as "the total amount of bags that can be gotten in the game" — and
// that turned out to be the wrong shape for the job, because a bag is not the
// only thing that scores. Anyone clearing every bag and stomping one masked
// enemy passed him by fifty.
//
// THE BAGS THEN BECAME A ROUND NUMBER ON PURPOSE. Client: "make it 400 bags
// total." They used to be a dice roll that happened to land on 379; they are
// now a quota the generator cannot miss (world/generator.js wantsBag), so
// every bag in the game is exactly 40,000.
//
// 50,000 is a better number than either that or the arithmetic ceiling, for a
// reason worth writing down: IT IS BEATABLE, BUT ONLY JUST. Every line below
// is MEASURED off the shipping levels by tools/harness/ceiling.mjs, which
// walks all four stages, forces every spawn, and counts the bags that actually
// fall inside each bottle's real 9-second window (2,602px of road at the
// measured 4.80 px/tick) rather than assuming an average density.
//
//   400 bags at 100                                       40,000
//   105 masked enemies stomped at 50                      +5,250
//   ── flawless with no bottle at all                      45,250
//   164 of those bags doubled, bottles where they sit     +16,400
//   ── PERFECT RUN, as the map is built                    61,650
//
// (The ENEMIES are the masked hoodie figures — docs/GDD.md "Enemy design",
// three palette variants, the only thing in the game worth 50. They are not
// the undercroft RATS, which are scenery under the street in
// render/undercroft.js, cannot be touched, and are worth nothing. An earlier
// draft of this note called the enemies rats and the client caught it.)
//
// So he sits at 81% of a perfect run. Note the middle line: even with 400
// bags, a flawless run that never touches a bottle tops out at 45,250 — SO
// 50,000 STILL CANNOT BE REACHED WITHOUT THE DOUBLER. That was true at 379
// bags and it survives the raise, which is the property worth protecting: if
// the bag count ever goes past 447, bags alone clear him and the champagne
// stops mattering at the top of the board.
//
// Reaching him means all eight bottles, all 164 bags inside their windows,
// every enemy stomped, and about 50% of the 236 bags outside the windows —
// and no enemy touch late, because a touch dumps the whole purse on the
// pavement. A real target with a real route behind it, which is what the top
// of a contest board should be — not an unbeatable wall, and not a number the
// first decent player strolls past.
//
// The card art paints 125,680 next to his name. That was always decoration;
// no run can approach it.
export const BAGS_IN_GAME = 400;
export const PERFECT_RUN = 61650;      // measured — tools/harness/ceiling.mjs
// ⚠️ WILL HILL IS NO LONGER PINNED TO THE BOARD.
//
// He used to sit at rank 1 with 50,000 as the benchmark to beat. The client,
// looking at the live build: "the leaderboard still has Will Hill at number
// one — you said that removing that was done." He had asked for the board to
// be empty until the contest is live, and he meant EMPTY: no benchmark, no
// placeholder, nothing but real entrants.
//
// The function stays, and stays the single place the board's rows are
// composed, because the board and the SHARE card both call it and the two
// must never be able to disagree about what the board says. It now only
// sorts and strips any pinned row that might arrive from elsewhere.
export function withWillHill(runs) {
  const list = (runs || []).filter((r) => !r.pinned);
  list.sort((a, b) => b.score - a.score || (a.t || 0) - (b.t || 0));
  return list;
}

export function localRuns() {
  try {
    const a = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (_e) {
    return [];
  }
}

export function bankLocalRun(score) {
  if (!(score > 0)) return;
  const runs = localRuns();
  runs.push({ name: lbName(), score, t: Date.now(), me: true });
  runs.sort((a, b) => b.score - a.score || a.t - b.t);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(runs.slice(0, 10)));
  } catch (_e) {}
}

// ── LIFETIME STATS ───────────────────────────────────────────────────────
//
// Client: "can we count stats like how many deaths over throughout the entire
// time of you playing, how many kills… how can we keep stats and metrics like
// that?"
//
// ⚠️ TALLIED FROM THE RUN LOG, NOT FROM COUNTERS SPRINKLED THROUGH THE GAME.
// Every one of these numbers already exists in the event log the run submits —
// bags, doubles, stomps, bottles, potholes, the deaths and stage clears added
// alongside this. Incrementing a second set of counters at each gameplay site
// would be two sources of truth for one fact, and they drift the first time a
// path is added that forgets one: the knocked-down run that submitted a score
// but never banked it locally was exactly that bug, and it lied about the
// player's own best for weeks.
//
// So this takes the finished log and folds it in ONCE, at the end of the run.
// One call site, one arithmetic, and it is the same log the server tallies —
// so the device's numbers and the dashboard's numbers cannot disagree about
// what happened, only about which runs reached the network.
const STATS_KEY = 'wh_stats';
const STATS_VERSION = 1;

const EMPTY_STATS = {
  v: STATS_VERSION,
  runs: 0, bags: 0, bagsX2: 0, bagsLost: 0, kills: 0, bottles: 0,
  potholes: 0, continues: 0, deaths: 0,
  deathsEnemy: 0, deathsPothole: 0, deathsFall: 0,
  stagesCleared: 0, bestStage: 0, gamesCompleted: 0,
  bestScore: 0, totalScore: 0, totalMs: 0, firstT: 0, lastT: 0,
};

export function readStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
    if (!s || s.v !== STATS_VERSION) return { ...EMPTY_STATS };
    return { ...EMPTY_STATS, ...s };
  } catch (_e) {
    return { ...EMPTY_STATS };
  }
}

// Exported for the Worker to share — see cloudflare/leaderboard-worker.js,
// which folds the same log server-side. Kept as a pure function of the log so
// both sides can be checked against the same input.
export function tallyLog(log) {
  const t = { bags: 0, bagsX2: 0, bagsLost: 0, kills: 0, bottles: 0,
    potholes: 0, continues: 0, deaths: 0, deathsEnemy: 0, deathsPothole: 0,
    deathsFall: 0, stagesCleared: 0, bestStage: 0 };
  for (const ev of (log && log.events) || []) {
    const type = ev && ev.type;
    if (type === 'bag') t.bags++;
    else if (type === 'bagx2') { t.bags++; t.bagsX2++; }
    else if (type === 'bagLost') t.bagsLost++;
    else if (type === 'stomp') t.kills++;
    else if (type === 'champagne') t.bottles++;
    else if (type === 'pothole') t.potholes++;
    else if (type === 'continue') t.continues++;
    else if (typeof type === 'string' && type.startsWith('death_')) {
      t.deaths++;
      if (type === 'death_enemy') t.deathsEnemy++;
      else if (type === 'death_pothole') t.deathsPothole++;
      else if (type === 'death_fall') t.deathsFall++;
    } else if (typeof type === 'string' && type.startsWith('stage_clear_')) {
      t.stagesCleared++;
      const n = Number(type.slice('stage_clear_'.length)) || 0;
      if (n > t.bestStage) t.bestStage = n;
    }
  }
  return t;
}

export function recordRunStats(log, score) {
  const t = tallyLog(log);
  const s = readStats();
  const now = Date.now();
  s.runs += 1;
  s.bags += t.bags; s.bagsX2 += t.bagsX2; s.bagsLost += t.bagsLost;
  s.kills += t.kills; s.bottles += t.bottles; s.potholes += t.potholes;
  s.continues += t.continues; s.deaths += t.deaths;
  s.deathsEnemy += t.deathsEnemy; s.deathsPothole += t.deathsPothole;
  s.deathsFall += t.deathsFall;
  s.stagesCleared += t.stagesCleared;
  if (t.bestStage > s.bestStage) s.bestStage = t.bestStage;
  // Four stages cleared in one run is the whole game — the `complete` screen.
  if (t.bestStage >= 4) s.gamesCompleted += 1;
  const sc = Math.max(0, Math.floor(Number(score) || 0));
  s.totalScore += sc;
  if (sc > s.bestScore) s.bestScore = sc;
  s.totalMs += Math.max(0, Math.floor((log && log.durationMs) || 0));
  if (!s.firstT) s.firstT = now;
  s.lastT = now;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (_e) {}
  return s;
}

// ── submit + fetch top ──
//
// ⚠️ AN UNREGISTERED RUN IS HELD, NOT DISCARDED. This is the bug the client
// caught by asking the right question — "when they enter after the run, I just
// wanna make sure that that run is actually added."
//
// It was not. `lbSubmit` returned early when nobody was registered, and the
// submit fires at the MOMENT OF DEATH — before the panel has offered them the
// contest. So the common path (play, die, then decide to enter) threw the run
// away: they entered, and the score they had just set was gone. Entering
// beforehand worked, which is exactly why it survived testing.
//
// The finished log is parked here instead, and `flushPendingRun()` sends it
// the instant registration completes.
// ⚠️ A QUEUE, NOT A SLOT — AND THE SINGLE SLOT COST A REAL SCORE.
//
// This was `let pendingRun = null` with `pendingRun = runLogResult`, so the
// SECOND run played before registering overwrote the first. Caught in the
// live contest database: the client's own board showed a best of 18,300
// while his share card said 25,800, and the 25,800 run was in neither the
// accepted rows nor the rejections. It had been held, overwritten by a later
// run, and silently dropped. In a contest with a real prize that is the worst
// class of bug there is — the player's best run disappearing with no error
// anywhere.
//
// Every unsent run is kept now, in order, and all of them go when
// registration completes. Capped so a marathon session cannot grow without
// bound; the cap drops the LOWEST-scoring held run rather than the oldest,
// because the one that matters to a contest is the best one.
const PENDING_CAP = 12;
let pendingRuns = [];

// Runs already accepted by the Worker. The server refuses a repeat by run id
// — that is the replay protection working — but it should never be ASKED
// twice: his dashboard logged two `replay` rejections against runs that had
// already scored, which is noise in the abuse log where a real attack would
// otherwise stand out.
const sentRunIds = new Set();

export function lbSubmit(runLogResult) {
  if (!runLogResult) return;
  if (runLogResult.runId && sentRunIds.has(runLogResult.runId)) return;
  if (!isRegistered()) {
    // Same run twice (a re-offered form, a second flush) must not queue twice.
    if (runLogResult.runId
        && pendingRuns.some((r) => r.runId === runLogResult.runId)) return;
    pendingRuns.push(runLogResult);
    if (pendingRuns.length > PENDING_CAP) {
      const scoreOf = (r) => (r.events || []).reduce((n, ev) => n
        + (ev && ev.type === 'bag' ? 100 : 0)
        + (ev && ev.type === 'bagx2' ? 200 : 0)
        + (ev && ev.type === 'stomp' ? 50 : 0)
        - (ev && ev.type === 'bagLost' ? 100 : 0), 0);
      let worst = 0;
      for (let i = 1; i < pendingRuns.length; i++) {
        if (scoreOf(pendingRuns[i]) < scoreOf(pendingRuns[worst])) worst = i;
      }
      pendingRuns.splice(worst, 1);
    }
    return;
  }
  if (!lbOn()) return;
  if (runLogResult.runId) sentRunIds.add(runLogResult.runId);
  const reg = contestRegistration();
  try {
    fetch(LB_URL + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: runLogResult.runId,
        // Present only on a run that was continued — see createRunLog.renew.
        supersedes: runLogResult.supersedes || '',
        name: lbName(),
        events: runLogResult.events,
        durationMs: runLogResult.durationMs,
        phone: reg?.phone || '',
        email: reg?.email || '',
        // The hidden honeypot field, always empty from the real client. The
        // Worker treats any value here as a bot and drops the entry while
        // answering as though it succeeded.
        website: '',
      }),
    }).catch(() => {});
  } catch (_e) {}
}

// Called the moment someone enters the contest. Sends the run they had just
// finished, if there was one. Safe to call at any time: no held run, no-op.
export function flushPendingRun() {
  if (!pendingRuns.length) return false;
  // Taken first, so a submit that somehow re-enters cannot see the same runs
  // still queued and send them a second time.
  const runs = pendingRuns;
  pendingRuns = [];
  for (const run of runs) lbSubmit(run);
  return true;
}

// Test seam — the harness needs to see whether runs are being held, and how
// many, since "one is held" was true right up until the moment a second run
// quietly replaced the first.
export function hasPendingRun() { return pendingRuns.length > 0; }
export function pendingRunCount() { return pendingRuns.length; }

export function lbTop(n, cb) {
  if (!lbOn()) {
    cb(null);
    return;
  }
  let done = false;
  const to = setTimeout(() => {
    if (!done) {
      done = true;
      cb(null);
    }
  }, 4500);
  const fin = (v) => {
    if (done) return;
    done = true;
    clearTimeout(to);
    cb(v);
  };
  try {
    fetch(LB_URL + '/top?n=' + n)
      .then((r) => r.json())
      .then((j) => fin(j && j.ok ? j.runs : null))
      .catch(() => fin(null));
  } catch (_e) {
    fin(null);
  }
}
