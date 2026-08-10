// Will Hill: Player One — entry point.
// This is a scaffold: it wires the module structure and boots a placeholder
// loop, but does not yet implement gameplay (see docs/GDD.md for design,
// CLAUDE.md for architecture). Fill in core/loop.js, entities/, world/, and
// render/ as real implementation work starts.

import { createLoop } from './core/loop.js';
import { createCamera } from './core/camera.js';
import { createInput } from './core/input.js';
import { renderPlaceholder } from './render/renderer.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const input = createInput();
const camera = createCamera({ headroom: true }); // extra headroom per GDD.md "Camera"

const loop = createLoop((dt) => {
  renderPlaceholder(ctx, canvas, { camera, input });
});

loop.start();
