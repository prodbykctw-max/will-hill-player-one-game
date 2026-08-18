// HOW TO PLAY IS ONE PAGE, HIS FRAMES, AND ALMOST NO WORDS.
//
// Client: "make the how to play instructions one page like it was
// originally… based off the Jandé once upon a time instruction page. The
// layout, not the art design." And: "I want to keep the images, but simplify
// the text instructions. I had feedback that it was too many words — dumb it
// down, make it really easy to digest."
//
// ⚠️ THIS REPLACES howswipe.mjs, WHICH GRADED A FOUR-PAGE SWIPE. Half of that
// file tested scroll-snap, dots and a tap-to-page fallback — machinery that no
// longer exists, and a harness that grades a superseded product is worse than
// no harness. The half that was about the PROMISE rather than the mechanism is
// carried over intact, because those faults are still possible:
//
//   * every frame is a real loaded image, not a broken src;
//   * NO ✓ ANYWHERE WITHOUT ITS ✕. This is the one that matters. The original
//     one-page version shipped `champagne` and `money` as lone ✓s with no ✕
//     and no lesson, and that — not the one-page format — is what got it
//     rejected image by image. Going back to one page puts that fault back
//     within reach, so it is checked harder than anything else here;
//   * the champagne pair REALLY differs where it matters — decoded in-page,
//     the ✓ frame must read bluer than the ✕ in its bluest 1%, because "the
//     bags turn blue" is the whole lesson and a pair that does not show it is
//     decoration. Same statistic tools/shoot_howto.mjs gates on, applied to
//     what actually shipped.
//
// And two new ones, for the two things this rewrite was FOR:
//
//   * ⚠️ THE WORD COUNT HAS A CEILING. "Too many words" was the complaint and
//     ~90 words became ~20; nothing stops that creeping back one helpful
//     clarification at a time except a number that fails.
//   * ⚠️ IT FITS ON ONE SCREEN, at 430x932 AND at 320x568. "One page" that
//     scrolls is not one page. This is the check that caught the small phone
//     overrunning by 47px.
//
//   PLAYWRIGHT=... CHROMIUM=... BASE=... node tools/harness/howpage.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (w, ok, d = '') => {
  checks.push([w, ok]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${w}${d ? '   ' + d : ''}`);
};

// The four lessons, in his order, and the shots each one must carry.
const LESSONS = ['pothole', 'manhole', 'ninja', 'champagne'];
// ⚠️ RAISED FROM 34 TO 46, DELIBERATELY AND ONCE. The cap exists so the copy
// cannot creep back into paragraphs one helpful clarification at a time — so
// moving it has to be an argued act, not a convenience. What changed: three
// CONTROL rows were added (Move / Jump / Dash), which are new rows rather than
// new prose. The four lesson rows are still ~4 words each and did not move.
// If this number needs raising again, say why in the same commit.
const WORD_CAP = 46;

const open = async (p) => {
  await p.goto(`${BASE}/?tod=night`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
    null, { timeout: 25000 });
  await p.evaluate(() => window.__panel.open('menu'));
  await p.waitForTimeout(400);
  await p.click('#btnMenuHow');
  await p.waitForTimeout(600);
};

const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await open(p);

// ── it is a LIST, and the pager is gone ────────────────────────────────────
const shape = await p.evaluate(() => ({
  list: !!document.getElementById('howList'),
  pager: !!document.getElementById('howPager'),
  dots: !!document.getElementById('howDots'),
  rows: [...document.querySelectorAll('#howList li')].map((li) => ({
    shots: [...li.querySelectorAll('.howShot')].map((i) => ({
      shot: i.dataset.shot, loaded: i.complete && i.naturalWidth > 50,
    })),
    marks: [...li.querySelectorAll('.mark')].map((m) => m.textContent.trim()),
    txt: (li.querySelector('.howTxt')?.textContent || '').trim(),
  })),
}));
check('it is one list, not a pager', shape.list && !shape.pager && !shape.dots,
  JSON.stringify({ list: shape.list, pager: shape.pager, dots: shape.dots }));

const lessonRows = shape.rows.filter((r) => r.shots.length);
check('four lesson rows, one per hazard', lessonRows.length === 4,
  `${lessonRows.length} rows`);

// ── his order, his pairing ────────────────────────────────────────────────
for (let i = 0; i < LESSONS.length; i++) {
  const r = lessonRows[i];
  const want = [`${LESSONS[i]}-bad`, `${LESSONS[i]}-good`];
  check(`${LESSONS[i]}: ✕ frame then ✓ frame, in that order`,
    !!r && JSON.stringify(r.shots.map((s) => s.shot)) === JSON.stringify(want),
    JSON.stringify(r?.shots.map((s) => s.shot)));
  check(`${LESSONS[i]}: both frames really loaded`,
    !!r && r.shots.length === 2 && r.shots.every((s) => s.loaded),
    JSON.stringify(r?.shots.map((s) => s.loaded)));
  check(`${LESSONS[i]}: marked ✕ then ✓`,
    !!r && JSON.stringify(r.marks) === JSON.stringify(['✕', '✓']),
    JSON.stringify(r?.marks));
}

// ⚠️ THE FAULT THAT KILLED THE FIRST ONE-PAGE VERSION.
const orphans = await p.evaluate(() => {
  const bad = [];
  for (const li of document.querySelectorAll('#howList li')) {
    const marks = [...li.querySelectorAll('.mark')].map((m) => m.textContent.trim());
    if (marks.includes('✓') && !marks.includes('✕')) {
      bad.push(li.querySelector('.howShot')?.dataset.shot || 'unknown');
    }
  }
  return bad;
});
check('no ✓ anywhere without its ✕ — the fault that killed the old one-pager',
  orphans.length === 0, orphans.join(' '));

// ── the words, capped ─────────────────────────────────────────────────────
const words = await p.evaluate(() => [
  ...document.querySelectorAll('#howList .howTxt'),
  document.getElementById('howIntro'),
].filter(Boolean).map((n) => n.textContent.trim()).join(' ')
  .split(/\s+/).filter(Boolean).length);
check(`the page stays short — ${WORD_CAP} words or fewer`, words <= WORD_CAP,
  `${words} words`);

// The two numbers that earn their place stay honest.
const copy = await p.evaluate(() =>
  [...document.querySelectorAll('#howList .howTxt')].map((n) => n.textContent).join(' '));
check('the ninja row still carries the real stomp payout', /\+?\$50/.test(copy), copy.slice(0, 90));
check('the champagne row still carries the real duration', /\b9\b/.test(copy));

// ── the controls are finally taught, AND THEY LOOK LIKE THE REAL ONES ─────
//
// Client: "the buttons should reflect the actual buttons on the screen. And
// don't forget to add dash." So this is not "is there a badge" — it is
// whether the badge is the same object the thumb will meet. The live pad's
// COMPUTED style is read out of #touch and compared, so a restyle of the pads
// that forgets this page fails here rather than shipping two looks.
check('the page tells you how to move, jump AND dash',
  /move/i.test(copy) && /jump/i.test(copy) && /roll|dash/i.test(copy), copy.slice(0, 80));

// ⚠️ EACH BADGE AGAINST ITS OWN PAD, not against "a pad". The first version
// of this check compared all four to document.querySelector('#touch .pad'),
// which returns #tL — so JUMP was being graded against a movement arrow. It
// failed, correctly, and finding out why is what turned up that the pads are
// not one look at all: #tL/#tR are rounded rects, #tJump is an 82px BLUE
// circle, #tDash a 64px amber one.
//
// Sizes are deliberately not compared — the badges are scaled down to sit in
// a row. What is compared is everything a player recognises the control BY:
// its colour, its border, its ink, its weight, and whether it is round.
const pads = await p.evaluate(() => {
  const PAIRS = [['◀', 'tL'], ['▶', 'tR'], ['JUMP', 'tJump'], ['DASH', 'tDash']];
  // ⚠️ NO letter-spacing AND NO font-size. Both are legitimately different:
  // the badges are scaled down to sit in a row, and `letter-spacing: .06em`
  // resolves against whatever font-size that leaves. Comparing them would fail
  // forever for a reason that is not a defect. What IS compared is everything
  // a player recognises the control by and which does not depend on its size.
  const want = ['background-color', 'border-top-color', 'color', 'font-weight'];
  const badges = [...document.querySelectorAll('#howList .howPad')];
  const out = { labels: badges.map((b) => b.textContent.trim()), bad: [] };
  // The pads only render during play (body.touch.playing), so measure them
  // where they are: force the class on, read, put it back.
  const hadTouch = document.body.classList.contains('touch');
  const hadPlaying = document.body.classList.contains('playing');
  document.body.classList.add('touch', 'playing');
  const pick = (el) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(want.map((k) => [k, cs.getPropertyValue(k)]));
  };
  for (const [label, id] of PAIRS) {
    const real = document.getElementById(id);
    const badge = badges.find((b) => b.textContent.trim() === label);
    if (!real || !badge) { out.bad.push(`${label}:missing`); continue; }
    const r = pick(real); const g = pick(badge);
    const diff = want.filter((k) => g[k] !== r[k]);
    if (diff.length) out.bad.push(`${label}:${diff.join(',')}`);
    // Round is round: the real JUMP and DASH are 50% and must read as discs.
    const cs = getComputedStyle(badge);
    const round = parseFloat(cs.borderTopLeftRadius) >= parseFloat(cs.height) * 0.45;
    const realRound = parseFloat(getComputedStyle(real).borderTopLeftRadius)
      >= parseFloat(getComputedStyle(real).height) * 0.45;
    if (round !== realRound) out.bad.push(`${label}:shape`);
  }
  if (!hadTouch) document.body.classList.remove('touch');
  if (!hadPlaying) document.body.classList.remove('playing');
  return out;
});
check('there are four control badges — ◀ ▶ JUMP DASH',
  JSON.stringify(pads.labels) === JSON.stringify(['◀', '▶', 'JUMP', 'DASH']),
  JSON.stringify(pads.labels));
check("every badge matches the game's own pad — colour, ink and shape",
  pads.bad.length === 0, pads.bad.join(' | '));

// ── the champagne pair actually shows the mechanic ────────────────────────
const blue = await p.evaluate(async () => {
  const top1pc = (img) => {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    // The bags live in the lower half. ⚠️ TOP 1%, NOT THE TOP DECILE: the
    // four wads are about 2% of that region, so a decile averages the signal
    // away — measured ✕ 8.1 vs ✓ 10.9 on a pair that is VISIBLY blue. The
    // percentile follows the geometry; it was not moved to make a red check
    // green.
    const d = c2.getImageData(0, Math.floor(cv.height / 2), cv.width,
      Math.ceil(cv.height / 2)).data;
    const br = [];
    for (let i = 0; i < d.length; i += 4) br.push(d[i + 2] - d[i]);
    br.sort((x, y) => y - x);
    const top = br.slice(0, Math.max(1, Math.floor(br.length / 100)));
    return +(top.reduce((x, y) => x + y, 0) / top.length).toFixed(1);
  };
  const bad = document.querySelector('img[data-shot="champagne-bad"]');
  const good = document.querySelector('img[data-shot="champagne-good"]');
  await Promise.all([bad, good].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; }))));
  return { bad: top1pc(bad), good: top1pc(good) };
});
check("the champagne ✓ frame is really bluer where the bags are",
  blue.good - blue.bad >= 15, `✕ ${blue.bad}  ✓ ${blue.good}`);
await ctx.close();

// ── ONE PAGE MEANS ONE PAGE, on the small phone too ───────────────────────
for (const [w, h] of [[430, 932], [320, 568]]) {
  const c2 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await open(p2);
  const fit = await p2.evaluate(() => {
    const el = document.getElementById('panel');
    return { over: Math.max(0, el.scrollHeight - el.clientHeight),
      card: Math.round(document.getElementById('panelCard').getBoundingClientRect().height) };
  });
  check(`it fits on one screen at ${w}x${h}`, fit.over === 0,
    `card ${fit.card}px, overflow ${fit.over}px`);
  await c2.close();
}

await b.close();
console.log('');
const bad = checks.filter(([, o]) => !o);
console.log(bad.length ? 'FAILED: ' + bad.map(([w]) => w).join(', ')
  : `ALL ${checks.length} PASS`);
process.exit(bad.length ? 1 : 0);
