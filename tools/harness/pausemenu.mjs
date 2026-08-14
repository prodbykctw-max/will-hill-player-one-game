// THE PAUSE MENU, AND THE TWO SOUND SWITCHES BEHIND IT.
//
// Client: "did you finish the pause menu, as well as being able to go back to
// the main menu from the options and from the leaderboard?" — plus, earlier,
// "checkboxes, no slider" for music and effects, and "a restart button on
// pause styled like Resume".
//
// Four things worth proving, none of which can be read off the source:
//   1. RESUME, RESTART and MAIN MENU are all there and each goes where it
//      says. RESTART is the interesting one — it was removed once at the
//      client's request and is back at his request, and it must ABANDON the
//      run (score 0, stage one) rather than carry the score into a fresh one,
//      which is the only version of it that would break the contest.
//   2. MUSIC and SFX are SEPARABLE. This is the regression that matters:
//      `setMuted` used to silence everything, and splitting it is exactly the
//      kind of change that silently leaves one half dead.
//   3. The choice persists, and the OPTIONS panel agrees with the pause menu
//      — they are one setting seen from two screens.
//   4. The panel can be scrolled to its own top. A centred flex item in a
//      scroll container overflows in BOTH directions and the top half is
//      unreachable, which is what cut the head off his MARTA card.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/pausemenu.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const OUT = process.env.SEAM_OUT || '.';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// A short phone, because that is where the card overflows the panel.
const p = await (await b.newContext({ viewport: { width: 393, height: 732 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(2600);

// ── into a run, then pause ───────────────────────────────────────────────
await p.mouse.click(196, 300);
await p.waitForFunction(() => window.__game.screen === 'playing', null, { timeout: 15000 });
await p.waitForTimeout(600);
// Bank some score so RESTART has something to visibly throw away.
await p.evaluate(() => { window.__game.score = 12345; });
await p.keyboard.press('KeyP');
await p.waitForTimeout(400);
check('P pauses the run', await p.evaluate(() => window.__game.screen) === 'paused');

// The menu rebuilds its hit rects every frame; read them rather than guess.
const menu = () => p.evaluate(() => (window.__menuButtons || []).map((m) => ({
  x: m.x, y: m.y, w: m.w, h: m.h, label: m.label })));
let rows = await menu();
console.log('  rows:', JSON.stringify(rows.map((r) => r.label)));
check('the menu carries RESUME, RESTART and MAIN MENU',
  ['RESUME', 'RESTART', 'MAIN MENU'].every((l) => rows.some((r) => r.label === l)),
  rows.map((r) => r.label).join(' / '));
check('and the two switches, MUSIC and SOUND EFFECTS',
  ['MUSIC', 'SOUND EFFECTS'].every((l) => rows.some((r) => r.label === l)));

const tapRow = async (label) => {
  const r = (await menu()).find((x) => x.label === label);
  if (!r) throw new Error(`no row ${label}`);
  await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await p.waitForTimeout(320);
};

// ── 2 & 3. the switches are independent, and they stick ──────────────────
const snd = () => p.evaluate(() => ({
  music: localStorage.getItem('wh_sound') !== 'off',
  sfx: localStorage.getItem('wh_sfx') !== 'off',
  ...window.__audio.status(),
}));
const before = await snd();
await tapRow('MUSIC');
const noMusic = await snd();
check('turning MUSIC off leaves the EFFECTS on',
  noMusic.muted === true && noMusic.sfxMuted === false,
  JSON.stringify({ muted: noMusic.muted, sfxMuted: noMusic.sfxMuted }));

await tapRow('SOUND EFFECTS');
const neither = await snd();
check('and the effects switch works on its own too',
  neither.muted === true && neither.sfxMuted === true,
  JSON.stringify({ muted: neither.muted, sfxMuted: neither.sfxMuted }));

await tapRow('MUSIC');
const musicBack = await snd();
check('MUSIC comes back without bringing the effects with it',
  musicBack.muted === false && musicBack.sfxMuted === true,
  JSON.stringify({ muted: musicBack.muted, sfxMuted: musicBack.sfxMuted }));
check('both choices are written to storage',
  musicBack.music === true && musicBack.sfx === false,
  JSON.stringify({ wh_sound: musicBack.music, wh_sfx: musicBack.sfx }));

// The OPTIONS panel must show the SAME two settings, not a second copy.
await p.evaluate(() => { window.__panel.open('settings'); });
await p.waitForTimeout(400);
const boxes = await p.evaluate(() => ({
  music: document.getElementById('sSound').checked,
  sfx: document.getElementById('sSfx').checked,
}));
check('OPTIONS shows the same two settings the pause menu just set',
  boxes.music === true && boxes.sfx === false, JSON.stringify(boxes));

// ── 4. the panel scrolls to its own top ──────────────────────────────────
await p.evaluate(() => { window.__panel.open('board'); });
await p.waitForTimeout(600);
const scroll = await p.evaluate(() => {
  const el = document.getElementById('panel');
  const card = document.getElementById('panelCard');
  el.scrollTop = 0;                       // ask for the very top
  const cardTop = card.getBoundingClientRect().top;
  const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
  return { scrollTop: el.scrollTop, cardTop: Math.round(cardTop), padTop: Math.round(padTop),
    overflows: el.scrollHeight > el.clientHeight,
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
});
console.log('  scroll:', JSON.stringify(scroll));
// The head of the card must be AT or BELOW the panel's top padding when
// scrolled to the top. Negative means it is above the viewport and
// unreachable — the bug.
check('scrolled to the top, the card head is on screen and not clipped',
  scroll.cardTop >= scroll.padTop - 1, `cardTop=${scroll.cardTop} padTop=${scroll.padTop}`);
check('the panel is a real scroll container when the card overflows',
  scroll.overflows, JSON.stringify({ h: scroll.scrollHeight, c: scroll.clientHeight }));
const bar = await p.evaluate(() => {
  const el = document.getElementById('panel');
  return el.offsetWidth - el.clientWidth;          // 0 when no bar takes space
});
check('and it takes no scrollbar gutter', bar === 0, `gutter=${bar}px`);
await p.screenshot({ path: `${OUT}/pausemenu-board-top.png` });

// ── 1. RESTART abandons the run; MAIN MENU leaves it ─────────────────────
await p.evaluate(() => { window.__panel.close(); });
await p.waitForTimeout(300);
await p.keyboard.press('KeyP');
await p.waitForTimeout(400);
if (await p.evaluate(() => window.__game.screen) !== 'paused') {
  await p.keyboard.press('KeyP'); await p.waitForTimeout(400);
}
await p.screenshot({ path: `${OUT}/pausemenu.png` });
await tapRow('RESTART');
await p.waitForTimeout(900);
const restarted = await p.evaluate(() => ({ screen: window.__game.screen,
  score: window.__game.score, stage: window.__game.stageIndex }));
check('RESTART starts a fresh run at stage one with the score thrown away',
  restarted.screen === 'playing' && restarted.score === 0 && restarted.stage === 0,
  JSON.stringify(restarted));

await p.keyboard.press('KeyP');
await p.waitForTimeout(400);
await tapRow('MAIN MENU');
await p.waitForTimeout(900);
check('MAIN MENU leaves the run and goes back to the title',
  await p.evaluate(() => window.__game.screen) === 'title');

console.log('');
console.log(checks.every(([, x]) => x)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, x]) => !x).map(([w]) => w).join(', ')}`);
await b.close();
