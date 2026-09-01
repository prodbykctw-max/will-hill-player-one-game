/**
 * WILL HILL: PLAYER ONE — the contest leaderboard.
 *
 * Unlike the Jandé project's leaderboard (a promo high-score board with no
 * real stakes), this backs a real contest: the top score wins a real-world
 * prize, so a wrong number here costs the client money and credibility.
 *
 *   POST /submit  { runId, name, phone, email, events[], durationMs, ts }
 *     -> { ok, rank, score, best, total }
 *     Score is RECOMPUTED here from the event log. The client never gets to
 *     assert a number. phone/email are stored but never returned by anything.
 *   GET  /top?n=20
 *     -> { ok, runs:[{id, name, score}] }   PUBLIC. No phone, no email, ever.
 *
 * ── WHY D1 AND NOT KV ────────────────────────────────────────────────────
 *
 * This ran on a single KV key (`lb:runs`) holding the whole board, read →
 * modified → written on every submit. That is broken for a contest and the
 * client asked the right question about it — "if a person plays 100 times a
 * day, how can we make sure it doesn't break":
 *
 *   * KV has NO COMPARE-AND-SWAP. Two people finishing at the same moment both
 *     read the old list, and the second write silently erases the first. A
 *     lost score, with a prize attached to it.
 *   * KV allows roughly ONE WRITE PER SECOND PER KEY. A launch party is a
 *     burst against exactly one key.
 *
 * D1 turns the whole race into one statement — see `upsert` below. "Keep the
 * highest" becomes a database guarantee instead of application code that
 * happens to run alone.
 *
 * ── AND THE READ PATH IS CACHED, THE WRITE PATH NEVER ────────────────────
 *
 * A hundred players generate a hundred writes across an evening and thousands
 * of reads — everyone sitting on the leaderboard screen. So `/top` is cached
 * at the edge for TOP_TTL seconds and `/submit` is never cached at all. Note
 * this is the exact inverse of the old design's mistake, which used the
 * eventually-consistent store for the thing that needs consistency and cached
 * nothing that didn't.
 *
 * Bind D1 as `DB` (see wrangler.toml). Schema in schema.sql.
 */

const CAP = 500;          // rows the public board will ever return
const TOP_TTL = 2;        // seconds /top may be served from cache
const MAX_BODY = 256 * 1024;
const MAX_EVENTS = 5000;
// The most a `combo` event is allowed to claim. A chain cannot outrun the
// stomps that make it and the whole log is capped at MAX_EVENTS, so anything
// near this is a claim rather than a run. See statsFromEvents.
const MAX_COMBO = 9999;

// TODO: set the real 3-day contest window before launch.
const CONTEST_START = 0;  // Date.now()-style ms epoch
const CONTEST_END = 0;

// ⚠️ WHO MAY POST TO THIS. It was `*` — any page on the internet could enter
// the contest from anywhere. The game is served from GitHub Pages, so that is
// the only origin that has any business here. Localhost stays for development
// and is harmless: an attacker cannot make a victim's browser claim it.
const ALLOWED_ORIGINS = [
  'https://prodbykctw-max.github.io',
  'http://localhost:5199',
  'http://127.0.0.1:5199',
];

function corsFor(req) {
  const origin = req.headers.get('Origin') || '';
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    _ok: ok,
  };
}

// Scoring rules the server applies to a submitted event log — keep in sync
// with the client's run-event types (src/net/leaderboard.js createRunLog).
const SCORE_RULES = {
  bag: 100,
  // A bag collected while the champagne was lit. It is its OWN event rather
  // than two `bag`s, because two bags and one doubled bag are the same number
  // and a different run — and a validator that cannot tell them apart cannot
  // check the thing that matters, which is whether the player had a bottle up
  // at the time. Mirrors CHAMPAGNE_MULT in src/entities/collectibles.js.
  bagx2: 200,
  stomp: 50,
  champagne: 0,
  pothole: 0,
  bagLost: -100,
};

// ⚠️ THE CEILING IS MEASURED, NOT GUESSED. tools/harness/ceiling.mjs walks the
// shipping levels and counts every bag, every enemy and every bottle at its
// real position: 400 bags (40,000), plus stomps, plus what the champagne
// windows can actually double. Nothing legitimate can exceed this, so anything
// that does is a synthesised log however well-formed it looks.
const MAX_LEGIT_SCORE = 70000;
// A run that claims more points than seconds by a wide margin is not a run.
// Generous on purpose — this catches fabrication, not skill.
//
// ⚠️ THE FLOOR WAS 60s AND IT WAS THROWING AWAY REAL SCORES. The reasoning
// was "four stages at a measured 4.80px/tick cannot be crossed in under about
// two minutes" — true, and irrelevant, because that is the time to CLEAR the
// game and almost no run ends that way. Runs end in death. Die to the first
// pothole twenty seconds in and the submit came back `invalid run`, which
// reads to the player like an accusation.
//
// The live abuse log is what proved it: 93 refusals, every single one this
// check, every one a duration under 40s, and not one of them anywhere near
// the rate ceiling — the longest was 3350 points over 39.9s, i.e. 84/s
// against a limit of 400/s. Two accepted runs in the same window.
//
// And the floor never had anti-cheat value up here. To claim the 70,000
// ceiling a fabricator must respect 400/s, so they must claim at least 175
// seconds no matter what this is set to; the rate check does all of the work.
// All a high floor can refuse is a SMALL score from a SHORT run — which is
// precisely an honest early death. 3s still stops a zero-duration submit and
// the divide-by-almost-nothing that comes with it, and stops nothing else.
const MIN_RUN_MS = 3 * 1000;
const MAX_SCORE_PER_SECOND = 400;

const cleanName = (n) => {
  const s = String(n == null ? '' : n)
    .replace(/[^\p{L}\p{N} .!'-]/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'PLAYER ONE';
};

const cleanContact = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// Digits only, so +1 (404) 555-0100 and 4045550100 are one person.
const phoneKey = (v) => String(v == null ? '' : v).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

// ── WHO SOMEBODY IS, FOR CONTEST PURPOSES ────────────────────────────────
//
// THE PHONE NUMBER IS THE IDENTITY. Not the display name — two people called
// Will are two people, and one person can type six different names. Entries
// are keyed on the number, so a player's later runs UPDATE their entry rather
// than filling the board.
//
// WHY THERE IS NO SMS VERIFICATION. The client decided against it, and the
// reasoning holds: a web page cannot stop someone typing a made-up number, and
// the usual answers (fingerprinting, localStorage) are weak and clearable.
// What protects a contest is that the PRIZE is claimed on the number given. A
// fake entry wins nothing, so it costs nothing to allow.
async function idFor(digits) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('whp1:' + digits));
  return [...new Uint8Array(buf).slice(0, 10)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function inContestWindow(now) {
  if (!CONTEST_START || !CONTEST_END) return true; // not configured — dev/testing
  return now >= CONTEST_START && now <= CONTEST_END;
}

function scoreFromEvents(events, durationMs) {
  if (!Array.isArray(events)) return 0;
  let score = 0;
  let lastT = -1;
  for (const ev of events.slice(0, MAX_EVENTS)) {
    if (!ev || typeof ev.t !== 'number' || typeof ev.type !== 'string') continue;
    if (ev.t < lastT || ev.t > (durationMs || 0) + 1000) continue; // out of order / past the end
    lastT = ev.t;
    score += SCORE_RULES[ev.type] || 0;
  }
  return score;
}

// ── THE SAME LOG, COUNTED ────────────────────────────────────────────────
//
// Client: "can we count stats like how many deaths over throughout the entire
// time of you playing, how many kills."
//
// Deliberately a MIRROR of tallyLog in src/net/leaderboard.js — same event
// names, same arithmetic, same shape. The device keeps its own lifetime
// numbers from the log it just finished; this keeps the contest-wide ones from
// the log it just received. Two implementations of one rule is a risk worth
// naming: if either side gains an event type, both change, and the pair are
// cross-checked by tools/harness/statsync.mjs feeding one log to both.
//
// Nothing new is collected. Every number here was already inside the payload
// the score is recomputed from; it was simply being discarded afterwards.
// ⚠️ EXPORTED SO IT CAN BE CROSS-CHECKED, NOT BECAUSE THE WORKER NEEDS IT.
// A Worker only ever uses its `default` export, so a named one is inert at
// runtime. This is here because the comment above claimed for weeks that
// tools/harness/statsync.mjs feeds one log to both tallies — and that file did
// not exist, partly because this function could not be reached from outside.
export function statsFromEvents(events, durationMs) {
  const s = {
    bags: 0, bags_x2: 0, bags_lost: 0, kills: 0, bottles: 0, potholes: 0,
    continues: 0, deaths: 0, death_enemy: 0, death_pothole: 0, death_fall: 0,
    stages: 0, best_stage: 0, max_combo: 0,
  };
  if (!Array.isArray(events)) return s;
  let lastT = -1;
  for (const ev of events.slice(0, MAX_EVENTS)) {
    if (!ev || typeof ev.t !== 'number' || typeof ev.type !== 'string') continue;
    // The same window the scorer trusts. An event the score would not count
    // must not be counted here either, or the dashboard disagrees with the
    // board about the very same run.
    if (ev.t < lastT || ev.t > (durationMs || 0) + 1000) continue;
    lastT = ev.t;
    const type = ev.type;
    if (type === 'bag') s.bags++;
    else if (type === 'bagx2') { s.bags++; s.bags_x2++; }
    else if (type === 'bagLost') s.bags_lost++;
    else if (type === 'stomp') s.kills++;
    else if (type === 'champagne') s.bottles++;
    else if (type === 'pothole') s.potholes++;
    else if (type === 'continue') s.continues++;
    else if (type.startsWith('death_')) {
      s.deaths++;
      if (type === 'death_enemy') s.death_enemy++;
      else if (type === 'death_pothole') s.death_pothole++;
      else if (type === 'death_fall') s.death_fall++;
    } else if (type.startsWith('stage_clear_')) {
      s.stages++;
      const n = Number(type.slice('stage_clear_'.length)) || 0;
      if (n > s.best_stage) s.best_stage = n;
    } else if (type === 'combo') {
      // ⚠️ ONE EVENT PER NEW RUN BEST — not one per link, and not one per
      // run. The game (src/main.js, the stomp branch) records the chain only
      // when it beats its own high for the run, so a best of 5 costs the log
      // four events and a 200-link chain costs 199 rather than 200 per link.
      // That shape was chosen over an end-of-run summary because a run can
      // end at a death, at a continue that renews the run id, or at the last
      // stage clear, and the continue path has already cost this contest a
      // real score once by being missed. Taking MAX here is correct for all
      // of them, and correct again if the client ever sends only one.
      // ⚠️ AND IT IS A NUMBER THE PLAYER HANDED US. The score is recomputed
      // and can be refused; this cannot be — a cheat could claim any chain
      // without gaining a point. CAP is what stops the dashboard printing a
      // twelve-digit number through the panel he painted. Same caveat as
      // every other column in run_stats: good for a dashboard, not evidence.
      const c = Math.floor(Number(ev.n) || 0);
      if (c > s.max_combo) s.max_combo = Math.min(c, MAX_COMBO);
    }
  }
  return s;
}

// Every refusal is recorded with its reason so the dashboard can show abuse
// as it happens. Never allowed to break a request: a logging failure must not
// turn a clean rejection into a 500.
async function reject(env, req, reason, detail, status = 400) {
  try {
    await env.DB.prepare('INSERT INTO rejects (t, reason, detail, ip) VALUES (?, ?, ?, ?)')
      .bind(Date.now(), reason, String(detail || '').slice(0, 200),
        req.headers.get('CF-Connecting-IP') || '')
      .run();
  } catch (_e) { /* never let logging break the response */ }
  return { reason, status };
}

export default {
  async fetch(req, env, ctx) {
    const CORS = corsFor(req);
    const cors = { ...CORS };
    delete cors._ok;
    const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', ...extra },
    });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);

    try {
      // ── PUBLIC BOARD ─────────────────────────────────────────────────
      if (url.pathname === '/top' && req.method === 'GET') {
        const n = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get('n')) || 20)));
        // Edge cache keyed on n. Two seconds is invisible to a person reading
        // a board and removes essentially all read load from the database.
        const cache = caches.default;
        const ckey = new Request(`${url.origin}/top?n=${n}`, { method: 'GET' });
        const hit = await cache.match(ckey);
        if (hit) {
          const body = await hit.text();
          return new Response(body, {
            headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          });
        }
        // SELECTS FROM `runs` ONLY. The contact details are in another table
        // entirely, so this query has no phone column available to leak.
        //
        // ⚠️ AND THAT SENTENCE WAS THE WHOLE MISTAKE, BECAUSE IT WAS TRUE.
        // The query selected `id` as well, and `id` IS the phone number:
        // idFor() is SHA-256 of "whp1:" + the ten digits, truncated. Fixed
        // prefix, no per-entrant salt, and a US mobile number is one of about
        // 10^10 strings — a complete rainbow table of every possible input is
        // an afternoon on a laptop and minutes on a GPU. So a public,
        // unauthenticated, edge-cached GET was handing out a reversible
        // encoding of every entrant's phone number, which is the exact
        // opposite of the public name+score / private phone+email split this
        // whole backend is shaped around.
        //
        // The board needs a name and a number. Nothing on the client ever read
        // `id` — panel.js renders name and score and withWillHill() sorts on
        // score — so this drops a column nobody was using.
        const { results } = await env.DB
          .prepare('SELECT name, score FROM runs ORDER BY score DESC, updated ASC LIMIT ?')
          .bind(Math.min(n, CAP))
          .all();
        const body = JSON.stringify({ ok: true, runs: results || [] });
        const res = new Response(body, {
          headers: {
            ...cors,
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${TOP_TTL}`,
            'X-Cache': 'MISS',
          },
        });
        ctx.waitUntil(cache.put(ckey, res.clone()));
        return res;
      }

      // ── SUBMIT A RUN ─────────────────────────────────────────────────
      if (url.pathname === '/submit' && req.method === 'POST') {
        const now = Date.now();

        if (!CORS._ok) {
          const r = await reject(env, req, 'origin', req.headers.get('Origin'), 403);
          return json({ ok: false, err: 'forbidden' }, r.status);
        }
        if (!inContestWindow(now)) {
          return json({ ok: false, err: 'contest window closed' }, 403);
        }

        const raw = await req.text();
        if (raw.length > MAX_BODY) {
          const r = await reject(env, req, 'body-too-large', raw.length, 413);
          return json({ ok: false, err: 'too large' }, r.status);
        }
        let b;
        try { b = JSON.parse(raw); } catch (_e) { b = null; }
        if (!b || typeof b !== 'object') {
          await reject(env, req, 'bad-json', '');
          return json({ ok: false, err: 'bad request' }, 400);
        }

        // ⚠️ HONEYPOT 1 — THE DECOY SCORE. The real client never sends a
        // score; the server computes it from the events. So a payload that
        // carries one was written by somebody poking at the API, by
        // definition. Logged and dropped, and deliberately answered with the
        // same shape as success so a prober learns nothing from the reply.
        if ('score' in b) {
          await reject(env, req, 'honeypot-score', JSON.stringify(b.score));
          return json({ ok: true, rank: 0, score: 0, best: 0, total: 0 });
        }
        // ⚠️ HONEYPOT 2 — THE HIDDEN FORM FIELD. `website` is rendered
        // off-screen with tabindex=-1 and autocomplete=off, so no human ever
        // types in it and an automated form-filler always does.
        if (b.website) {
          await reject(env, req, 'honeypot-field', String(b.website).slice(0, 60));
          return json({ ok: true, rank: 0, score: 0, best: 0, total: 0 });
        }

        const digits = phoneKey(b.phone);
        if (digits.length < 10) {
          await reject(env, req, 'phone', String(digits.length));
          return json({ ok: false, err: 'phone required' }, 400);
        }

        const runId = String(b.runId || '').slice(0, 64);
        if (!/^[0-9a-f-]{16,64}$/i.test(runId)) {
          await reject(env, req, 'run-id', runId);
          return json({ ok: false, err: 'bad run' }, 400);
        }

        const durationMs = Math.max(0, Math.min(3600000, Math.floor(Number(b.durationMs) || 0)));
        if (!Array.isArray(b.events) || b.events.length > MAX_EVENTS) {
          await reject(env, req, 'events', Array.isArray(b.events) ? b.events.length : 'not-array');
          return json({ ok: false, err: 'bad run' }, 400);
        }

        const score = scoreFromEvents(b.events, durationMs);
        if (score <= 0) return json({ ok: false, err: 'empty run' }, 400);

        // Plausibility. The recompute already defeats naive tampering; these
        // are what catch a log somebody BUILT rather than played.
        if (score > MAX_LEGIT_SCORE) {
          await reject(env, req, 'over-ceiling', String(score));
          return json({ ok: false, err: 'invalid run' }, 400);
        }
        if (durationMs < MIN_RUN_MS || score / (durationMs / 1000) > MAX_SCORE_PER_SECOND) {
          await reject(env, req, 'implausible-rate', `${score}/${durationMs}ms`);
          return json({ ok: false, err: 'invalid run' }, 400);
        }

        const id = await idFor(digits);
        const name = cleanName(b.name);

        // ⚠️ REPLAY: THE PRIMARY KEY IS THE LOCK. A duplicate run id fails to
        // insert and the submit is refused — which stops the same log being
        // posted twice, and stops somebody else's good run being posted under
        // a different phone number. No read-then-check, so there is no window
        // between the two for a second request to slip through.
        try {
          await env.DB.prepare('INSERT INTO seen_runs (run_id, id, t) VALUES (?, ?, ?)')
            .bind(runId, id, now).run();
        } catch (_e) {
          await reject(env, req, 'replay', runId, 409);
          return json({ ok: false, err: 'already submitted' }, 409);
        }

        // PRIVATE — its own table, never joined on the public path.
        await env.DB.prepare(
          `INSERT INTO entrants (id, phone, email, name, created, seen)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             email = excluded.email, name = excluded.name, seen = excluded.seen`,
        ).bind(id, digits, cleanContact(b.email, 128), name, now, now).run();

        // PUBLIC — one row per person, always their best. The whole race the
        // KV version had lives inside MAX() now, where the database owns it.
        await env.DB.prepare(
          `INSERT INTO runs (id, name, score, updated, created, plays)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET
             name    = excluded.name,
             plays   = runs.plays + 1,
             updated = CASE WHEN excluded.score > runs.score
                            THEN excluded.updated ELSE runs.updated END,
             score   = MAX(runs.score, excluded.score)`,
        ).bind(id, name, score, now, now).run();

        // STATS — one row per run, on the public side of the wall (opaque id
        // only). Wrapped so a stats failure can never cost somebody their
        // contest entry: the score is already committed above, and a dashboard
        // number is not worth failing a submission over.
        try {
          const st = statsFromEvents(b.events, durationMs);
          // WHERE FROM — Cloudflare has already resolved it on the way in, so
          // this costs nothing and asks the player for nothing. Coarse by
          // nature (see schema.sql), stored on the opaque-id side, never
          // beside a phone number. `latitude`/`longitude` arrive as strings.
          const cf = req.cf || {};
          const num = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const txt = (v) => (v == null ? null : String(v).slice(0, 64));
          await env.DB.prepare(
            `INSERT OR IGNORE INTO run_stats
               (run_id, id, t, score, duration, bags, bags_x2, bags_lost,
                kills, bottles, potholes, continues, deaths, death_enemy,
                death_pothole, death_fall, stages, best_stage, max_combo,
                city, region, country, lat, lon)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?)`,
          ).bind(runId, id, now, score, durationMs, st.bags, st.bags_x2,
            st.bags_lost, st.kills, st.bottles, st.potholes, st.continues,
            st.deaths, st.death_enemy, st.death_pothole, st.death_fall,
            st.stages, st.best_stage, st.max_combo,
            txt(cf.city), txt(cf.region), txt(cf.country),
            num(cf.latitude), num(cf.longitude)).run();
          // ⚠️ A CONTINUED RUN REPLACES ITS OWN PARTIAL ROW. The client
          // submits at the knockdown and again at the true end, under a fresh
          // id (see createRunLog.renew) — otherwise the finished, higher run
          // is refused as a replay and the board keeps the lesser score. The
          // finished log contains every event of the earlier one, so without
          // this the first stretch is counted twice in the stats.
          //
          // Scoped to the SAME player id, so nobody can delete anyone else's
          // row by naming it, and the row in `runs` needs no repair: it holds
          // MAX(score) per person, which the finished run wins on its own.
          // ⚠️ NEVER DELETE A ROW THAT SCORED HIGHER THAN THE ONE REPLACING
          // IT. `supersedes` exists so a continued run does not count its
          // first stretch twice — the partial is dropped and the finished run
          // stands. That is right whenever the finished run is the bigger of
          // the two, which is the only way a continue can go.
          //
          // It is NOT right unconditionally, and the live database showed why:
          // `runs` keeps MAX(score) forever, so the board held 29,750 while
          // the row carrying that run's detail had been deleted by a later,
          // smaller submission. Every dashboard tile reads run_stats, so the
          // board and the tiles disagreed by 9,550 — on a page that decides
          // who gets paid.
          //
          // The guard is the score itself: drop the superseded row only if
          // this run beat it. Anything else leaves both rows, which
          // over-counts one stretch of play in the totals — a far cheaper
          // error than losing the winning run.
          const sup = String(b.supersedes || '').slice(0, 64);
          if (sup && /^[0-9a-f-]{16,64}$/i.test(sup)) {
            await env.DB.prepare(
              'DELETE FROM run_stats WHERE run_id = ? AND id = ? AND score <= ?',
            ).bind(sup, id, score).run();
          }
        } catch (e) {
          // ⚠️ THIS WAS `catch (_e) {}` AND IT COST US THE EVIDENCE.
          // Stats are still never load-bearing — the score in `runs` is the
          // contest record and it is already committed above, so a failure
          // here must not fail the submission. But swallowing it left no
          // trace, and the first sign of trouble was a dashboard disagreeing
          // with itself: `runs` held KCTW at 29,750 over 4 plays while
          // run_stats held 2 rows topping out at 20,200 — the highest run
          // missing outright, and nothing anywhere saying why.
          // The response is unchanged; the failure just stops being invisible.
          try {
            await env.DB.prepare(
              'INSERT INTO rejects (t, reason, detail, ip) VALUES (?, ?, ?, ?)',
            ).bind(Date.now(), 'stats-insert',
              String((e && e.message) || e).slice(0, 200),
              req.headers.get('CF-Connecting-IP') || '').run();
          } catch (_e2) { /* logging the logging failure is where it stops */ }
        }

        const row = await env.DB.prepare('SELECT score FROM runs WHERE id = ?').bind(id).first();
        const best = row ? row.score : score;
        const rankRow = await env.DB.prepare(
          'SELECT COUNT(*) AS n FROM runs WHERE score > ? OR (score = ? AND updated < ?)',
        ).bind(best, best, now).first();
        const totalRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs').first();

        return json({
          ok: true,
          rank: (rankRow ? rankRow.n : 0) + 1,
          score,
          best,
          total: totalRow ? totalRow.n : 0,
        });
      }

      // ── WHAT DOES THE EDGE KNOW ABOUT THE DEVICE ASKING? ─────────────────
      //
      // Purely diagnostic, and it exists because the map cannot be verified
      // from the machine that builds it: a probe sent from this project's
      // container came back with city, region and country all null, even
      // though Cloudflare's own trace resolves that address to US/IAD. Edge
      // geo is attached to consumer networks, not reliably to datacentre or
      // proxy addresses — so "does geo work" is a question only a real phone
      // on a real carrier can answer.
      //
      // Open it on the phone and it says what would be stored for a run from
      // there. It reveals only the caller's own coarse location back to the
      // caller — the same thing cloudflare.com/cdn-cgi/trace already does for
      // anybody — reads nothing, writes nothing, and touches no table.
      if (url.pathname === '/whereami' && req.method === 'GET') {
        const cf = req.cf || {};
        return json({
          ok: true,
          city: cf.city || null,
          region: cf.region || null,
          country: cf.country || null,
          lat: cf.latitude || null,
          lon: cf.longitude || null,
          timezone: cf.timezone || null,
          colo: cf.colo || null,
          // If this is false the map will have no dot for this device, and
          // the reason is the network it is on, not the code.
          wouldPlotOnMap: !!(cf.latitude && cf.longitude),
        });
      }

      return json({ ok: false, err: 'not found' }, 404);
    } catch (e) {
      // ⚠️ FAIL CLOSED. This used to return String(e.message) to the caller,
      // which hands an attacker a free map of the internals one malformed
      // request at a time. Log it, say nothing.
      try {
        await env.DB.prepare('INSERT INTO rejects (t, reason, detail, ip) VALUES (?, ?, ?, ?)')
          .bind(Date.now(), 'exception', String((e && e.message) || e).slice(0, 200),
            req.headers.get('CF-Connecting-IP') || '').run();
      } catch (_e2) { /* */ }
      return json({ ok: false, err: 'server error' }, 500);
    }
  },
};
