// CAN'T SUBMIT WITHOUT AGREEING TO THE PRIVACY POLICY.
//
// Client: "add a check box next to privacy policy. Can't submit without
// agreeing to privacy policy." What this grades:
//
//   1. filled form, box unchecked -> SAVE refuses, nothing is registered
//   2. filled form, box checked -> SAVE goes through
//   3. the inline "Privacy Policy" link opens the popup WITHOUT toggling
//      the checkbox underneath it (the trap a checkbox-in-a-label always
//      risks) — real p.click() on the coordinates, not a synthetic event,
//      because that is the one thing a synthetic dispatch cannot prove
//   4. the box resets unchecked every time the card re-opens — consent is
//      asked fresh each visit, never inherited from a stored flag
//   5. the field-order rule survives: an empty NAME is still reported
//      before the agreement gate, so a first-time visitor fixes their info
//      before being told to agree to anything
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/agreegate.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const ck = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 30000 });
await p.waitForTimeout(1500);

const fill = () => p.evaluate(() => {
  document.getElementById('fName').value = 'TESTER';
  document.getElementById('fPhone').value = '4045550123';
  document.getElementById('fEmail').value = 'tester@example.com';
});

await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
await p.waitForTimeout(500);

// ── 1: filled, unchecked -> refused ────────────────────────────────────
await fill();
await p.click('#btnSave');
await p.waitForTimeout(250);
const refused = await p.evaluate(() => ({
  errShown: !document.getElementById('formErr').hidden,
  errText: document.getElementById('formErr').textContent,
  boxBad: document.getElementById('fAgree').classList.contains('bad'),
  registered: !!JSON.parse(localStorage.getItem('wh_contest_reg') || 'null'),
}));
ck('an unchecked box refuses SAVE with a visible message',
  refused.errShown && /agree/i.test(refused.errText), refused.errText);
ck('the checkbox itself is flagged bad', refused.boxBad);
ck('nothing gets registered without the box checked', !refused.registered);

// ── 2: check it, SAVE goes through ─────────────────────────────────────
await p.click('#fAgree');
await p.click('#btnSave');
await p.waitForTimeout(400);
const went = await p.evaluate(() => ({
  registered: !!JSON.parse(localStorage.getItem('wh_contest_reg') || 'null'),
  formHidden: document.getElementById('entryLayer').hidden,
}));
ck('checked + SAVE actually registers', went.registered);
ck('and the form closes on success', went.formHidden);

// ── the fill is really painted, not just `checked` in the DOM ──────────
// ⚠️ A REAL FAILURE MODE, NOT A HYPOTHETICAL. A first version set
// `background: linear-gradient(...)` then `background-image: url(svg)`
// right after it in the SAME rule — the longhand replaces the shorthand's
// image instead of layering onto it, and the shorthand's own reset drops
// background-color to transparent at the same time. `.checked` read true
// the whole time; only a zoomed screenshot showed the box rendering with
// no gold behind the checkmark. Read the computed background back rather
// than trusting the DOM property.
await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
await p.waitForTimeout(400);
await p.click('#fAgree');
await p.waitForTimeout(150);
const painted = await p.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('fAgree'));
  return { bg: cs.backgroundColor, img: cs.backgroundImage };
});
ck('the checked box actually paints a fill, not just DOM .checked',
  painted.bg !== 'rgba(0, 0, 0, 0)' && painted.bg !== 'transparent' && painted.img !== 'none',
  JSON.stringify(painted));

// ── 3: the inline link opens the popup, never the checkbox ─────────────
await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
await p.waitForTimeout(500);
const before = await p.evaluate(() => document.getElementById('fAgree').checked);
// A REAL click at real coordinates, not a synthetic dispatch — the one
// thing that can catch a label forwarding its click to the wrong control.
await p.click('#btnPrivacyInline');
await p.waitForTimeout(400);
const after = await p.evaluate(() => ({
  checked: document.getElementById('fAgree').checked,
  privacyOpen: !document.getElementById('privacyLayer').hidden,
}));
ck('the "Privacy Policy" link opens the popup', after.privacyOpen);
ck('and does NOT toggle the checkbox underneath it', before === after.checked,
  `before=${before} after=${after.checked}`);
await p.click('#btnPrivacyBack');
await p.waitForTimeout(300);
const closed = await p.evaluate(() => ({
  privacyClosed: document.getElementById('privacyLayer').hidden,
  formStillOpen: !document.getElementById('entryLayer').hidden,
}));
ck('BACK closes the policy and the form is still there', closed.privacyClosed && closed.formStillOpen);

// ── 4: reopening the card resets the box unchecked ─────────────────────
await p.click('#fAgree');
const wasChecked = await p.evaluate(() => document.getElementById('fAgree').checked);
await p.evaluate(() => window.__panel.close());
await p.waitForTimeout(300);
await p.evaluate(() => window.__panel.open('form', { flow: 'start' }));
await p.waitForTimeout(400);
const reopened = await p.evaluate(() => document.getElementById('fAgree').checked);
ck('the box resets unchecked on every fresh open', wasChecked === true && reopened === false,
  `checked-before-close=${wasChecked} checked-on-reopen=${reopened}`);

// ── 5: field errors still take priority over the agreement gate ────────
await p.evaluate(() => {
  document.getElementById('fName').value = '';
  document.getElementById('fPhone').value = '';
  document.getElementById('fEmail').value = '';
});
await p.click('#btnSave');
await p.waitForTimeout(250);
const order = await p.evaluate(() => document.getElementById('formErr').textContent);
ck('an empty NAME is still reported before the agreement gate',
  /name/i.test(order), order);

await ctx.close();

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
