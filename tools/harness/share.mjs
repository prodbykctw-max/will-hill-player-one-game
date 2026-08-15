// SHARE MY SCORE — does the sheet get a real card, and do the fallbacks land?
//
// A harness cannot open a real OS share sheet, so it proves the CONTRACT at
// the boundary instead: what navigator.share is handed, what the desktop
// fallback actually does, and that the PNG is a genuine card with the score
// drawn on it rather than a blank re-encode of the artwork.
//
//   1. Phone-shaped context (share stubbed): tap SHARE → share() received a
//      File, image/png, non-trivial, and text carrying the score + GAME_URL.
//      The File is then decoded IN PAGE and its YOUR-RANK band compared
//      against the raw card asset — the drawn row must differ from the empty
//      artwork, or the card is decorative.
//   2. Desktop-shaped context (share deleted): tap SHARE → an <a download>
//      click fired with a .png name and the caption landed on the clipboard.
//      Also covers the zero-runs copy, then the gameOver-banking fix: dying
//      must bank the score locally (it already submits to the contest), so
//      the NEXT share carries it.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/share.mjs
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const checks = [];
const check = (what, pass, detail = '') => {
  checks.push([what, pass]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};
const GAME_URL = 'https://prodbykctw-max.github.io/will-hill-player-one-game/';

// ── 1. the share sheet's side of the contract ──────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.addInitScript(() => {
    try {
      localStorage.setItem('wh_local_runs',
        JSON.stringify([{ name: 'TESTER', score: 12345, t: 1, me: true }]));
      localStorage.setItem('wh_name', 'TESTER');
      // ⚠️ REGISTERED, NOW REQUIRED. Sharing is gated on entering the contest
      // — "you shouldn't be able to share your score until you enter the
      // contest" — so an unregistered profile no longer even shows the
      // button. The card this harness checks is an entrant's card.
      localStorage.setItem('wh_contest_reg',
        JSON.stringify({ phone: '4045550123', email: 'tester@example.com' }));
    } catch (_e) { /* */ }
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = (d) => {
      const f = d.files && d.files[0];
      window.__sharedFile = f || null;
      window.__shared = {
        files: d.files ? d.files.length : 0,
        type: f ? f.type : null, size: f ? f.size : 0,
        text: d.text || '', title: d.title || '',
      };
      return Promise.resolve();
    };
  });
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });
  await p.evaluate(() => window.__panel.open('board'));
  await p.waitForTimeout(900);                    // prepareShareCard renders here
  await p.click('#btnShare');
  // ⚠️ POLL, DO NOT SLEEP — see the same note on the desktop block below.
  // Encoding the 852x1846 card to PNG took ~4s on a loaded machine and this
  // fixed 400ms reported the whole share feature as dead.
  await p.waitForFunction(() => !!window.__shared, null, { timeout: 30000 }).catch(() => {});
  const s = await p.evaluate(() => window.__shared || null);
  check('share() was called with exactly one file', !!s && s.files === 1, JSON.stringify(s && { files: s.files }));
  check('the file is a real PNG, not a stub', !!s && s.type === 'image/png' && s.size > 50000,
    s ? `${s.type} ${s.size}B` : 'no call');
  check('the caption carries the score', !!s && s.text.includes('12,345'), s ? s.text : '');
  check('and the way back to the game', !!s && s.text.includes(GAME_URL));

  const img = await p.evaluate(async () => {
    const f = window.__sharedFile;
    if (!f) return null;
    const bm = await createImageBitmap(f);
    const cv = document.createElement('canvas');
    cv.width = bm.width; cv.height = bm.height;
    const c = cv.getContext('2d');
    c.drawImage(bm, 0, 0);
    // The raw artwork, for the empty-band reference.
    const bgUrl = getComputedStyle(document.getElementById('lbCard'))
      .backgroundImage.slice(5, -2);
    const raw = await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = bgUrl;
    });
    const cv2 = document.createElement('canvas');
    cv2.width = raw.naturalWidth; cv2.height = raw.naturalHeight;
    cv2.getContext('2d').drawImage(raw, 0, 0);
    const band = (g, W, H) => g.getImageData(
      Math.round(0.12 * W), Math.round(0.79 * H),
      Math.round(0.78 * W), Math.round(0.06 * H)).data;
    const a = band(c, cv.width, cv.height);
    const bnd = band(cv2.getContext('2d'), cv2.width, cv2.height);
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, bnd.length); i += 4) {
      if (Math.abs(a[i] - bnd[i]) + Math.abs(a[i + 1] - bnd[i + 1])
        + Math.abs(a[i + 2] - bnd[i + 2]) > 60) diff++;
    }
    return { w: bm.width, h: bm.height, inkPx: diff };
  });
  check('the card decodes at the artwork\'s own size',
    !!img && img.w === 852 && img.h === 1846, img ? `${img.w}x${img.h}` : 'no file');
  check('the YOUR-RANK band actually carries the drawn score',
    !!img && img.inkPx > 400, img ? `${img.inkPx} ink pixels vs the empty card` : '');
  await ctx.close();
}

// ── 2. the desktop fallback, the zero-runs copy, and gameOver banking ─────
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
  await p.addInitScript(() => {
    delete Navigator.prototype.share;
    delete Navigator.prototype.canShare;
    localStorage.setItem('wh_contest_reg',
      JSON.stringify({ phone: '4045550123', email: 'tester@example.com' }));
    window.__downloads = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { window.__downloads.push(this.download); return; }
      return origClick.call(this);
    };
    window.__clip = null;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window.__clip = t; return Promise.resolve(); } },
    });
  });
  await p.goto('http://localhost:5199/?tod=night', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null, { timeout: 25000 });

  // Zero runs on this fresh profile: the button shares the GAME.
  await p.evaluate(() => window.__panel.open('board'));
  await p.waitForTimeout(900);
  await p.click('#btnShare');
  // ⚠️ WAIT FOR THE WORK, NOT FOR A GUESS AT HOW LONG IT TAKES.
  // This was `waitForTimeout(400)` and it started reporting the desktop
  // fallback as dead — no download, no clipboard, no error. Measured, the
  // click lands at 0ms and the file appears at about 4s: the card is an
  // 852x1846 canvas encoded to a 2.5MB PNG, and how long that takes depends
  // on what else the machine is doing. 400ms was never a contract, just a
  // number that used to be enough. Poll the condition instead.
  await p.waitForFunction(() => window.__downloads.length > 0 && window.__clip,
    null, { timeout: 30000 }).catch(() => {});
  const first = await p.evaluate(() => ({
    dl: window.__downloads, clip: window.__clip,
    note: document.getElementById('boardNote').textContent,
  }));
  check('desktop: the card downloads as a PNG',
    first.dl.length === 1 && /\.png$/.test(first.dl[0]), JSON.stringify(first.dl));
  check('desktop: the caption lands on the clipboard, with the URL',
    !!first.clip && first.clip.includes(GAME_URL), first.clip || '');
  check('desktop: with no runs yet it shares the game, not a score',
    !!first.clip && !first.clip.includes('$'), first.clip || '');
  check('desktop: the note says what happened',
    /saved/i.test(first.note), first.note);

  // Die with money in hand: the score must be banked locally (the fix), and
  // the next share must carry it.
  await p.evaluate(() => window.__panel.close());
  const banked = await p.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const g = window.__game;
    window.__startStage(0);
    for (let k = 0; k < 4; k++) await frame();
    g.score = 777;
    g.player.y = 99999; g.player.vy = 0;      // off the end of the world
    for (let k = 0; k < 10 && g.screen !== 'gameOver'; k++) await frame();
    let runs = [];
    try { runs = JSON.parse(localStorage.getItem('wh_local_runs') || '[]'); } catch (_e) { /* */ }
    return { screen: g.screen, runs };
  });
  check('a knocked-down run banks its score locally',
    banked.screen === 'gameOver' && banked.runs.some((r) => r.score === 777),
    JSON.stringify(banked));

  await p.evaluate(() => { window.__game.screen = 'title'; window.__panel.open('board'); });
  await p.waitForTimeout(900);
  await p.click('#btnShare');
  // Same again — the second card is the same size and the same wait.
  await p.waitForFunction(() => window.__clip && window.__clip.includes('$'),
    null, { timeout: 30000 }).catch(() => {});
  const second = await p.evaluate(() => window.__clip);
  check('the next share carries the banked score',
    !!second && second.includes('777'), second || '');
  await ctx.close();
}

console.log('');
console.log(checks.every(([, ok]) => ok)
  ? `ALL ${checks.length} PASS`
  : `FAILED: ${checks.filter(([, ok]) => !ok).map(([w]) => w).join(', ')}`);
await b.close();
