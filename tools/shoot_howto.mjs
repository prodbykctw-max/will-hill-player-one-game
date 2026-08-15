// THE HOW TO PLAY PICTURES, TAKEN INSIDE THE REAL GAME.
//
// Client: "I want an instructions page with images telling what to do... an
// image of you standing on it with an X next to it, an image of you jumping
// over the pothole with a tick... walking into the ninja and all your money
// falling out, and then jumping on the ninja's head... it don't have to be
// words just an image."
//
// So none of these are mock-ups. Each frame is the actual game, at the actual
// moment, staged through the same dev hooks the other harnesses drive
// (`window.__game`, `window.__startStage`) and captured the instant the game
// state proves the thing happened. That matters for more than honesty: the
// player sprite, the road, the lighting and his own backdrop art are all
// exactly what the player will see a second after reading the page.
//
// ⚠️ THE TWO COLLISION FRAMES ARE TRANSIENT, so they are not captured on a
// timer. The money burst is caught by watching for dropped bags to appear in
// `level.bags`, and the stomp by watching the score tick up by the stomp
// bonus — the same "wait for the state that proves it" rule the share and
// daylamps harnesses use, because a fixed delay lands on a different frame on
// a slower machine.
//
// Day, not night: this is a page somebody reads to learn the rules, and the
// daylight plates carry far more contrast than wet asphalt under sodium.
//
//   PLAYWRIGHT=... CHROMIUM=... node tools/shoot_howto.mjs [--write]
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const _pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const WRITE = process.argv.includes('--write');
const RAW = process.env.OUT || 'shots/howto';
const DEST = 'src/assets/howto';
mkdirSync(RAW, { recursive: true });
if (WRITE) mkdirSync(DEST, { recursive: true });

const b = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
// No `hasTouch`: the on-screen pads only mount on a touch device and they
// would sit right across the bottom of every crop.
const ctx = await b.newContext({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('  THROWN: ' + e.message));
await p.goto('http://localhost:5199/?tod=day', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.screen === 'title', null,
  { timeout: 25000 });

// Everything the page side needs, installed once.
await p.evaluate(async () => {
  const tm = await import('/src/world/tilemap.js');
  const col = await import('/src/entities/collectibles.js');
  const en = await import('/src/entities/enemy.js');
  window.__hw = { tm, col, en };
  window.__frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // A clean, repeatable stage: start the run, clear everything the generator
  // put down near the camera, and stand him on flat road. Each shot then adds
  // back exactly the one thing it is about, so nothing else wanders into
  // frame.
  window.__stage = async (px) => {
    const g = window.__game;
    if (g.screen !== 'playing') { window.__startStage(0); for (let k = 0; k < 6; k++) await window.__frame(); }
    const { T, FLOOR_R, LH, groundCol } = window.__hw.tm;
    g.player.x = px;
    g.player.y = FLOOR_R * T - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    g.player.dead = false; g.player.hearts = 3;
    g.player.hurtUntil = 0; g.player.invulnerableUntil = 0;
    // Re-ground a wide corridor and empty it.
    const c0 = Math.floor(px / T) - 30, c1 = Math.floor(px / T) + 30;
    for (let c = c0; c < c1; c++) groundCol(g.level.map, c, FLOOR_R, LH - 1);
    const near = (o) => Math.abs(o.x - px) < 1400;
    g.level.enemies = g.level.enemies.filter((o) => !near(o));
    g.level.bags = g.level.bags.filter((o) => !near(o));
    g.level.champagnes = g.level.champagnes.filter((o) => !near(o));
    g.level.obstacles = g.level.obstacles.filter((o) => !near(o));
    // Stop the generator refilling the corridor behind us mid-shot.
    g.level.lastFeatureCol = Math.floor(px / T) + 40;
    // ⚠️ THE CAMERA HAS TO CATCH UP BEFORE ANYTHING IS FRAMED. It lerps
    // toward the player, so after a teleport of a couple of thousand pixels
    // it is still far behind — and the crop, which is computed from the
    // camera, then points at empty road. That is exactly how the first two
    // pothole frames came back as fence with no Will Hill in them. Snapping
    // it and then letting it settle costs nothing and cannot be got wrong.
    const cam = window.__camera;
    const cv = document.querySelector('canvas');
    cam.x = g.player.x + g.player.w / 2 - (cv.width / cam.zoom) / 2;
    for (let k = 0; k < 24; k++) await window.__frame();
  };

  // Is he actually inside the frame we are about to cut? Cheap, and it turns
  // a silently empty picture into a loud failure.
  window.__onScreen = () => {
    const g = window.__game, cam = window.__camera;
    const cv = document.querySelector('canvas');
    const sx = (g.player.x + g.player.w / 2 - cam.x) * cam.zoom;
    const sy = (g.player.y + g.player.h / 2 - cam.y) * cam.zoom;
    return sx > 40 && sx < cv.width - 40 && sy > 20 && sy < cv.height - 20;
  };

  // ⚠️ THE CROP IS CUT IN-PAGE, NOT BY page.screenshot({clip}).
  //
  // The clip version needed three round trips — compute the rect, then
  // screenshot — and the game keeps running between them. Sixty frames a
  // second of camera lerp and gravity is enough to put him somewhere else by
  // the time the shutter opens, which is how a jump frame came back as an
  // empty stretch of fence twice. Reading the canvas inside a single
  // synchronous evaluate freezes the question: these are the pixels that were
  // on screen at the instant the state was true.
  //
  // Source coordinates are in DEVICE pixels (canvas.width), not CSS.
  window.__cut = (padX = 250, top = 180, h = 340) => {
    const g = window.__game, cam = window.__camera;
    const cv = document.querySelector('canvas');
    const dpr = cv.width / cv.clientWidth;
    const cx = (g.player.x + g.player.w / 2 - cam.x) * cam.zoom * dpr;
    const cy = (g.player.y + g.player.h / 2 - cam.y) * cam.zoom * dpr;
    const sw = padX * 2 * dpr, sh = h * dpr;
    const sx = Math.max(0, Math.min(cv.width - sw, Math.round(cx - padX * dpr)));
    const sy = Math.max(0, Math.min(cv.height - sh, Math.round(cy - top * dpr)));
    const out = document.createElement('canvas');
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const c2 = out.getContext('2d');
    c2.imageSmoothingEnabled = false;
    c2.drawImage(cv, sx, sy, out.width, out.height, 0, 0, out.width, out.height);
    return {
      dbg: { px: Math.round(g.player.x), py: Math.round(g.player.y),
        dead: g.player.dead, anim: g.player.anim, alpha: g.player.inv,
        camx: Math.round(cam.x), sx: Math.round(cx), sy: Math.round(cy),
        cutx: sx, cuty: sy, dpr },
      url: out.toDataURL('image/png'),
      // Where he landed inside the cut, so a miss is loud rather than silent.
      inside: cx - sx > 30 && cx - sx < sw - 30 && cy - sy > 20 && cy - sy < sh - 20,
    };
  };

  // The champagne pair's own proof. Sample the canvas at each live bag's own
  // screen position and return the mean blue-minus-red there, plus whether
  // the aura is actually lit. The ✓ frame must read strongly bluer AT THE
  // BAGS than the ✕ frame — measured off the rendered pixels, because the
  // whole point of the pair is that the player can SEE the difference, and a
  // picture that does not carry it teaches nothing.
  window.__bagTint = () => {
    const g = window.__game, cam = window.__camera;
    const cv = document.querySelector('canvas');
    const c2 = cv.getContext('2d');
    const dpr = cv.width / cv.clientWidth;
    const vals = [];
    for (const bag of g.level.bags) {
      if (bag.got) continue;
      const sx = (bag.x + bag.w / 2 - cam.x) * cam.zoom * dpr;
      const sy = (bag.y + bag.h / 2 - cam.y) * cam.zoom * dpr;
      if (sx < 12 || sy < 12 || sx > cv.width - 12 || sy > cv.height - 12) continue;
      // ⚠️ SAMPLE THE WHOLE BAG BOX AND KEEP THE BLUEST DECILE. A 20px box
      // at the bag's centre reported the pair as identical (-58.6 vs -53.1)
      // while the ✓ frame was VISIBLY blue — because the blue lives in the
      // money wad at the TOP of the bag and the centre lands on tan leather
      // either way. The claim is "there is blue here", so the statistic is
      // the bluest pixels in the box, not the average of mostly-leather.
      const bw = Math.round(bag.w * cam.zoom * dpr);
      const bh = Math.round(bag.h * cam.zoom * dpr * 1.4); // grown bags reach higher
      const x0 = Math.max(0, Math.round(sx - bw / 2));
      const y0 = Math.max(0, Math.round(sy - bh * 0.75));
      const d = c2.getImageData(x0, y0, Math.min(bw, cv.width - x0),
        Math.min(bh, cv.height - y0)).data;
      const br = [];
      for (let i = 0; i < d.length; i += 4) br.push(d[i + 2] - d[i]);
      br.sort((x, y) => y - x);
      const top = br.slice(0, Math.max(1, Math.floor(br.length / 10)));
      vals.push(top.reduce((x, y) => x + y, 0) / top.length);
    }
    return {
      bags: vals.length,
      meanBminusR: vals.length ? +(vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1) : null,
      lit: g.player.invulnerableUntil > performance.now(),
    };
  };
});

const shots = [];
let failed = 0;
async function shoot(name, note) {
  const { url, inside, dbg } = await p.evaluate(() => window.__cut());
  if (process.env.DBG) console.log('       ', JSON.stringify(dbg));
  writeFileSync(`${RAW}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  shots.push(name);
  if (!inside) failed++;
  console.log(`  ${inside ? 'shot' : 'MISS'} ${name.padEnd(16)} ${note}`);
}

// ── 1/2. THE POTHOLE ──────────────────────────────────────────────────────
// Walked into: the foot test in main.js fires when the middle of his body is
// over the hole while he is on the road, and trip() takes a heart.
await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R } = window.__hw.tm;
  await window.__stage(2400);
  // ⚠️ STAGED STANDING, NOT MID-STUMBLE. Chasing the trip frame put him
  // through a hurt-and-knockback the capture kept missing — the frame came
  // back with a patrolling ninja and no Will Hill in it at all. His own words
  // are the simpler brief anyway: "an image of you standing on it with an X
  // next to it." So he stands on it, still, and the X does the telling.
  // ⚠️ CENTRED IN THE HOLE, ON THE REACTION. Client: "the image of the
  // pothole should show him standing and being hit, basically INSIDE the
  // pothole, with the reaction that he has." The first cut had him at the
  // lip, which reads as standing beside it. The hole is centred on his own
  // middle, and the frame is taken after trip() has pitched him and gravity
  // has started bringing him back down into it — that descending beat is
  // where the hit pose actually reads.
  g.level.obstacles.push({
    x: g.player.x + g.player.w / 2 - 78, y: FLOOR_R * T + 1, w: 156, h: 30,
  });
  g.player.vx = 1.2;
  g.level.enemies = g.level.enemies.filter((e) => Math.abs(e.x - g.player.x) > 900);
  for (let k = 0; k < 30 && !(g.player.stumble > 0); k++) await window.__frame();
  // Let the pitch peak and start falling back, so he is over the hole rather
  // than launched above it.
  for (let k = 0; k < 8 && g.player.vy < 0; k++) await window.__frame();
  for (let k = 0; k < 3; k++) await window.__frame();   // down into the mouth
  // ⚠️ THEN KILL THE I-FRAME FLICKER BEFORE CUTTING.
  //
  // renderer.js:643 skips drawing the player entirely on alternating i-frame
  // windows (`Math.floor(p.inv / 4) % 2 === 0`), and trip() sets inv to
  // CONTACT_IFRAMES. Every attempt at this frame landed on a skipped one and
  // came back as a pothole with nobody near it — twice, which is what sent me
  // looking at the camera and the crop maths instead of the renderer. `inv`
  // is only invulnerability bookkeeping; zeroing it in a screenshot tool
  // changes nothing but whether the sprite is on this frame.
  g.player.inv = 0;
  await window.__frame();
});
await shoot('pothole-bad', 'standing in it — the X case');

// Cleared: same hole, caught at the top of the jump.
await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R } = window.__hw.tm;
  await window.__stage(2400);
  // ⚠️ CAUGHT ON THE LANDING SIDE, NOT AT THE TOP OF THE ARC. Client: "don't
  // show them immediately over it because it just looks like they jumped
  // straight in the air — show them almost landing on the other side, like
  // they're finishing jumping over it." So the hole sits behind him and he is
  // on the way down, close to the road, which is the frame that reads as
  // having cleared something.
  const hx = g.player.x;
  g.level.obstacles.push({ x: hx, y: FLOOR_R * T + 1, w: 156, h: 30 });
  g.player.x = hx + 172;          // just past the far lip
  // ⚠️ HIGH ENOUGH THAT HE IS STILL IN THE AIR WHEN THE SHUTTER OPENS. At 42px
  // and two frames he had already touched down and the frame read as walking
  // past the hole, which is the one thing this picture must not say. ~86px
  // with a gentle descent and a SINGLE step leaves him clearly airborne and
  // clearly coming down on the far side.
  g.player.y -= 86;
  g.player.vy = 3.0;
  g.player.vx = 3.4;
  g.player.onGround = false; g.player.anim = 'jumpLand';
  await window.__frame();
});
await shoot('pothole-good', 'jumped clean over it');

// ── 3/4. THE MANHOLE ──────────────────────────────────────────────────────
// A real pit carved into the tilemap — the hole that actually drops you,
// drawn unmistakably (drawPitMouth) rather than sunk into the surface.
await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R, LH, pit } = window.__hw.tm;
  await window.__stage(3200);
  const c = Math.floor(g.player.x / T) + 1;
  pit(g.level.map, c, 3, FLOOR_R, LH - 1);
  g.player.x = (c + 1) * T; g.player.vx = 1.0;
  const y0 = g.player.y;
  // Deeper than the first pass: at +46 he was still level with the road and
  // read as standing on the lid. Down far enough that the mouth is above his
  // shoulders is the picture of falling through.
  for (let k = 0; k < 60 && g.player.y < y0 + 96; k++) await window.__frame();
});
await shoot('manhole-bad', 'stepped in — falling through');

await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R, LH, pit } = window.__hw.tm;
  await window.__stage(3200);
  const c = Math.floor(g.player.x / T) + 2;
  pit(g.level.map, c, 3, FLOOR_R, LH - 1);
  // Landing side again, for the same reason as the pothole.
  g.player.x = (c + 3) * T + 10;
  g.player.y -= 86;               // see the pothole note — airborne, descending
  g.player.vy = 3.0;
  g.player.vx = 3.4;
  g.player.onGround = false; g.player.anim = 'jumpLand';
  await window.__frame();
});
await shoot('manhole-good', 'jumped it');

// ── 5/6. THE NINJA ────────────────────────────────────────────────────────
// Walked into: he has to be carrying money for any to come out, so the run is
// given a purse first. Captured when dropped bags actually appear.
await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R } = window.__hw.tm;
  await window.__stage(4000);
  g.score = 6000;
  const before = g.level.bags.length;
  g.level.enemies.push(window.__hw.en.createEnemy(
    g.player.x + 54, FLOOR_R * T - 56, 0, 'a'));
  g.player.vx = 2.4;
  for (let k = 0; k < 60 && g.level.bags.length <= before + 2; k++) await window.__frame();
  // Three frames, not eight: the bags need to have left him, but any longer
  // and he has finished going down and the picture is a body on the pavement
  // rather than the moment of being robbed.
  for (let k = 0; k < 3; k++) await window.__frame();
});
await shoot('ninja-bad', 'walked into him — the money goes');

// Stomped: dropped onto his head, captured on the score tick the stomp pays.
await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R } = window.__hw.tm;
  await window.__stage(4600);
  g.score = 0;
  const e = window.__hw.en.createEnemy(g.player.x + 6, FLOOR_R * T - 56, 0, 'a');
  g.level.enemies.push(e);
  g.player.y -= 92; g.player.vy = 5.0; g.player.onGround = false;
  g.player.anim = 'jumpLand';
  for (let k = 0; k < 40 && g.score < 50; k++) await window.__frame();
});
await shoot('ninja-good', 'landed on his head');

// ── 7/8. THE CHAMPAGNE PAIR — and the money lesson folded into it ─────────
// Client, on the old page: "there is no image showing you jumping to get the
// bottle and it still has a green check next to it, and the money isn't blue
// showing that it gets bigger." He is right twice: the champagne and money
// shots were two orphans wearing ✓s with no ✕ to answer, and the money frame
// was taken with no aura up, so the bags in it were plain — the one thing the
// picture existed to show, missing.
//
// One lesson now, two frames, SAME four bags at the SAME offsets in both:
//   ✕  running past the bottle on the ground — bags plain
//   ✓  mid-air for the bottle, aura lit — the same bags grown and blue
//
// ⚠️ THE DIFFERENCE IS MEASURED, NOT ASSERTED. Each staging samples the
// canvas at the bags' own screen positions (window.__bagTint) inside the
// stage evaluate, and the run REFUSES to write if the ✓ frame does not read
// markedly bluer at the bags than the ✕ frame. A pair that fails that gate
// is restaged, not shipped — the picture IS the claim.
const tintBad = await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R } = window.__hw.tm;
  await window.__stage(5200);
  const { createMoneyBag, createChampagneBottle } = window.__hw.col;
  const gy = FLOOR_R * T;
  // The bottle he is passing up: ahead, above head height — plainly there,
  // plainly not being jumped for.
  g.level.champagnes.push(createChampagneBottle(g.player.x + 150, gy - 150));
  for (let i = 0; i < 4; i++) {
    g.level.bags.push(createMoneyBag(g.player.x + 60 + i * 64, gy - 46));
  }
  g.player.vx = 1.6;
  for (let k = 0; k < 6; k++) await window.__frame();
  return window.__bagTint();
});
console.log('        ✕ bags:', JSON.stringify(tintBad));
await shoot('champagne-bad', 'ran past the bottle — the bags stay plain');

const tintGood = await p.evaluate(async () => {
  const g = window.__game, { T, FLOOR_R } = window.__hw.tm;
  await window.__stage(6400);
  const { createMoneyBag, createChampagneBottle } = window.__hw.col;
  const gy = FLOOR_R * T;
  g.level.champagnes.push(createChampagneBottle(g.player.x + 40, gy - 150));
  for (let i = 0; i < 4; i++) {
    g.level.bags.push(createMoneyBag(g.player.x + 90 + i * 64, gy - 46));
  }
  // Mid-air FOR the bottle — the client's missing frame. Caught the moment
  // the aura state proves the take, while he is still off the ground.
  g.player.y -= 96; g.player.vy = 0.2; g.player.vx = 2.2; g.player.onGround = false;
  for (let k = 0; k < 40 && !(g.player.invulnerableUntil > performance.now()); k++) {
    await window.__frame();
  }
  return window.__bagTint();
});
console.log('        ✓ bags:', JSON.stringify(tintGood));
await shoot('champagne-good', 'jumped for it — the same bags, grown and blue');

// The gate. Numbers first (they print above), then the refusal.
if (!tintGood.lit || tintGood.bags < 2 || tintBad.bags < 2
  || !(tintGood.meanBminusR - tintBad.meanBminusR >= 15)) {
  console.log(`\n  ⚠️  the ✓ frame does not read bluer at the bags than the ✕ `
    + `(✕ ${tintBad.meanBminusR}, ✓ ${tintGood.meanBminusR}, lit=${tintGood.lit}) — restage, do not write.`);
  failed++;
}

await ctx.close();
await b.close();
if (failed) {
  console.log(`\n  ⚠️  ${failed} frame(s) did not have him on screen — fix before writing.`);
}

// ── to webp, at a size the page can actually use ─────────────────────────
// The captures are 2x for sharpness; 520px wide is plenty for a panel that
// renders around 150-170 CSS px on a phone, and keeps the whole set small.
if (WRITE) {
  for (const name of shots) {
    execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open("${RAW}/${name}.png").convert("RGB")
w = 520
im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
im.save("${DEST}/${name}.webp", quality=88, method=6)
print("  wrote ${DEST}/${name}.webp", im.size)
`]);
  }
} else {
  console.log(`\n  dry run — PNGs in ${RAW}/, pass --write to emit ${DEST}/`);
}
