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
      return new Response(JSON.stringify({
        ok: true, rows: results || [], rejects: rejects.results || [], counts,
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
</header>
<div class="wrap"><table><thead><tr>
 <th>#</th><th>score</th><th>name</th><th>phone</th><th>email</th><th>plays</th><th>best run</th>
</tr></thead><tbody id="rows"></tbody></table></div>
<div class="rej" id="rej"></div>
<script>
const K = new URLSearchParams(location.search).get('k');
document.getElementById('csv').href = '/csv?k=' + encodeURIComponent(K);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let data = { rows: [], rejects: [], counts: {} };
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
