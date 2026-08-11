// Will Hill: Player One — entry point + game-state orchestration.
// Ties together the ported engine pieces (core/, world/, entities/,
// render/) into an actual playable loop. See docs/GDD.md for design,
// CLAUDE.md for architecture, and the PHASE 2 plan for what was ported from
// Jandé's Action RPG mode vs. reskinned/simplified for Will Hill.

import { createLoop } from './core/loop.js';
import { createCamera } from './core/camera.js';
import { createInput } from './core/input.js';
import { advanceAnim } from './core/animate.js';
import { createPlayer, stepPlayer, isInvulnerable, grantInvulnerability, PLAYER_SPRITE } from './entities/player.js';
import { ENEMY_SPRITES, updateEnemy, resolveEnemyCollision } from './entities/enemy.js';
import { overlapsPlayer, PROP_SPRITES } from './entities/collectibles.js';
import { createLevel, buildRunway, genAhead, finishLineX } from './world/generator.js';
import { STAGES } from './world/stages.js';
import { T, FLOOR_R, SLAB_R, FALL_DEATH_Y, isSolid } from './world/tilemap.js';
import { createRenderer } from './render/renderer.js';
import { createBackdrop } from './render/backdrop.js';
import { createUndercroft } from './render/undercroft.js';
import { createHud } from './render/hud.js';
import { loadImages } from './render/images.js';
import { createRunLog, lbSubmit } from './net/leaderboard.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = createRenderer(ctx, canvas);
const backdrop = createBackdrop(ctx, canvas);
const undercroft = createUndercroft(ctx, canvas);
const hud = createHud(ctx, canvas);
const input = createInput();
const camera = createCamera();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  camera.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

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

let images = null; // { player, enemy, eav, edgewood, l5p, underground }

function startStage(i) {
  const stage = STAGES[i];
  state.stageIndex = i;
  state.level = createLevel(stage, i);
  buildRunway(state.level);
  genAhead(state.level, camera.vw / T + GEN_LOOKAHEAD_COLS);

  state.player = createPlayer(3 * T, (FLOOR_R - 4) * T);
  state.player.hearts = state.hearts; // carry hearts across stages within a run
  camera.x = 0;
  camera.y = 0;
  state.screen = 'playing';
  state.screenT = 0;
}

function startRun() {
  state.score = 0;
  state.hearts = 3;
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

  if (state.screen === 'stageClear') {
    state.screenT++;
    if (state.screenT > 20 && confirmPressed()) {
      if (state.stageIndex + 1 < STAGES.length) {
        startStage(state.stageIndex + 1); // checkpoint: next neighborhood, hearts carried over
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
    if (state.screenT > 20 && confirmPressed()) startRun();
    return;
  }

  // ── screen === 'playing' ──
  const level = state.level;
  const player = state.player;
  const now = Date.now();

  genAhead(level, camera.visibleRight() / T + GEN_LOOKAHEAD_COLS);
  stepPlayer(player, input, level.map);

  if (player.y > FALL_DEATH_Y) player.dead = true;

  // enemies: patrol/defeat-timer update, then collision resolution
  for (let i = level.enemies.length - 1; i >= 0; i--) {
    const e = level.enemies[i];
    const gone = updateEnemy(e);
    if (gone) {
      level.enemies.splice(i, 1);
      continue;
    }
    const result = resolveEnemyCollision(e, player, now);
    if (result === 'stomp') {
      state.score += 50; // matches SCORE_RULES.stomp in cloudflare/leaderboard-worker.js
      state.runLog.record('stomp');
    }
  }

  // money bags
  for (const bag of level.bags) {
    if (overlapsPlayer(bag, player)) {
      bag.got = true;
      state.score += bag.value;
      state.runLog.record('bag');
    }
  }

  // champagne bottles
  for (const bottle of level.champagnes) {
    if (overlapsPlayer(bottle, player)) {
      bottle.got = true;
      grantInvulnerability(player, now, 30);
      state.runLog.record('champagne');
    }
  }

  // static hazards
  for (const hz of level.obstacles) {
    const overlap = player.x < hz.x + hz.w && player.x + player.w > hz.x && player.y < hz.y + hz.h && player.y + player.h > hz.y;
    if (overlap && !isInvulnerable(player, now)) {
      player.hearts--;
      player.inv = 75;
      player.vy = -6;
      if (player.hearts <= 0) player.dead = true;
    }
  }

  camera.follow(player);
  advanceAnim(player, PLAYER_SPRITE.atlas);
  for (const e of level.enemies) advanceAnim(e, ENEMY_SPRITES[e.variant].atlas);

  state.hearts = player.hearts;

  if (player.dead) {
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

  const items = [
    { label: 'RESUME', action: resume },
    { label: 'RESTART STAGE', action: () => { startStage(state.stageIndex); } },
    { label: 'RESTART RUN', action: () => { startRun(); } },
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

  const level = state.level;
  const player = state.player;
  const stage = STAGES[state.stageIndex];
  const bgImg = images[stage.id];

  // Paint order mirrors Jandé's: screen-space backdrop, screen-space
  // undercroft, then ONE world-transformed block, then screen-space HUD.
  const groundY = camera.groundScreenY();
  const slabPx = SLAB_R * T * camera.zoom;

  const bgObjects = {};
  for (const o of stage.bg.objects || []) bgObjects[o.key] = images[`${stage.id}_${o.key}`];
  backdrop.drawFar(bgImg, bgObjects, stage, camera, state.tick);
  undercroft.draw(stage, groundY, slabPx, camera, state.tick);

  renderer.withCameraTransform(camera, () => {
    renderer.drawTiles(level.map, camera, (c, r) => isSolid(level.map, c, r));
    // Light pools go down BEFORE the entities, so characters stand in the
    // light rather than having it painted over them.
    renderer.lighting.drawGroundPools(camera, stage);
    renderer.drawFinishLine(finishLineX(level), state.tick);
    for (const bag of level.bags) renderer.drawPickup(bag, images.bag, state.tick, 'rgba(255,206,110,0.30)');
    for (const bottle of level.champagnes) renderer.drawPickup(bottle, images.champagne, state.tick, 'rgba(255,240,170,0.34)');
    for (const hz of level.obstacles) renderer.drawHazard(hz);
    for (const e of level.enemies) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    renderer.drawPlayer(player, images.player, PLAYER_SPRITE.atlas, stage);
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
    champagneFrac: champLeft / 30000,
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
    drawOverlayText([
      ['GAME OVER', 28, '#e0435f'],
      [`$${state.score.toLocaleString()}`, 18],
      ['press JUMP to retry', 13, 'rgba(255,255,255,0.7)'],
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
};
for (const [v, sp] of Object.entries(ENEMY_SPRITES)) imageManifest['enemy_' + v] = sp.url;
for (const st of STAGES) {
  imageManifest[st.id] = st.bg.img;
  for (const o of st.bg.objects || []) imageManifest[`${st.id}_${o.key}`] = o.img;
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
