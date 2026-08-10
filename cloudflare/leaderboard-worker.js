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
 * Storage: one KV blob "lb:runs" — a JSON array of full entries (including
 * private phone/email), sorted by score desc, deduped to each name's best,
 * capped at CAP. Bind the KV namespace as `LB` (see wrangler.toml).
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

function dedupeTrim(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
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
        const runs = list.slice(0, n).map((r) => ({ name: r.name, score: r.score }));
        return json({ ok: true, runs });
      }

      if (url.pathname === '/submit' && req.method === 'POST') {
        const now = Date.now();
        if (!inContestWindow(now)) {
          return json({ ok: false, err: 'contest window closed' }, 403);
        }

        const b = await req.json().catch(() => ({}));
        const durationMs = Math.max(0, Math.min(3600000, Math.floor(Number(b.durationMs) || 0)));
        const score = scoreFromEvents(b.events, durationMs);

        const run = {
          name: cleanName(b.name),
          score,
          phone: cleanContact(b.phone, 32),
          email: cleanContact(b.email, 128),
          t: now,
        };
        if (run.score <= 0) return json({ ok: false, err: 'empty run' }, 400);

        const list = dedupeTrim([...(await getList(env)), run].sort(sortRuns));
        await putList(env, list);
        const rank = list.findIndex((r) => r.t === run.t && r.name === run.name) + 1;

        return json({ ok: true, rank, score });
      }

      return json({ ok: false, err: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, err: String((e && e.message) || e) }, 500);
    }
  },
};
