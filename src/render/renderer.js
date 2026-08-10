// Canvas 2D renderer. Placeholder draw so the scaffold is visibly running
// before real rendering (backgrounds, sprites, tilemap) is implemented.

export function renderPlaceholder(ctx, canvas, { camera, input }) {
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffd66e';
  ctx.font = '16px monospace';
  ctx.fillText('Will Hill: Player One — scaffold running', 16, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '12px monospace';
  ctx.fillText('See docs/GDD.md for design, CLAUDE.md for architecture.', 16, 48);
}
