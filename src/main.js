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
import { ENEMY_SPRITE, updateEnemy, resolveEnemyCollision } from './entities/enemy.js';
import { overlapsPlayer } from './entities/collectibles.js';
import { createLevel, buildRunway, genAhead, finishLineX } from './world/generator.js';
import { STAGES } from './world/stages.js';
import { T, FLOOR_R, FALL_DEATH_Y } from './world/tilemap.js';
import { createRenderer } from './render/renderer.js';
import { loadImages } from './render/images.js';
import { createRunLog, lbSubmit } from './net/leaderboard.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = createRenderer(ctx, canvas);
const input = createInput();
const camera = createCamera({ headroom: true });

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
  screen: 'loading', // loading | playing | stageClear | gameOver | complete
  screenT: 0,
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

function update() {
  if (state.screen === 'loading') return;

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

  camera.follow(player, FLOOR_R * T);
  advanceAnim(player, PLAYER_SPRITE.atlas);
  for (const e of level.enemies) advanceAnim(e, ENEMY_SPRITE.atlas);

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
    renderer.clear();
    drawOverlayText([['LOADING…', 22]]);
    return;
  }

  const level = state.level;
  const player = state.player;
  const stage = STAGES[state.stageIndex];
  const bgImg = images[stage.id];

  renderer.clear();
  renderer.drawBackdrop(bgImg, camera);
  renderer.withCameraTransform(camera, () => {
    renderer.drawTiles(level.map, camera);
    for (const bag of level.bags) renderer.drawMoneyBag(bag);
    for (const bottle of level.champagnes) renderer.drawChampagneBottle(bottle);
    for (const hz of level.obstacles) renderer.drawHazard(hz);
    for (const e of level.enemies) renderer.drawEnemy(e, images.enemy, ENEMY_SPRITE.atlas);
    renderer.drawPlayer(player, images.player, PLAYER_SPRITE.atlas, player.inv > 0);
  });

  renderer.drawHUD({
    score: state.score,
    distanceM: Math.max(0, (player.x - 3 * T) / T),
    hearts: state.hearts,
    maxHearts: player.maxHearts,
    stageName: stage.name,
    invulnerable: Date.now() < player.invulnerableUntil,
  });

  if (state.screen === 'stageClear') {
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

loadImages({
  player: PLAYER_SPRITE.url,
  enemy: ENEMY_SPRITE.url,
  eav: STAGES[0].bg,
  edgewood: STAGES[1].bg,
  l5p: STAGES[2].bg,
  underground: STAGES[3].bg,
}).then((loaded) => {
  images = loaded;
  startRun();
  loop.start();
});
