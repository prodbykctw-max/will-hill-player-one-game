// THE OPTIONS SHELF, THE BOARD THAT DOES NOT SCROLL, AND THE SIGN-UP OFFERS.
//
// Client, spelling out the shelf: "under options — leaderboard is there.
// Instructions could also be found under the options. The settings button
// should be found under the options, and then back to the game should be
// filed under the options." Plus, separately: "change the UX so no scroll
// needed", "if you are already signed up the button wouldn't appear", and
// "an option to sign up should be before run and after death."
//
// Three of these are only true at a real viewport, which is why they are
// measured in a browser rather than reasoned about:
//
//   1. NO SCROLL is a pixel fact, not a CSS opinion. His MARTA card is
//      852x1846; at width:100% on a 430px phone it is ~849px tall before the
//      title, note and buttons exist. The check reads the panel's own
//      scrollHeight against its clientHeight — if a single pixel can be
//      scrolled, this fails.
//   2. THE PRE-RUN OFFER MUST NOT EAT A FIRST GAME OR AN INTRO SKIP. Both
//      guards live in main.js; here the offer is proven to fire only for a
//      player who already has a run banked, and to latch afterwards.
//   3. AFTER DEATH is the path that was missing entirely — finishing the
//      whole game asked, being knocked out did not, and being knocked out is
//      how nearly every run ends.
//
//   PLAYWRIGHT=... CHROMIUM=... OUT=... node tools/harness/optionsmenu.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
// Screenshots land in `shots/` unless SEAM_OUT says otherwise. It used to
// default to the repo ROOT, so any run without that variable set dropped
// untracked PNGs beside the source — which on this project is the exact
// shape of the accident the CLAUDE.md guardrail is about (harness output
// riding into a commit unnoticed). `shots/` is already gitignored.
const OUT = process.env.OUT || 'shots';
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// ── 1. the shelf, the board, the instructions ─────────────────────────────
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

await p.evaluate(() => window.__panel.open('menu'));
await p.waitForTimeout(250);
const menu = await p.evaluate(() => ({
  title: document.getElementById('panelTitle').textContent,
  btns: [...document.querySelectorAll('#pvMenu .btn')].map((x) => x.textContent.trim()),
}));
check('OPTIONS is a menu with his four items', menu.title === 'OPTIONS'
  && JSON.stringify(menu.btns)
    === JSON.stringify(['LEADERBOARD', 'HOW TO PLAY', 'SETTINGS', 'BACK TO GAME']),
  JSON.stringify(menu));
await p.screenshot({ path: `${OUT}/ux-menu.png` });

await p.click('#btnMenuBoard');
await p.waitForTimeout(700);
const board = await p.evaluate(() => {
  const panel = document.getElementById('panel');
  const card = document.getElementById('panelCard');
  return {
    scrollable: panel.scrollHeight - panel.clientHeight,
    cardH: Math.round(card.getBoundingClientRect().height),
    viewH: window.innerHeight,
    register: !document.getElementById('btnRegister').hidden,
    share: !document.getElementById('btnShare').hidden,
    rows: [...document.querySelectorAll('#board li')].map((li) => li.textContent),
  };
});
check('the board fits with NO scrolling', board.scrollable <= 1,
  `card ${board.cardH}px in ${board.viewH}px, overflow ${board.scrollable}px`);
// Nobody's practice runs are dressed up as a ranking, and since the client
// asked for the pinned WILL HILL 50,000 benchmark off the board there is not
// even a placeholder — it is genuinely empty until the Worker is deployed.
check('the board is empty until the contest is live', board.rows.length === 0,
  JSON.stringify(board.rows));
check('an unregistered player is offered the contest', board.register);
// The other half of the same rule: sharing belongs to entrants, so the two
// buttons are mutually exclusive and only ever one is on the card.
check('and cannot share until they enter', !board.share,
  JSON.stringify({ register: board.register, share: board.share }));
await p.screenshot({ path: `${OUT}/ux-board.png` });

await p.click('#btnBoardBack');
await p.waitForTimeout(200);
check('BACK steps up to OPTIONS, not out of the panel',
  await p.evaluate(() => document.getElementById('panelTitle').textContent) === 'OPTIONS');

await p.click('#btnMenuHow');
await p.waitForTimeout(200);
const how = await p.evaluate(() => ({
  t: document.getElementById('panelTitle').textContent,
  // ⚠️ #howList, NOT #howPager. HOW TO PLAY went back to one page.
  n: document.querySelectorAll('#howList .howShot').length,
}));
check('HOW TO PLAY opens with its lessons', how.t === 'HOW TO PLAY' && how.n >= 6,
  JSON.stringify(how));
await p.screenshot({ path: `${OUT}/ux-how.png` });
await p.evaluate(() => window.__panel.close());

// ── 2. the offer before a run — EVERY start, until they enter ─────────────
//
// ⚠️ THIS SECTION ASSERTED THE OPPOSITE UNTIL NOW, and it was wrong on
// `origin/main` before the sign-up card was ever cropped — five checks red,
// two of them only because the form stopped being a `.pv`. The other three
// were testing a flow `ca4e5a2` deliberately replaced, and a harness that
// defends a superseded decision is worse than no harness.
//
// What it used to assert: a brand-new device gets straight into the game, the
// offer belongs to a player who already has a run banked, the offer is latched
// in localStorage so it only happens once, and NOT NOW goes straight to
// 'playing'. Every one of those is now deliberately false. His spec:
//
//   "Start — sign in or not — how to play — play game"
//   "Ask again next time they start until they're registered."
//
// So the gate fires on the FIRST start, with nothing banked — that brand-new
// player is exactly who it exists for, and the old `localRuns().length` guard
// made it unreachable for them. It repeats every start, so the `wh_signup_asked`
// latch is gone rather than merely unset. And NOT NOW lands on HOW TO PLAY,
// because the lesson is the next link in the chain, not the run.
await p.evaluate(() => { const g = window.__game; g.screenT = g.introAt + 999; });
await p.waitForTimeout(120);
await p.mouse.click(215, 700);
await p.waitForTimeout(450);
const firstRun = await p.evaluate(() => ({
  screen: window.__game.screen,
  // ⚠️ `open` MEANS "A PANEL SURFACE IS UP", NOT "#panel IS VISIBLE". The
  // client had the sign-up separated into its own top-level layer — "how to
  // play is not supposed to be the background of the contest entry form" — so
  // #panel is deliberately SHUT while the form is showing. Reading the element
  // alone reported the sign-up as never opening while it filled the screen.
  open: !document.getElementById('panel').hidden
     || !document.getElementById('entryLayer').hidden,
  form: !document.getElementById('entryLayer').hidden,
}));
check('the very first START offers the contest, with nothing banked',
  firstRun.open && firstRun.form, JSON.stringify(firstRun));

// Bank a run, come back to the title, and the offer is due again.
await p.evaluate(() => {
  localStorage.setItem('wh_local_runs', JSON.stringify([{ name: 'X', score: 900, t: 1, me: true }]));
});
await p.evaluate(() => { const g = window.__game; g.screen = 'title'; g.screenT = g.introAt + 999; });
await p.waitForTimeout(150);
await p.mouse.click(215, 700);
await p.waitForTimeout(450);
const offered = await p.evaluate(() => ({
  // ⚠️ NOT THE PANEL TITLE ANY MORE FOR THE SIGN-UP. His card is lettered
  // ENTER THE CONTEST in the artwork, so with the form as an overlay the
  // panel's own heading belongs to the view BEHIND it and reads HOW TO PLAY
  // or LEADERBOARD. The layer is the thing to ask.
  view: !document.getElementById('entryLayer').hidden ? 'ENTER THE CONTEST'
    : document.getElementById('panelTitle').textContent,
  // same rule as above: the sign-up is its own layer and shuts #panel.
  open: !document.getElementById('panel').hidden
     || !document.getElementById('entryLayer').hidden,
  asked: localStorage.getItem('wh_signup_asked'),
}));
check('a returning player is offered sign-up before the run',
  offered.open && offered.view === 'ENTER THE CONTEST', JSON.stringify(offered));
// ⚠️ NOT LATCHED, AND THAT IS THE FEATURE. "Ask again next time they start
// until they're registered." A device that has been asked and said no must
// still be asked, so nothing may be written that would stop it.
check('the offer is NOT latched away on the device', offered.asked === null,
  String(offered.asked));

// NOT NOW hands them on to the lesson, which is the next link in his chain —
// not straight to the run, and above all not stranded on a panel.
await p.click('#btnSkip');
await p.waitForTimeout(550);
const afterSkip = await p.evaluate(() => ({
  form: !document.getElementById('entryLayer').hidden,
  how: !document.getElementById('pvHow').hidden,
  back: document.getElementById('btnHowBack')?.textContent,
}));
check('NOT NOW dismisses the card and lands on HOW TO PLAY',
  !afterSkip.form && afterSkip.how, JSON.stringify(afterSkip));
check('and HOW TO PLAY is holding the run, so its footer reads PLAY',
  afterSkip.back === 'PLAY', String(afterSkip.back));
await p.click('#btnHowBack');
await p.waitForTimeout(600);
check('PLAY starts the run they asked for',
  await p.evaluate(() => window.__game.screen) === 'playing');
await ctx.close();

// ── 3. and after death ────────────────────────────────────────────────────
const c2 = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p2 = await c2.newPage();
p2.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p2.addInitScript(() => { localStorage.setItem('wh_signup_asked', '1'); });
await p2.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p2.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
const dead = await p2.evaluate(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = window.__game;
  window.__startStage(0);
  for (let k = 0; k < 4; k++) await frame();
  g.continues = 0;
  g.score = 4321;
  g.player.y = 99999;                    // off the end of the world
  g.player.vy = 0;
  for (let k = 0; k < 12 && g.screen !== 'gameOver'; k++) await frame();
  g.screenT = 60;                        // past the tap guard
  return g.screen;
});
// ⚠️ PRESS THE BUTTON, NOT THE MIDDLE OF THE SCREEN. GAME KNOCKED used to
// advance on a tap anywhere; it draws SEE YOUR SCORE now and that tap is the
// only one it takes. A click at 215,500 lands on nothing and this check read
// "the sign-up is never offered after death" when the offer was one button
// press away. See tools/harness/betweenscreens.mjs.
const knockedBtn = await p2.evaluate(() => {
  const r = (window.__screenButtons || [])[0];
  return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2, label: r.label } : null;
});
check('GAME KNOCKED offers a way on', !!knockedBtn, JSON.stringify(knockedBtn));
if (knockedBtn) await p2.mouse.click(knockedBtn.x, knockedBtn.y);
await p2.waitForTimeout(600);
const after = await p2.evaluate(() => ({
  // same rule again: the sign-up layer shuts #panel behind it.
  open: !document.getElementById('panel').hidden
     || !document.getElementById('entryLayer').hidden,
  // ⚠️ NOT THE PANEL TITLE ANY MORE FOR THE SIGN-UP. His card is lettered
  // ENTER THE CONTEST in the artwork, so with the form as an overlay the
  // panel's own heading belongs to the view BEHIND it and reads HOW TO PLAY
  // or LEADERBOARD. The layer is the thing to ask.
  view: !document.getElementById('entryLayer').hidden ? 'ENTER THE CONTEST'
    : document.getElementById('panelTitle').textContent,
}));
check('and after death, when the score is fresh',
  dead === 'gameOver' && after.open && after.view === 'ENTER THE CONTEST',
  JSON.stringify({ dead, ...after }));
await c2.close();

// ── THE CABINET FITS THE SCREEN, INCLUDING IN THE INSTALLED APP ──────────
//
// Client, with a PWA screenshot of this very panel: "the cabinets on the PWA
// seem to be a tad bit large because of the alerts button is not visible and
// screen. I just want uniformity across all devices if possible."
//
// ⚠️ AN INSET COUNTED TWICE, exactly like the home controls. #panelCard.cabinet
// cover-sizes off `100lvh + env(safe-area-inset-top) + env(safe-area-inset-
// bottom)`, and a standalone launch with viewport-fit=cover has a `lvh` that
// ALREADY contains both strips. Measured with the shipped rule and a 59/34
// pair of insets: the card came out 473px wide on a 430px screen, 22px of the
// plate gone off each side, which is the ALERT panel. It is sized from a
// measured --vp-h now (resize() in src/main.js).
//
// Chromium cannot launch as a home-screen app, so this drives the same
// overrides main.js exposes for the canvas path.
console.log('\n=== THE CABINET FITS, BROWSER AND INSTALLED ===');
for (const [name, w, h] of [['Pro Max', 430, 932], ['15 Pro', 393, 852],
  ['SE', 375, 667], ['Android', 412, 780]]) {
  for (const [tag, standalone] of [['browser', false], ['installed', true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.addInitScript(([sa, scr]) => {
      window.__standaloneOverride = sa;
      if (sa) window.__screenHeightOverride = scr;      // the stretch resize() takes
    }, [standalone, h + 59]);
    await pg.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => window.__game && window.__game.screen === 'title',
      null, { timeout: 25000 });
    await pg.waitForTimeout(1400);
    const at = await pg.evaluate(() => {
      const o = window.__title.optionsRect(window.__game.titleBox);
      return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    });
    await pg.mouse.click(at.x, at.y);
    await pg.waitForTimeout(700);
    const m = await pg.evaluate(() => {
      const c = document.getElementById('panelCard');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, cabinet: c.classList.contains('cabinet'),
        vw: window.innerWidth, vh: window.innerHeight };
    });
    const lost = (m.w - m.vw) / 2;
    check(`[${name} ${tag}] the cabinet is not wider than the screen`,
      m.cabinet && lost <= 1,
      `card ${Math.round(m.w)} vs viewport ${m.vw} — ${Math.round(lost)}px of plate lost per side`);
    // And it must still COVER — under-covering is the gap he reported before
    // this rule existed, and shrinking the card is the lazy way to pass above.
    check(`[${name} ${tag}] and it still covers the screen`,
      m.w >= m.vw - 1 && m.h >= m.vh - 1,
      `card ${Math.round(m.w)}x${Math.round(m.h)} vs ${m.vw}x${m.vh}`);
    await ctx.close();
  }
}

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
