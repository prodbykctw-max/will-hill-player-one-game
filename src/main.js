// Will Hill: Player One — entry point + game-state orchestration.
// Ties together the ported engine pieces (core/, world/, entities/,
// render/) into an actual playable loop. See docs/GDD.md for design,
// CLAUDE.md for architecture, and the PHASE 2 plan for what was ported from
// Jandé's Action RPG mode vs. reskinned/simplified for Will Hill.

import { createLoop } from './core/loop.js';
import { createCamera } from './core/camera.js';
import { createInput } from './core/input.js';
import { advanceAnim } from './core/animate.js';
import { createPlayer, stepPlayer, isInvulnerable, grantInvulnerability, trip, CHAMPAGNE_SECONDS, PLAYER_SPRITE } from './entities/player.js';
import { createAudio } from './audio/audio.js';
import { WALK_SPEED, RUN_SPEED } from './core/physics.js';
import { ENEMY_SPRITES, updateEnemy, resolveEnemyCollision } from './entities/enemy.js';
import { beginStompOut, stepStompOut, splitStompers } from './entities/knockdown.js';
import { overlapsPlayer, PROP_SPRITES, createDroppedBag, BAG_VALUE } from './entities/collectibles.js';
import { createLevel, buildRunway, genAhead, finishLineX } from './world/generator.js';
import { STAGES } from './world/stages.js';
import { T, FLOOR_R, SLAB_R, FALL_DEATH_Y, isSolid } from './world/tilemap.js';
import { createRenderer } from './render/renderer.js';
import { createBackdrop } from './render/backdrop.js';
import { createUndercroft } from './render/undercroft.js';
import { createHud } from './render/hud.js';
import { createMartaMap } from './render/martamap.js';
import martaMapArt from './assets/backgrounds/marta-map.webp';
import { loadImages } from './render/images.js';
import { createRunLog, lbSubmit } from './net/leaderboard.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = createRenderer(ctx, canvas);
const backdrop = createBackdrop(ctx, canvas);
const undercroft = createUndercroft(ctx, canvas);
const hud = createHud(ctx, canvas);
const martaMap = createMartaMap(ctx, canvas);
const input = createInput();
const audio = createAudio();
// Browsers keep an AudioContext suspended until a real gesture, so the first
// key or touch is what actually starts the audio thread. `once` per event so
// this costs nothing after the first interaction.
for (const ev of ['keydown', 'pointerdown', 'touchstart']) {
  window.addEventListener(ev, () => audio.unlock(), { once: true, passive: true });
}
const camera = createCamera();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  camera.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

const RIDE_TICKS = 150; // ~2.5s on the train between neighbourhoods
const GEN_LOOKAHEAD_COLS = 24; // stream this many columns beyond the camera's right edge

const state = {
  stageIndex: 0,
  level: null,
  player: null,
  score: 0,
  hearts: 3,
  screen: 'loading', // loading | playing | paused | stageClear | gameOver | complete
  resumeTo: 'playing', // what pausing interrupted, so resume goes back to it
  screenT: 0,
  tick: 0,
  runLog: createRunLog(),
};

// DEV ONLY — a handle on the live state, so a headless browser can drive the
// game into states that are deliberately hard to reach: the knockdown needs
// enemies standing over you at the moment you run out of hearts, and a pit
// fall needs you to walk into a specific hole. Checking those by playing to
// them by hand is how they went unverified long enough to ship broken.
// Vite folds `import.meta.env.DEV` to false and drops this from the build.
if (import.meta.env.DEV) window.__game = state;

let images = null; // { player, enemy, eav, edgewood, l5p, underground }

function startStage(i) {
  const stage = STAGES[i];
  state.stageIndex = i;
  state.level = createLevel(stage, i);
  buildRunway(state.level);
  genAhead(state.level, camera.vw / T + GEN_LOOKAHEAD_COLS);

  state.player = createPlayer(3 * T, (FLOOR_R - 4) * T);
  state.player.hearts = state.hearts; // carry hearts across stages within a run
  // Clear the stomp-out beat, or a death on stage 2 replays stage 1's.
  state.stompT = undefined;
  state.stompers = [];
  state.dust = [];
  camera.x = 0;
  camera.y = 0;
  state.screen = 'playing';
  state.screenT = 0;
}

// ONE CONTINUE PER RUN. Restart from the top of the stage you went down on,
// keeping the money you had banked. Deliberately one, and deliberately per
// RUN rather than per stage — it is the way back in now that the pause menu
// no longer offers a restart, without turning a contest run into unlimited
// retries. It is recorded in the replay log, so a continued run is legible
// to the leaderboard rather than hidden from it.
const CONTINUES_PER_RUN = 1;

function startRun() {
  state.score = 0;
  state.hearts = 3;
  state.continues = CONTINUES_PER_RUN;
  state.runLog = createRunLog();
  state.runLog.start();
  startStage(0);
}

function confirmPressed() {
  return input.jump();
}

// ── PAUSE ────────────────────────────────────────────────────────────────
// Menu buttons are rebuilt each frame so they track the canvas size; their
// rects are what the pointer handler hit-tests against.
const menuButtons = [];

function pause() {
  if (state.screen !== 'playing') return;
  state.resumeTo = state.screen;
  state.screen = 'paused';
  state.screenT = 0;
}

function resume() {
  if (state.screen !== 'paused') return;
  state.screen = state.resumeTo || 'playing';
  state.screenT = 0;
}

function hit(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// One pointer path for the pause control and the menu. Canvas coordinates
// must be scaled from CSS pixels or every hit-test is wrong on a HiDPI
// screen, where the backing store is larger than the element.
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / r.width);
  const y = (e.clientY - r.top) * (canvas.height / r.height);

  if (state.screen === 'playing') {
    if (hit(hud.pauseRect, x, y)) { pause(); e.preventDefault(); }
    return;
  }
  if (state.screen === 'paused') {
    for (const b of menuButtons) {
      if (hit(b, x, y)) { b.action(); e.preventDefault(); return; }
    }
  }
});

// Keyboard parity, and the convention players expect.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    state.screen === 'paused' ? resume() : pause();
  }
});

// Losing focus mid-run should pause rather than let the player walk into a
// pothole they can't see.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function update() {
  state.tick++;
  if (state.screen === 'loading') return;
  // Paused freezes the world but keeps drawing, so the menu sits over a
  // still frame of the run rather than a black screen.
  if (state.screen === 'paused') { state.screenT++; return; }

  // THE RIDE. Between stages he takes MARTA, because these are real places on
  // a real system and the route the stage order describes is one you could
  // actually make. See render/martamap.js.
  if (state.screen === 'riding') {
    state.screenT++;
    if (state.screenT >= RIDE_TICKS) startStage(state.rideTo);
    return;
  }

  if (state.screen === 'stageClear') {
    state.screenT++;
    if (state.screenT > 20 && confirmPressed()) {
      if (state.stageIndex + 1 < STAGES.length) {
        state.rideFrom = STAGES[state.stageIndex].id;
        state.rideTo = state.stageIndex + 1;
        state.screen = 'riding';
        state.screenT = 0;
      } else {
        state.screen = 'complete';
        state.screenT = 0;
        lbSubmit(state.runLog.finish());
      }
    }
    return;
  }

  if (state.screen === 'gameOver' || state.screen === 'complete') {
    state.screenT++;
    if (state.screenT > 20 && confirmPressed()) {
      // Spend the continue if there is one and this was a knockdown, not the
      // end of the game. Hearts come back full and the stage restarts from
      // its beginning; the score carries, because the money was already
      // earned and taking it back would make the continue worthless.
      if (state.screen === 'gameOver' && state.continues > 0) {
        state.continues--;
        state.runLog.record('continue');
        state.hearts = 3;
        startStage(state.stageIndex);
      } else {
        startRun();
      }
    }
    return;
  }

  // ── screen === 'playing' ──
  const level = state.level;
  const player = state.player;
  const now = Date.now();

  genAhead(level, camera.visibleRight() / T + GEN_LOOKAHEAD_COLS);
  stepPlayer(player, input, level.map);

  if (player.y > FALL_DEATH_Y) { player.dead = true; player.deathCause = 'fall'; }

  // enemies: patrol/defeat-timer update, then collision resolution
  for (let i = level.enemies.length - 1; i >= 0; i--) {
    const e = level.enemies[i];
    const gone = updateEnemy(e, level.map);
    if (gone) {
      level.enemies.splice(i, 1);
      continue;
    }
    const result = resolveEnemyCollision(e, player, now);
    if (result === 'stomp') {
      audio.play('punch');
      state.score += 50; // matches SCORE_RULES.stomp in cloudflare/leaderboard-worker.js
      state.runLog.record('stomp');
    } else if (result === 'contact') {
      // AN ENEMY KNOCKS THE MONEY OUT OF YOU. Deliberately different from a
      // pothole, which only trips you: a pothole is the street, an enemy robs
      // you. It also self-sequences into the three-touch rule without any
      // hit counter — the first touch is the only one you still have money
      // for, so touch one costs the cash and a heart, touch two a heart,
      // touch three kills you.
      //
      // SONIC'S RINGS. ALL of it comes out — not a capped slice — because
      // that is what makes a full purse worth being scared of. The three-touch
      // escalation still stands on top of it: touch one empties you and costs
      // a heart, touch two a heart, touch three kills.
      //
      // Sonic does not spawn one sprite per ring either; it loses every ring
      // and draws a bounded burst of them. Same here. MAX_SCATTER sprites go
      // out, each carrying an equal share of the whole loss, so recovering
      // them returns the money in proportion and the frame cost is fixed no
      // matter how rich the run is.
      const MAX_SCATTER = 24;
      const lost = Math.floor(state.score / BAG_VALUE);
      if (lost > 0) {
        const n = Math.min(MAX_SCATTER, lost);
        // WHOLE BAGS PER SPRITE, remainder handed to the first few. A flat
        // round() drifts: 50 bags across 24 sprites rounds to 208 each, which
        // hands back 4992 of 5000 and leaves the Worker's recomputed score
        // 200 adrift from the screen. Integer division plus remainder is
        // exact, and it keeps every sprite worth a whole number of `bag`
        // events, which is the only way the two logs can agree at all.
        const per = Math.floor(lost / n);
        const extra = lost % n;
        const away = player.x < e.x ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const worth = (per + (i < extra ? 1 : 0)) * BAG_VALUE;
          // A fan, alternating either side of the arc the way a ring burst
          // does, rather than a single spray in one direction.
          const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
          const side = i % 2 === 0 ? 1 : -1;
          const speed = 2.2 + Math.abs(t) * 3.4;
          level.bags.push(createDroppedBag(
            player.x + player.w * 0.5, player.y + player.h * 0.35,
            away * speed * 0.5 + side * t * 5.0,
            -5.4 - Math.abs(t) * 4.0 - Math.random() * 1.6, now, worth,
          ));
        }
        // ONE EVENT PER BAG, not per sprite. The server recomputes the score
        // from this log at -100 a bagLost (SCORE_RULES in the Worker), so if
        // the log counted the 24 sprites instead of the bags they stand for,
        // a big loss would score as a small one and the contest board would
        // disagree with the screen.
        for (let i = 0; i < lost; i++) state.runLog.record('bagLost');
        state.score -= lost * BAG_VALUE;
      }
    }
  }

  // money bags
  // Knocked-loose bags arc out, bounce once or twice and settle. Only the
  // dropped ones move; the placed ones stay exactly where the generator put
  // them.
  for (const bag of level.bags) {
    if (!bag.dropped || bag.got || bag.settled) continue;
    bag.vy += 0.42;
    bag.x += bag.vx;
    bag.y += bag.vy;
    const rest = FLOOR_R * T - bag.h;
    if (bag.y >= rest) {
      bag.y = rest;
      bag.vx *= 0.62;
      bag.vy = -bag.vy * 0.34;
      if (Math.abs(bag.vy) < 1.2) { bag.vy = 0; bag.vx = 0; bag.settled = true; }
    }
  }

  for (const bag of level.bags) {
    if (overlapsPlayer(bag, player, now)) {
      bag.got = true;
      audio.play('coin');
      state.score += bag.value;
      // Mirror of the loss above: a scattered bag can be worth several bags,
      // so it logs several `bag` events. Keeps the Worker's recomputed score
      // identical to the one on screen.
      const units = Math.max(1, Math.round(bag.value / BAG_VALUE));
      for (let i = 0; i < units; i++) state.runLog.record('bag');
    }
  }

  // champagne bottles
  for (const bottle of level.champagnes) {
    if (overlapsPlayer(bottle, player, now)) {
      bottle.got = true;
      audio.play('glisten');
      grantInvulnerability(player, now, CHAMPAGNE_SECONDS);
      state.runLog.record('champagne');
    }
  }

  // POTHOLES. Not an overlap test. A pothole is sunk INTO the road surface —
  // its box starts a pixel below the walking plane — and the player's feet
  // rest exactly on that plane, so `player.y + player.h > hz.y` was never
  // true and the hazard could never fire. They were decoration you could
  // stand on.
  //
  // What actually matters is whether a foot is over the hole while you are on
  // the road, so that is what is tested: on the ground, and the middle of the
  // body horizontally inside the pothole's span. Jump it and you clear it.
  for (const hz of level.obstacles) {
    if (!player.onGround) continue;
    const foot = player.x + player.w * 0.5;
    if (foot > hz.x && foot < hz.x + hz.w) {
      if (trip(player, now)) state.runLog.record('pothole');
    }
  }

  camera.follow(player);
  // Stretch the locomotion clips to the speed he is actually moving at. Both
  // were authored for one speed, and with a walk gear and a run gear the same
  // clip now has to cover a range — without this the feet skate whenever the
  // two disagree.
  const sp = Math.abs(player.vx);
  let animScale = 1;
  if (player.anim === 'walk') animScale = WALK_SPEED / Math.max(sp, 0.8);
  else if (player.anim === 'run') animScale = RUN_SPEED / Math.max(sp, 0.8);
  advanceAnim(player, PLAYER_SPRITE.atlas, 4, Math.min(2.2, Math.max(0.55, animScale)));
  for (const e of level.enemies) advanceAnim(e, ENEMY_SPRITES[e.variant].atlas);

  state.hearts = player.hearts;

  if (player.dead) {
    // THE KNOCKDOWN. He is not dead — he got jumped and robbed. Only fires
    // when an ENEMY put him down; a hole or a pothole goes straight to the
    // fade, because there is nobody standing there to do it. Short on
    // purpose, ~1.6s. See entities/stompout.js.
    if (player.deathCause === 'enemy') {
      if (state.stompT === undefined) {
        state.stompT = 0;
        state.stompers = beginStompOut(player, level.enemies);
        state.dust = [];
      }
      player.anim = 'knockdown';
      player.vx = 0;
      // CLEAR THE I-FRAMES, or he is invisible for the whole beat.
      //
      // drawPlayer flickers the sprite while `inv` is counting down, and the
      // countdown lives in stepPlayer — which stops being called the moment
      // he is dead. So `inv` freezes at whatever it was, and 75 happens to
      // land on an OFF frame of the flicker: three men stomping a bare patch
      // of pavement, for 98 ticks, every single time, because a knockdown is
      // always preceded by the hit that caused it. Invulnerability means
      // nothing to a man already on the ground; zero it and he stays drawn.
      player.inv = 0;
      const done = stepStompOut(state.stompT++, player, state.stompers, state.dust);
      for (const e of state.stompers) advanceAnim(e, ENEMY_SPRITES[e.variant].atlas);
      if (!done) return;
    }
    state.screen = 'gameOver';
    state.screenT = 0;
    lbSubmit(state.runLog.finish());
    return;
  }

  if (player.x >= finishLineX(level)) {
    state.screen = 'stageClear';
    state.screenT = 0;
  }
}

// Pause menu. Buttons are laid out and registered every frame so they stay
// correct through rotation and resize — a menu whose hitboxes are computed
// once goes wrong the first time someone turns their phone.
function drawPauseMenu(stage) {
  menuButtons.length = 0;

  ctx.save();
  ctx.fillStyle = 'rgba(6,3,12,0.80)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd66e';
  ctx.font = '700 30px sans-serif';
  ctx.fillText('PAUSED', cx, canvas.height * 0.26);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = 'rgba(232,217,160,0.9)';
  ctx.fillText(stage.name.toUpperCase(), cx, canvas.height * 0.26 + 26);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`$${state.score.toLocaleString()}  ·  ${state.hearts}/${state.player.maxHearts} hearts`,
    cx, canvas.height * 0.26 + 48);

  // RESUME ONLY. RESTART STAGE and RESTART RUN were here and the client had
  // them removed outright.
  //
  // It is also the right call for a contest build: the leaderboard scores a
  // RUN (see cloudflare/leaderboard-worker.js and the replay log), and a
  // pause menu that hands you a free restart lets anyone reroll a bad start
  // as many times as they like without it ever showing up in the log. The
  // only way out of a run is now to finish it or to get knocked down.
  const items = [
    { label: 'RESUME', action: resume },
  ];

  const bw = Math.min(300, canvas.width * 0.72);
  const bh = 52;
  const gap = 14;
  let by = canvas.height * 0.44;

  for (const it of items) {
    const bx = cx - bw / 2;
    ctx.fillStyle = 'rgba(20,16,30,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255,214,110,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = '#ffd66e';
    ctx.font = '700 17px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, cx, by + bh / 2);
    ctx.textBaseline = 'alphabetic';

    menuButtons.push({ x: bx, y: by, w: bw, h: bh, action: it.action });
    by += bh + gap;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 12px sans-serif';
  ctx.fillText('tap a button  ·  P or ESC to resume', cx, by + 14);
  ctx.restore();
}

function drawOverlayText(lines) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,3,12,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd66e';
  let y = canvas.height / 2 - (lines.length - 1) * 16;
  for (const [text, size, color] of lines) {
    ctx.font = `700 ${size}px sans-serif`;
    ctx.fillStyle = color || '#ffd66e';
    ctx.fillText(text, canvas.width / 2, y);
    y += size + 14;
  }
  ctx.restore();
}

function draw() {
  if (state.screen === 'loading' || !images) {
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlayText([['LOADING…', 22]]);
    return;
  }

  // Riding MARTA between neighbourhoods — the map replaces the world
  // entirely, so it returns before any of the stage draw runs.
  if (state.screen === 'riding') {
    // The Underground plate IS Five Points, so the interstitial stands in the
    // game's own art rather than in a pattern invented for this screen.
    martaMap.draw(state.rideFrom, STAGES[state.rideTo].id,
      Math.min(1, state.screenT / RIDE_TICKS), STAGES[state.rideTo].name,
      images.martamap);
    return;
  }

  const level = state.level;
  const player = state.player;
  const stage = STAGES[state.stageIndex];
  // The stage's image set: `base` plus one entry per multiplane card. Stages
  // that have not been cut yet just get `base`.
  const bgImages = { base: images[stage.id] };
  for (const c of stage.bg.cards || []) bgImages[c.key] = images[`${stage.id}_${c.key}`];

  // Paint order mirrors Jandé's: screen-space backdrop, screen-space
  // undercroft, then ONE world-transformed block, then screen-space HUD.
  const groundY = camera.groundScreenY();
  const slabPx = SLAB_R * T * camera.zoom;

  backdrop.drawFar(bgImages, stage, camera, state.tick);
  undercroft.draw(stage, groundY, slabPx, camera, state.tick);

  renderer.withCameraTransform(camera, () => {
    renderer.drawTiles(level.map, camera, (c, r) => isSolid(level.map, c, r));
    // Straight after the tiles and before anything else: the holes have to be
    // drawn, not just left undrawn. See drawPitMouths in render/renderer.js.
    renderer.drawPitMouths(level.map, camera,
      (c, r) => isSolid(level.map, c, r), level.genC);
    // Light pools go down BEFORE the entities, so characters stand in the
    // light rather than having it painted over them.
    renderer.lighting.drawGroundPools(camera, stage);
    renderer.drawFinishLine(finishLineX(level), state.tick);
    for (const bag of level.bags) renderer.drawPickup(bag, images.bag, state.tick, 'rgba(255,206,110,0.30)');
    for (const bottle of level.champagnes) renderer.drawPickup(bottle, images.champagne, state.tick, 'rgba(255,240,170,0.34)');
    for (const hz of level.obstacles) renderer.drawHazard(hz);
    // STOMP-OUT draw order: the enemy in the `back` slot goes down BEFORE the
    // body so the body reads as lying in front of it, and the two side
    // stompers go down after. Outside the beat this is just the normal loop.
    const [behind, infront] = state.stompT !== undefined
      ? splitStompers(state.stompers) : [[], []];
    const back = new Set(behind);
    for (const e of level.enemies) {
      if (back.has(e)) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    }
    for (const e of level.enemies) {
      if (!back.has(e) && !infront.includes(e)) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    }
    renderer.drawPlayer(player, images.player, PLAYER_SPRITE.atlas, stage, state.tick);
    for (const e of infront) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    if (state.dust && state.dust.length) renderer.drawDust(state.dust);
    // The getaway: each one running off with a bag of your money.
    for (const e of state.stompers || []) {
      if (e.carrying) renderer.drawCarriedBag(e, images.bag, ENEMY_SPRITES[e.variant].atlas, state.tick);
    }
    renderer.lighting.drawBloom(camera, stage);
  });

  backdrop.drawVignette();

  const champLeft = Math.max(0, player.invulnerableUntil - Date.now());
  hud.draw({
    score: state.score,
    distanceM: Math.max(0, (player.x - 3 * T) / T),
    hearts: state.hearts,
    maxHearts: player.maxHearts,
    stageName: stage.name,
    champagneFrac: champLeft / (CHAMPAGNE_SECONDS * 1000),
    portraitImg: images.player,
    portraitAtlas: PLAYER_SPRITE.atlas,
  });

  if (state.screen === 'paused') {
    drawPauseMenu(stage);
  } else if (state.screen === 'stageClear') {
    drawOverlayText([
      ['STAGE CLEAR', 28],
      [stage.name.toUpperCase(), 15, '#e8d9a0'],
      ['press JUMP to continue', 13, 'rgba(255,255,255,0.7)'],
    ]);
  } else if (state.screen === 'gameOver') {
    // GAME KNOCKED — the client's wording, and it is player slang, not a
    // typo for "knocked out". Leave it exactly as written. He is not dead:
    // "GAME OVER" in blood red over a body reads far grimmer than this game
    // is meant to be. He got jumped and robbed; he gets back up.
    // The prompt has to say WHICH it is. Pressing JUMP either spends the
    // continue and puts you back at the top of this stage, or starts a fresh
    // run — and a player who thinks they are continuing when they are not
    // has lost a run to an ambiguous line of text.
    drawOverlayText(state.continues > 0 ? [
      ['GAME KNOCKED', 28, '#e8a13f'],
      [`$${state.score.toLocaleString()}`, 18],
      [`${state.continues} CONTINUE`, 15, '#8fe08f'],
      [`press JUMP to get back up in ${STAGES[state.stageIndex].name}`, 13, 'rgba(255,255,255,0.7)'],
    ] : [
      ['GAME KNOCKED', 28, '#e8a13f'],
      [`$${state.score.toLocaleString()}`, 18],
      ['no continues left', 13, 'rgba(255,140,120,0.85)'],
      ['press JUMP to start a new run', 13, 'rgba(255,255,255,0.7)'],
    ]);
  } else if (state.screen === 'complete') {
    drawOverlayText([
      ['SHOWTIME', 30],
      ['Will Hill made it to the stage.', 15, '#e8d9a0'],
      [`Final score: $${state.score.toLocaleString()}`, 16],
      ['press JUMP to play again', 13, 'rgba(255,255,255,0.7)'],
    ]);
  }
}

const loop = createLoop({ update, draw });

const imageManifest = {
  player: PLAYER_SPRITE.url,
  bag: PROP_SPRITES.bag,
  champagne: PROP_SPRITES.champagne,
  // The client's stylized MARTA rail map, for the between-stage screen.
  martamap: martaMapArt,
};
for (const [v, sp] of Object.entries(ENEMY_SPRITES)) imageManifest['enemy_' + v] = sp.url;
for (const s of STAGES) {
  imageManifest[s.id] = s.bg.img;
  for (const c of s.bg.cards || []) imageManifest[`${s.id}_${c.key}`] = c.img;
}

loadImages(imageManifest)
  .then((loaded) => {
    images = loaded;
    startRun();
    loop.start();
  })
  .catch((err) => {
    // A rejected asset load used to leave a permanently black canvas with
    // no clue why (loop.start() simply never ran). Fail loudly instead.
    console.error('Asset load failed:', err);
    ctx.fillStyle = '#140a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlayText([
      ['ASSET LOAD FAILED', 20, '#e0435f'],
      ['check the console', 13, 'rgba(255,255,255,0.7)'],
    ]);
  });
