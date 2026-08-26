// DOES THE JANDÉ CARD FIT, READ, AND STILL GUARD THE GAME UNDER IT?
//
// The sign-up used to be the client's painted cabinet with transparent hit
// targets over the artwork; he then pointed his Jandé registry layout at it —
// "the registration form should be the color scheme of the game" — so it is
// real DOM now: navy card, gold heading, red required tags, one glossy gold
// button, an underlined skip. This harness graded plate fractions before; the
// plate is gone, so what it grades now is what can silently break on a card:
//
//   1. the card overflows a viewport it should fit, or clips its controls
//   2. the scrim stops eating taps and PRESS START fires under the form
//   3. the keyboard lift stops clearing an on-screen keyboard, burying SAVE
//   4. the title lockup doubles over the real title screen, or vanishes on
//      the flows where it is the only logo on screen
//   5. the palette drifts off his colors, or the dead ✕ comes back
//   6. the painted plate sneaks back into the network (an unused import
//      still ships the file — the imports left panel.js on purpose)
//
// ⚠️ elementFromPoint, NOT rect arithmetic, for every tap question. Numbers
// agreeing with numbers does not put a thumb on a button — same lesson as
// tools/harness/hapticbtn.mjs.
//
//   PLAYWRIGHT=... CHROMIUM=... BASE=... node tools/harness/entryfit.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

// An on-screen keyboard, as a fraction of the viewport. iOS is ~340 of 932
// and ~216 of 568, so 0.37 covers both within a few pixels. Modelled rather
// than real because no headless browser raises one — the point is to catch a
// lift that stops clearing it, not to reproduce Safari.
const KB = 0.37;

const SIZES = [
  { width: 430, height: 932, name: 'his phone' },
  { width: 320, height: 568, name: 'a small phone' },
  { width: 900, height: 600, name: 'landscape' },
];

for (const size of SIZES) {
  const portrait = size.height > size.width;
  const ctx = await b.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: true, isMobile: portrait,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
    null, { timeout: 25000 });
  await p.waitForTimeout(1200);

  console.log(`\n${size.name}  ${size.width}x${size.height}`);
  await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
  await p.waitForTimeout(450);

  // ── the card fits, and its controls are really on screen ───────────────
  const geo = await p.evaluate(() => {
    const r = (id) => document.getElementById(id)?.getBoundingClientRect() || null;
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const b2 = el.getBoundingClientRect();
      return b2.width > 0 && b2.height > 0 && getComputedStyle(el).display !== 'none';
    };
    return {
      plate: r('entryPlate'), save: r('btnSave'), skip: r('btnSkip'),
      info: r('btnFormInfo'), name: r('fName'),
      xVisible: vis('btnFormX'), logoVisible: vis('entryLogo'),
      logoRect: r('entryLogo'),
    };
  });
  const inView = (r2) => r2 && r2.top >= 0 && r2.left >= 0
    && r2.bottom <= size.height && r2.right <= size.width;
  check('the card is on screen and inside the viewport', inView(geo.plate),
    geo.plate && `${Math.round(geo.plate.top)}..${Math.round(geo.plate.bottom)} of ${size.height}`);
  check('SAVE & ENTER is inside the card and visible',
    inView(geo.save) && geo.save.top > geo.plate.top && geo.save.bottom < geo.plate.bottom);
  check('the skip link sits under the gold button, not beside it',
    !!geo.skip && geo.skip.top >= geo.save.bottom);
  check('CONTEST INFO is a live link under the skip',
    !!geo.info && geo.info.top >= geo.skip.bottom - 1);
  check('the ✕ stays dead — "exes don\'t need to be back buttons"', !geo.xVisible);

  // ── the thumb lands on what the eye sees ───────────────────────────────
  const hits = await p.evaluate(() => {
    const hit = (id) => {
      const el = document.getElementById(id);
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return at === el || el.contains(at) ? 'self' : (at && (at.id || at.tagName));
    };
    // A tap OUTSIDE the card must die on the scrim — the canvas under it is
    // PRESS START, a run launched out from under a half-filled form.
    const plate = document.getElementById('entryPlate').getBoundingClientRect();
    const gx = plate.left / 2, gy = Math.min(plate.top / 2, 20);
    const guard = document.elementFromPoint(gx, gy);
    return {
      save: hit('btnSave'), skip: hit('btnSkip'), info: hit('btnFormInfo'),
      name: hit('fName'), phone: hit('fPhone'), email: hit('fEmail'),
      guard: guard ? (guard.id || guard.tagName) : 'nothing',
    };
  });
  for (const k of ['save', 'skip', 'info', 'name', 'phone', 'email']) {
    check(`a tap on ${k} lands on ${k}`, hits[k] === 'self', String(hits[k]));
  }
  check('a tap beside the card dies on the scrim, never the canvas',
    hits.guard === 'entryLayer' || hits.guard === 'entryPlate', hits.guard);

  // ── his colors, not approximately his colors ───────────────────────────
  const palette = await p.evaluate(() => {
    const cs = (id) => getComputedStyle(document.getElementById(id));
    return {
      head: cs('entryHead').color,
      req: getComputedStyle(document.querySelector('#pvForm .req')).color,
      saveBg: cs('btnSave').backgroundImage,
      skipDecor: cs('btnSkip').textDecorationLine,
      placeholder: getComputedStyle(document.getElementById('fName')).color,
    };
  });
  check('the heading is the game\'s gold', palette.head === 'rgb(240, 180, 41)', palette.head);
  check('"required" is red', palette.req === 'rgb(255, 92, 74)', palette.req);
  check('the button is a real gold gradient, not a flat fill',
    /linear-gradient/.test(palette.saveBg));
  check('the skip is underlined like his Jandé link',
    /underline/.test(palette.skipDecor), palette.skipDecor);

  // ── the title lockup: only where the title screen is NOT already there ──
  check('start flow: no doubled logo over the real title screen',
    !geo.logoVisible);
  const postLogo = await p.evaluate(() => {
    window.__panel.open('form', { flow: 'post' });
    const lg = document.getElementById('entryLogo');
    const pl = document.getElementById('entryPlate');
    const r = lg.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0 && getComputedStyle(lg).display !== 'none';
    return { shown, above: r.bottom <= pl.getBoundingClientRect().top, top: r.top };
  });
  if (portrait && size.height > 640) {
    check('post flow: the lockup fills the band above the card',
      postLogo.shown && postLogo.above && postLogo.top >= 0,
      `top ${Math.round(postLogo.top)}`);
  } else {
    // Landscape has no band; a short portrait phone (≤640px) has less band
    // than the lockup is tall. Both hide it rather than clip it.
    check('no band, no lockup — hidden rather than clipped', !postLogo.shown);
  }
  await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
  await p.waitForTimeout(150);

  // ── refusal: the error appears where the eye is ────────────────────────
  await p.click('#btnSave');
  await p.waitForTimeout(200);
  const err = await p.evaluate(() => {
    const e = document.getElementById('formErr');
    const r = e.getBoundingClientRect();
    const pl = document.getElementById('entryPlate').getBoundingClientRect();
    return { hidden: e.hidden, text: e.textContent.trim(),
      inCard: r.top > pl.top && r.bottom < pl.bottom && r.width > 0 };
  });
  check('an empty SAVE refuses with a visible message',
    !err.hidden && err.text.length > 0, err.text);
  check('the message sits inside the card, above the button', err.inCard);

  // ── the keyboard lift still clears a keyboard (portrait only) ──────────
  if (portrait) {
    await p.focus('#fName');
    await p.waitForTimeout(420);
    const lift = await p.evaluate(() => ({
      typing: document.getElementById('entryPlate').classList.contains('typing'),
      saveBottom: document.getElementById('btnSave').getBoundingClientRect().bottom,
      nameTop: document.getElementById('fName').getBoundingClientRect().top,
    }));
    const kbTop = size.height * (1 - KB);
    check('focusing a field lifts the card', lift.typing);
    check('SAVE & ENTER clears the modelled keyboard',
      lift.saveBottom <= kbTop,
      `save bottom ${Math.round(lift.saveBottom)} vs keyboard top ${Math.round(kbTop)}`);
    check('the focused field is still on screen after the lift',
      lift.nameTop >= 0, `name top ${Math.round(lift.nameTop)}`);
    await p.evaluate(() => document.getElementById('fName').blur());
    await p.waitForTimeout(250);
  }

  // ── the painted plate stays out of the build AND the network ───────────
  const plates = await p.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter((r) => /contest-entry|glow-entry/.test(r.name)).length);
  check('contest-entry.webp and glow-entry.webp are never fetched', plates === 0,
    `${plates} requests`);

  // ── the skip actually leaves ───────────────────────────────────────────
  await p.click('#btnSkip');
  await p.waitForTimeout(300);
  const gone = await p.evaluate(() => document.getElementById('entryLayer').hidden);
  check('the skip link dismisses the form', gone);

  await ctx.close();
}

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
