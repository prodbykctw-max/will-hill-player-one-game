// WHEN THE DASHBOARD CLOSES THE CONTEST, THE GAME STOPS OFFERING IT.
//
// Client: "make it to where the contest doesn't pop up in the app anymore
// cause it's closed if it's closed." Before this, the dashboard switch only
// gated the Worker's /submit — the game kept showing ENTER THE CONTEST and
// the sign-up form, and the Worker then refused every run without a word.
//
// The game now asks GET /status (net/leaderboard.js refreshContestStatus).
// The network is stubbed at `fetch`, so this grades what the game DOES with
// each answer rather than needing the Worker. Both directions are graded:
// closed hides every offer, and open — or no answer at all — changes nothing.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/contestclosed.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const BASE = process.env.BASE || 'http://localhost:5199';
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// `status` is what GET /status answers: true, false, or null for a Worker
// that predates the route (404). `stored` seeds what this device last heard.
async function fresh({ status, stored = null, registered = false }) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.addInitScript(([st, sd, reg]) => {
    window.__posts = [];
    window.__statusAsked = 0;
    try {
      localStorage.setItem('wh_intro_v7', '1');
      if (sd !== null) localStorage.setItem('wh_contest_open', sd);
      if (reg) localStorage.setItem('wh_contest_reg',
        JSON.stringify({ phone: '4045550199', email: 'closed@example.com' }));
    } catch (_e) {}
    const orig = window.fetch;
    const json = (o, s = 200) => Promise.resolve(new Response(JSON.stringify(o),
      { status: s, headers: { 'Content-Type': 'application/json' } }));
    window.fetch = (u, o) => {
      const url = String(u);
      if (url.includes('/status')) {
        window.__statusAsked++;
        return st === null ? json({ ok: false, err: 'not found' }, 404) : json({ ok: true, open: st });
      }
      if (url.includes('/top')) {
        return json({ ok: true, runs: [{ name: 'Chando', score: 80850 }, { name: 'Lani', score: 78750 }] });
      }
      if (url.includes('/submit')) {
        try { window.__posts.push(JSON.parse(o.body)); } catch (_e) { window.__posts.push(null); }
        return st === false ? json({ ok: false, err: 'contest closed' }, 403)
          : json({ ok: true, rank: 1, score: 1, best: 1, total: 1 });
      }
      return orig(u, o);
    };
  }, [status, stored, registered]);
  await p.goto(BASE + '/?tod=night&lb=http://stub.invalid', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.waitForFunction(() => window.__statusAsked > 0, null, { timeout: 5000 }).catch(() => {});
  // Past the title assembly, where a tap means "skip the animation".
  await p.waitForTimeout(3000);
  return p;
}

const view = (p) => p.evaluate(() => {
  if (!document.getElementById('entryLayer').hidden) return 'form';
  if (document.getElementById('panel').hidden) return 'none';
  for (const id of ['pvMenu', 'pvHow', 'pvBoard', 'pvSettings']) {
    if (!document.getElementById(id).hidden) return id.slice(2).toLowerCase();
  }
  return 'none';
});
const tapRect = async (p, which) => {
  const pt = await p.evaluate((w) => {
    const r = window.__title[w](window.__game.titleBox);
    const cv = document.querySelector('canvas');
    const s = cv.getBoundingClientRect().width / cv.width;
    return { x: (r.x + r.w / 2) * s, y: (r.y + r.h / 2) * s };
  }, which);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(700);
};
const stored = (p) => p.evaluate(() => localStorage.getItem('wh_contest_open'));
const board = (p) => p.evaluate(() => ({
  note: document.getElementById('boardNote').textContent,
  register: !document.getElementById('btnRegister').hidden,
}));
// Die with no continues left, then read the knocked-down card's buttons.
const gameOverLabels = (p) => p.evaluate(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const g = window.__game;
  window.__startStage(0);
  for (let k = 0; k < 6; k++) await frame();
  g.runLog.start();
  for (let i = 0; i < 8; i++) g.runLog.record('bag');
  g.continues = 0;
  g.hearts = 0;
  g.player.y = 40000;
  for (let k = 0; k < 120 && g.screen !== 'gameOver'; k++) await frame();
  for (let k = 0; k < 10; k++) await frame();
  return window.__screenButtons.map((x) => x.label);
});

// ── 1. CLOSED: every contest offer is gone ────────────────────────────────
{
  const p = await fresh({ status: false });
  check('closed: the game asked /status and remembered the answer', (await stored(p)) === '0',
    String(await stored(p)));
  const label = await p.evaluate(() => window.__title.bannerLabel(window.__game.titleBox, 'closed'));
  check('closed: the title banner no longer says ENTER THE CONTEST',
    !/ENTER/.test(label) && /BOARD/.test(label), label);
  await tapRect(p, 'bannerRect');
  const v = await view(p);
  check('closed: the banner opens the board, not the sign-up form', v === 'board', v);
  const bd = await board(p);
  check('closed: the board says it is the final standings', /final standings/i.test(bd.note), bd.note);
  check('closed: the board has no ENTER THE CONTEST button', bd.register === false);
  await p.context().close();
}
{
  const p = await fresh({ status: false });
  await tapRect(p, 'promptRect');
  await p.waitForTimeout(600);
  const v = await view(p);
  const screen = await p.evaluate(() => window.__game.screen);
  check('closed: PRESS START goes straight into a run, no form',
    v !== 'form' && (screen === 'playing' || screen === 'loading'), `view=${v} screen=${screen}`);
  await p.context().close();
}
{
  const p = await fresh({ status: false });
  const labels = await gameOverLabels(p);
  check('closed: the knocked-down card offers LEADERBOARD, not ENTER THE CONTEST',
    labels.includes('LEADERBOARD') && !labels.includes('ENTER THE CONTEST'), JSON.stringify(labels));
  await p.context().close();
}

// ── 2. OPEN: nothing changes ──────────────────────────────────────────────
{
  const p = await fresh({ status: true });
  check('open: remembered as open', (await stored(p)) === '1', String(await stored(p)));
  await tapRect(p, 'bannerRect');
  const v = await view(p);
  check('open: the banner still opens the sign-up form', v === 'form', v);
  await p.context().close();
}
{
  const p = await fresh({ status: true });
  await tapRect(p, 'promptRect');
  const v = await view(p);
  check('open: PRESS START still offers the form to someone not entered', v === 'form', v);
  await p.evaluate(() => window.__panel.open('board'));
  await p.waitForTimeout(600);
  const bd = await board(p);
  check('open: the board still has ENTER THE CONTEST', bd.register === true);
  await p.context().close();
}
{
  const p = await fresh({ status: true });
  const labels = await gameOverLabels(p);
  check('open: the knocked-down card still says ENTER THE CONTEST',
    labels.includes('ENTER THE CONTEST'), JSON.stringify(labels));
  await p.context().close();
}

// ── 3. NO ANSWER: fails open, and remembers ───────────────────────────────
{
  const p = await fresh({ status: null });
  await tapRect(p, 'bannerRect');
  const v = await view(p);
  check('no /status (older Worker): a fresh device treats the contest as open', v === 'form', v);
  await p.context().close();
}
{
  const p = await fresh({ status: null, stored: '0' });
  await tapRect(p, 'bannerRect');
  const v = await view(p);
  check('no answer: a device that saw it closed keeps it closed', v === 'board', v);
  await p.context().close();
}
{
  const p = await fresh({ status: true, stored: '0' });
  await tapRect(p, 'bannerRect');
  const v = await view(p);
  check('re-opened from the dashboard: the offer comes back', v === 'form' && (await stored(p)) === '1', v);
  await p.context().close();
}

// ── 4. ALREADY ENTERED, CONTEST CLOSED: straight to the board, no error ──
{
  const p = await fresh({ status: false, registered: true });
  await tapRect(p, 'bannerRect');
  const v = await view(p);
  const bd = await board(p);
  check('closed + entered: banner opens the board with the final-standings note',
    v === 'board' && /final standings/i.test(bd.note), `${v} / ${bd.note}`);
  await p.context().close();
}

console.log('');
console.log(checks.every(([, o]) => o) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, o]) => !o).map(([w]) => w).join(', '));
await b.close();
process.exit(checks.every(([, o]) => o) ? 0 : 1);
