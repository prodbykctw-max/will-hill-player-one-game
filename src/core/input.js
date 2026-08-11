// Input — keyboard plus on-screen touch controls.
//
// Directional helpers are ported from Jandé's iL()/iR()/iU() pattern
// (once-upon-a-time/index.html ~line 1442-1447), with its touch state (TC)
// merged in the same way: each helper ORs the keyboard state with the touch
// state, so nothing downstream has to know which device drove it. Dropped
// from Jandé: iD() (slide — no slide clip) and the strike key (no combat,
// per docs/GDD.md). Dash maps to the `roll` animation.
//
// The pads are only switched on for touch devices. This game is
// portrait-phone-first, so without them it is literally unplayable on its
// primary target; on desktop they would just be clutter over the frame.

const TOUCH_ACTS = ['left', 'right', 'jump', 'dash'];

function isTouchDevice() {
  return (
    (typeof window !== 'undefined' && 'ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

export function createInput() {
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    // stop the page scrolling out from under a jump
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  const touch = { left: false, right: false, jump: false, dash: false };

  // Listeners are attached UNCONDITIONALLY; only VISIBILITY is gated on
  // touch detection. Gating the listeners too made the pads inert whenever
  // detection said "not touch" — which breaks hybrid machines (touchscreen
  // laptops), breaks anyone who plugs in a touch display later, and makes
  // the controls impossible to exercise in a desktop test harness.
  if (isTouchDevice()) document.body.classList.add('touch');

  {
    for (const act of TOUCH_ACTS) {
      const el = document.querySelector(`#touch [data-act="${act}"]`);
      if (!el) continue;

      const set = (on) => {
        touch[act] = on;
        el.classList.toggle('on', on);
      };

      // Pointer events cover touch, pen and mouse in one path. Capture keeps
      // the press alive if the thumb slides off the pad mid-jump — losing a
      // jump because your thumb drifted 3px is the single most annoying
      // failure mode on a phone platformer.
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        set(true);
      });
      const release = (e) => {
        if (e) e.preventDefault();
        set(false);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      // belt and braces: a pointer that ends anywhere clears every pad
      window.addEventListener('pointerup', () => set(false));
    }

    // Coming back from a backgrounded tab with a pad stuck "down" would run
    // the player off a ledge on their own.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        for (const act of TOUCH_ACTS) {
          touch[act] = false;
          document.querySelector(`#touch [data-act="${act}"]`)?.classList.remove('on');
        }
      }
    });
  }

  function isDown(code) {
    return keys.has(code);
  }

  return {
    isDown,
    left: () => isDown('ArrowLeft') || isDown('KeyA') || touch.left,
    right: () => isDown('ArrowRight') || isDown('KeyD') || touch.right,
    jump: () => isDown('Space') || isDown('ArrowUp') || isDown('KeyW') || touch.jump,
    dash: () => isDown('ShiftLeft') || isDown('ShiftRight') || isDown('KeyX') || touch.dash,
  };
}
