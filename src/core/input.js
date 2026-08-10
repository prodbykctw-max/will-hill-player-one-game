// Keyboard input state. Minimal scaffold — extend with gamepad support
// following the Jandé project's precedent (ARROWS/SPACE/SHIFT + gamepad) if
// parity is wanted.

export function createInput() {
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  return {
    isDown(code) {
      return keys.has(code);
    },
  };
}
