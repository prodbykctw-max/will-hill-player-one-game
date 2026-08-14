// DOES EVERY PANEL VIEW HAVE A WAY BACK, AND DOES IT GO SOMEWHERE SENSIBLE?
//
// Client: "when I pulled a leaderboard up, I have no way to get back to the
// main screen cause it just takes me back to the settings... how can I get
// out of options? How can I get out of the leaderboard? Do you look at that
// flow in that logic and make sure it is standard?"
//
// The board (leaderboard) is the panel's HOME view — OPTIONS opens straight
// to it — and until now it was the only view with no bottom, thumb-reachable
// way out: settings has BACK, the form has NOT NOW, the board had nothing
// but the small ✕ in the corner. This proves the fix (btnBoardClose) closes
// the panel exactly like ✕ does, and that the existing BACK/NOT NOW paths
// still land where they always did — one level at a time, never stuck.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/panelnav.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(2600);

const openPanel = async () => {
  const { x, y } = await p.evaluate(() => {
    const r = window.__title.optionsRect(window.__game.titleBox);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
  // NOT touchscreen.tap — a touch event's delayed synthetic click landed on
  // whatever DOM button the panel put at that same point once it was open
  // (ENTER THE CONTEST, here), which looked exactly like a stuck-on-form
  // navigation bug and was purely a Playwright touch-emulation artifact.
  // mouse.click() is one real click, no second synthesized one to collide.
  await p.mouse.click(x, y);
  await p.waitForTimeout(400);
};

const shown = () => p.evaluate(() => ({
  open: !document.getElementById('panel').hidden,
  view: ['pvBoard', 'pvForm', 'pvSettings'].find((id) => !document.getElementById(id).hidden),
  screen: window.__game.screen,
}));

// ── OPTIONS opens straight to the board ──────────────────────────────────
await openPanel();
let s = await shown();
check('OPTIONS opens the panel on the board', s.open && s.view === 'pvBoard', JSON.stringify(s));

// ── board -> settings -> BACK -> board (one level at a time) ────────────
await p.click('#btnSettings');
await p.waitForTimeout(200);
s = await shown();
check('SETTINGS steps to the settings view', s.view === 'pvSettings', JSON.stringify(s));

await p.click('#btnBack');
await p.waitForTimeout(200);
s = await shown();
check('BACK from settings lands on the board, not closed', s.open && s.view === 'pvBoard', JSON.stringify(s));

// ── board -> form -> NOT NOW -> board ────────────────────────────────────
await p.click('#btnRegister');
await p.waitForTimeout(200);
s = await shown();
check('ENTER THE CONTEST steps to the form', s.view === 'pvForm', JSON.stringify(s));

await p.click('#btnSkip');
await p.waitForTimeout(200);
s = await shown();
check('NOT NOW from the form lands on the board, not closed', s.open && s.view === 'pvBoard', JSON.stringify(s));

// ── THE FIX: the board's own way out, same destination as ✕ ─────────────
const hasExit = await p.evaluate(() => !!document.getElementById('btnBoardClose'));
check('the board has its own exit button', hasExit);

await p.click('#btnBoardClose');
await p.waitForTimeout(300);
s = await shown();
check('BACK TO GAME closes the panel and returns to the title', !s.open && s.screen === 'title', JSON.stringify(s));

// ── ✕ still works from every depth, including two levels deep ──────────
await openPanel();
await p.click('#btnSettings');
await p.waitForTimeout(200);
await p.click('#panelClose');
await p.waitForTimeout(300);
s = await shown();
check('✕ still closes the panel from settings, two levels deep', !s.open && s.screen === 'title', JSON.stringify(s));

// A closed panel must not have swallowed the run — a plain tap starts one.
await p.touchscreen.tap(215, 300);
await p.waitForTimeout(1600);
check('the game is still playable after all that', await p.evaluate(() => window.__game.screen) === 'playing');

console.log('');
console.log(checks.every(([, pass]) => pass)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, pass]) => !pass).map(([w]) => w).join(', ')}`);
await b.close();
