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

  // ── Kill browser zoom, all three routes into it ──────────────────────
  // A game where a stray tap zooms the board is unplayable, and this needs
  // belt and braces: the viewport meta asks for user-scalable=no and iOS
  // Safari has ignored that since iOS 10, and `touch-action` in index.html
  // covers only one of the three routes.
  //
  // 1. Double-tap. touch-action:manipulation is supposed to stop this, and on
  //    iOS it still fires when the two taps land on different elements —
  //    which is exactly what happens working the left/right pads back and
  //    forth. Timing the gap between touchends and cancelling the second is
  //    the only thing that reliably stops it. 350ms is above the ~300ms
  //    Safari uses to pair taps, and single taps are left alone so ordinary
  //    clicks still work.
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // 2. Pinch. WebKit's gesture events are a separate path that ignores
  //    touch-action entirely. These never fire outside Safari.
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(g, (e) => e.preventDefault(), { passive: false });
  }

  // 3. Desktop: ctrl/cmd + wheel, and trackpad pinch, which arrive as a
  //    wheel event with ctrlKey set.
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

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

      // MULTI-TOUCH. Each pad remembers WHICH pointer pressed it and only
      // responds to that one. The first version also had a window-level
      // pointerup that cleared every pad, so lifting the movement thumb
      // simultaneously cancelled jump — which made jumping forward, the most
      // common thing you do in a platformer, nearly impossible.
      let ownerId = null;

      // Capture keeps the press alive if the thumb slides off the pad
      // mid-jump; losing a jump to a few px of drift is miserable.
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ownerId = e.pointerId;
        el.setPointerCapture?.(e.pointerId);
        set(true);
      });
      const release = (e) => {
        if (e) {
          if (ownerId !== null && e.pointerId !== ownerId) return; // another finger
          e.preventDefault();
        }
        ownerId = null;
        set(false);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
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
