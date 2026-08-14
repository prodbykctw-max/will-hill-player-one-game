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

// ── WILL HILL HOLDS FIRST PLACE ──────────────────────────────────────────
//
// Client: "Will Hill will occupy first place. The total amount of bags that
// can be gotten in the game is gonna be his high score."
//
// COUNTED, NOT INVENTED. Every stage generated to its own stageEnd and the
// bags tallied off the live level:
//
//   eav 90 · edgewood 97 · underground 91 · l5p 100  =  378 bags
//   378 x BAG_VALUE 100                              =  37,800
//
// It was 379 until the champagne bottles moved onto the raised slabs: a
// bottle now claims the slab it lands on and the bag that would have sat
// there does not spawn, because the two share a centre line and would
// overlap. Underground lost the one. Recount whenever the generator changes —
// this number is a measurement, and a measurement goes stale.
//
// ⚠️ THIS IS BEATABLE BY FIFTY POINTS. Bags are not the only thing that
// scores — a stomp is worth 50, and there are 106 rats across the four
// stages. Somebody who clears every bag AND stands on one rat finishes on
// 37,950 and takes the top slot. A flawless run — every bag, every rat — is
// 43,200, and THAT is the number nothing can pass. Which one belongs here is
// his call: 37,900 is what he asked for, 43,200 is what "occupies first
// place" needs. One constant either way.
//
// It is pinned rather than banked into localStorage: it is part of the game,
// not a run somebody did on this phone, so it survives a cleared cache and it
// shows on a device that has never played. `me` is deliberately absent — the
// YOUR RANK line belongs to whoever is holding the phone.
export const BAGS_IN_GAME = 378;
export const PERFECT_RUN = 43100;      // every bag AND every rat
export const WILL_HILL = Object.freeze({ name: 'WILL HILL', score: 37800, pinned: true });

// Merge him into whatever the board is showing, wherever his score puts him.
// Not spliced at index 0 — if a player ever does beat it, the board has to
// show that honestly rather than pretend otherwise.
export function withWillHill(runs) {
  const list = (runs || []).filter((r) => !r.pinned).concat([WILL_HILL]);
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
