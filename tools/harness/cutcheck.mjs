// WOULD A PLAYER ACTUALLY SEE THIS CUT?
//
// tools/cut_audit.py measures card masks and says which cuts LOOK wrong. It
// cannot say whether the wrongness reaches the screen, and those are different
// questions: a 99% flat cut on a card that slides 2.7px is invisible, and a
// distant skyline can be flat-topped against open sky and read perfectly.
//
// Answering it by hand cost more than the findings were worth. Three separate
// attempts put the camera somewhere the card was not even in frame — once past
// the end of the stage entirely, reading a STAGE CLEAR overlay — and each time
// the near-zero diff looked like "no defect" when it meant "no card".
//
// So this sweeps. For one card it walks the stage, and at every stop renders
// the frame twice — once at the card's shipped depth, once at BASE_DEPTH where
// the cut cannot be seen by construction — and diffs them. The stop with the
// LARGEST difference is where that card is most on-screen and most displaced,
// which is the only frame worth judging. Everything else is noise about where
// the camera happened to be.
//
// Reading the number: the diff is the whole visible consequence of that card's
// parallax, tear and all. High is not automatically bad — a big far card
// legitimately moves a lot of pixels. It says WHERE to look; the saved frames
// say what is there.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/cutcheck.mjs <stageIdx> <tod> <card> <depth>
//   PLAYWRIGHT=... CHROMIUM=... node tools/harness/cutcheck.mjs --all
const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const BASE = process.env.BASE || 'http://localhost:5199';
const OUT = process.env.OUT || 'shots/cutcheck';
const fs = await import('fs');
const PNG = (b) => b;

// The nine the audit still flags, with the stage index and time of day each
// lives on. eav 0, edgewood 1, underground 2, l5p 3.
const NINE = [
  { s: 1, tod: 'night', card: 'skyline',  d: 0.05 },
  { s: 1, tod: 'day',   card: 'trees',    d: 0.70 },
  { s: 1, tod: 'day',   card: 'parapet',  d: 0.20 },
  { s: 1, tod: 'night', card: 'lamps',    d: 0.62 },
  { s: 0, tod: 'day',   card: 'pole',     d: 0.76 },
  { s: 0, tod: 'night', card: 'pole',     d: 0.76 },
  { s: 0, tod: 'day',   card: 'cars',     d: 0.21 },
  { s: 0, tod: 'day',   card: 'skyline',  d: 0.07 },
  { s: 0, tod: 'night', card: 'skyline',  d: 0.07 },
];

// Walk stops across a stage. Stage length varies, so this stops early if the
// run ends — a frame of the STAGE CLEAR overlay is worse than no frame.
const STOPS = [900, 2000, 3200, 4400, 5600, 6800, 8000, 9200, 10400];

const b = await chromium.launch(process.env.CHROMIUM
  ? { executablePath: process.env.CHROMIUM } : {});

async function walkTo(p, x) {
  for (let i = 0; i < 900; i++) {
    const st = await p.evaluate((t) => {
      const g = window.__game;
      if (!g.player) return 'nop';
      if (g.screen !== 'playing') return g.screen;   // ended: stop walking
      g.hearts = 3; g.player.vy = 0;
      if (g.player.x >= t) return 'there';
      g.player.x += 34;
      return 'walking';
    }, x);
    if (st !== 'walking') return st;
    await p.waitForTimeout(2);
  }
  return 'timeout';
}

async function check({ s, tod, card, d }) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 620 },
    deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?tod=${tod}&relay=1`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__game && window.__game.screen === 'title',
    null, { timeout: 40000 });
  await p.waitForTimeout(2200);
  await p.evaluate((i) => window.__startStage(i), s);
  await p.waitForTimeout(2000);

  const present = await p.evaluate((k) =>
    !!window.__game.level.stage.bg.cards.find((c) => c.key === k), card);
  if (!present) { await ctx.close(); return { card, tod, err: 'card not on this stage' }; }

  let best = { pct: -1 };
  for (const stop of STOPS) {
    const st = await walkTo(p, stop);
    if (st !== 'there') break;                     // stage ended; stop here
    // ⚠️ LET THE CAMERA STOP FIRST. It lerps toward the player every frame and
    // converges over about a second and a half; shooting 320ms after the last
    // step catches it mid-slide, and a sliding camera moves every pixel in the
    // frame. That put the noise floor at 6-20% and buried a 15px card shift
    // completely — eight of nine cards read as "no difference" purely because
    // the control was as noisy as the signal.
    await p.evaluate(() => { const g = window.__game; if (g.player) g.player.vx = 0; });
    await p.waitForTimeout(1800);
    // ⚠️ A CONTROL SHOT, OR THE NUMBER IS MEANINGLESS. The game keeps running
    // between captures: the camera lerps toward the player, clouds drift,
    // lamps pulse. A first pass without this measured 21% "difference" on a
    // card that had barely moved, because the whole frame had slid a pixel.
    // Three shots — own, base, own again — so diff(own,own2) is the animation
    // noise floor and anything at or below it is not the card.
    const shots = {};
    // ⚠️ THE STAGE CAN CHANGE UNDER THIS, AND IT THREW. walkTo() stops the
    // instant the player is at the stop, but the game keeps running through
    // the 1800ms settle and the three captures — long enough, at the far
    // stops, to cross the finish and load the NEXT stage, whose cards have
    // different keys. `.find(...).depth = v` then read `.depth` off undefined
    // and took the whole sweep down mid-table. The presence check at the top
    // of check() cannot cover this: it is true when it runs and false 2s
    // later. So every write re-asks, and a stop that moved on is abandoned
    // rather than measured — which is the same rule as line 90, applied to
    // the window that line 90 does not cover.
    let moved = false;
    for (const [tag, depth] of [['own', d], ['base', 0.5], ['own2', d]]) {
      const ok = await p.evaluate(([k, v]) => {
        const g = window.__game;
        if (!g || g.screen !== 'playing' || !g.level) return false;
        const c = (g.level.stage.bg.cards || []).find((x) => x.key === k);
        if (!c) return false;
        c.depth = v;
        return true;
      }, [card, depth]);
      if (!ok) { moved = true; break; }
      // Short, so cloud drift and the idle cycle move as little as possible
      // between the three captures.
      await p.waitForTimeout(110);
      shots[tag] = await p.screenshot();
    }
    if (moved) break;
    // Compare as raw PNG bytes is useless; decode in-page instead.
    const diff = async (a, c) => p.evaluate(async ([x, y]) => {
      const load = (b64) => new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.src = 'data:image/png;base64,' + b64;
      });
      const [A, C] = await Promise.all([load(x), load(y)]);
      const cv = document.createElement('canvas');
      cv.width = A.width; cv.height = A.height;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(A, 0, 0);
      const da = g.getImageData(0, 0, cv.width, cv.height).data;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(C, 0, 0);
      const dc = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - dc[i]) > 12 || Math.abs(da[i + 1] - dc[i + 1]) > 12
            || Math.abs(da[i + 2] - dc[i + 2]) > 12) n++;
      }
      return (n * 400) / da.length;
    }, [a, c]);
    const signal = await diff(shots.own.toString('base64'),
                              shots.base.toString('base64'));
    const noise = await diff(shots.own.toString('base64'),
                             shots.own2.toString('base64'));
    const pct = Math.max(0, signal - noise);
    if (pct > best.pct) {
      best = { pct, signal, noise, stop, own: shots.own, base: shots.base };
    }
  }
  await ctx.close();
  if (best.pct < 0) return { card, tod, err: 'never reached a walkable stop' };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `s${s}-${tod}-${card}`;
  fs.writeFileSync(`${OUT}/${tag}-own.png`, PNG(best.own));
  fs.writeFileSync(`${OUT}/${tag}-base.png`, PNG(best.base));
  return { card, tod, s, d, pct: best.pct, signal: best.signal,
           noise: best.noise, stop: best.stop, tag };
}

const args = process.argv.slice(2);
const jobs = args[0] === '--all' || !args.length ? NINE
  : [{ s: +args[0], tod: args[1], card: args[2], d: +args[3] }];

for (const j of jobs) {
  const r = await check(j);
  if (r.err) console.log(`  ${(r.tod + ' ' + r.card).padEnd(22)} — ${r.err}`);
  else console.log(`  stage${r.s} ${(r.tod + ' ' + r.card).padEnd(18)} d=${r.d}`
    + `  signal ${r.signal.toFixed(1)}% - noise ${r.noise.toFixed(1)}%`
    + ` = ${r.pct.toFixed(1)}%  at x=${r.stop}`
    + `${r.pct < 1 ? '   (nothing a player would see)' : `   -> ${r.tag}`}`);
}
await b.close();
