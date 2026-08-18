// HAPTIC BUTTONS — does every panel button carry the switch that makes his
// thumb buzz, and does it still behave like a button?
//
// ⚠️ THIS CANNOT GRADE THE HAPTIC. There is no way to detect a Taptic Engine
// pulse from a page, and Playwright's "iPhone" profile is Chromium wearing an
// iOS user-agent — it even reports navigator.vibrate as a function, which real
// Safari does not. Three rounds of public/haptic.html already settled the
// physics from the client's own phone:
//
//     a scripted click               never buzzes
//     his finger on a hidden switch  buzzes
//     under the control's own art    buzzes
//     on press or on release?        release
//     fifteen fast taps              throttled
//     switch inside a real button    buzzes, handler runs once
//
// So what is left to protect is the WIRING, and all of it is checkable here:
// that a switch exists inside each button, that it is what a thumb lands on,
// that it covers the whole control rather than a corner of it, that the
// button's own handler still fires exactly once, and that none of it appears
// off iOS. The path is forced on with ?haptest=1 so a desktop browser can
// walk it.
//
// Run:  PLAYWRIGHT=... CHROMIUM=... node tools/harness/hapticbtn.mjs
const BASE = process.env.BASE || 'http://localhost:5199';
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;

let pass = 0;
let fail = 0;
function ok(cond, what, detail) {
  if (cond) { pass += 1; console.log('  PASS  ' + what + (detail ? '   ' + detail : '')); }
  else { fail += 1; console.log('  FAIL  ' + what + (detail ? '   ' + detail : '')); }
}

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => { fail += 1; console.log('  THROWN  ' + e.message); });

// ── OFF iOS, NOTHING HAPPENS ─────────────────────────────────────────────
// The whole point of gating this is that the 19 other harnesses, and every
// hit-target rect measured against his artwork, keep seeing plain buttons.
await page.goto(BASE + '/?relay=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.evaluate(() => window.__panel && window.__panel.open('menu'));
await page.waitForTimeout(250);
console.log('\nOFF iOS — the path must stay invisible');
ok(await page.evaluate(() => document.querySelectorAll('input[data-haptic]').length) === 0,
  'a desktop browser gets no switches at all',
  await page.evaluate(() => document.querySelectorAll('input[data-haptic]').length) + ' found');
ok(await page.evaluate(() => {
  const b = document.getElementById('btnMenuBoard');
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === b;
}), 'and his painted OPTIONS button is still its own hit target');

// ── WITH THE PATH FORCED ON ──────────────────────────────────────────────
await page.goto(BASE + '/?relay=1&haptest=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

for (const [view, ids] of [
  ['menu', ['btnMenuBoard', 'btnMenuHow', 'btnMenuSettings', 'btnMenuClose', 'panelClose']],
  // ⚠️ btnFormBoard AND btnFormRules ARE GONE. Both sat below y992 on his
  // cabinet and went with the crop that turned the sign-up into a card; SAVE
  // is the green tick on the knob now, and the x on his card is #entryClose
  // rather than #panelClose. See tools/crop_entry_plate.py.
  ['form', ['btnSave', 'btnSkip', 'btnFormX', 'btnFormInfo', 'entryClose']],
  ['settings', ['btnBack']],
]) {
  await page.evaluate((v) => window.__panel && window.__panel.open(v), view);
  await page.waitForTimeout(300);
  console.log('\n' + view.toUpperCase() + ' — every painted control carries one');
  for (const id of ids) {
    const r = await page.evaluate((i) => {
      const b = document.getElementById(i);
      if (!b) return { missing: true };
      const sw = b.querySelector('input[data-haptic]');
      if (!sw) return { noSwitch: true };
      const br = b.getBoundingClientRect();
      const sr = sw.getBoundingClientRect();
      // What does a thumb actually land on, at the centre and at each corner
      // inset a few px? A switch that only covers the middle leaves the edges
      // of his painted button silent.
      const pts = [[0.5, 0.5], [0.12, 0.2], [0.88, 0.2], [0.12, 0.8], [0.88, 0.8]];
      const onSwitch = pts.filter(([fx, fy]) => {
        const el = document.elementFromPoint(br.left + br.width * fx, br.top + br.height * fy);
        return el === sw;
      }).length;
      return {
        covers: sr.left <= br.left + 0.5 && sr.top <= br.top + 0.5
          && sr.right >= br.right - 0.5 && sr.bottom >= br.bottom - 0.5,
        onSwitch,
        aria: sw.getAttribute('aria-hidden') === 'true' && sw.tabIndex === -1,
        inButton: sw.parentElement === b,
      };
    }, id);
    ok(!r.missing && !r.noSwitch && r.covers && r.onSwitch === 5 && r.aria && r.inButton,
      id.padEnd(14) + ' switch present, covering, and what the thumb hits',
      JSON.stringify(r));
  }
}

// ── AND IT STILL BEHAVES LIKE A BUTTON ───────────────────────────────────
// The failure worth catching: a haptic that eats the tap. Probe 3 showed the
// counter rising by exactly one per press on the device; this asserts the same
// thing about the real handlers.
console.log('\nTHE TAP STILL DOES ITS JOB');
await page.evaluate(() => window.__panel && window.__panel.open('menu'));
await page.waitForTimeout(250);
await page.click('#btnMenuSettings');
await page.waitForTimeout(350);
ok(await page.evaluate(() => !document.getElementById('pvSettings').hidden),
  'OPTIONS -> SETTINGS still navigates with a switch in the way');
await page.click('#btnBack');
await page.waitForTimeout(350);
ok(await page.evaluate(() => !document.getElementById('pvMenu').hidden),
  'and BACK comes back');

await page.evaluate(() => window.__panel && window.__panel.open('form'));
await page.waitForTimeout(300);
const runs = await page.evaluate(async () => {
  let n = 0;
  const b = document.getElementById('btnFormInfo');
  b.addEventListener('click', () => { n += 1; });
  b.click();
  await new Promise((r) => setTimeout(r, 200));
  return n;
});
ok(runs === 1, 'a tap fires the handler exactly once, not twice', 'runs=' + runs);

// The switch toggling must not be mistaken for a form control by anything
// that walks the panel — the sign-up form posts three fields, not four.
await page.evaluate(() => window.__panel && window.__panel.open('form'));
await page.waitForTimeout(250);
ok(await page.evaluate(() =>
  [...document.querySelectorAll('#pvForm input')]
    .filter((i) => !i.dataset.haptic && i.type !== 'hidden').length === 4),
'the form still has its own four inputs and no more',
  await page.evaluate(() => [...document.querySelectorAll('#pvForm input')]
    .filter((i) => !i.dataset.haptic).length) + ' non-haptic inputs');

// ── THE THREE PILLS ──────────────────────────────────────────────────────
// "The haptics button should vibrate when turned on." A checkbox is not a
// button: the switch sits OVER it and has to hand the toggle on, so the two
// things to protect are that the pill still moves, and that it moves ONCE.
console.log('\nTHE SETTINGS PILLS');
await page.evaluate(() => window.__panel && window.__panel.open('settings'));
await page.waitForTimeout(350);
for (const id of ['sSound', 'sSfx', 'sHaptics']) {
  const r = await page.evaluate((i) => {
    const box = document.getElementById(i);
    const lab = box.closest('label');
    const sw = lab.querySelector('input[data-haptic]');
    if (!sw) return { noSwitch: true };
    const lr = lab.getBoundingClientRect();
    const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
    return { onTop: hit === sw, before: box.checked };
  }, id);
  ok(!r.noSwitch && r.onTop, id.padEnd(10) + ' pill has a switch and it is what the thumb hits',
    JSON.stringify(r));
}

// One tap, one change event, one state flip — not two.
const flip = await page.evaluate(async () => {
  const box = document.getElementById('sSfx');
  const before = box.checked;
  let events = 0;
  box.addEventListener('change', () => { events += 1; });
  box.closest('label').querySelector('input[data-haptic]').click();
  await new Promise((r) => setTimeout(r, 200));
  return { before, after: box.checked, events };
});
ok(flip.after === !flip.before && flip.events === 1,
  'tapping the pill flips it exactly once', JSON.stringify(flip));

// ── TURNING VIBRATION OFF HAS TO TAKE THE SWITCHES OUT ───────────────────
// The bug this guards: on iOS the buzz is WebKit reacting to a real control,
// so a flag cannot decline it. If the switches stay in the DOM, VIBRATION OFF
// still buzzes every button in the game.
console.log('\nVIBRATION OFF ACTUALLY TURNS IT OFF');
const off = await page.evaluate(async () => {
  const box = document.getElementById('sHaptics');
  if (box.checked) {
    box.closest('label').querySelector('input[data-haptic]').click();
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    setting: box.checked,
    switchesLeft: document.querySelectorAll('input[data-haptic]').length,
    vibrationKeepsItsOwn: !!box.closest('label').querySelector('input[data-haptic]'),
  };
});
ok(off.setting === false, 'the setting really went off', JSON.stringify(off));
ok(off.switchesLeft === 1 && off.vibrationKeepsItsOwn,
  'every switch is gone except the vibration pill\'s own', JSON.stringify(off));

const back = await page.evaluate(async () => {
  const box = document.getElementById('sHaptics');
  box.closest('label').querySelector('input[data-haptic]').click();
  await new Promise((r) => setTimeout(r, 250));
  return { setting: box.checked, switches: document.querySelectorAll('input[data-haptic]').length };
});
ok(back.setting === true && back.switches > 5,
  'and turning it back on puts them all back', JSON.stringify(back));

console.log('\n' + (fail === 0 ? `ALL ${pass} PASS` : `${pass} pass, ${fail} FAIL`));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
