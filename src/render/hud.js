// HUD — portrait layout following the reference image: a bordered
// character-portrait box top-left, segmented bars beside it, pause control
// top-right. Canvas-drawn rather than DOM (Jandé uses DOM; at this scope
// canvas is simpler and keeps everything in one paint path).
//
// Screen space — called AFTER the world transform is restored.

const PAD = 10;

export function createHud(ctx, canvas) {
  // The pause control's on-screen rect, refreshed every frame in draw(). It
  // has to be published rather than recomputed by the caller, or the button
  // drifts out of step with its own hitbox the moment the layout changes.
  const pauseRect = { x: 0, y: 0, w: 0, h: 0 };
  // Crops the character's head out of the spritesheet's idle frame for the
  // portrait box, so the HUD portrait is always in sync with the sprite art
  // instead of being a separate asset that can drift.
  function drawPortrait(img, atlas, x, y, size) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,16,0.85)';
    ctx.fillRect(x, y, size, size);

    if (img && atlas) {
      const [cellW, cellH] = atlas.frameSize;
      const idle = atlas.animations.idle;
      const fit = atlas.fitRef || { h: 1, b: 1 };
      // head region: top of the character's occupied band, ~32% of its height
      const charTop = (fit.b - fit.h) * cellH;
      const headH = fit.h * cellH * 0.34;
      const headW = headH;
      // Locate the idle clip's first frame the same way the renderer does.
      // Clips now flow across the sheet as a grid so each can be its own
      // length, so `start` is a LINEAR frame index; `row` only exists on the
      // older uniform sheets. Reading `row` unconditionally made this NaN and
      // blanked the portrait the moment the player sheet was relaid out.
      const idx = idle.start !== undefined ? idle.start : idle.row * atlas.cols;
      const fx = (idx % atlas.cols) * cellW;
      const fy = Math.floor(idx / atlas.cols) * cellH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, size - 4, size - 4);
      ctx.clip();
      ctx.drawImage(
        img,
        fx + cellW / 2 - headW / 2, fy + charTop,
        headW, headH,
        x + 2, y + 2, size - 4, size - 4,
      );
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(255,214,110,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    ctx.restore();
  }

  // Segmented bar, like the reference's chunky block meters.
  function drawSegBar(x, y, w, h, segments, filled, colorFor) {
    const gap = 2;
    const segW = (w - gap * (segments - 1)) / segments;
    for (let i = 0; i < segments; i++) {
      const sx = x + i * (segW + gap);
      if (i < filled) {
        ctx.fillStyle = colorFor(i / Math.max(1, segments - 1));
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
      }
      ctx.fillRect(sx, y, segW, h);
    }
  }

  function drawPauseGlyph(x, y, size) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,16,0.85)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(235,235,240,0.9)';
    const bw = size * 0.16;
    ctx.fillRect(x + size * 0.32, y + size * 0.26, bw, size * 0.48);
    ctx.fillRect(x + size * 0.52, y + size * 0.26, bw, size * 0.48);
    ctx.restore();
  }

  function draw(state) {
    const {
      score, distanceM, hearts, maxHearts, stageName,
      champagneFrac, portraitImg, portraitAtlas,
    } = state;

    const box = Math.min(54, Math.max(38, canvas.width * 0.11));
    const barX = PAD + box + 8;
    const barW = Math.min(canvas.width - barX - PAD - box - 10, canvas.width * 0.52);

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    // panel behind the whole cluster
    ctx.fillStyle = 'rgba(8,6,14,0.55)';
    ctx.fillRect(PAD - 4, PAD - 4, box + barW + 18, box + 8);

    drawPortrait(portraitImg, portraitAtlas, PAD, PAD, box);

    // hearts — segmented, warm->cool across the bar like the reference
    const barH = Math.max(8, box * 0.26);
    drawSegBar(barX, PAD + 2, barW, barH, maxHearts, hearts, (t) => {
      const r = Math.round(224 - t * 90);
      const g = Math.round(60 + t * 150);
      return `rgb(${r},${g},70)`;
    });

    // champagne / invulnerability timer — second bar, blue like the reference
    const seg2 = 10;
    const filled2 = Math.round(champagneFrac * seg2);
    drawSegBar(barX, PAD + barH + 6, barW, barH * 0.7, seg2, filled2, () => 'rgb(70,180,235)');

    // score + distance under the bars
    ctx.font = `700 ${Math.round(box * 0.34)}px sans-serif`;
    ctx.fillStyle = '#ffd66e';
    ctx.textAlign = 'left';
    ctx.fillText(`$${score.toLocaleString()}`, barX, PAD + box - 1);

    ctx.font = `600 ${Math.round(box * 0.23)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(distanceM)}m`, barX + barW, PAD + box - 1);

    pauseRect.x = canvas.width - PAD - box;
    pauseRect.y = PAD;
    pauseRect.w = box;
    pauseRect.h = box;
    drawPauseGlyph(pauseRect.x, pauseRect.y, box);

    // stage name under the pause control
    ctx.font = `700 ${Math.round(box * 0.22)}px sans-serif`;
    ctx.fillStyle = 'rgba(232,217,160,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(stageName.toUpperCase(), canvas.width - PAD, PAD + box + 14);

    ctx.restore();
  }

  return { draw, pauseRect };
}
