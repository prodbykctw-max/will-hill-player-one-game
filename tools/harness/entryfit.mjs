// DOES THE CROPPED SIGN-UP CARD ACTUALLY FIT, AND IS IT STILL AN OVERLAY?
//
// The ENTER CONTEST cabinet was 853x1844 and covered the screen. Cropped to
// 853x992 (tools/crop_entry_plate.py) it is a card laid OVER whatever view the
// panel is already showing — client: "an overlay over how to play."
//
// Three things can go wrong with that and none of them throws:
//
//   1. the card is sized off the wrong axis and overflows a short window
//   2. a control's fraction was remapped wrong, so the hit target drifts off
//      the thing he painted — invisible, because the target is transparent
//   3. the backdrop is reachable through the overlay, and a tap meant for the
//      form starts the run instead
//
// ⚠️ elementFromPoint, NOT rect arithmetic. Every control here is a
// transparent box over a painting; comparing numbers to numbers tells you the
// numbers agree with each other, not that a thumb lands on the button. Same
// lesson as tools/harness/hapticbtn.mjs.
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

// The painted controls that survived the crop. LEADERBOARD and RULES & PRIZES
// were below the cut and are gone; SAVE moved onto the knob as a green tick.
// The tiny ✕ is gone, paint and hit target both — see tools/crop_entry_plate.py.
const CONTROLS = ['btnSave', 'btnSkip', 'btnFormX', 'btnFormInfo'];

// An on-screen keyboard, as a fraction of the viewport. iOS is ~340 of 932 and
// ~216 of 568, so 0.37 covers both within a few pixels. Modelled rather than
// real because no headless browser raises one — the point is to catch a lift
// that stops clearing it, not to reproduce Safari.
const KB = 0.37;

const SIZES = [
  { width: 430, height: 932, name: 'his phone' },
  { width: 320, height: 568, name: 'a small phone' },
  { width: 900, height: 600, name: 'landscape' },
];

for (const size of SIZES) {
  const ctx = await b.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: true, isMobile: size.height > size.width,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
    null, { timeout: 25000 });
  await p.waitForTimeout(2200);

  console.log(`\n${size.name}  ${size.width}x${size.height}`);
  await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
  await p.waitForTimeout(450);

  const geo = await p.evaluate(() => {
    const r = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return {
      plate: r('entryPlate'),
      layerShown: !document.getElementById('entryLayer').hidden,
      howShown: !document.getElementById('pvHow').hidden,
      formShown: !document.getElementById('pvForm').hidden,
      panelHidden: document.getElementById('panel').hidden,
      vw: innerWidth, vh: innerHeight,
    };
  });

  // ── IT IS ITS OWN SCREEN — nothing of the panel behind it ──────────────
  //
  // ⚠️ THIS CHECK USED TO ASSERT THE EXACT OPPOSITE, and the reversal is the
  // client's, not a drift. It read "HOW TO PLAY is behind it, not replaced by
  // it" and required `geo.howShown` — built from his earlier note, "an overlay
  // over how to play". He then sent a screenshot of the cabinet floating in a
  // visible HOW TO PLAY panel and said: "it's supposed to be independent from
  // the how to play... how to play is NOT supposed to be the background of the
  // contest entry form... the how to play is his own thing, just how they load
  // on top of one another."
  //
  // So the panel is shut underneath the form now and what shows through the
  // scrim is the game canvas — his home screen, which is what he asked to be
  // behind it. Asserting the old rule here would hold the code to an
  // instruction that has been withdrawn.
  check('the sign-up layer is showing', geo.layerShown);
  check('it is its own screen — the panel is SHUT behind it', geo.panelHidden,
    JSON.stringify({ panelHidden: geo.panelHidden, form: geo.formShown }));
  check('HOW TO PLAY is NOT the background of the form', !geo.howShown,
    JSON.stringify({ how: geo.howShown }));

  // ── it FITS, on both axes, with no overflow ────────────────────────────
  const pl = geo.plate;
  check('the card fits the viewport',
    pl.x >= -1 && pl.y >= -1 && pl.x + pl.w <= geo.vw + 1 && pl.y + pl.h <= geo.vh + 1,
    `card ${pl.w.toFixed(0)}x${pl.h.toFixed(0)} at ${pl.x.toFixed(0)},${pl.y.toFixed(0)} in ${geo.vw}x${geo.vh}`);
  // and it is a CARD, not the screen — the whole point of the crop
  check('it does not cover the screen', pl.h < geo.vh * 0.94,
    `${(pl.h / geo.vh * 100).toFixed(0)}% of the height`);
  check("the plate keeps his artwork's aspect",
    Math.abs(pl.w / pl.h - 853 / 992) < 0.01, (pl.w / pl.h).toFixed(4));

  // ── every control lands on itself ─────────────────────────────────────
  const hits = await p.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) { out[id] = 'MISSING'; continue; }
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[id] = at ? (at.id || at.tagName) : 'null';
    }
    return out;
  }, CONTROLS);
  for (const id of CONTROLS) {
    check(`${id} takes its own tap`, hits[id] === id, `-> ${hits[id]}`);
  }
  // and nothing hangs off the card, which is what a bad remap looks like
  const inside = await p.evaluate((ids) => {
    const c = document.getElementById('entryPlate').getBoundingClientRect();
    return ids.concat(['fName', 'fPhone', 'fEmail']).filter((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.x < c.x - 1 || r.y < c.y - 1
        || r.x + r.width > c.right + 1 || r.y + r.height > c.bottom + 1;
    });
  }, CONTROLS);
  check('no control hangs off the card', inside.length === 0, inside.join(' '));

  // ── the backdrop is NOT reachable through the scrim ───────────────────
  // HOW TO PLAY's footer reads PLAY here and starts the run. A tap that gets
  // to it launches the game out from under a half-filled form.
  const leak = await p.evaluate(() => {
    const back = document.getElementById('btnHowBack');
    if (!back) return 'no btnHowBack';
    const r = back.getBoundingClientRect();
    if (r.width === 0) return 'ok:not-rendered';
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return at === back ? 'REACHABLE' : 'ok:' + (at?.id || at?.tagName);
  });
  check('the backdrop cannot be tapped through the overlay',
    leak !== 'REACHABLE', leak);

  // ── the lift clears a keyboard ────────────────────────────────────────
  if (size.height > size.width) {
    await p.click('#fEmail');
    await p.waitForTimeout(320);
    const typing = await p.evaluate(() => {
      const q = (id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { top: b.y, bottom: b.bottom };
      };
      return {
        lifted: document.getElementById('entryPlate').classList.contains('typing'),
        email: q('fEmail'), save: q('btnSave'), plate: q('entryPlate'),
      };
    });
    const kbTop = size.height * (1 - KB);
    check('focus lifts the card', typing.lifted);
    // ⚠️ WITH MARGIN, not just clear of it. The first version asserted
    // `bottom <= kbTop` and passed on the small phone by three pixels, which
    // is not a passing lift — it is a failing one that happened to round the
    // right way. A keyboard's height varies by a good 20px with the predictive
    // bar and the accessory row.
    const MARGIN = 12;
    check('the field being typed in clears the keyboard',
      typing.email.bottom <= kbTop - MARGIN,
      `email bottom ${typing.email.bottom.toFixed(0)} vs keyboard at ${kbTop.toFixed(0)}`);
    check('the tick clears the keyboard',
      typing.save.bottom <= kbTop - MARGIN,
      `tick bottom ${typing.save.bottom.toFixed(0)} vs keyboard at ${kbTop.toFixed(0)}`);
    check('the lift does not push the card off the top',
      typing.plate.top >= -1, `card top ${typing.plate.top.toFixed(0)}`);
  }
  await ctx.close();
}

await b.close();
const bad = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - bad.length}/${checks.length} passed`);
if (bad.length) { for (const [w] of bad) console.log('  FAILED: ' + w); process.exit(1); }
