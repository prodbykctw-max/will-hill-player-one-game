// THE MOVEMENT PAIR: HIGHER OFF THE FLOOR, AND SOLIDER TO LOOK AT.
//
// Client: "the left and right buttons need to come up slightly, the ones at
// the bottom left of the screen... and I want them to appear a little more
// solid."
//
// Both halves are measured, not eyeballed: the gap from the bottom of the
// screen in CSS px, and the ALPHA the pad's own face is composited at. And
// two things must NOT have changed — JUMP and DASH stay where they were, and
// the pair must still light up when pressed, which is the bit a careless
// specificity fix breaks silently.
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.evaluate(() => window.__startStage(0));
await p.waitForTimeout(900);

const geo = await p.evaluate(() => {
  const out = {};
  for (const id of ['tL', 'tR', 'tJump', 'tDash']) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out[id] = {
      gap: Math.round(window.innerHeight - r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color,
    };
  }
  out.seam = Math.round(document.getElementById('tR').getBoundingClientRect().left
    - document.getElementById('tL').getBoundingClientRect().right);
  return out;
});
console.log('  ' + JSON.stringify(geo, null, 1).replace(/\n/g, '\n  '));

const alpha = (c) => { const m = /rgba?\([^)]*?([\d.]+)\)/.exec(c); return c.startsWith('rgba') ? +m[1] : 1; };

check('the movement pair sits higher than JUMP does',
  geo.tL.gap > geo.tJump.gap, `L/R ${geo.tL.gap}px vs JUMP ${geo.tJump.gap}px`);
check('lifted to 34px, up from 18', geo.tL.gap === 34 && geo.tR.gap === 34,
  `${geo.tL.gap} / ${geo.tR.gap}`);
check('JUMP has NOT moved — he asked for the nav pair only', geo.tJump.gap === 18,
  `${geo.tJump.gap}px`);
check('the face is solider than the old 0.52', alpha(geo.tL.bg) >= 0.75,
  `${geo.tL.bg} -> alpha ${alpha(geo.tL.bg)}`);
check('the gold edge is brighter than the old 0.34', alpha(geo.tL.border) >= 0.5,
  `${geo.tL.border}`);
check('both pads got it, not just one', geo.tL.bg === geo.tR.bg);
check('the 4px seam between them is untouched', geo.seam === 4, `${geo.seam}px`);
check('they are still 70px', geo.tL.w === 70 && geo.tL.h === 70);

// ⚠️ THE ONE A SPECIFICITY FIX BREAKS SILENTLY. `:not(.on)` is what keeps the
// solid face off the pressed state; get that wrong and the button stops
// lighting under a thumb while every geometric check above still passes.
const press = await p.evaluate(async () => {
  const el = document.getElementById('tL');
  const read = () => { const c = getComputedStyle(el); return { b: c.borderTopColor, t: c.transform }; };
  // ⚠️ BASELINE FIRST. Reading the "off" value straight after removing .on
  // reports the ON colour, because release carries a 90ms transition and the
  // computed style is still mid-flight. That is what failed the first run of
  // this check — the CSS was fine, the harness was reading a fade.
  const before = read();
  el.classList.add('on');
  const on = read();
  el.classList.remove('on');
  return { before, on };
});
check('pressing still lights the pad', press.on.b !== press.before.b,
  `${press.before.b} -> ${press.on.b}`);
check('and still presses down', press.on.t !== press.before.t, press.on.t);

// ⚠️ POINTER EVENTS, NOT TOUCH. src/core/input.js binds pointerdown /
// pointermove / pointerup on the pad root — a synthetic TouchEvent reaches
// nobody, which is why the first run of this file reported the player pinned
// at x=96 and looked like the lift had broken the controls. It had not.
const before = await p.evaluate(() => window.__game.player.x);
const held = await p.evaluate(() => new Promise((res) => {
  const el = document.getElementById('tR');
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
    isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  setTimeout(() => {
    const x = window.__game.player.x;
    el.dispatchEvent(new PointerEvent('pointerup', o));
    res(x);
  }, 500);
}));
check('holding the RIGHT pad still moves him', held > before + 8,
  `x ${Math.round(before)} -> ${Math.round(held)}`);

await p.screenshot({ path: `${process.env.SEAM_OUT || 'shots'}/pads-lifted.png` });
console.log('');
console.log(checks.every(([, o]) => o) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, o]) => !o).map(([w]) => w).join(', '));
await b.close();
