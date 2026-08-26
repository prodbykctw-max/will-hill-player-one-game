// IS EVERY TAPPABLE THING LIT, AND IS NOTHING ELSE?
//
// Client: "Can we make all tappable buttons a little more noticeable... it
// needs to be a lot more obvious they could be clicked." Then, on the first
// attempt: "Instead of those square lines that are glowing around buttons and
// stuff like that I think you just need to trace over the text of each button
// as functional and make the text glow. It's all white text so just make the
// text a white glow and you can intensify a little more too so it's blatantly
// obvious."
//
// The glow is a bitmap cut off his own plates (tools/cut_glow_glyphs.py) and
// screened back over them, which means it can go wrong in ways CSS cannot:
//
//   DRIFT      a rect moves in index.html and not in the cutter, so the glow
//              sits next to the control instead of on it. This is the one that
//              would ship quietly — the panel still looks lit.
//   A BOX      the cutter picks up a painted frame or a panel edge and the
//              rectangle he asked to remove comes back in his own ink.
//   A DEAD TAP the layer covers every control it lights, so a missing
//              pointer-events would eat every button on the screen.
//   NO PULSE   the layer never resolves (a bad var, a 404) and the whole
//              feature is silently absent.
//
// So this measures the actual painted pixels: it freezes the pulse at each end,
// screenshots, and diffs. Light that appears between the two frames is the
// glow, wherever it came from, and every assertion below is about WHERE that
// light lands rather than about which CSS properties are set.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/btnglow.mjs

const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => { check('no exception', false, e.message); });
await p.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(2600);

const NAMES = ['glyphglow', 'textglow', 'textglowpx',
  'glyphglowcalm', 'textglowcalm', 'textglowpxcalm'];
// ⚠️ THE PHASE IS A FRACTION OF EACH ANIMATION'S OWN DURATION, not of a number
// written here. The cycle length is a thing he asks about ("they should slowly
// pulse") and it has already changed once; a hardcoded 2800 would silently
// freeze the layers at some arbitrary point in the cycle the next time it moves
// and quietly weaken every measurement below.
const freeze = (t) => p.evaluate(([names, tt]) => {
  document.getAnimations().forEach((a) => {
    if (!names.includes(a.animationName)) return;
    const d = a.effect.getTiming().duration;
    a.pause();
    a.currentTime = tt * (typeof d === 'number' ? d : 2800);
  });
}, [NAMES, t]);

// Two screenshots of the same view, one at the trough and one at the peak of
// the 2.8s cycle, decoded to a luminance grid. The DIFFERENCE is the glow.
async function litMap() {
  await freeze(0);
  await p.waitForTimeout(50);
  const dim = await p.screenshot();
  await freeze(0.5);
  await p.waitForTimeout(50);
  const lit = await p.screenshot();
  // Decode in the page — no image library in this repo's toolchain, and the
  // browser already has one.
  return p.evaluate(async ([a, c]) => {
    const load = (bytes) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = 'data:image/png;base64,' + bytes;
    });
    const grid = async (bytes) => {
      const im = await load(bytes);
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const out = new Float32Array(cv.width * cv.height);
      for (let i = 0; i < out.length; i += 1) {
        out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      }
      return { w: cv.width, h: cv.height, v: out };
    };
    const A = await grid(a);
    const B = await grid(c);
    const diff = new Float32Array(A.v.length);
    for (let i = 0; i < diff.length; i += 1) diff[i] = B.v[i] - A.v[i];
    return { w: A.w, h: A.h, diff: Array.from(diff), dpr: devicePixelRatio };
  }, [dim.toString('base64'), lit.toString('base64')]);
}

// How much light lands inside a CSS rect, and how much of it is covered.
function inRect(map, r) {
  const s = map.w / 430;                       // device px per CSS px
  const x0 = Math.max(0, Math.round(r.x * s));
  const y0 = Math.max(0, Math.round(r.y * s));
  const x1 = Math.min(map.w, Math.round((r.x + r.width) * s));
  const y1 = Math.min(map.h, Math.round((r.y + r.height) * s));
  let n = 0; let hit = 0; let sum = 0; let max = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const d = map.diff[y * map.w + x];
      n += 1;
      if (d > 3) { hit += 1; sum += d; }
      if (d > max) max = d;
    }
  }
  return { cover: n ? hit / n : 0, mean: hit ? sum / hit : 0, max, px: n };
}

const rects = (ids) => p.evaluate((list) => {
  const out = {};
  for (const id of list) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.display === 'none') continue;
    out[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return out;
}, ids);

const openPanel = async () => {
  const { x, y } = await p.evaluate(() => {
    const r = window.__title.optionsRect(window.__game.titleBox);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
  await p.mouse.click(x, y);
  await p.waitForTimeout(450);
};

// ── OPTIONS: his four amber labels. THE PAINTED ✕ IS GONE ────────────────
// Client: "remove the x from the options menu." It was in his plate, not in
// CSS, so it is erased at the cut (tools/cut_cabinet.py) and #panelClose is
// display:none in both cabinet views. FOUR here, not five — and the count is
// asserted rather than the list simply shortened, because a control silently
// vanishing from his panel is exactly what this file exists to catch.
await openPanel();
console.log('\nOPTIONS menu');
let map = await litMap();
let rs = await rects(['btnMenuBoard', 'btnMenuHow', 'btnMenuSettings', 'btnMenuClose']);
check('all four painted controls are on screen', Object.keys(rs).length === 4,
  Object.keys(rs).join(' '));
check('and no ✕ exists at all', await p.evaluate(() =>
  document.getElementById('panelClose') === null));
for (const [id, r] of Object.entries(rs)) {
  const m = inRect(map, r);
  check(`${id} lights up`, m.max > 12 && m.cover > 0.01,
    `cover ${(m.cover * 100).toFixed(1)}% mean +${m.mean.toFixed(0)} max +${m.max.toFixed(0)}`);
}
// ⚠️ THE BOX TEST. His menu buttons are drawn as amber rounded frames, and the
// whole point of this rework is that the FRAME does not glow. A frame lighting
// up would put light along the rect's own border and nowhere else, so compare a
// 6px ring just inside each edge against the middle of the button: the middle
// must be the brighter of the two.
for (const [id, r] of Object.entries(rs)) {
  const edge = 5;
  const ring = [
    inRect(map, { x: r.x, y: r.y, width: r.width, height: edge }),
    inRect(map, { x: r.x, y: r.y + r.height - edge, width: r.width, height: edge }),
    inRect(map, { x: r.x, y: r.y, width: edge, height: r.height }),
    inRect(map, { x: r.x + r.width - edge, y: r.y, width: edge, height: r.height }),
  ];
  const worst = Math.max(...ring.map((m) => m.cover));
  const mid = inRect(map, {
    x: r.x + r.width * 0.2, y: r.y + r.height * 0.3,
    width: r.width * 0.6, height: r.height * 0.4,
  });
  check(`${id} glows in the middle, not around the edge`, mid.cover > worst * 1.5 + 0.02,
    `middle ${(mid.cover * 100).toFixed(1)}% vs edge ${(worst * 100).toFixed(1)}%`);
}
// Nothing that is not a control may light up. The housing's own controls — the
// joystick, the DOOR/BELL/LIGHTS row, the marta badge — are paint, not buttons.
const dark = await p.evaluate(() => {
  const s = document.getElementById('panelScreen').getBoundingClientRect();
  return { x: 8, y: s.bottom + 30, width: 414, height: 120 };
});
let m = inRect(map, dark);
check('the housing below the screen stays dark', m.cover < 0.005,
  `cover ${(m.cover * 100).toFixed(2)}%`);
// And the layer must not be in the way of a thumb.
const eaten = await p.evaluate(() => {
  const out = [];
  for (const id of ['btnMenuBoard', 'btnMenuHow', 'btnMenuSettings', 'btnMenuClose']) {
    const r = document.getElementById(id).getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (hit && hit.id !== id) out.push(`${id}->${hit.id || hit.tagName}`);
  }
  return out;
});
check('the glow layer eats no taps', eaten.length === 0, eaten.join(' '));

// ── SETTINGS ─────────────────────────────────────────────────────────────
await p.click('#btnMenuSettings');
await p.waitForTimeout(450);
console.log('\nSETTINGS');
map = await litMap();
rs = await rects(['btnBack']);
m = inRect(map, rs.btnBack);
check('BACK lights up', m.max > 12 && m.cover > 0.01,
  `cover ${(m.cover * 100).toFixed(1)}% max +${m.max.toFixed(0)}`);

// The pulse itself has to be real, running, and SLOW — "they should slowly
// pulse so people can know that they're accessible". Graded HERE, on a
// cabinet, because the cabinets are where the bloom lives now: the sign-up
// left the painted plates for a real-DOM card (see below) and took its
// glyphglow with it.
const anims = await p.evaluate((names) => document.getAnimations()
  .filter((a) => names.includes(a.animationName))
  .map((a) => ({ n: a.animationName, d: a.effect.getTiming().duration,
    state: a.playState })), NAMES);
const pulse = anims.find((a) => a.n === 'glyphglow');
check('the pulse is running on the cabinet', !!pulse, JSON.stringify(anims));
check('and it is a slow breath, not a blink', !!pulse && pulse.d >= 3000 && pulse.d <= 6000,
  pulse ? `${pulse.d}ms` : 'absent');

// ── THE SIGN-UP CABINET, where he was looking when he asked ──────────────
await p.click('#btnBack');
await p.waitForTimeout(400);
await p.click('#btnMenuBoard');
await p.waitForTimeout(600);
console.log('\nleaderboard ticket (real DOM text)');
map = await litMap();
rs = await rects(['btnRegister', 'btnShare', 'btnBoardBack']);
for (const [id, r] of Object.entries(rs)) {
  const m2 = inRect(map, r);
  check(`${id} text glows`, m2.max > 12 && m2.cover > 0.01,
    `cover ${(m2.cover * 100).toFixed(1)}% max +${m2.max.toFixed(0)}`);
}

await p.click('#btnRegister');
await p.waitForTimeout(650);
console.log('\nENTER CONTEST card (real DOM, no bloom)');
// ⚠️ THE SIGN-UP LEFT THE PAINTED SURFACES. Client: "the registration form
// should be the color scheme of the game" — it is his Jandé registry card
// now, real DOM in the game's navy and gold, and its affordances are the
// controls THEMSELVES: a glossy gold gradient button, an underlined skip
// link. No bloom layer, no glyphglow, no transparent boxes over paint. What
// this section guards is that contract — and that the old plate's glow
// machinery never quietly comes back to a screen that no longer has ink for
// it. (tools/harness/entryfit.mjs owns the card's fit, palette and taps.)
const card = await p.evaluate(() => {
  const plate = document.getElementById('entryPlate');
  const after = getComputedStyle(plate, '::after');
  const save = getComputedStyle(document.getElementById('btnSave'));
  const skip = getComputedStyle(document.getElementById('btnSkip'));
  const x = document.getElementById('btnFormX');
  const glow = document.getAnimations()
    .filter((a) => a.animationName === 'glyphglow').length;
  return {
    bloom: after.content !== 'none' && after.backgroundImage !== 'none',
    saveGradient: /linear-gradient/.test(save.backgroundImage),
    saveRaised: save.boxShadow !== 'none',
    skipUnderlined: /underline/.test(skip.textDecorationLine),
    xShown: x && x.getBoundingClientRect().width > 0,
    glow,
  };
});
check('no bloom layer on the card — the plate is gone', !card.bloom);
check('no glyphglow runs on this screen', card.glow === 0, `${card.glow} running`);
check('the gold button is a real gradient', card.saveGradient);
check('and visibly raised — the bevel IS its affordance', card.saveRaised);
check('the skip link is underlined, not a second button', card.skipUnderlined);
check('the dead ✕ stays dead', !card.xShown);
const eaten2 = await p.evaluate(() => {
  const out = [];
  for (const id of ['btnSave', 'btnSkip', 'btnFormInfo']) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (hit && hit.id !== id && !el.contains(hit)) out.push(`${id}->${hit.id || hit.tagName}`);
  }
  return out;
});
check('nothing sits between a thumb and the card\'s controls', eaten2.length === 0,
  eaten2.join(' '));

// ⚠️ AND IT STILL BREATHES WITH MOTION REDUCED. It used to stop dead there,
// which is the likeliest reason he asked for a pulse he had already been sent:
// with Reduce Motion on in iOS Accessibility, Safari reports it and the glow was
// frozen. Slower and shallower honours the setting's purpose — no vestibular
// motion — while keeping the affordance he asked for.
const still = await ctx.newPage();
await still.emulateMedia({ reducedMotion: 'reduce' });
await still.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
await still.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await still.waitForTimeout(2600);
const rm = await still.evaluate(() => {
  const r = window.__title.optionsRect(window.__game.titleBox);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
});
await still.mouse.click(rm.x, rm.y);
await still.waitForTimeout(500);
const reduced = await still.evaluate(() => {
  const a = document.getAnimations().find((x) => x.animationName === 'glyphglowcalm');
  const fast = document.getAnimations().filter((x) => x.animationName === 'glyphglow').length;
  // Sample the trough and the peak, so this measures the actual depth of the
  // breath rather than trusting the keyframe text.
  const at = (t) => {
    a.pause(); a.currentTime = t * a.effect.getTiming().duration;
    return parseFloat(getComputedStyle(document.getElementById('panelScreen'), '::after').opacity);
  };
  return a
    ? { dur: a.effect.getTiming().duration, low: at(0), high: at(0.5), fast }
    : { missing: true, fast };
});
check('reduced motion still breathes, slower and shallower',
  !reduced.missing && reduced.fast === 0 && reduced.dur >= 6000
  && reduced.low >= 0.5 && reduced.high > reduced.low + 0.15,
  JSON.stringify(reduced));

const bad = checks.filter(([, ok]) => !ok).length;
console.log('\n' + (bad === 0 ? `ALL ${checks.length} PASS` : `${bad} of ${checks.length} FAIL`));
await b.close();
process.exit(bad === 0 ? 0 : 1);
