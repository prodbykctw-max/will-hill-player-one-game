// Keyboard input state + directional helpers — ported from Jandé's
// iL()/iR()/iU() pattern (once-upon-a-time/index.html ~line 1442-1447).
// Dropped: iD() (slide — no composed slide animation, not in scope) and the
// strike key (no combat, per docs/GDD.md). Dash maps to the `roll`
// animation, same role as Jandé's dash key (burst speed + i-frames).

export function createInput() {
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  function isDown(code) {
    return keys.has(code);
  }

  return {
    isDown,
    left: () => isDown('ArrowLeft') || isDown('KeyA'),
    right: () => isDown('ArrowRight') || isDown('KeyD'),
    jump: () => isDown('Space') || isDown('ArrowUp') || isDown('KeyW'),
    dash: () => isDown('ShiftLeft') || isDown('ShiftRight') || isDown('KeyX'),
  };
}
