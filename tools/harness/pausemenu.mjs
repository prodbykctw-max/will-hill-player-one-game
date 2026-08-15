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
// Screenshots land in `shots/` unless SEAM_OUT says otherwise. It used to
// default to the repo ROOT, so any run without that variable set dropped
// untracked PNGs beside the source — which on this project is the exact
// shape of the accident the CLAUDE.md guardrail is about (harness output
// riding into a commit unnoticed). `shots/` is already gitignored.
const OUT = process.env.SEAM_OUT || 'shots';
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
// ⚠️ RELATIVE, NOT ABSOLUTE. An earlier version asserted "after this tap
// MUSIC is off" — which quietly encoded the assumption that MUSIC starts ON.
// It does not any more (it defaults OFF so that ticking it is the gesture the
// browser needs; see soundEnabled in ui/panel.js), and four checks failed on
// a change that was entirely correct. What this actually needs to prove is
// INDEPENDENCE — that each switch flips itself and leaves the other one
// alone — and that is true whatever either one starts at.
const snd = () => p.evaluate(() => ({
  music: localStorage.getItem('wh_sound') === 'on',
  sfx: localStorage.getItem('wh_sfx') !== 'off',
  ...window.__audio.status(),
}));
const before = await snd();
console.log('  start:', JSON.stringify({ muted: before.muted, sfxMuted: before.sfxMuted }));

await tapRow('MUSIC');
const t1 = await snd();
check('tapping MUSIC flips MUSIC and leaves the EFFECTS untouched',
  t1.muted === !before.muted && t1.sfxMuted === before.sfxMuted,
  JSON.stringify({ muted: t1.muted, sfxMuted: t1.sfxMuted }));

await tapRow('SOUND EFFECTS');
const t2 = await snd();
check('tapping SOUND EFFECTS flips the effects and leaves MUSIC untouched',
  t2.sfxMuted === !before.sfxMuted && t2.muted === t1.muted,
  JSON.stringify({ muted: t2.muted, sfxMuted: t2.sfxMuted }));

await tapRow('MUSIC');
const t3 = await snd();
check('MUSIC comes back without bringing the effects with it',
  t3.muted === before.muted && t3.sfxMuted === !before.sfxMuted,
  JSON.stringify({ muted: t3.muted, sfxMuted: t3.sfxMuted }));
check('both choices are written to storage',
  t3.music === !t3.muted && t3.sfx === !t3.sfxMuted,
  JSON.stringify({ wh_sound: t3.music, wh_sfx: t3.sfx, muted: t3.muted, sfxMuted: t3.sfxMuted }));

// The OPTIONS panel must show the SAME two settings, not a second copy.
await p.evaluate(() => { window.__panel.open('settings'); });
await p.waitForTimeout(400);
const boxes = await p.evaluate(() => ({
  music: document.getElementById('sSound').checked,
  sfx: document.getElementById('sSfx').checked,
}));
check('OPTIONS shows the same two settings the pause menu just set',
  boxes.music === !t3.muted && boxes.sfx === !t3.sfxMuted,
  JSON.stringify({ panel: boxes, pause: { music: !t3.muted, sfx: !t3.sfxMuted } }));

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
// ⚠️ THIS USED TO ASSERT THE OPPOSITE, AND WAS RIGHT TO. When his MARTA card
// was sized by WIDTH it was always taller than a phone, so the only thing
// that could be guaranteed was that the overflow stayed REACHABLE — the top
// of the card had to be scrollable to, which is the bug this file caught
// ("the leaderboard is cut off at the top"). The card is now sized by the
// height the viewport actually has, at the client's request — "change the UX
// so no scroll needed" — so the stronger promise holds and is what gets
// checked: there is nothing to scroll at all. The reachability check above
// stays as-is; it is still the guard if a future view does overflow.
check('and there is nothing to scroll — the whole card fits',
  !scroll.overflows,
  JSON.stringify({ h: scroll.scrollHeight, c: scroll.clientHeight }));
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
