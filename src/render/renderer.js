// Canvas 2D renderer. World-space drawing (tiles/player/enemies/pickups)
// goes through the camera transform, same scale-then-translate approach as
// Jandé's draw() (once-upon-a-time/index.html ~line 3914:
// `FX.scale(ZOOM,ZOOM);FX.translate(-camX,-camY)`); HUD is drawn in screen
// space afterward, transform reset.
//
// No tile/prop art exists yet (see docs/GDD.md "Open items" — landmark/tile
// art production is future work), so platforms/ground render as flat
// asphalt-colored rects for now; money bags and champagne bottles render as
// simple stylized shapes rather than sprite art. Swap these for real art by
// replacing the relevant draw* function bodies — the call sites (main.js)
// don't need to change.

import { T, FLOOR_R } from '../world/tilemap.js';

const ASPHALT = '#3a3a3f';
const ASPHALT_EDGE = '#54545c';
const SKY_TOP = '#120a20';
const SKY_BOTTOM = '#2a1a3a';

export function createRenderer(ctx, canvas) {
  function clear() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Fixed/slow-parallax backdrop — the stage reference images are single
  // "postcard" compositions (see docs/GDD.md), not seamless scrolling
  // panoramas, so this is deliberately NOT a tiling scroll: a slow
  // horizontal drift (a fraction of camera.x) plus a fixed vertical anchor
  // near the ground line, scaled to cover the canvas height.
  function drawBackdrop(img, camera) {
    if (!img) return;
    const scale = canvas.height / img.height;
    const drawW = img.width * scale;
    const parallaxX = -((camera.x * 0.15) % drawW);
    for (let x = parallaxX - drawW; x < canvas.width; x += drawW) {
      ctx.drawImage(img, x, 0, drawW, canvas.height);
    }
    // subtle dark scrim so foreground gameplay reads clearly over the art
    ctx.fillStyle = 'rgba(8,4,16,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function withCameraTransform(camera, fn) {
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    fn();
    ctx.restore();
  }

  // Draws only solid ('G'/'P') tiles that are visible, asphalt-colored.
  // Mirrors Jandé's SLAB_R idea loosely (only the top couple of rows read as
  // a solid slab) without porting its undercroft cross-section rendering.
  function drawTiles(map, camera) {
    const c0 = Math.floor(camera.x / T) - 1;
    const c1 = Math.floor((camera.x + camera.vw) / T) + 1;
    const r0 = Math.floor(camera.y / T) - 1;
    const r1 = Math.floor((camera.y + camera.vh) / T) + 1;
    for (const t of map.tiles) {
      if (t.c < c0 || t.c > c1 || t.r < r0 || t.r > r1) continue;
      if (t.t !== 'G' && t.t !== 'P') continue;
      const x = t.c * T;
      const y = t.r * T;
      ctx.fillStyle = ASPHALT;
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = ASPHALT_EDGE;
      ctx.fillRect(x, y, T, 3); // top edge highlight reads as a road surface
    }
  }

  function drawSpriteFrame(image, atlas, animKey, frame, x, y, w, h, flipX) {
    const anim = atlas.animations[animKey];
    if (!anim || !image) return;
    const [fw, fh] = atlas.frameSize;
    const col = frame % anim.frameCount;
    const sx = col * fw;
    const sy = anim.row * fh;
    ctx.save();
    if (flipX) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, sx, sy, fw, fh, 0, 0, w, h);
    } else {
      ctx.drawImage(image, sx, sy, fw, fh, x, y, w, h);
    }
    ctx.restore();
  }

  function drawPlayer(p, image, atlas, blinking) {
    if (blinking && Math.floor(p.inv / 4) % 2 === 0) return; // i-frame flicker
    const drawW = p.w * 2.2; // sprite art is larger than the collision box, same convention as Jandé
    const drawH = p.h * 1.6;
    drawSpriteFrame(image, atlas, p.anim, Math.floor(p.frame), p.x - (drawW - p.w) / 2, p.y - (drawH - p.h), drawW, drawH, p.faceL);
  }

  function drawEnemy(e, image, atlas) {
    const drawW = e.w * 1.8;
    const drawH = e.h * 1.6;
    drawSpriteFrame(image, atlas, e.anim, Math.floor(e.frame), e.x - (drawW - e.w) / 2, e.y - (drawH - e.h), drawW, drawH, e.vx < 0);
  }

  function drawMoneyBag(item) {
    if (item.got) return;
    const { x, y, w, h } = item;
    ctx.fillStyle = '#caa04a';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.quadraticCurveTo(x, y + h * 0.3, x + w * 0.1, y + h);
    ctx.lineTo(x + w * 0.9, y + h);
    ctx.quadraticCurveTo(x + w, y + h * 0.3, x + w * 0.5, y);
    ctx.fill();
    ctx.strokeStyle = '#7a5a1e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#3a2a10';
    ctx.font = `${Math.round(h * 0.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('$', x + w / 2, y + h * 0.78);
  }

  function drawChampagneBottle(item) {
    if (item.got) return;
    const { x, y, w, h } = item;
    ctx.fillStyle = '#2f6b3a';
    ctx.fillRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.75);
    ctx.fillRect(x + w * 0.4, y, w * 0.2, h * 0.3);
    ctx.fillStyle = '#e8d9a0';
    ctx.fillRect(x + w * 0.2, y + h * 0.55, w * 0.6, h * 0.14);
  }

  function drawHazard(o) {
    ctx.fillStyle = '#b03030';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + o.h);
    ctx.lineTo(o.x + o.w / 2, o.y);
    ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.closePath();
    ctx.fill();
  }

  function drawHUD({ score, distanceM, hearts, maxHearts, stageName, invulnerable }) {
    ctx.save();
    ctx.font = '700 20px sans-serif';
    ctx.fillStyle = '#ffd66e';
    ctx.textAlign = 'left';
    ctx.fillText(`$${score.toLocaleString()}`, 16, 30);

    ctx.font = '600 13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`${Math.round(distanceM)}m`, 16, 50);

    ctx.textAlign = 'right';
    ctx.font = '700 15px sans-serif';
    ctx.fillStyle = '#e8d9a0';
    ctx.fillText(stageName, canvas.width - 16, 30);

    for (let i = 0; i < maxHearts; i++) {
      ctx.fillStyle = i < hearts ? '#e0435f' : 'rgba(255,255,255,0.25)';
      const hx = canvas.width - 16 - (maxHearts - i) * 22;
      ctx.beginPath();
      ctx.arc(hx, 46, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (invulnerable) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe08a';
      ctx.font = '700 13px sans-serif';
      ctx.fillText('CHAMPAGNE — INVULNERABLE', canvas.width / 2, 24);
    }
    ctx.restore();
  }

  return {
    clear,
    drawBackdrop,
    withCameraTransform,
    drawTiles,
    drawSpriteFrame,
    drawPlayer,
    drawEnemy,
    drawMoneyBag,
    drawChampagneBottle,
    drawHazard,
    drawHUD,
  };
}
