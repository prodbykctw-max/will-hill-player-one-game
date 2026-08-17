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
 /* ── THE CLIENT'S MARTA CAB, AROUND THE LIVE PAGE ──────────────────
    His concept art (assets/ui-concept/dashboard-empty.png), cut at the EDGES
    only by tools/cut_dash_cab.py.

    ⚠️ NOTHING IS BLANKED OUT OF HIS PLATE. A first attempt painted over the
    screen area to make one frame image, and it swallowed the DOOR / BELL /
    LIGHTS / MAP / PA / WIPER / HVAC row, the joystick and the gauge — the cab
    furniture that makes it a cab. He caught it immediately. So the frame is
    four crops from the UNTOUCHED painting: the top bezel, 48px of each side
    rail repeated down the page, and the whole bottom console.

    The page inside is live data — a growing entrant table and 7-digit scores —
    which is why the panels render in CSS rather than being painted into a
    fixed image the way OPTIONS and SETTINGS are in the game. */
 body{margin:0;background-color:#0a0810;color:var(--fg);font:15px/1.5 system-ui,sans-serif;
   background-image:
     url(data:image/webp;base64,UklGRlwDAABXRUJQVlA4IFADAABwEQCdASpcADAAPjEWiEKiISEYCq1UIAMEtIBjTqh+d89SYSfZjT61+NWWk99SzUtNrpe+76mdZrcOl5I9/5qKsr6cKzYykMn7nCjFjpn5lxJdZ5lAMN3geO+Hx4iVnSE3e3Vp45cpCIKGs9g//oNEyjX87mHyfgMPtXg5Xzp3XXLoziGeOpmS/4a358gR/FY6E7egAP7/8UL/sv/9XIy/N4wP8Wk+oImIBfj5etBaydFv8LXII4kTOD63EwxZYxLd5fJeTjYU9TvioUsNGiNDMGPkQZ4NYGTse9yYoOtI0rST0tnHkhAcLLrEQ/HuAcw11HjH1H9fGq01SHD+5uX3Lm+KrFXVM0CAutmxYJDSFC95hEuNKXA9V4sZu0StbdnnRz5xWCp1GoPOC6zo2FKAERL/M6BXk/uBBz/m4//tCIXFO1evayi5Fjfe6nFzYb/ub4TBvu0VtcY3VJbQsvIvff8PgnfXYK57eXH4Ze4ANXEsXzB/G5/QWmTbbrVhlkqi/ztIL7XedI7qVN0eo0ZeSTaxwjz68sDKNtMIzIrzjBWTS2vGH2fcgrGVqNdgxrrUQ4swCpqoSM1HLmiCrSjbj2Mxfnd8S3MPSFqx2KkOxcOejrQkAT9qfX701BNyjoV9amw3rSPUUg//JVtWI+iT/QysK+64vsxq404jsxhdYPbaGUsY+9aJcAC+/Ujf/NXRF8c18GFS/EGIlqcuDW+vHyeUAenklf79k9bDCmmSHzpWzW39Tyxc/C0Kl4h9KaQ7yicMWH6BCqi8sQVTm1ny0yoRiLl1HGkCu3GImO5gB1Qe27AG/U/TEPJbYOWLc7+uRLOoX3aqEnRCPnpBS5g4k/ZHAdoKjwKcAfIWXpiI4ldggtVO/cEzmTPfNuBaduHzok9AdeicfhPd4wIrXBoXEcxkjvMQP1QqAwnlIylTZy66ItB7bIzuYPl5dAawBgM93Cv+5BwsjdzHtlOO8LmvJjSkDRUc2bUCdrnK2Y4zdRmeISlMS0NlAmfncLz7SOG09WRfRxZHU9Sliv8a2+mPrad95Va4kLTFfeUibDk7SqnIuAcBNBKnsoWYCKQfQgZNOkQTmw0wK6oOn5kgCRK32f841Z3dW0OBIb1y3gAAAA==),
     url(data:image/webp;base64,UklGRkQEAABXRUJQVlA4IDgEAABQFACdASpdADAAPjESiEMiISEXGwYAIAMEs4BfPgd3BoO0959v/2jwbraXEsaE9HxYemmnmxq/8T1XdIqoWem27VYC8Wn4k6lSEqTKaVU/TWs1gUhiKhGrgyThELY1vMeXnSo4/pUngIWl/7WYqBYPxsDXk8MXf2584WJT+zLGPlIinejyU4i3BdUU4gAzg7U12aPLdfkYtW3JxjFBQRFcM0saomkpYbl2RAAA/v+B/yvj/zcfqVVICihhZ+yLcJI/tu9gza1UZS6L4uRdSxe20SljhfivzjJfERGGmohi7OfGvhdRj9cLY35zuMZ7ybnsfld0rnnRQDGxGdwJZVTSy+QUjpHpPmPr9711MoHmM6ggmxq+Lxup/lyTfHI/3+XeO/wa/WNyhEtzsDBuSivFw3Mroqwoc0saTxYV2MSQa7J9/RtopoKslLe6vUk/JHeXG7nBGqlhwj2WCGxirC7rTLBCHB+9+WVJjK+vKoR33Pbp+GoO2pl0cuBfaILHO55tnjTyGY7gyalK/a1FLQIYf4q6NR6zYTf09n9zezONmXIhBekIilIF5RgPkhRQ5uVQSCJglkW9St9YYs8X0qRwYAZJBj3Yhzb3B6QNFCs/woUll78wb6Gv2G8+SO3DAaSnqB9hc60+jDY6lW4G+l1J0YhmGHoNxdCbpev9vUZsnB328LdNfrzoQL4/5+1pihIHSS70fHg0c43SfGtigr40Y+tBZbuWb7wye9iY9tqLTS81JV9DOyLGq7dhxfrfdaXxP9xtDQ8eN3PlwMjIIc/zvfSpRR+7tf1z2g286ExdlVtNg+09IGzs8//lxEpsFCfzlJGiUNOMcM2NytjAPHAxztN22RHU8/N/9dwsPlC236clz683s5JCUi9swdf+oXKo65hyz8cNBPhGfWG3AU1tjsXIwswXe2ndCkQOKz5iIzWdN4MtjrocwB4xBZYprZgKcUI6Z3NeG2ACrkNNW/5Rsp+tTG7QyqzBJf1FuAoI7nhFAOZ1ZhNzPsfKhn3K8n+tx+N55le6L9zHMjcPUtWFds+ZJC6Q67/clLFWHnY/tEUYtmYWjzP7sY/XJy0QMXuc19WeUKe1Zuh83aT8y6bchCJ5ZBE0rYxdO5Ou8w2Xnxs5nVSFEwp36C/N9VLZ6PfQBEeYwPw+lg1dcpHU4pivLoXPEujVl5jxhj0TkjjpFQ/lRcEBJr04ZUSAwH3Du6B/xmHIfu8CCDxtoLI66Cd+2TnpRfLaxdA4iJ/Q7OMhLLDxCeBpEirz8gj+FhL66c1rC9FRms0KEsrzr1l7PAC3J5ir1SXe1ZsNYp8PqgWHJtAwZeGYUjrNTFYpOXpFDuKK/WQK4O8/qekOCoAs+9OtgyOJUaDKKKcuq/vjAOj6+l9PrsriELF7k6FyoLRpzuJfjlobwrtC2A4+lgZGgKjMIoNp6AIAAAA=),
     url(data:image/webp;base64,UklGRigEAABXRUJQVlA4IBwEAABwIwCdASpVAx4APjEYikQiIYhlmjwQAYJaW1+872rktj9Q5ulqkN+dCEomhv8hf9JTtsf+3KgMSPFub+nkHzCctuto5NFshNtOAeB9qlWQzLpFwe8aSl2/3JWnYAT8o+WnlwkYdq2jUI5XJgE3XcCCMBXhR4F3KKPrH4kfcfBDEmaUM4mF8Bhse2ky5fbZL9fvuv7r8ZlfmatHYaAaBt00EhkZZDVnTXEJgIyoTEUl3kjy1SBfUMAVzBAwOnUH/eX0eLmQMo/LZUQmdYr1uIh2YSSHX9l9JKwEmg/XOY/5nnyitgt1ZnmT1Xvpar0pVz9yx/lpytk5oopBS18X5N3H9n1YQbgtOKze3NzRF4xYmA4KvB63iRYQB6AT6h018zqaxIEAAP7/2I1Xjw3+YVsFml1KkPqq0pNF8cHlzMxDRDy5y1+wXV5XkPLz/Ffv5s3O9WQAdIJI9+FBtZtHmtVzBGsNCnzt/TCVis4j9tBZH8vw6rbAGsfivg0Sz4k3GG7/w9q8p2KaLPizXRTKEyGuHYEeSpHg/U8aaG3uOMm6vFfT2P142AH7PSJNjzMEKs+vZsIFDJ496DhBaJBqCfn5D9QapBe/pXbRTSJGcIPF09R1tqyrCeadH2FTnTZwUV7KAA0Yev1CrOsQkTOAOC5YieaHJgrW1i1LHP17xplSZxXJBaXS9Rep6D6ynZoHTA5AmaGedS3SLbrUCLwimWIAVpR66ysddKgEVMO32/sgcH3RN7OZLfZHTodsmRFDtSaohVPqHH2If+L519aeqNA/2hYO/5pUoYPmH4iGICgh/y+jHXphdgjs823OTksPPpR24aLOJfath98MnEmp0PGZ4VrdV3CspUY/B44zANVW+R7j8EW/wInPIgT896SoK/lvfxtdJC09RaqyE3JFW6cHX1nx483EXSuF8gOADEMUz++A6osPx5U5M6Ii1rz2Ksg+WKe4lPJidV3IqOtpTbJRP/oA8Xr9sGL6WAVwgIMksLMRsqYgYXh3ByHvVfYumgWq7oqobrZCcTxteDd76gPtQcsnA0LslkEhRBCU92fpy2oBP4hpIFnLcTPoiTZZio2TTG19XDxoWF2nDsRzceU7GOntj+cOZmc3YyNRHsojuCJRo7rbPgk7z1h9U6+G7vO3iK6CHHpbS7t8zZL2hV5w0/mCVbVqEs+XWO1rP5lwkH+7kovcnMnyD+xdme+ydfRj0zVE8VA5A7v1F3n1WAYm9ErppByvouqzRaueUyBLMsrkFiX5YE6DYlnl/82K8NKVhiE4H299PwJ6uD4GEq/NyUpSWsxK/RgccsNhUtx05fb/9+dot/kV+q24COvEImhEd6YdufWbx3h8Ff7//xM4587JCA+laO6ARPrcZrIUbaiZNoUMuubMZ8AAAA==),
     url(data:image/webp;base64,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);
   background-position:left top,right top,center top,center bottom;
   background-repeat:repeat-y,repeat-y,no-repeat,no-repeat;
   background-size:10.79% auto,10.90% auto,100% auto,100% auto;
   background-attachment:scroll,scroll,scroll,scroll;
   /* clear the rails and the console. The rails are 92 and 93px of 853. */
   /* ⚠️ The bottom pad is the CONSOLE'S OWN HEIGHT, 168 of 853 = 19.7% of
      the width, plus a little air. At 10.5% the rejection rows rendered
      underneath the joystick. */
   padding:calc(100vw * 0.012) 11.4% calc(100vw * 0.225);}
 /* not sticky any more — it would slide over his top bezel */
 header{padding:14px 0 12px;border-bottom:1px solid var(--line)}
 h1{margin:0 0 4px;font-size:18px;letter-spacing:.06em;color:var(--gold)}
 .sub{color:var(--dim);font-size:13px}
 .bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
 input,select,a.btn{background:#1a1626;color:var(--fg);border:1px solid var(--line);
   border-radius:8px;padding:8px 10px;font:inherit;text-decoration:none}
 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
 /* Eight columns including an email address do not fit between the cab's
    rails on a phone. The table scrolls inside its own panel rather than
    pushing the page sideways under the frame. */
 .wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
 .wrap table{min-width:640px}
 /* ── the map, the cards, the board ─────────────────────────────────── */
 .strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;padding:14px 0 0}
 .stat{background:#161226;border:1px solid var(--line);border-radius:10px;padding:9px 11px}
 .stat b{display:block;font:600 19px/1.25 ui-monospace,monospace;color:var(--gold);font-variant-numeric:tabular-nums}
 .stat span{color:var(--dim);font-size:11px;letter-spacing:.05em;text-transform:uppercase}
 .cols{display:grid;grid-template-columns:1.55fr 1fr;gap:14px;padding:14px 0;align-items:start}
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
 /* ⚠️ NO BACKTICKS IN HERE. This CSS lives inside the page's own template
    literal, so a backtick in a comment ends the string and the worker stops
    parsing — the same trap as a literal dollar-brace, which already bit
    this file once.
    THE ACTIVE PRESET HAS TO LOOK ACTIVE. The map already OPENED on the
    world box (VIEWS.world, set at load) but all three buttons
    rendered identically, so there was nothing on screen saying which one
    you were looking at. Client: "the map should start at world view with
    world selected." The geometry was right and the readout was missing. */
 .mapbar button.on{background:var(--gold);color:#1a1408;border-color:var(--gold);font-weight:700}
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
    markPreset(null);   // a city is its own view, not one of the three
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

// One place decides which preset reads as selected, so a city tap and a
// preset tap cannot disagree about it.
function markPreset(which){
  for (const [id, key] of [['mWorld','world'],['mUS','us'],['mATL','atl']]) {
    document.getElementById(id).classList.toggle('on', key === which);
  }
}
document.getElementById('mWorld').onclick = () => { picked = null; markPreset('world'); flyTo(VIEWS.world); drawCards(); };
document.getElementById('mUS').onclick = () => { markPreset('us'); flyTo(VIEWS.us); };
document.getElementById('mATL').onclick = () => { markPreset('atl'); flyTo(VIEWS.atl); };
markPreset('world');   // the view starts here; now it says so
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
  // ⚠️ "offline" WAS A DEAD END. This used to swallow every failure into one
  // word, and when the page came up empty there was nothing to act on: the
  // database was healthy, all eight queries returned rows, and the word said
  // only that something threw. A status code and the first line of the body
  // separate the three real cases — a 404 means the key in this URL is not the
  // deployed DASH_TOKEN, a 500 means the query broke, and a network error
  // means the fetch never landed.
  const tick = document.getElementById('tick');
  if (!K) { tick.textContent = 'no key in this URL — open the ?k=... link'; return; }
  let res;
  try {
    res = await fetch('/data?k=' + encodeURIComponent(K));
  } catch (e) {
    tick.textContent = 'network error: ' + e.message;
    return;
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 80);
    tick.textContent = res.status === 404
      ? 'HTTP 404 — the key in this URL does not match DASH_TOKEN'
      : 'HTTP ' + res.status + ' ' + body;
    return;
  }
  try {
    data = await res.json();
  } catch (e) {
    tick.textContent = 'bad JSON from /data: ' + e.message;
    return;
  }
  draw();
  tick.textContent = 'updated ' + new Date().toLocaleTimeString();
}
document.getElementById('q').oninput = draw;
document.getElementById('lim').onchange = draw;
pull(); setInterval(pull, 5000);
</script></body></html>`;
    return new Response(html, { headers: HEADERS });
  },
};
