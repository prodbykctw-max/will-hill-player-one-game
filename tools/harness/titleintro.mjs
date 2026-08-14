// THE TITLE CARD ASSEMBLING ITSELF, frame by frame.
//
// The portrait plate is cut into TEN cards now. Seven are the objects that
// fly in — WILL HILL: and both red stars split out of what used to be one
// ragged "logo" card (tools/cut_title_extras.py) so his name can land before
// PLAYER ONE and the stars can land WITH it. The other three are the SKY:
// far clouds, the towers, near clouds, which do not fly in at all — they come
// up with the plate (see `backdrop` in title.js) and the clouds then drift
// across, the far ones passing BEHIND the skyline and the near ones in front.
// Three things about the assembly are worth a harness rather than a look:
//
//   1. NOTHING MAY DOUBLE. The base is the whole painting, so its copy of
//      every card is already sitting at the destination. If the backdrop
//      starts before the last card lands you get two of that card, which has
//      happened once already and shipped two PLAYER ONEs.
//   2. The controls that are NOT painted in — the relay pill, the music box —
//      have to arrive with the last layer, not before it.
//   3. Tapping mid-assembly must still work, because that is the skip.
//
//   PLAYWRIGHT=... SEAM_OUT=... node tools/harness/titleintro.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const OUT = process.env.SEAM_OUT || '.';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => { checks.push([w, ok]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`); };

const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

// Every card must actually have loaded. A missing image is silently skipped by
// the renderer, so the card would just never appear and the assembly would
// look "fine" with a hole in it.
const loaded = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  const spec = t.titleCards(window.__images);
  const imgs = window.__images || {};
  return spec.map((c) => ({
    key: c.key, depth: c.depth, sway: !!c.sway,
    backdrop: !!c.backdrop,
    // A cloud card carries `sprites`, not one `img` — every sprite in it has
    // to have loaded or a cloud silently never appears.
    ok: c.sprites
      ? c.sprites.length > 0 && c.sprites.every((s) => s.img && s.img.width)
      : !!(imgs[c.key] && imgs[c.key].width),
    sprites: c.sprites ? c.sprites.length : 0,
  }));
});
console.log('  cards:', loaded.map((c) => `${c.key}${c.sprites ? `(${c.sprites})` : ''}${c.ok ? '' : ' MISSING'}`).join(', '));
check('all ten cards loaded', loaded.length === 10 && loaded.every((c) => c.ok),
  JSON.stringify(loaded.map((c) => [c.key, c.ok])));
// The whole point of the three sky cards: far clouds, then the towers that
// hide them, then the near clouds that do not get hidden.
const order = loaded.map((c) => c.key);
check('the sky is layered far-clouds / towers / near-clouds',
  order[0] === 'tp_cloudsFar' && order[1] === 'tp_skyline' && order[2] === 'tp_cloudsNear',
  order.slice(0, 3).join(' -> '));
check('the towers do not sway', !loaded[1].sway);
check('the sky cards are backdrop, the seven objects are not',
  loaded.slice(0, 3).every((c) => c.backdrop) && loaded.slice(3).every((c) => !c.backdrop));
check('they are ordered far to near',
  loaded.every((c, i) => i === 0 || c.depth > loaded[i - 1].depth),
  loaded.map((c) => c.depth).join(' < '));

// Walk the intro clock and watch for the doubling. Sample points now run out
// to 180 — the street furniture lands by ~74, WILL HILL: by ~112, PLAYER ONE
// and both stars together by ~148 — so the final shots actually show the
// fully-settled card instead of stopping mid-assembly the way the old
// five-card schedule (last landing ~78) did.
const shots = [];
for (const t of [0, 14, 30, 46, 62, 78, 94, 112, 130, 148, 166, 180]) {
  await p.evaluate(async (tt) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__game.screenT = tt; window.__game.introAt = 0;
    await frame();
  }, t);
  shots.push({ t, b64: (await p.screenshot()).toString('base64') });
}
const fs = await import('fs');
fs.writeFileSync(`${OUT}/titleintro.json`, JSON.stringify(shots));

// The guard itself, read out of the module rather than trusted: the backdrop
// must not begin before the slowest card has landed. TITLE_COVER_ROWS was
// replaced by TITLE_SAFE (a {top,bottom} band, not a single row count) when
// the fit was reworked to split its crop across both ends — see stillscene.js.
const timing = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  return { cards: t.titleCards().length, safe: t.TITLE_SAFE };
});
check('the card list drives the timing', timing.cards === 10, JSON.stringify(timing));
check('TITLE_SAFE is a real top/bottom band',
  timing.safe && timing.safe.top > 0 && timing.safe.bottom > timing.safe.top,
  JSON.stringify(timing.safe));

// NO OTHER CARD MAY CARRY A STAR PIXEL. This is the exact bug the client
// caught live: "that star is still over the street sign." SAM's original cut
// of tp_pole bled into the right-hand star sitting beside the lamp post, so
// it rode along on the pole's early slide-in instead of landing with PLAYER
// ONE. tools/cut_title_extras.py now scrubs every other card against a
// dilated copy of the star mask on every re-cut — this checks the shipped
// assets rather than trusting that script ran.
const starLeak = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  const imgs = window.__images || {};
  const pts = { left: [48 / t.SRC_W, 338 / t.SRC_H], right: [808 / t.SRC_W, 339 / t.SRC_H] };
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const hits = [];
  for (const card of t.titleCards()) {
    if (card.key === 'tp_stars') continue;
    const img = imgs[card.key];
    if (!img || !img.width) continue;
    c.width = img.width; c.height = img.height;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    for (const [side, [fx, fy]] of Object.entries(pts)) {
      const x = Math.round(fx * img.width), y = Math.round(fy * img.height);
      const a = g.getImageData(x, y, 1, 1).data[3];
      if (a > 0) hits.push(`${card.key}/${side}(a=${a})`);
    }
  }
  return hits;
});
check('no card but tp_stars carries a star pixel', starLeak.length === 0,
  JSON.stringify(starLeak));

// And the skip still works mid-assembly.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(500);
await p.touchscreen.tap(215, 300);
await p.waitForTimeout(1700);
check('a tap during the assembly still starts the run',
  await p.evaluate(() => window.__game.screen) === 'playing');

// ── DO THE FAR CLOUDS ACTUALLY GO BEHIND THE TOWERS? ─────────────────────
//
// Card ORDER is asserted above and it is not enough: the towers card could be
// ordered correctly and still be transparent where a tower is, in which case
// a "far" cloud sails straight over the skyline and the order proved nothing.
// Client: "if it's a cloud that's supposed to be behind the building based on
// distance, I want it to move behind the building."
//
// ⚠️ AND IT CANNOT BE DONE BY COMPARING AGAINST THE TOWER'S COLOUR, which was
// the first attempt: reading the skyline card at a transparent pixel returns
// (0,0,0) because canvas stores premultiplied alpha, so the "reference" was
// black and every comparison against it was meaningless.
//
// The honest test needs no reference at all. Drive the clock to a frame where
// a far cloud is ON the tower, and to one where NOTHING is, and compare the
// two SCREEN pixels: if the cloud is genuinely behind, the tower looks the
// same either way. The near mirror must then differ, or "in front" is what is
// broken instead.
// ⚠️ BACK TO THE TITLE FIRST. The check immediately above taps to prove the
// assembly can be skipped — which STARTS A RUN, so by this point the canvas
// is showing the street, not the card. Probing it there reads gameplay
// pixels that never change no matter what the clouds do, which looked
// exactly like broken occlusion: identical dark values on every sample.
await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
await p.waitForTimeout(3000);

const occ = await p.evaluate(async () => {
  const t = await import('/src/render/title.js');
  const g = window.__game;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cv = document.querySelector('canvas');
  const c2 = cv.getContext('2d');
  const bx = g.titleBox, S = bx.dw / t.SRC_W;
  const spr = t.CLOUD_SPRITES;
  const P = (s) => t.SRC_W + s.w;
  const xAt = (s, k) => (((s.x + s.w + k * s.speed) % P(s)) + P(s)) % P(s) - s.w;

  // Where the towers card is genuinely opaque.
  const im = window.__images.tp_skyline;
  const oc = document.createElement('canvas');
  oc.width = im.width; oc.height = im.height;
  oc.getContext('2d').drawImage(im, 0, 0);
  const alphaAt = (x, y) => oc.getContext('2d').getImageData(x, y, 1, 1).data[3];

  // ⚠️ AND THE PROBE MUST BE CLEAR OF EVERY CARD THAT DRAWS LATER. The first
  // near-cloud probe landed at (790,428), under the lamp post — tp_pole is
  // drawn after the near clouds and quite correctly hid it, so a working
  // "in front" read as broken. Anything opaque in an object card is not a
  // place to ask this question.
  const overs = ['tp_signL', 'tp_signR', 'tp_hero', 'tp_pole', 'tp_wordmark',
    'tp_logo', 'tp_stars'].map((k) => {
    const i2 = window.__images[k];
    if (!i2 || !i2.width) return null;
    const c3 = document.createElement('canvas');
    c3.width = i2.width; c3.height = i2.height;
    c3.getContext('2d').drawImage(i2, 0, 0);
    return c3.getContext('2d');
  }).filter(Boolean);
  const coveredLater = (x, y) => overs.some((g2) => {
    for (let dy = -3; dy <= 3; dy += 3) {
      for (let dx = -3; dx <= 3; dx += 3) {
        if (g2.getImageData(Math.max(0, x + dx), Math.max(0, y + dy), 1, 1).data[3] > 8) return true;
      }
    }
    return false;
  });

  // ⚠️ THE SPRITE'S OWN ALPHA, NOT ITS BOUNDING BOX. A cloud is a wisp inside
  // a rectangle and most of that rectangle is empty — probing "is the box
  // over this point" put the probe in a transparent corner and the near-cloud
  // test read delta 0, i.e. "the cloud is not in front", when the cloud was
  // simply not THERE. Ask the pixels.
  const spriteCtx = {};
  for (const s of spr) {
    const i3 = window.__images[s.key];
    if (!i3 || !i3.width) continue;
    const c4 = document.createElement('canvas');
    c4.width = i3.width; c4.height = i3.height;
    c4.getContext('2d').drawImage(i3, 0, 0);
    spriteCtx[s.key] = c4.getContext('2d');
  }
  const covers = (s, k, x, y) => {
    const sx = xAt(s, k);
    const lx = Math.round(x - sx), ly = Math.round(y - s.y);
    if (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h) return false;
    const g3 = spriteCtx[s.key];
    return !!g3 && g3.getImageData(lx, ly, 1, 1).data[3] > 200;
  };
  const read = async (k, x, y) => {
    // ⚠️ PIN THE CARD TO ITS SETTLED STATE. The intro walk earlier in this
    // file leaves screenT wherever it stopped, and the assembly fades the
    // whole plate up out of black — so a probe taken while introT is still
    // inside INTRO_TICKS reads letterbox black and blames the occlusion for
    // it. Measured: (11,13,14) at a pixel that is (88,107,126) once settled.
    g.screenT = 100000; g.introAt = 0;
    g.tick = k; await frame(); await frame();
    const d = c2.getImageData(Math.round(bx.dx + x * S), Math.round(bx.dy + y * S), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const diff = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);

  // For a given cloud, find a probe inside a solid tower that it crosses,
  // plus a tick where it is there and a tick where no cloud is.
  // `pad` is how much solid tower must surround the probe. The FAR test needs
  // a generous margin because it asserts "nothing shows" and the plate draws
  // at about half scale, so one screen pixel straddles two source pixels and
  // a probe near the tower's feathered edge picks up real bleed. The NEAR
  // test asserts the opposite — "the cloud is plainly visible" — so it only
  // needs the point to BE a building, and demanding a wide solid margin there
  // just filters out every candidate.
  const trial = async (s, pad) => {
    for (let y = Math.max(0, s.y + 4); y < s.y + s.h - 4; y += 3) {
      for (let x = 20; x < t.SRC_W - 20; x += 7) {
        // ⚠️ SOLID OVER A NEIGHBOURHOOD, not just at the point. The plate is
        // drawn at about half scale, so one screen pixel straddles two source
        // pixels — probing a point one pixel inside the tower's feathered
        // edge read 14 levels of cloud bleed and called correct occlusion a
        // failure. Require the whole neighbourhood the screen pixel samples
        // from to be tower.
        let solidAround = true;
        for (let dy = -pad; dy <= pad && solidAround; dy++) {
          for (let dx = -pad; dx <= pad; dx++) {
            if (alphaAt(x + dx, y + dy) < 254) { solidAround = false; break; }
          }
        }
        if (!solidAround || coveredLater(x, y)) continue;
        let on = -1, off = -1;
        for (let k = 0; k < 30000 && (on < 0 || off < 0); k++) {
          const anyCloud = spr.some((q) => covers(q, k, x, y));
          if (on < 0 && covers(s, k, x, y)) on = k;
          if (off < 0 && !anyCloud) off = k;
        }
        if (on < 0 || off < 0) continue;
        const a = await read(on, x, y);
        const b = await read(off, x, y);
        return { key: s.key, x, y, on, off, withCloud: a, without: b, delta: diff(a, b) };
      }
    }
    return null;
  };
  const far = spr.filter((s) => !s.near).sort((a, b) => b.w - a.w);
  const near = spr.filter((s) => s.near).sort((a, b) => b.w - a.w);
  let f = null, n = null;
  for (const s of far) { f = await trial(s, 3); if (f) break; }
  for (const s of near) { n = await trial(s, 1); if (n) break; }
  return { far: f, near: n };
});
console.log('  far  :', JSON.stringify(occ.far));
console.log('  near :', JSON.stringify(occ.near));
check('a FAR cloud crossing a tower leaves the tower pixel unchanged',
  !!occ.far && occ.far.delta <= 6,
  occ.far ? `delta ${occ.far.delta} at (${occ.far.x},${occ.far.y})` : 'no far cloud crosses a tower');
check('a NEAR cloud crossing a tower DOES change it',
  !!occ.near && occ.near.delta > 20,
  occ.near ? `delta ${occ.near.delta} at (${occ.near.x},${occ.near.y})` : 'no near cloud crosses a tower');

console.log('');
console.log(checks.every(([, ok]) => ok) ? `ALL ${checks.length} PASS`
  : 'FAILED: ' + checks.filter(([, ok]) => !ok).map(([w]) => w).join(', '));
await b.close();
