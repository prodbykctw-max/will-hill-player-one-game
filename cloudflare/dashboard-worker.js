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
 * shares nothing with it but the database, and it is READ-ONLY on that.
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
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
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

import { WORLD } from './worldmap.js';

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
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.name, r.score, r.updated, r.created, r.plays,
                e.phone, e.email
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
      const geo = await env.DB.prepare(
        `SELECT city, region, country,
                AVG(lat) AS lat, AVG(lon) AS lon,
                COUNT(*) AS runs,
                COUNT(DISTINCT id) AS players,
                MAX(score) AS best,
                SUM(kills) AS kills,
                SUM(deaths) AS deaths,
                MAX(t) AS last
           FROM run_stats
          WHERE lat IS NOT NULL AND lon IS NOT NULL
          GROUP BY country, region, city
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
                COALESCE(SUM(death_enemy),0)   AS d_enemy,
                COALESCE(SUM(death_pothole),0) AS d_pothole,
                COALESCE(SUM(death_fall),0)    AS d_fall,
                COALESCE(SUM(bottles),0)       AS bottles,
                COALESCE(SUM(bags_lost),0)     AS bags_lost,
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
        // The page cannot know the contest window; the Worker does.
        contest: { start: CONTEST_START, end: CONTEST_END, now: Date.now() },
      }), { headers: { ...HEADERS, 'Content-Type': 'application/json' } });
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
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>WH:P1 — contest</title>
<style>
 :root{--bg:#0f0d16;--fg:#f2ead8;--gold:#ffd66e;--dim:#8c86a0;--line:#241f33}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
 header{padding:16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
 h1{margin:0 0 4px;font-size:18px;letter-spacing:.06em;color:var(--gold)}
 .sub{color:var(--dim);font-size:13px}
 .bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
 input,select,a.btn{background:#1a1626;color:var(--fg);border:1px solid var(--line);
   border-radius:8px;padding:8px 10px;font:inherit;text-decoration:none}
 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
 /* ── the map, the cards, the board ─────────────────────────────────── */
 .strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;padding:14px 16px 0}
 .stat{background:#161226;border:1px solid var(--line);border-radius:10px;padding:9px 11px}
 .stat b{display:block;font:600 19px/1.25 ui-monospace,monospace;color:var(--gold);font-variant-numeric:tabular-nums}
 .stat span{color:var(--dim);font-size:11px;letter-spacing:.05em;text-transform:uppercase}
 .cols{display:grid;grid-template-columns:1.55fr 1fr;gap:14px;padding:14px 16px;align-items:start}
 @media (max-width:900px){.cols{grid-template-columns:1fr}}
 .panel{background:#161226;border:1px solid var(--line);border-radius:12px;overflow:hidden}
 .panel h2{margin:0;padding:10px 13px;font:600 12px/1 ui-monospace,monospace;color:var(--dim);
   letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--line)}
 #mapwrap{position:relative;background:#0b0913}
 #map{display:block;width:100%;height:auto;touch-action:manipulation}
 .land{fill:#1d1830;stroke:#2f2846;stroke-width:.35;vector-effect:non-scaling-stroke}
 .dot{fill:var(--gold);fill-opacity:.82;stroke:#0b0913;stroke-width:.5;cursor:pointer;
   vector-effect:non-scaling-stroke}
 .dot:hover,.dot.on{fill:#fff}
 .halo{fill:none;stroke:var(--gold);stroke-width:1;opacity:.45;vector-effect:non-scaling-stroke}
 .lbl{fill:#efe9dc;font-family:ui-monospace,monospace;font-weight:600;paint-order:stroke;
   stroke:#0b0913;pointer-events:none}  /* size/stroke set per-frame in px units */
 .mapbar{display:flex;gap:6px;align-items:center;padding:8px 13px;border-top:1px solid var(--line);
   flex-wrap:wrap}
 .mapbar button{background:#221c33;color:var(--fg);border:1px solid var(--line);border-radius:7px;
   padding:6px 9px;font:600 12px ui-sans-serif,system-ui;cursor:pointer}
 .mapbar button:hover{border-color:var(--gold)}
 .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:11px;
   max-height:330px;overflow:auto}
 .card{background:#1b1629;border:1px solid var(--line);border-radius:10px;padding:9px 10px;cursor:pointer}
 .card:hover,.card.on{border-color:var(--gold);background:#241d34}
 .card .city{font-weight:600}
 .card .meta{color:var(--dim);font-size:11px;margin-top:2px}
 .card .best{color:var(--gold);font:600 13px ui-monospace,monospace;margin-top:4px}
 .board{padding:6px 11px 11px}
 .board .row{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:baseline;
   padding:6px 2px;border-bottom:1px solid #1e1930}
 .board .row:last-child{border-bottom:0}
 .board .n{color:var(--dim);font:600 12px ui-monospace,monospace}
 .board .sc{color:var(--gold);font:600 14px ui-monospace,monospace}
 .board .row.gold .n{color:var(--gold)}
 .note{color:var(--dim);font-size:11px;padding:0 13px 11px;line-height:1.45}
 /* ── his concept's lower row: funnel, sparkline, continues, metrics ─── */
 .row3{display:grid;grid-template-columns:1.2fr 1.4fr .8fr 1fr;gap:14px;padding:0 16px 14px}
 @media (max-width:1100px){.row3{grid-template-columns:1fr 1fr}}
 @media (max-width:640px){.row3{grid-template-columns:1fr}}
 .fun{padding:11px 13px}
 .fun .f{display:grid;grid-template-columns:74px 1fr auto;gap:8px;align-items:center;margin:7px 0}
 .fun .nm{color:var(--dim);font:11px ui-monospace,monospace;letter-spacing:.04em}
 .fun .bar{height:11px;background:#221c33;border-radius:3px;overflow:hidden}
 .fun .bar i{display:block;height:100%;background:linear-gradient(90deg,#ffd66e,#f0b429)}
 .fun .v{font:12px ui-monospace,monospace;color:var(--fg);white-space:nowrap}
 .spark{padding:11px 13px}
 .spark svg{width:100%;height:96px;display:block}
 .kv{padding:9px 13px 12px}
 .kv div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;
   border-bottom:1px solid #1e1930;font-size:13px}
 .kv div:last-child{border-bottom:0}
 .kv span{color:var(--dim)}
 .kv b{font:600 13px ui-monospace,monospace;color:var(--gold)}
 .big{padding:14px 13px;text-align:center}
 .big b{display:block;font:700 30px/1 ui-monospace,monospace;color:var(--gold)}
 .big span{color:var(--dim);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
 /* deaths tile carries its own three-way split, from his concept */
 .stat .split{display:flex;gap:6px;margin-top:5px}
 .stat .split i{flex:1;font-style:normal;font:11px ui-monospace,monospace;color:var(--dim);
   background:#1d1728;border-radius:4px;padding:2px 4px;text-align:center}
 .stat .split i b{display:block;color:var(--hot);font-size:12px}
 .clock{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:8px}
 .clock div span{display:block;color:var(--dim);font-size:10px;letter-spacing:.07em;
   text-transform:uppercase}
 .clock div b{font:700 17px/1.15 ui-monospace,monospace;color:var(--gold)}
 .clock .live b{color:#57e08a}
 /* the city list, compact, replacing the big cards */
 .clist{padding:6px 11px 11px;max-height:290px;overflow:auto}
 .clist .c{display:grid;grid-template-columns:1fr auto;gap:6px;padding:7px 6px;
   border-bottom:1px solid #1e1930;cursor:pointer;border-radius:6px}
 .clist .c:hover,.clist .c.on{background:#241d34}
 .clist .c.on{outline:1px solid var(--gold)}
 .clist .nm{font-weight:600}
 .clist .sub{color:var(--dim);font-size:11px}
 .clist .sc{font:600 13px ui-monospace,monospace;color:var(--gold);align-self:center}
 th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
 th{position:sticky;top:0;background:#151122;color:var(--dim);font-size:12px;
    letter-spacing:.08em;text-transform:uppercase}
 td.s{color:var(--gold);font-weight:700}
 tr.top1 td.r{color:#ffd66e;font-weight:800}
 .wrap{overflow-x:auto}
 .rej{padding:16px;color:var(--dim);font-size:13px}
 .rej b{color:#ff9c9c}
</style></head><body>
<header>
 <h1>WILL HILL: PLAYER ONE — CONTEST</h1>
 <div class="sub" id="sum">loading…</div>
 <div class="bar">
  <input id="q" placeholder="filter name or phone">
  <select id="lim"><option value="0">everyone</option><option value="3">top 3</option>
   <option value="10">top 10</option><option value="25">top 25</option></select>
  <a class="btn" id="csv" href="#">download CSV</a>
  <span class="sub" id="tick"></span>
 </div>
 <div class="clock">
  <div><span>Atlanta time (ET)</span><b id="cET">—</b></div>
  <div><span id="cLabel">Contest</span><b id="cLeft">—</b></div>
  <div class="live"><span>Status</span><b id="cStat">—</b></div>
 </div>
</header>
<div class="strip" id="strip"></div>
<div class="cols">
 <div class="panel">
  <h2>Where they are playing from</h2>
  <div id="mapwrap"><svg id="map" viewBox="0 51 360 201" preserveAspectRatio="xMidYMid meet"
    role="img" aria-label="World map of contest players by city"></svg></div>
  <div class="mapbar">
   <button id="mWorld">world</button><button id="mUS">north america</button>
   <button id="mATL">atlanta</button>
   <span class="sub" id="mHint">tap a city</span>
  </div>
  <p class="note">Edge geolocation resolves the NETWORK, not the person — a phone on
   cellular often lands on its carrier's hub city and a VPN reports wherever it exits.
   Good for "the Southeast is lit up"; not evidence of where anyone lives.</p>
 </div>
 <div class="panel">
  <h2>Top 10</h2><div class="board" id="board"></div>
  <h2 id="cityHead">Cities</h2><div class="clist" id="cards"></div>
 </div>
</div>
<div class="row3">
 <div class="panel"><h2>Stage progression</h2><div class="fun" id="fun"></div></div>
 <div class="panel"><h2>Runs over time (72h)</h2><div class="spark" id="spark"></div></div>
 <div class="panel"><h2>Continues spent</h2><div class="big" id="cont"></div></div>
 <div class="panel"><h2>Other metrics</h2><div class="kv" id="kv"></div></div>
</div>
<div class="wrap"><table><thead><tr>
 <th>#</th><th>score</th><th>name</th><th>phone</th><th>email</th><th>plays</th><th>best run</th>
</tr></thead><tbody id="rows"></tbody></table></div>
<div class="rej" id="rej"></div>
<script>
// ⚠️ THE OUTLINE IS INTERPOLATED, NOT ESCAPED. It is coordinate data, not
// markup — see cloudflare/worldmap.js. Everything else in this script is built
// with string CONCATENATION rather than template literals, because this whole
// page is itself inside a template literal in the Worker and a stray backtick
// or dollar-brace would be evaluated on the server instead of in the browser.
// (Writing that sequence out literally here is what broke the first build of
// this file: the warning was itself interpolated.)
const WORLD = '${WORLD}';
const K = new URLSearchParams(location.search).get('k');
document.getElementById('csv').href = '/csv?k=' + encodeURIComponent(K);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let data = { rows: [], rejects: [], counts: {}, geo: [], totals: {} };
let picked = null;                      // the selected city key, shared by map and cards

// ── WEB MERCATOR ─────────────────────────────────────────────────────────
// Not equirectangular: on a flat lon/lat grid the northern hemisphere reads
// squashed and a city zoom comes out visibly skewed. Both axes land in 0..360,
// so the viewBox arithmetic below is in the same units as the outline.
const MX = (lon) => lon + 180;
const MY = (lat) => 180 - (180 / Math.PI)
  * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));

const SVG = 'http://www.w3.org/2000/svg';
const map = document.getElementById('map');
// ⚠️ PRESETS ARE PROJECTED, NEVER HAND-WRITTEN. The first version of this
// guessed the boxes in projected units and put the Atlanta preset at y 96-103
// when Atlanta actually lands at y 144.1 — the button flew the map to empty
// ocean north of the city and the dots were off-screen. Give the bounds in
// degrees, which are checkable against a map, and let MX/MY do the arithmetic.
const BOUNDS = {                    // [west, east, north, south] in degrees
  world: [-180, 180, 78, -58],
  us: [-170, -52, 72, 14],
  atl: [-84.9, -83.9, 34.15, 33.35],
};
const boxOf = (b) => [MX(b[0]), MY(b[2]), MX(b[1]) - MX(b[0]), MY(b[3]) - MY(b[2])];
const VIEWS = { world: boxOf(BOUNDS.world), us: boxOf(BOUNDS.us), atl: boxOf(BOUNDS.atl) };
let view = VIEWS.world.slice();
map.setAttribute('viewBox', view.join(' '));

function el(tag, attrs) {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// The land, drawn once. 247 rings, so this is not worth redoing every poll.
let landDrawn = false;
function drawLand() {
  if (landDrawn) return;
  landDrawn = true;
  const g = el('g', { class: 'land' });
  for (const ring of WORLD.split('|')) {
    let d = '';
    const pts = ring.split(' ');
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i].split(',');
      d += (i ? 'L' : 'M') + MX(+c[0]).toFixed(2) + ' ' + MY(+c[1]).toFixed(2);
    }
    g.appendChild(el('path', { d: d + 'Z' }));
  }
  map.appendChild(g);
}

// ── FLY, DO NOT JUMP ─────────────────────────────────────────────────────
// There are no tiles to swap, so "zoom" is the viewBox animating. Ease-out
// over ~450ms: long enough to see WHERE it went, which is the whole point of
// a zoom — a cut leaves you wondering what you are looking at.
let flying = 0;
function flyTo(box) {
  const from = view.slice(), to = box.slice(), t0 = performance.now();
  cancelAnimationFrame(flying);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 450);
    const e = 1 - Math.pow(1 - k, 3);
    view = from.map((v, i) => v + (to[i] - v) * e);
    map.setAttribute('viewBox', view.map((v) => v.toFixed(3)).join(' '));
    if (k < 1) flying = requestAnimationFrame(step);
    else drawDots();                    // label visibility depends on zoom
  };
  flying = requestAnimationFrame(step);
}
const keyOf = (c) => [c.country, c.region, c.city].join('|');

// ── CITIES THAT OVERLAP GET CLUSTERED, NOT STACKED ───────────────────────
//
// His real data is going to be Atlanta, Marietta and Decatur — three dots
// inside a few projected units of each other. Drawn individually at world
// zoom they land on top of one another, and the SMALLEST one wins the click
// because it is painted last: Atlanta, the whole point of the map, became
// unclickable behind Decatur. Caught by a click timing out in the harness.
//
// So dots are grouped by how far apart they are ON SCREEN. Zoom in and the
// merge radius shrinks in world units, so a cluster splits into its cities
// on its own — which is exactly the "zooms in to city level" behaviour, and
// it now falls out of the geometry instead of being faked.
function cluster(cities, mergeUnits) {
  const out = [];
  for (const c of cities) {
    const x = MX(c.lon), y = MY(c.lat);
    let host = null;
    for (const g of out) {
      if (Math.hypot(g.x - x, g.y - y) <= mergeUnits) { host = g; break; }
    }
    if (host) {
      host.members.push(c);
      host.players += c.players || 0;
      host.runs += c.runs || 0;
      host.best = Math.max(host.best, c.best || 0);
      // The cluster sits on its biggest member, not on the centroid — a
      // centroid drifts into the countryside between two cities.
      if ((c.players || 0) > (host.lead.players || 0)) { host.lead = c; host.x = x; host.y = y; }
    } else {
      out.push({ x: x, y: y, lead: c, members: [c],
        players: c.players || 0, runs: c.runs || 0, best: c.best || 0 });
    }
  }
  return out;
}

function drawDots() {
  drawLand();
  const old = map.querySelector('g.dots');
  if (old) old.remove();
  const g = el('g', { class: 'dots' });
  const cities = (data.geo || []).filter((c) => c.lat != null && c.lon != null)
    .slice().sort((a, b) => (b.players || 0) - (a.players || 0));
  const most = Math.max(1, ...cities.map((c) => c.players || 1));
  const zoom = VIEWS.world[2] / Math.max(0.0001, view[2]);
  // ⚠️ SIZES ARE IN SCREEN PIXELS, CONVERTED — not in world units divided by
  // some function of zoom. The first version divided the radius by sqrt(zoom),
  // which does NOT hold a dot at a constant on-screen size: at the Atlanta
  // preset the view is 1 unit wide, so a 0.18-unit dot rendered 165px across
  // and the map became three overlapping blobs. One unit is (view width / the
  // element's pixel width), so everything below is stated in px and multiplied
  // by that.
  const perPx = view[2] / Math.max(1, map.clientWidth || 900);
  // ~14 screen px of separation before two cities are treated as one place.
  const groups = cluster(cities, 14 * perPx);
  for (const grp of groups) {
    // Scaled by AREA, not radius. Sizing by radius makes one busy city a blob
    // that swallows its neighbours — and Atlanta is going to be that city.
    // 3px for a single player up to 12px for the busiest city, by AREA:
    // sizing by radius makes one busy city a blob that swallows its
    // neighbours, and Atlanta is going to be that city.
    const r = (3 + 9 * Math.sqrt(grp.players / most)) * perPx;
    const on = grp.members.some((m) => picked === keyOf(m));
    if (on) g.appendChild(el('circle', { cx: grp.x, cy: grp.y, r: r * 2.4, class: 'halo' }));
    const dot = el('circle', { cx: grp.x, cy: grp.y, r: r,
      class: 'dot' + (on ? ' on' : ''), tabindex: '0', role: 'button' });
    const many = grp.members.length > 1;
    dot.setAttribute('aria-label', (grp.lead.city || 'unknown')
      + (many ? ' and ' + (grp.members.length - 1) + ' nearby' : '')
      + ', ' + grp.players + ' players');
    dot.onclick = () => pick(grp.lead, true);
    g.appendChild(dot);
    // Labels only once zoomed in, or the Atlanta cluster is a smear.
    if (zoom > 2.2) {
      const lbl = el('text', { x: grp.x + r + 3 * perPx, y: grp.y + 4 * perPx, class: 'lbl',
        'font-size': (11 * perPx).toFixed(4), 'stroke-width': (2.5 * perPx).toFixed(4) });
      lbl.textContent = (grp.lead.city || '') + (many ? ' +' + (grp.members.length - 1) : '');
      g.appendChild(lbl);
    }
  }
  map.appendChild(g);
}

function pick(c, fly) {
  picked = c ? keyOf(c) : null;
  if (c && fly) {
    const w = VIEWS.atl[2], h = w * (VIEWS.world[3] / VIEWS.world[2]);
    flyTo([MX(c.lon) - w / 2, MY(c.lat) - h / 2, w, h]);
  }
  drawDots(); drawCards();
  const hint = document.getElementById('mHint');
  hint.textContent = c
    ? (c.city || 'unknown') + ', ' + (c.region || c.country || '') + ' — '
      + (c.players || 0) + ' player' + ((c.players || 0) === 1 ? '' : 's') + ' · '
      + (c.runs || 0) + ' runs · best ' + (c.best || 0).toLocaleString()
    : 'tap a city';
}

function drawStrip() {
  const t = data.totals || {}, c = data.counts || {};
  const tiles = [
    ['entrants', c.entrants || 0], ['runs', t.runs || 0],
    ['high score', (t.best || 0).toLocaleString()], ['bags', t.bags || 0],
    ['stomped', t.kills || 0], ['deaths', t.deaths || 0],
  ];
  const f = data.funnel || {};
  document.getElementById('strip').innerHTML = tiles.map((x, i) =>
    '<div class="stat"><b>' + x[1] + '</b><span>' + x[0] + '</span>'
    + (i === 5 ? '<div class="split">'
        + '<i>enemy<b>' + (f.d_enemy || 0) + '</b></i>'
        + '<i>pothole<b>' + (f.d_pothole || 0) + '</b></i>'
        + '<i>fall<b>' + (f.d_fall || 0) + '</b></i></div>' : '')
    + '</div>').join('');
}

function drawBoard() {
  const top = (data.rows || []).slice(0, 10);
  document.getElementById('board').innerHTML = top.length
    ? top.map((r, i) => '<div class="row' + (i === 0 ? ' gold' : '') + '">'
        + '<span class="n">' + (i + 1) + '</span><span>' + esc(r.name) + '</span>'
        + '<span class="sc">' + r.score.toLocaleString() + '</span></div>').join('')
    : '<p class="note">No scores yet. The board fills as soon as the first run is submitted.</p>';
}

function drawCards() {
  const cities = data.geo || [];
  document.getElementById('cityHead').textContent = 'Cities by players (' + cities.length + ')';
  if (!cities.length) {
    document.getElementById('cards').innerHTML =
      '<p class="note">No cities yet — this fills in the moment somebody plays. '
      + 'Nothing is broken.</p>';
    return;
  }
  document.getElementById('cards').innerHTML = cities.map((c) =>
    '<div class="c' + (picked === keyOf(c) ? ' on' : '') + '" data-k="' + esc(keyOf(c)) + '">'
    + '<div><div class="nm">' + esc(c.city || 'unknown') + ', ' + esc(c.region || c.country || '')
    + '</div><div class="sub">' + (c.players || 0) + ' player'
    + ((c.players || 0) === 1 ? '' : 's') + ' · ' + (c.runs || 0) + ' runs</div></div>'
    + '<div class="sc">' + (c.best || 0).toLocaleString() + '</div></div>').join('');
  for (const node of document.querySelectorAll('#cards .c')) {
    node.onclick = () => pick(cities.find((c) => keyOf(c) === node.dataset.k), true);
  }
}

// ── HOW FAR PEOPLE ACTUALLY GET ──────────────────────────────────────────
// The single most useful shape on the page: he asks about difficulty
// constantly, and four bars answer it better than watching anyone play.
function drawFunnel() {
  const f = data.funnel || {};
  const base = Math.max(1, f.s1 || 0);
  const rows = [['EAV', f.s1], ['EDGEWOOD', f.s2], ['UNDERGROUND', f.s3], ['L5P', f.s4]];
  document.getElementById('fun').innerHTML = (f.runs || 0)
    ? rows.map((r) => {
        const n = r[1] || 0, pct = Math.round(100 * n / base);
        return '<div class="f"><span class="nm">' + r[0] + '</span>'
          + '<span class="bar"><i style="width:' + pct + '%"></i></span>'
          + '<span class="v">' + n.toLocaleString() + ' (' + pct + '%)</span></div>';
      }).join('')
    : '<p class="note">No runs yet.</p>';
}

// Runs per hour for 72 hours. Drawn as a path rather than 72 rects so it stays
// one node and scales with the panel.
function drawSpark() {
  const buckets = new Array(72).fill(0);
  for (const s of (data.spark || [])) {
    if (s.hour >= 0 && s.hour < 72) buckets[s.hour] = s.n;
  }
  const peak = Math.max(1, ...buckets);
  const W = 300, H = 96, pad = 6;
  let d = '';
  buckets.forEach((n, i) => {
    const x = pad + (W - pad * 2) * (i / 71);
    const y = H - pad - (H - pad * 2) * (n / peak);
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  });
  const any = buckets.some((n) => n > 0);
  document.getElementById('spark').innerHTML = any
    ? '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
      + '<path d="' + d + 'L' + (W - pad) + ' ' + (H - pad) + 'L' + pad + ' ' + (H - pad) + 'Z" '
      + 'fill="rgba(255,214,110,0.13)"/>'
      + '<path d="' + d + '" fill="none" stroke="#ffd66e" stroke-width="1.6" '
      + 'vector-effect="non-scaling-stroke"/></svg>'
      + '<div class="sub" style="display:flex;justify-content:space-between;font-size:10px">'
      + '<span>-72h</span><span>-48h</span><span>-24h</span><span>now</span></div>'
    : '<p class="note">No runs in the last 72 hours.</p>';
}

function drawSide() {
  const f = data.funnel || {}, t2 = data.totals || {};
  const runs = f.runs || 0;
  const pct = runs ? (100 * (t2.continues || 0) / runs).toFixed(1) : '0.0';
  document.getElementById('cont').innerHTML =
    '<b>' + (t2.continues || 0).toLocaleString() + '</b><span>total</span>'
    + '<div style="margin-top:9px"><b style="font-size:19px">' + pct + '%</b>'
    + '<span>runs that used a continue</span></div>';
  const ms = f.avg_ms || 0, mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
  document.getElementById('kv').innerHTML = [
    ['avg run length', runs ? mm + ':' + String(ss).padStart(2, '0') : '—'],
    ['champagne bottles', (f.bottles || 0).toLocaleString()],
    ['bags lost', (f.bags_lost || 0).toLocaleString()],
    ['best stage reached', runs ? (f.s4 ? 'L5P' : f.s3 ? 'Underground' : f.s2 ? 'Edgewood' : 'EAV') : '—'],
  ].map((r) => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
}

// ── ATLANTA TIME, BECAUSE THAT IS THE CLOCK THE GAME RUNS ON ─────────────
// Same rule as the game itself: Intl is asked for the hour in America/
// New_York rather than an offset being subtracted, so daylight saving is the
// platform's problem. See timeOfDay() in src/world/stages.js.
function drawClock() {
  try {
    document.getElementById('cET').textContent = new Date().toLocaleTimeString('en-US',
      { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  } catch (e) { document.getElementById('cET').textContent = '—'; }
  const c = data.contest || {};
  const label = document.getElementById('cLabel'), left = document.getElementById('cLeft');
  const stat = document.getElementById('cStat');
  if (!c.start || !c.end) {
    label.textContent = 'Contest window';
    left.textContent = 'not set';
    stat.textContent = 'OPEN';
    stat.style.color = '#ffd66e';
    stat.title = 'CONTEST_START and CONTEST_END are 0, so the Worker accepts every run.';
    return;
  }
  const now = Date.now();
  const ended = now > c.end, started = now >= c.start;
  const ms = Math.max(0, (started ? c.end : c.start) - now);
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  label.textContent = ended ? 'Contest' : started ? 'Contest ends in' : 'Contest opens in';
  left.textContent = ended ? 'closed'
    : d + 'D ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
      + ':' + String(s).padStart(2, '0');
  stat.textContent = ended ? 'CLOSED' : started ? 'LIVE' : 'SCHEDULED';
  stat.style.color = ended ? '#8c86a0' : started ? '#57e08a' : '#ffd66e';
}
setInterval(drawClock, 1000);

document.getElementById('mWorld').onclick = () => { picked = null; flyTo(VIEWS.world); drawCards(); };
document.getElementById('mUS').onclick = () => flyTo(VIEWS.us);
document.getElementById('mATL').onclick = () => flyTo(VIEWS.atl);
function draw(){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const lim = +document.getElementById('lim').value;
  let rows = data.rows.map((r,i)=>({...r, rank:i+1}));
  if (q) rows = rows.filter(r => (r.name||'').toLowerCase().includes(q) || (r.phone||'').includes(q));
  if (lim) rows = rows.slice(0, lim);
  document.getElementById('rows').innerHTML = rows.map(r =>
    '<tr class="' + (r.rank===1?'top1':'') + '"><td class="r">'+r.rank+'</td>'+
    '<td class="s">'+r.score.toLocaleString()+'</td><td>'+esc(r.name)+'</td>'+
    '<td>'+esc(r.phone)+'</td><td>'+esc(r.email)+'</td><td>'+r.plays+'</td>'+
    '<td>'+new Date(r.updated).toLocaleString()+'</td></tr>').join('');
  document.getElementById('sum').textContent =
    (data.counts.entrants||0)+' entrants · '+(data.counts.plays||0)+' runs submitted';
  drawStrip(); drawBoard(); drawCards(); drawDots();
  drawFunnel(); drawSpark(); drawSide(); drawClock();
  document.getElementById('rej').innerHTML = data.rejects.length
    ? '<b>recent rejections</b><br>' + data.rejects.map(r =>
        new Date(r.t).toLocaleTimeString()+' — '+esc(r.reason)+' '+esc(r.detail||'')).join('<br>')
    : '';
}
async function pull(){
  try{
    const res = await fetch('/data?k='+encodeURIComponent(K));
    data = await res.json(); draw();
    document.getElementById('tick').textContent = 'updated ' + new Date().toLocaleTimeString();
  }catch(e){ document.getElementById('tick').textContent = 'offline'; }
}
document.getElementById('q').oninput = draw;
document.getElementById('lim').onchange = draw;
pull(); setInterval(pull, 5000);
</script></body></html>`;
    return new Response(html, { headers: HEADERS });
  },
};
