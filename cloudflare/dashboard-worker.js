/**
 * WILL HILL: PLAYER ONE — the contest dashboard.
 *
 * Client: "I wanna make a dashboard and that dashboard is gonna have all this
 * information... it's gonna be a whole nother separate link that is just the
 * dashboard, and whoever I give access to is gonna have access. They're gonna
 * be visiting that dashboard and reviewing that."
 *
 * ⚠️ A SEPARATE WORKER ON A SEPARATE HOSTNAME, DELIBERATELY. It would be less
 * code to bolt an /admin route onto the game worker, and that is exactly what
 * makes it worse: the game worker is the thing every phone at the party is
 * hammering, and it is the thing an attacker already has a URL for. This one
 * shares nothing with it but the database.
 *
 * ⚠️ NOT read-only ANY MORE — POST /toggle writes the one row the contest
 * on/off switch lives in, and POST /push-toggle the one row the push-
 * notifications master switch lives in (contest_state and push_state, both
 * schema.sql). Everything else here is still SELECT only; those two writes
 * are the exceptions, gated behind the same token as the rest of this
 * worker.
 *
 * ⚠️ WHICH SWITCH IS WHICH, ON SCREEN, IS NOT WHICH TABLE THEY WRITE. Client:
 * "important buttons need to be bigger and in face... that alert switch
 * [should be] the contest on and off switch... more larger in view than
 * that top button." His painted ALERT switch (#contestAlert, big, lower
 * right rail) drives /toggle — the contest — because it is the important
 * one and his art is the biggest control on the page. The small floating
 * pill (#pushPill, top corner) drives /push-toggle — it started as the
 * contest switch, when it was the only one; a second small control was
 * cheaper to add than a second painted one, and push is the one that can
 * afford to be small. Same two endpoints, same two tables, swapped fronts.
 *
 * ── ACCESS ───────────────────────────────────────────────────────────────
 *
 * One secret token, in the URL, no login — he wants to hand a link to Kema or
 * to Will Hill's team and have them just open it. So:
 *
 *   https://<host>/?k=<DASH_TOKEN>
 *
 * Set it, and rotate it, with:
 *   wrangler secret put DASH_TOKEN --name will-hill-dashboard
 *
 * ⚠️ A LINK WITH NO LOGIN IS AS PRIVATE AS THE LEAST CAREFUL PERSON IT REACHES,
 * and this page shows real phone numbers. Two things make that acceptable and
 * they are both load-bearing: the token can be rotated in one command, which
 * kills every link ever sent, and the page is noindex + no-referrer so the
 * token cannot walk out in a search index or an outbound click. ROTATE IT THE
 * DAY THE CONTEST CLOSES.
 *
 * A wrong or missing token gets 404, not 403 — a 403 confirms there is
 * something here to find.
 */

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  // Not indexed, and the token never rides along on an outbound request.
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  // ⚠️ `img-src data:` IS THE ONLY WIDENING, AND IT CANNOT FETCH. This page
  // joins public scores to private phone numbers, so the policy stays hostile
  // to the network — no CDN, no tile server, no font host. The client's MARTA
  // cabinet is inlined as four base64 WebP slices (27 KB all in).
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

// Constant-time compare, so the token cannot be recovered a character at a
// time by measuring how long the answer takes.
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a || ''));
  const y = new TextEncoder().encode(String(b || ''));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

// ⚠️ worldmap.js/mapdata.js WERE IMPORTED HERE — dead as of the Lightning
// rebuild below. They fed the old page's hand-drawn world map, which this
// front-end replaced with a plain LOCATIONS list view (a real Salesforce
// report is a table, not a canvas). Neither file is deleted — the SQL that
// produces the rows they used to plot is untouched in /data below, so a
// future map view could still read them — but nothing in this file needs
// them anymore.

// ⚠️ THESE MUST MIRROR cloudflare/leaderboard-worker.js. They were REFERENCED
// on the /data response and never DECLARED here, so every single call threw
// a ReferenceError and returned 500 — which is why this dashboard had never
// once shown a number since the day it was built. The page said "offline",
// which named the symptom and hid the cause; it reports the status code now.
// A worker has no access to the other worker's module scope, so the value is
// duplicated on purpose. Change one, change both.
const CONTEST_START = 0;  // ms epoch, 0 = not configured
const CONTEST_END = 0;

// ── THE SWITCH ────────────────────────────────────────────────────────────
//
// Client: "there should be a switch on the dashboard that allows them to turn
// the contest on or off. That's the simplest way to do it." One row in D1
// (schema.sql's contest_state, migrations/002); this worker reads it for the
// page and writes it from POST /toggle below. ⚠️ MIRRORS the same function in
// leaderboard-worker.js — a Worker has no access to the other Worker's module
// scope, so this is the second of the two on-purpose duplicates in this file,
// same reasoning as CONTEST_START/END above. Fails open on a read error for
// the same reason: a transient D1 hiccup must not read as "closed".
async function contestOpen(env) {
  try {
    const row = await env.DB.prepare('SELECT open FROM contest_state WHERE id = 1').first();
    return row ? !!row.open : true;
  } catch (_e) { return true; }
}

// ── THE ALERT SWITCH ─────────────────────────────────────────────────────
//
// Client: "their ability to turn on notification should be the alert switch
// inside of the cab... it should be able to switch on and off with a click
// sound for push notifications." Same shape as contestOpen() above, its own
// row (schema.sql's push_state, migrations/003) because this and the contest
// switch answer different questions — a contest can be open with push off,
// or push can stay on into a second contest. Fails CLOSED on a read error,
// the opposite default from contestOpen(): a transient D1 hiccup must not
// start silently paging people.
async function pushEnabled(env) {
  try {
    const row = await env.DB.prepare('SELECT enabled FROM push_state WHERE id = 1').first();
    return row ? !!row.enabled : false;
  } catch (_e) { return false; }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const key = url.searchParams.get('k');
    if (!env.DASH_TOKEN || !safeEqual(key, env.DASH_TOKEN)) return notFound();

    // ── DATA ─────────────────────────────────────────────────────────────
    // The one place in the system that joins the public board to the contact
    // details, and the only reason this worker exists.
    if (url.pathname === '/data') {
      // best_ms fills the BEST-RUN TIME column he painted into ALL ENTRANTS.
      // It is the duration of that player's highest-scoring run, so it is the
      // length of the run the board is showing and not an average. Correlated
      // subquery rather than another round trip: run_stats.id is indexed, and
      // a player has a handful of rows, not thousands.
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.name, r.score, r.updated, r.created, r.plays,
                e.phone, e.email,
                (SELECT s.duration FROM run_stats s
                  WHERE s.id = r.id ORDER BY s.score DESC LIMIT 1) AS best_ms
           FROM runs r LEFT JOIN entrants e ON e.id = r.id
          ORDER BY r.score DESC, r.updated ASC`,
      ).all();
      const rejects = await env.DB.prepare(
        'SELECT t, reason, detail FROM rejects ORDER BY t DESC LIMIT 50',
      ).all();
      const counts = await env.DB.prepare(
        'SELECT COUNT(*) AS entrants, COALESCE(SUM(plays),0) AS plays FROM runs',
      ).first();

      // ── WHERE THEY ARE PLAYING FROM ──────────────────────────────────────
      //
      // Client: "I want a world map that zooms in to city level and I wanna be
      // able to see what city each contestant is playing from."
      //
      // Grouped in SQL rather than in the page, because the page should not
      // have to hold every run to draw a dot — one row per city, however many
      // thousand runs came from it. `players` counts DISTINCT ids, so the dot
      // is sized by people and not by whoever refreshed the most.
      //
      // ⚠️ THE JOIN IS DELIBERATELY ABSENT. This reads run_stats only, which
      // is the opaque-id side of the wall — no phone number is anywhere near
      // the map. A city and a contact detail are joined in exactly one place
      // in this system, the query above, and the map is not it.
      // ⚠️ `best` COMES OFF THE BOARD, NOT OFF THE STATS ROWS. He caught the
      // mismatch himself: "do you see any discrepancies in the numbers — I
      // see 29,750 and also 20,200." HIGH SCORE reads `runs`, which is the
      // contest record; CITIES was reading MAX(run_stats.score), and this
      // database is missing two stats rows that a since-fixed supersede
      // DELETE destroyed, so the same player's best read 20,200 there and
      // 29,750 above it. The board score is the truth, so the city quotes it.
      //
      // The join is to `runs` ONLY — name and score, the public side. It is
      // NOT to `entrants`; a city and a phone number still meet in exactly
      // one query in this system, the one above, and the map is not it.
      const geo = await env.DB.prepare(
        `SELECT s.city, s.region, s.country,
                AVG(s.lat) AS lat, AVG(s.lon) AS lon,
                COUNT(*) AS runs,
                COUNT(DISTINCT s.id) AS players,
                MAX(COALESCE(r.score, s.score)) AS best,
                SUM(s.kills) AS kills,
                SUM(s.deaths) AS deaths,
                MAX(s.t) AS last
           FROM run_stats s LEFT JOIN runs r ON r.id = s.id
          WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL
          GROUP BY s.country, s.region, s.city
          ORDER BY players DESC, runs DESC`,
      ).all();

      // Lifetime totals, for the strip along the top. Same table, so the same
      // caveat applies: these are runs that reached the Worker.
      const totals = await env.DB.prepare(
        `SELECT COUNT(*) AS runs, COALESCE(SUM(kills),0) AS kills,
                COALESCE(SUM(deaths),0) AS deaths,
                COALESCE(SUM(bags),0) AS bags,
                COALESCE(SUM(continues),0) AS continues,
                COALESCE(MAX(score),0) AS best,
                COALESCE(SUM(duration),0) AS ms
           FROM run_stats`,
      ).first();

      // ── THE PANELS THE MOCKUP ADDED ──────────────────────────────────────
      // Every column below already existed in run_stats; they were recorded
      // when the stats work went in and nothing had ever read them. The
      // funnel is the one worth having: "how far do people actually get" is
      // the question he keeps asking about difficulty, and four numbers
      // answer it better than any amount of watching people play.
      const funnel = await env.DB.prepare(
        `SELECT COUNT(*) AS runs,
                SUM(CASE WHEN best_stage >= 1 THEN 1 ELSE 0 END) AS s1,
                SUM(CASE WHEN best_stage >= 2 THEN 1 ELSE 0 END) AS s2,
                SUM(CASE WHEN best_stage >= 3 THEN 1 ELSE 0 END) AS s3,
                SUM(CASE WHEN best_stage >= 4 THEN 1 ELSE 0 END) AS s4,
                SUM(CASE WHEN best_stage >= 5 THEN 1 ELSE 0 END) AS s5,
                COALESCE(SUM(death_enemy),0)   AS d_enemy,
                COALESCE(SUM(death_pothole),0) AS d_pothole,
                COALESCE(SUM(death_fall),0)    AS d_fall,
                COALESCE(SUM(bottles),0)       AS bottles,
                COALESCE(SUM(bags_lost),0)     AS bags_lost,
                -- MAX, not SUM: the panel says MAX COMBO, so it is the best
                -- chain anybody has strung together, not everyone's added up.
                COALESCE(MAX(max_combo),0)     AS max_combo,
                COALESCE(AVG(duration),0)      AS avg_ms
           FROM run_stats`,
      ).first();

      // Runs per hour over the last 72, for the sparkline. Bucketed in SQL so
      // the page never holds more than 72 numbers however long the contest is.
      const since = Date.now() - 72 * 3600 * 1000;
      const spark = await env.DB.prepare(
        `SELECT CAST((t - ?1) / 3600000 AS INTEGER) AS hour, COUNT(*) AS n
           FROM run_stats WHERE t >= ?1 GROUP BY hour ORDER BY hour`,
      ).bind(since).all();

      return new Response(JSON.stringify({
        ok: true, rows: results || [], rejects: rejects.results || [], counts,
        geo: geo.results || [], totals, funnel,
        spark: spark.results || [], sparkFrom: since,
        // The page cannot know the contest window, or the switch; the Worker
        // does — `open` is the one that actually gates /submit day to day.
        contest: { start: CONTEST_START, end: CONTEST_END, now: Date.now(),
          open: await contestOpen(env) },
        push: { enabled: await pushEnabled(env) },
      }), { headers: { ...HEADERS, 'Content-Type': 'application/json' } });
    }

    // ── THE SWITCH, FLIPPED ─────────────────────────────────────────────
    //
    // Reads current state and writes its opposite in one round trip rather
    // than accepting a client-supplied desired value, so two people clicking
    // it at once can't fight over whose click "wins" — each click acts on
    // what's actually in the database, not on what the page last rendered.
    if (url.pathname === '/toggle' && req.method === 'POST') {
      const next = (await contestOpen(env)) ? 0 : 1;
      await env.DB.prepare(
        `INSERT INTO contest_state (id, open) VALUES (1, ?)
           ON CONFLICT(id) DO UPDATE SET open = excluded.open`,
      ).bind(next).run();
      return new Response(JSON.stringify({ ok: true, open: !!next }), {
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── THE ALERT SWITCH, FLIPPED ────────────────────────────────────────
    // Same read-current-write-opposite shape as /toggle above, same reason.
    if (url.pathname === '/push-toggle' && req.method === 'POST') {
      const next = (await pushEnabled(env)) ? 0 : 1;
      await env.DB.prepare(
        `INSERT INTO push_state (id, enabled) VALUES (1, ?)
           ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled`,
      ).bind(next).run();
      return new Response(JSON.stringify({ ok: true, enabled: !!next }), {
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/csv') {
      const { results } = await env.DB.prepare(
        `SELECT r.score, r.name, e.phone, e.email, r.plays, r.updated
           FROM runs r LEFT JOIN entrants e ON e.id = r.id
          ORDER BY r.score DESC, r.updated ASC`,
      ).all();
      const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const csv = ['rank,score,name,phone,email,plays,best_run_at']
        .concat((results || []).map((r, i) => [
          i + 1, r.score, q(r.name), q(r.phone), q(r.email), r.plays,
          q(new Date(r.updated).toISOString()),
        ].join(',')))
        .join('\n');
      return new Response(csv, {
        headers: {
          ...HEADERS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="will-hill-contest.csv"',
        },
      });
    }

    // ── THE PAGE ─────────────────────────────────────────────────────────
    // Polls /data every 5s, so it fills in live during the contest without
    // anybody refreshing. The token is read from this page's own URL and
    // never written into the document.
    // ── THE PAGE ─────────────────────────────────────────────────────────
    // Polls /data every 5s, so it fills in live during the contest without
    // anybody refreshing. The token is read from this page's own URL and
    // never written into the document.
    //
    // ⚠️ SALESFORCE LIGHTNING, NOT HIS PAINTED PLATE — a deliberate, later
    // rebuild. Kema (PM on this project, a Salesforce admin by trade) asked
    // for the admin console specifically to read like the tool she actually
    // runs contests out of: a Lightning app-nav rail, list views, report
    // cards, a proper toggle input — not custom-painted art. This is the
    // ONLY thing that changed. Every /data, /toggle, /push-toggle and /csv
    // call above is untouched — same shapes, same auth, same D1 queries —
    // because none of that is a design decision, and none of it is this
    // rebuild's to touch. If the backend ever changes shape, this page
    // reads it exactly the same way the painted one did.
    //
    // The map tab is gone on purpose, not an oversight: a hand-illustrated
    // world map was the previous page's own design language (his painted
    // plate), and it doesn't have a Lightning equivalent — a real Salesforce
    // report is a table or a chart. LOCATIONS is that table: same geo rows,
    // sorted by players, with the projection math the old map needed
    // (MAPV/MAP, tuned to the painted plate's exact pixel dimensions)
    // dropped entirely since nothing here draws on a canvas anymore.
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>WH:P1 — Contest Console</title>
<style>
/* ── SALESFORCE LIGHTNING DESIGN SYSTEM TOKENS ───────────────────────────
   Salesforce's own brand blue (#0176D3) and neutral scale, not this game's
   gold-on-brick palette — the admin console is explicitly not the game's
   branding, it's the tool the PM runs the contest from. */
:root{
  --sf-blue:#0176d3; --sf-blue-dark:#014486; --sf-blue-light:#eaf5fe;
  --sf-bg:#f3f2f2; --sf-card:#ffffff; --sf-border:#dddbda;
  --sf-text:#181818; --sf-text-2:#3e3e3c; --sf-text-3:#706e6b;
  --sf-green:#04844b; --sf-green-bg:#e6f5ec;
  --sf-red:#ba0517; --sf-red-bg:#fdeeee;
  --sf-orange:#a35200; --sf-orange-bg:#fff3e0;
  --sf-shadow:0 2px 2px 0 rgba(0,0,0,.10);
  --sf-radius:4px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--sf-bg);color:var(--sf-text);
  font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:var(--sf-blue);text-decoration:none}
a:hover{text-decoration:underline}
button{font:inherit;cursor:pointer}

/* ── GLOBAL HEADER — Lightning's dark utility bar ─────────────────────── */
#hdr{background:var(--sf-blue-dark);color:#fff;display:flex;align-items:center;
  gap:16px;padding:0 16px;height:50px;position:sticky;top:0;z-index:20;
  box-shadow:var(--sf-shadow)}
#hdr .brand{font-weight:700;font-size:15px;letter-spacing:.01em;white-space:nowrap}
#hdr .brand small{display:block;font-weight:400;font-size:10.5px;
  color:rgba(255,255,255,.68);letter-spacing:.03em;margin-top:1px}
#hdr .spacer{flex:1}
#hdr .clock{font-size:12px;color:rgba(255,255,255,.82);text-align:right}
#hdr .clock b{display:block;color:#fff;font-size:13px}
#hdr .upd{font-size:11px;color:rgba(255,255,255,.6);margin-left:14px;
  padding-left:14px;border-left:1px solid rgba(255,255,255,.25)}

/* ── SHELL: app-nav rail + main ───────────────────────────────────────── */
#shell{display:flex;min-height:calc(100vh - 50px)}
#nav{width:200px;flex:none;background:var(--sf-card);
  border-right:1px solid var(--sf-border);padding:12px 0}
#nav .item{display:flex;align-items:center;gap:10px;padding:9px 16px;
  font-size:13px;color:var(--sf-text-2);cursor:pointer;border-left:3px solid transparent}
#nav .item:hover{background:var(--sf-bg)}
#nav .item.on{color:var(--sf-blue-dark);font-weight:700;
  background:var(--sf-blue-light);border-left-color:var(--sf-blue)}
#nav .item .ic{width:16px;height:16px;flex:none;border-radius:3px;
  background:var(--sf-text-3)}
#nav .item.on .ic{background:var(--sf-blue)}
#main{flex:1;min-width:0;padding:20px 24px 60px}

.crumb{font-size:11px;color:var(--sf-text-3);text-transform:uppercase;
  letter-spacing:.04em;margin-bottom:2px}
h1.pt{font-size:22px;font-weight:700;margin:0 0 16px;color:var(--sf-text)}

/* ── CARDS ─────────────────────────────────────────────────────────────── */
.card{background:var(--sf-card);border:1px solid var(--sf-border);
  border-radius:var(--sf-radius);box-shadow:var(--sf-shadow);margin-bottom:16px}
.card .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;
  border-bottom:1px solid var(--sf-border);font-weight:700;font-size:13px}
.card .hd .sub{font-weight:400;color:var(--sf-text-3);font-size:12px}
.card .bd{padding:16px}

/* ── KPI TILES ─────────────────────────────────────────────────────────── */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;
  margin-bottom:16px}
.kpi{background:var(--sf-card);border:1px solid var(--sf-border);
  border-left:3px solid var(--sf-blue);border-radius:var(--sf-radius);
  box-shadow:var(--sf-shadow);padding:12px 14px}
.kpi .lbl{font-size:11px;color:var(--sf-text-3);text-transform:uppercase;
  letter-spacing:.04em;margin-bottom:4px}
.kpi .val{font-size:24px;font-weight:700;color:var(--sf-text)}

/* ── QUICK ACTIONS: the switch, as a real toggle ──────────────────────── */
.qa{display:flex;flex-wrap:wrap;gap:20px}
.toggle-row{display:flex;align-items:center;gap:12px;min-width:220px}
.toggle-row .lbl{font-size:13px;font-weight:700}
.toggle-row .sub{font-size:11.5px;color:var(--sf-text-3)}
.slds-toggle{position:relative;width:36px;height:20px;border-radius:999px;
  background:#c9c7c5;border:0;flex:none;transition:background .15s}
.slds-toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;
  border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}
.slds-toggle.on{background:var(--sf-green)}
.slds-toggle.on::after{left:18px}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;
  padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
.badge.open{background:var(--sf-green-bg);color:var(--sf-green)}
.badge.closed{background:#f3f2f2;color:var(--sf-text-3)}
.badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}

/* ── LIST VIEWS (tables) ──────────────────────────────────────────────── */
.lv-tools{display:flex;align-items:center;gap:10px;padding:10px 16px;
  border-bottom:1px solid var(--sf-border)}
.lv-search{flex:1;max-width:320px;position:relative}
.lv-search input{width:100%;padding:7px 10px 7px 30px;border:1px solid var(--sf-border);
  border-radius:var(--sf-radius);font:inherit;color:var(--sf-text)}
.lv-search::before{content:'';position:absolute;left:10px;top:50%;margin-top:-6px;
  width:12px;height:12px;border:2px solid var(--sf-text-3);border-radius:50%}
.lv-count{font-size:12px;color:var(--sf-text-3)}
.btn{background:var(--sf-blue);color:#fff;border:0;border-radius:var(--sf-radius);
  padding:7px 14px;font-size:13px;font-weight:700}
.btn:hover{background:var(--sf-blue-dark)}
.btn.ghost{background:#fff;color:var(--sf-blue);border:1px solid var(--sf-border)}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{position:sticky;top:0;background:var(--sf-bg);text-align:left;
  font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--sf-text-3);
  padding:8px 14px;border-bottom:1px solid var(--sf-border);cursor:pointer;white-space:nowrap}
thead th:hover{color:var(--sf-blue-dark)}
thead th.num,td.num{text-align:right}
tbody td{padding:8px 14px;border-bottom:1px solid #f0efee;white-space:nowrap}
tbody tr:hover{background:var(--sf-blue-light)}
tbody tr:nth-child(even){background:#fafaf9}
tbody tr:nth-child(even):hover{background:var(--sf-blue-light)}
.rank{color:var(--sf-text-3)}
.tbl-wrap{overflow-x:auto;max-height:70vh;overflow-y:auto}
.empty{padding:30px;text-align:center;color:var(--sf-text-3)}

/* ── REPORT BARS (funnel / death causes) ──────────────────────────────── */
.rbar-row{display:grid;grid-template-columns:120px 1fr 56px;align-items:center;
  gap:10px;padding:6px 0;font-size:12.5px}
.rbar-track{background:#f0efee;border-radius:3px;height:14px;overflow:hidden}
.rbar-fill{height:100%;background:var(--sf-blue);border-radius:3px}
.rbar-fill.warn{background:var(--sf-orange)}
.rbar-fill.bad{background:var(--sf-red)}
.rbar-val{text-align:right;color:var(--sf-text-3);font-variant-numeric:tabular-nums}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px}
.stat-grid .s{border-left:2px solid var(--sf-border);padding-left:10px}
.stat-grid .s .v{font-size:18px;font-weight:700}
.stat-grid .s .l{font-size:11px;color:var(--sf-text-3);text-transform:uppercase;
  letter-spacing:.03em}

.view{display:none}
.view.on{display:block}
.hint{font-size:12px;color:var(--sf-text-3);margin:0 0 12px}
#navBtn{display:none}
#navBackdrop{display:none}
@media (max-width:760px){
  /* The rail is off-canvas by default at phone width — this is the only
     device he actually reads it on, so #navBtn/#navBackdrop below are not
     optional chrome, they're the only way to reach Entrants/Locations/
     Analytics/Activity Log at all. dashload.mjs's tab-open step caught this
     rail being unreachable before this button existed — fix it there too if
     this ever moves. */
  #nav{position:fixed;left:0;top:50px;bottom:0;transform:translateX(-100%);
    transition:transform .15s;z-index:15}
  #nav.open{transform:none}
  #main{padding:16px}
  #navBtn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;
    flex:none;cursor:pointer;border-radius:4px}
  #navBtn:hover{background:rgba(255,255,255,.12)}
  #navBtn span,#navBtn span::before,#navBtn span::after{content:'';display:block;
    width:18px;height:2px;background:#fff;border-radius:1px}
  #navBtn span::before{transform:translateY(-5px)}
  #navBtn span::after{transform:translateY(3px)}
  #navBackdrop.on{display:block;position:fixed;left:0;right:0;top:50px;bottom:0;
    background:rgba(8,7,7,.4);z-index:14}
  /* navBtn + brand + clock + upd, none of them shrinking, ran the header
     ~28px past a 390px phone — the width dashload.mjs actually checks. The
     "updated HH:MM:SS" stamp is the least load-bearing of the four (KPI
     freshness lives in the data itself), so it's what gives on a narrow
     phone rather than truncating the brand or the clock. */
  #hdr .upd{display:none}
}
</style>
</head><body>

<div id="hdr">
  <div id="navBtn"><span></span></div>
  <div class="brand">WILL HILL: PLAYER ONE<small>Contest Console</small></div>
  <div class="spacer"></div>
  <div class="clock">ATLANTA TIME<b id="clockA">—</b></div>
  <div class="upd" id="updText">—</div>
</div>

<div id="navBackdrop"></div>
<div id="shell">
  <div id="nav">
    <div class="item on" data-v="home"><span class="ic"></span>Home</div>
    <div class="item" data-v="entrants"><span class="ic"></span>Entrants</div>
    <div class="item" data-v="locations"><span class="ic"></span>Locations</div>
    <div class="item" data-v="analytics"><span class="ic"></span>Analytics</div>
    <div class="item" data-v="activity"><span class="ic"></span>Activity Log</div>
  </div>

  <div id="main">

    <!-- ── HOME ─────────────────────────────────────────────────────── -->
    <div class="view on" id="v-home">
      <div class="crumb">Contest Console</div>
      <h1 class="pt">Home</h1>

      <div class="kpis" id="kpis"></div>

      <div class="card">
        <div class="hd">Quick Actions</div>
        <div class="bd qa">
          <div class="toggle-row">
            <button class="slds-toggle" id="tgContest"></button>
            <div>
              <div class="lbl">Contest</div>
              <div class="sub" id="contestSub">—</div>
            </div>
            <span class="badge" id="contestBadge"></span>
          </div>
          <div class="toggle-row">
            <button class="slds-toggle" id="tgPush"></button>
            <div>
              <div class="lbl">Push Notifications</div>
              <div class="sub" id="pushSub">—</div>
            </div>
            <span class="badge" id="pushBadge"></span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="hd">Runs — last 72 hours<span class="sub" id="sparkSub"></span></div>
        <div class="bd" id="sparkWrap"></div>
      </div>
    </div>

    <!-- ── ENTRANTS ─────────────────────────────────────────────────── -->
    <div class="view" id="v-entrants">
      <div class="crumb">Contest Console</div>
      <h1 class="pt">Entrants</h1>
      <div class="card">
        <div class="lv-tools">
          <div class="lv-search"><input id="q" placeholder="Search name or phone"></div>
          <div class="spacer" style="flex:1"></div>
          <span class="lv-count" id="entCount"></span>
          <button class="btn" id="csvBtn">Download CSV</button>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr>
              <th data-k="rank">#</th><th data-k="name">Name</th>
              <th class="num" data-k="score">Score</th>
              <th class="num" data-k="best_ms">Best Run</th>
              <th class="num" data-k="plays">Plays</th>
              <th data-k="phone">Phone</th><th data-k="email">Email</th>
              <th data-k="updated">Last Played</th>
            </tr></thead>
            <tbody id="entBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── LOCATIONS (was the painted map) ─────────────────────────────
         Real Lightning reports are tables and charts, not a custom-drawn
         map — so this is a sorted list view of the same geo rows /data
         already grouped in SQL, not the canvas the old page drew. -->
    <div class="view" id="v-locations">
      <div class="crumb">Contest Console</div>
      <h1 class="pt">Locations</h1>
      <p class="hint">Where entrants are playing from, grouped server-side — most players first.</p>
      <div class="card">
        <div class="tbl-wrap">
          <table>
            <thead><tr>
              <th data-k="city">City</th><th data-k="region">Region / Country</th>
              <th class="num" data-k="players">Players</th>
              <th class="num" data-k="runs">Runs</th>
              <th class="num" data-k="best">Best Score</th>
              <th class="num" data-k="kills">Kills</th>
              <th class="num" data-k="deaths">Deaths</th>
              <th data-k="last">Last Active</th>
            </tr></thead>
            <tbody id="geoBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── ANALYTICS ─────────────────────────────────────────────────── -->
    <div class="view" id="v-analytics">
      <div class="crumb">Contest Console</div>
      <h1 class="pt">Analytics</h1>

      <div class="card">
        <div class="hd">Stage Progression<span class="sub">How far runs actually get</span></div>
        <div class="bd" id="funnelWrap"></div>
      </div>

      <div class="card">
        <div class="hd">Run Outcomes</div>
        <div class="bd stat-grid" id="statsWrap"></div>
      </div>

      <div class="card">
        <div class="hd">Cause of Death</div>
        <div class="bd" id="deathWrap"></div>
      </div>
    </div>

    <!-- ── ACTIVITY LOG (rejects) ───────────────────────────────────── -->
    <div class="view" id="v-activity">
      <div class="crumb">Contest Console</div>
      <h1 class="pt">Activity Log</h1>
      <p class="hint">Submissions the server refused — replay/score validation, honeypot hits, rate limits.</p>
      <div class="card">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>When</th><th>Reason</th><th>Detail</th></tr></thead>
            <tbody id="rejBody"></tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
const K = new URLSearchParams(location.search).get('k');
const $ = (i) => document.getElementById(i);
const n = (v) => Number(v || 0).toLocaleString();
const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

function atlanta(){
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
}
function mmss(ms){
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function stamp(t){
  if (!t) return '—';
  return new Date(t).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ── NAV ──────────────────────────────────────────────────────────────────
function closeNav(){
  $('nav').classList.remove('open');
  $('navBackdrop').classList.remove('on');
}
$('navBtn').addEventListener('click', () => {
  $('nav').classList.toggle('open');
  $('navBackdrop').classList.toggle('on');
});
$('navBackdrop').addEventListener('click', closeNav);
document.querySelectorAll('#nav .item').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('#nav .item').forEach((x) => x.classList.remove('on'));
    document.querySelectorAll('.view').forEach((x) => x.classList.remove('on'));
    el.classList.add('on');
    $('v-' + el.dataset.v).classList.add('on');
    closeNav();
  });
});

// ── STATE + POLL ─────────────────────────────────────────────────────────
let last = null;
let sortKey = { entrants: 'score', locations: 'players' };
let sortDir = { entrants: -1, locations: -1 };
let q = '';

async function pull(){
  let res;
  try { res = await fetch('/data?k=' + encodeURIComponent(K)); }
  catch (e) { $('updText').textContent = 'offline'; return; }
  if (!res.ok) { $('updText').textContent = 'error ' + res.status; return; }
  last = await res.json();
  $('updText').textContent = 'updated ' + new Date().toLocaleTimeString();
  draw();
}

// Every draw() rebuilds every table's innerHTML from scratch — fine once,
// not fine every 5s forever against a real entrant count. pull() only calls
// draw() with a fresh poll, never with a user action (search/sort call the
// drawX() functions directly), so comparing the raw JSON is safe: an
// unchanged poll is skipped outright instead of re-rendering rows nobody's
// scroll position or search box asked to move.
let lastSig = '';
function draw(){
  if (!last) return;
  const sig = JSON.stringify(last);
  if (sig === lastSig) return;
  lastSig = sig;
  drawKpis();
  drawSwitches();
  drawSpark();
  drawEntrants();
  drawLocations();
  drawAnalytics();
  drawActivity();
}

// ── HOME ─────────────────────────────────────────────────────────────────
function drawKpis(){
  const c = last.counts || {}, t = last.totals || {};
  const tiles = [
    ['Entrants', n(c.entrants)], ['Plays', n(c.plays)],
    ['Best Score', n(t.best)], ['Kills', n(t.kills)],
    ['Bags Collected', n(t.bags)], ['Deaths', n(t.deaths)],
  ];
  $('kpis').innerHTML = tiles.map(([l, v]) =>
    '<div class="kpi"><div class="lbl">' + esc(l) + '</div><div class="val">' + v + '</div></div>'
  ).join('');
}

function drawSwitches(){
  const open = !!(last.contest && last.contest.open);
  $('tgContest').classList.toggle('on', open);
  $('contestSub').textContent = open ? 'Accepting entries' : 'Closed to entries';
  $('contestBadge').className = 'badge ' + (open ? 'open' : 'closed');
  $('contestBadge').innerHTML = '<span class="dot"></span>' + (open ? 'OPEN' : 'CLOSED');

  const pushOn = !!(last.push && last.push.enabled);
  $('tgPush').classList.toggle('on', pushOn);
  $('pushSub').textContent = pushOn ? 'Players can receive alerts' : 'Alerts are off';
  $('pushBadge').className = 'badge ' + (pushOn ? 'open' : 'closed');
  $('pushBadge').innerHTML = '<span class="dot"></span>' + (pushOn ? 'ON' : 'OFF');
}

$('tgContest').addEventListener('click', async () => {
  $('tgContest').disabled = true;
  try { await fetch('/toggle?k=' + encodeURIComponent(K), { method: 'POST' }); }
  finally { $('tgContest').disabled = false; pull(); }
});
$('tgPush').addEventListener('click', async () => {
  $('tgPush').disabled = true;
  try { await fetch('/push-toggle?k=' + encodeURIComponent(K), { method: 'POST' }); }
  finally { $('tgPush').disabled = false; pull(); }
});

function drawSpark(){
  const rows = last.spark || [];
  if (!rows.length) { $('sparkWrap').innerHTML = '<div class="empty">No runs yet</div>'; return; }
  const max = Math.max(1, ...rows.map((r) => r.n));
  const w = 6, gap = 2;
  const bars = rows.map((r) =>
    '<div style="width:' + w + 'px;height:' + Math.round((r.n / max) * 60 + 2) +
    'px;background:var(--sf-blue);border-radius:1px" title="hour ' + r.hour + ': ' + r.n + ' runs"></div>'
  ).join('');
  $('sparkWrap').innerHTML =
    '<div style="display:flex;align-items:flex-end;gap:' + gap + 'px;height:64px">' + bars + '</div>';
  $('sparkSub').textContent = rows.reduce((a, r) => a + r.n, 0) + ' runs';
}

// ── ENTRANTS ─────────────────────────────────────────────────────────────
$('q').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); drawEntrants(); });
document.querySelectorAll('#v-entrants thead th').forEach((th) => {
  th.addEventListener('click', () => {
    const k = th.dataset.k;
    sortDir.entrants = (sortKey.entrants === k) ? -sortDir.entrants : -1;
    sortKey.entrants = k;
    drawEntrants();
  });
});
$('csvBtn').addEventListener('click', () => {
  location.href = '/csv?k=' + encodeURIComponent(K);
});

function drawEntrants(){
  let rows = (last.rows || []).filter((r) =>
    !q || (r.name || '').toLowerCase().includes(q) || (r.phone || '').includes(q));
  const k = sortKey.entrants, dir = sortDir.entrants;
  rows = rows.slice().sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1;
    return av > bv ? dir : av < bv ? -dir : 0;
  });
  $('entCount').textContent = rows.length + ' of ' + (last.rows || []).length;
  if (!rows.length) { $('entBody').innerHTML = '<tr><td colspan="8" class="empty">No entrants match</td></tr>'; return; }
  $('entBody').innerHTML = rows.map((r, i) =>
    '<tr><td class="rank">' + (i + 1) + '</td><td>' + esc(r.name) + '</td>' +
    '<td class="num">' + n(r.score) + '</td><td class="num">' + mmss(r.best_ms) + '</td>' +
    '<td class="num">' + n(r.plays) + '</td><td>' + esc(r.phone) + '</td>' +
    '<td>' + esc(r.email) + '</td><td>' + stamp(r.updated) + '</td></tr>'
  ).join('');
}

// ── LOCATIONS ────────────────────────────────────────────────────────────
document.querySelectorAll('#v-locations thead th').forEach((th) => {
  th.addEventListener('click', () => {
    const k = th.dataset.k;
    sortDir.locations = (sortKey.locations === k) ? -sortDir.locations : -1;
    sortKey.locations = k;
    drawLocations();
  });
});
function drawLocations(){
  let rows = last.geo || [];
  const k = sortKey.locations, dir = sortDir.locations;
  rows = rows.slice().sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1;
    return av > bv ? dir : av < bv ? -dir : 0;
  });
  if (!rows.length) { $('geoBody').innerHTML = '<tr><td colspan="8" class="empty">No located runs yet</td></tr>'; return; }
  $('geoBody').innerHTML = rows.map((r) =>
    '<tr><td>' + esc(r.city) + '</td><td>' + esc([r.region, r.country].filter(Boolean).join(', ')) + '</td>' +
    '<td class="num">' + n(r.players) + '</td><td class="num">' + n(r.runs) + '</td>' +
    '<td class="num">' + n(r.best) + '</td><td class="num">' + n(r.kills) + '</td>' +
    '<td class="num">' + n(r.deaths) + '</td><td>' + stamp(r.last) + '</td></tr>'
  ).join('');
}

// ── ANALYTICS ────────────────────────────────────────────────────────────
function bar(label, val, max, cls){
  // val missing/null (an empty funnel, a stage nobody's reached yet) must
  // not become width:NaN% — the browser ignores an invalid width and the
  // fill falls back to full, showing a 100% bar next to a 0 label.
  val = val || 0;
  const pct = max > 0 ? Math.round((val / max) * 100) : 0;
  return '<div class="rbar-row"><div>' + esc(label) + '</div>' +
    '<div class="rbar-track"><div class="rbar-fill' + (cls ? ' ' + cls : '') +
    '" style="width:' + pct + '%"></div></div>' +
    '<div class="rbar-val">' + n(val) + '</div></div>';
}
function drawAnalytics(){
  const f = last.funnel || {};
  const runs = f.runs || 0;
  $('funnelWrap').innerHTML = [
    bar('Started', runs, runs),
    bar('Reached Stage 2', f.s2, runs),
    bar('Reached Stage 3', f.s3, runs),
    bar('Reached Stage 4', f.s4, runs),
    bar('Finished (Stage 5)', f.s5, runs),
  ].join('');

  $('statsWrap').innerHTML = [
    ['Max Combo', n(f.max_combo)],
    ['Avg Run Time', mmss(f.avg_ms)],
    ['Bottles Thrown', n(f.bottles)],
    ['Bags Lost', n(f.bags_lost)],
  ].map(([l, v]) => '<div class="s"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>').join('');

  const deaths = [
    ['Enemy', f.d_enemy || 0, ''],
    ['Pothole', f.d_pothole || 0, 'warn'],
    ['Fall', f.d_fall || 0, 'bad'],
  ];
  const dmax = Math.max(1, ...deaths.map((d) => d[1]));
  $('deathWrap').innerHTML = deaths.map(([l, v, cls]) => bar(l, v, dmax, cls)).join('');
}

// ── ACTIVITY LOG ─────────────────────────────────────────────────────────
function drawActivity(){
  const rows = last.rejects || [];
  if (!rows.length) { $('rejBody').innerHTML = '<tr><td colspan="3" class="empty">Nothing rejected</td></tr>'; return; }
  $('rejBody').innerHTML = rows.map((r) =>
    '<tr><td>' + stamp(r.t) + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.detail) + '</td></tr>'
  ).join('');
}

$('clockA').textContent = atlanta();
setInterval(() => { $('clockA').textContent = atlanta(); }, 1000);
pull();
setInterval(pull, 5000);
</script></body></html>`;
    return new Response(html, { headers: HEADERS });
  },
};
