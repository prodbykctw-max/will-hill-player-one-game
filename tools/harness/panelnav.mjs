// DOES EVERY PANEL VIEW HAVE A WAY BACK, AND DOES IT GO SOMEWHERE SENSIBLE?
//
// Client: "when I pulled a leaderboard up, I have no way to get back to the
// main screen cause it just takes me back to the settings... how can I get
// out of options? How can I get out of the leaderboard? Do you look at that
// flow in that logic and make sure it is standard?"
//
// ⚠️ THE HOME VIEW IS THE MENU NOW, NOT THE BOARD. He later specified the
// shelf outright — "under options, leaderboard is there, instructions could
// also be found under the options, the settings button should be found under
// the options, and then back to the game should be filed under the options" —
// so OPTIONS opens a four-item menu and the board sits one level inside it.
// The rule this file exists to defend has not changed: every view has a
// bottom, thumb-reachable way out, it steps ONE level, and nothing is ever
// stuck. Only the destinations moved, so the checks moved with them.
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
  view: ['pvMenu', 'pvBoard', 'pvHow', 'pvForm', 'pvSettings']
    .find((id) => !document.getElementById(id).hidden),
  screen: window.__game.screen,
}));

// ── OPTIONS opens the shelf ──────────────────────────────────────────────
await openPanel();
let s = await shown();
check('OPTIONS opens the panel on the menu', s.open && s.view === 'pvMenu', JSON.stringify(s));

await p.click('#btnMenuBoard');
await p.waitForTimeout(250);
s = await shown();
check('LEADERBOARD steps to the board', s.view === 'pvBoard', JSON.stringify(s));

await p.click('#btnBoardBack');
await p.waitForTimeout(200);
s = await shown();
check('BACK from the board lands on OPTIONS, not closed',
  s.open && s.view === 'pvMenu', JSON.stringify(s));

// ── menu -> settings -> BACK -> menu (one level at a time) ──────────────
await p.click('#btnMenuSettings');
await p.waitForTimeout(200);
s = await shown();
check('SETTINGS steps to the settings view', s.view === 'pvSettings', JSON.stringify(s));

await p.click('#btnBack');
await p.waitForTimeout(200);
s = await shown();
check('BACK from settings lands on OPTIONS, not closed',
  s.open && s.view === 'pvMenu', JSON.stringify(s));

// ── menu -> how to play -> BACK -> menu ─────────────────────────────────
await p.click('#btnMenuHow');
await p.waitForTimeout(200);
s = await shown();
check('HOW TO PLAY steps to the instructions', s.view === 'pvHow', JSON.stringify(s));

await p.click('#btnHowBack');
await p.waitForTimeout(200);
s = await shown();
check('BACK from the instructions lands on OPTIONS',
  s.open && s.view === 'pvMenu', JSON.stringify(s));

// ── board -> form -> NOT NOW -> board ────────────────────────────────────
await p.click('#btnMenuBoard');
await p.waitForTimeout(250);
await p.click('#btnRegister');
await p.waitForTimeout(200);
s = await shown();
check('ENTER THE CONTEST steps to the form', s.view === 'pvForm', JSON.stringify(s));

await p.click('#btnSkip');
await p.waitForTimeout(200);
s = await shown();
check('NOT NOW from the form lands on the board, not closed', s.open && s.view === 'pvBoard', JSON.stringify(s));

// ── BACK TO GAME lives on the shelf, and closes exactly like ✕ ──────────
await p.click('#btnBoardBack');
await p.waitForTimeout(200);
const hasExit = await p.evaluate(() => !!document.getElementById('btnMenuClose'));
check('OPTIONS carries the way out of the panel', hasExit);

await p.click('#btnMenuClose');
await p.waitForTimeout(300);
s = await shown();
check('BACK TO GAME closes the panel and returns to the title', !s.open && s.screen === 'title', JSON.stringify(s));

// ── ✕ still works from every depth, including two levels deep ──────────
await openPanel();
await p.click('#btnMenuSettings');
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
