/**
 * Will Hill: Player One — 3-day contest leaderboard Worker.
 *
 * Unlike the Jandé project's leaderboard (a promo high-score board with no
 * real stakes), this backs a real contest: the top score wins a real-world
 * prize from Will Hill and his team. See docs/GDD.md "Leaderboard & contest"
 * for the full design this implements.
 *
 * Endpoints (CORS open):
 *   POST /submit  { name, events:[{t,type}], durationMs, phone, email }
 *     -> { ok, rank, score }
 *     Score is NOT trusted from the client — it's recomputed here from the
 *     event log (see scoreFromEvents). phone/email are stored but never
 *     returned by /top.
 *   GET  /top?n=20
 *     -> { ok, runs:[{name, score}] }   -- PUBLIC. Never includes phone/email.
 *
 * STORAGE IS SPLIT, AND THAT SPLIT IS THE POINT.
 *
 *   "lb:runs"   PUBLIC. A JSON array of { id, name, score, t } sorted by
 *               score, one entry per person, capped at CAP. No phone, no
 *               email — this blob could leak and cost nobody anything.
 *   "pii:<id>"  PRIVATE. One key per entrant, { phone, email, name, t }.
 *               Written by /submit, read by NOTHING. There is deliberately no
 *               endpoint that returns or lists these; the contest organiser
 *               reads them out of the KV dashboard when it is time to contact
 *               a winner.
 *
 * The old shape kept phone and email inside the public array and relied on
 * /top remembering to project them away. One forgotten field in one response
 * and the whole entrant list is public. Separate keys cannot be leaked by
 * forgetting something.
 *
 * Bind the KV namespace as `LB` (see wrangler.toml).
 *
 * NOT YET DEPLOYED. See cloudflare/README.md — creating the KV namespace and
 * running `wrangler deploy` is a manual, explicitly-confirmed step (it
 * touches the live Cloudflare account), same split the Jandé project used.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const CAP = 500;

// TODO: set the real 3-day contest window before launch.
const CONTEST_START = 0; // Date.now()-style ms epoch
const CONTEST_END = 0;

// Scoring rules the server applies to a submitted event log — keep in sync
// with the client's run-event types (src/net/leaderboard.js createRunLog).
const SCORE_RULES = {
  bag: 100, // money bag collected
  stomp: 50, // enemy defeated by stomp
  champagne: 0, // grants invulnerability, no direct score
  pothole: 0, // tripped in a pothole — costs a heart, never score
  // An enemy knocking money loose. One event per bag knocked out, so the
  // arithmetic mirrors `bag` exactly and a recovered bag scores again.
  bagLost: -100,
};

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const cleanName = (n) => {
  const s = String(n == null ? '' : n)
    .replace(/[^\p{L}\p{N} .!'-]/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'PLAYER ONE';
};

const cleanContact = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// ── WHO SOMEBODY IS, FOR CONTEST PURPOSES ────────────────────────────────
//
// THE PHONE NUMBER IS THE IDENTITY. Not the display name — two people called
// Will are two people, and one person can type six different names. Entries
// are keyed on the number, so a player's later runs UPDATE their entry rather
// than filling the board.
//
// WHY THERE IS NO SMS VERIFICATION. The client decided against it, and the
// reasoning holds: a web page cannot stop someone typing a made-up number,
// and the usual answers (device fingerprinting, localStorage) are both weak
// and clearable. What actually protects a contest is that the PRIZE is
// claimed on the number and address given. A fake entry wins nothing, so it
// costs nothing to allow. Verification can be added later if real abuse shows
// up; the schema does not change if it is.
//
// Digits only, so +1 (404) 555-0100 and 4045550100 are one person.
const phoneKey = (v) => String(v == null ? '' : v).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

// A short, stable id derived from the number. The PUBLIC board is keyed by
// this and never by the number itself, so nothing that leaves the Worker can
// be walked back to a phone.
async function idFor(digits) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('whp1:' + digits));
  return [...new Uint8Array(buf).slice(0, 10)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function inContestWindow(now) {
  if (!CONTEST_START || !CONTEST_END) return true; // window not configured yet — allow (dev/testing)
  return now >= CONTEST_START && now <= CONTEST_END;
}

// Recompute score server-side from the submitted event log — this is the
// anti-cheat measure: the client never gets to just assert a score.
function scoreFromEvents(events, durationMs) {
  if (!Array.isArray(events)) return 0;
  let score = 0;
  let lastT = -1;
  for (const ev of events.slice(0, 5000)) {
    if (!ev || typeof ev.t !== 'number' || typeof ev.type !== 'string') continue;
    if (ev.t < lastT || ev.t > (durationMs || 0) + 1000) continue; // out-of-order or beyond run length
    lastT = ev.t;
    score += SCORE_RULES[ev.type] || 0;
  }
  return score;
}

const sortRuns = (a, b) => b.score - a.score || a.t - b.t;

// One entry per PERSON, keeping their best. Was keyed on the lowercased
// display name, which is wrong in both directions: it merged two different
// people who picked the same name, and it let one person hold several places
// by changing theirs between runs.
function dedupeTrim(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= CAP) break;
  }
  return out;
}

const getList = async (env) => {
  const s = await env.LB.get('lb:runs');
  return s ? JSON.parse(s) : [];
};
const putList = (env, list) => env.LB.put('lb:runs', JSON.stringify(list.slice(0, CAP)));

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/top' && req.method === 'GET') {
        const n = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get('n')) || 20)));
        const list = await getList(env);
        // PUBLIC projection only — name + score, never phone/email.
        // PUBLIC projection: name + score, and the opaque id so the client
        // can highlight the viewer's own row without the board ever carrying
        // anything that identifies them to anyone else.
        const runs = list.slice(0, n).map((r) => ({ id: r.id, name: r.name, score: r.score }));
        return json({ ok: true, runs });
      }

      if (url.pathname === '/submit' && req.method === 'POST') {
        const now = Date.now();
        if (!inContestWindow(now)) {
          return json({ ok: false, err: 'contest window closed' }, 403);
        }

        const b = await req.json().catch(() => ({}));
        const digits = phoneKey(b.phone);
        // A contest entry with no way to reach the winner is not an entry.
        // Ten digits because this is a US phone contest; the client asks for
        // the same thing and says so on the form.
        if (digits.length < 10) return json({ ok: false, err: 'phone required' }, 400);

        const durationMs = Math.max(0, Math.min(3600000, Math.floor(Number(b.durationMs) || 0)));
        const score = scoreFromEvents(b.events, durationMs);
        if (score <= 0) return json({ ok: false, err: 'empty run' }, 400);

        const id = await idFor(digits);
        const name = cleanName(b.name);

        // PRIVATE, its own key, never returned by anything.
        await env.LB.put(`pii:${id}`, JSON.stringify({
          phone: digits, email: cleanContact(b.email, 128), name, t: now,
        }));

        // PUBLIC. Their previous entry is dropped first, so a worse replay
        // cannot knock a player down and a better one simply replaces it —
        // one line per person, always their best.
        const prev = (await getList(env)).filter((r) => r.id !== id);
        const best = Math.max(score, ...(await getList(env))
          .filter((r) => r.id === id).map((r) => r.score), 0);
        const run = { id, name, score: best, t: now };
        const list = dedupeTrim([...prev, run].sort(sortRuns));
        await putList(env, list);

        const rank = list.findIndex((r) => r.id === id) + 1;
        return json({ ok: true, rank, score, best, total: list.length });
      }

      return json({ ok: false, err: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, err: String((e && e.message) || e) }, 500);
    }
  },
};
