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

const LB_URL = ''; // TODO: set once the Worker is deployed (see cloudflare/README.md)

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
  return {
    start() {
      startedAt = performance.now();
      events.length = 0;
    },
    record(type) {
      events.push({ t: Math.round(performance.now() - startedAt), type });
    },
    finish() {
      return { events: events.slice(), durationMs: Math.round(performance.now() - startedAt) };
    },
  };
}

// ── THE LOCAL BOARD ──────────────────────────────────────────────────────
//
// Every run is banked on the device whether or not the Worker is up. This is
// what the board shows while `LB_URL` is empty — which is right now, and will
// be right up until the KV namespace is created — and it is also the fallback
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

// ── submit + fetch top ──
export function lbSubmit(runLogResult) {
  if (!runLogResult) return;
  if (!lbOn()) return;
  // No contact details means no contest entry — the Worker rejects it too,
  // and sending it anyway just burns a request on a phone's data.
  if (!isRegistered()) return;
  const reg = contestRegistration();
  try {
    fetch(LB_URL + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: lbName(),
        events: runLogResult.events,
        durationMs: runLogResult.durationMs,
        phone: reg?.phone || '',
        email: reg?.email || '',
      }),
    }).catch(() => {});
  } catch (_e) {}
}

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
