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

// `haptics` is optional so a test harness can build input on its own.
export function createInput(haptics) {
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

  // ── THE PAD ROUTER ────────────────────────────────────────────────────
  //
  // WHY THIS IS NOT PER-ELEMENT LISTENERS ANY MORE. It used to be: each pad
  // took its own pointerdown and called setPointerCapture so a thumb that
  // drifted a few px off the button did not drop the press. That is right for
  // an action button and WRONG for a d-pad, and it was measured doing exactly
  // the wrong thing — press LEFT, slide the thumb across onto RIGHT without
  // lifting, and LEFT stays lit while RIGHT never fires, because capture had
  // routed every subsequent event back to LEFT. Every single direction change
  // therefore cost a full lift-and-retap. That is the "stiff".
  //
  // So the pointer is routed here instead, against live geometry, and the two
  // kinds of control get the behaviour each actually wants:
  //
  //   MOVEMENT pads RE-TARGET. A pointer that went down on the movement
  //   cluster is re-tested on every move and drives whichever of ◀ / ▶ it is
  //   over. Rolling a thumb from one to the other switches direction with no
  //   lift, and the gap between them belongs to the nearer pad, so there is no
  //   dead strip in the middle to fall into.
  //
  //   ACTION pads LATCH. A pointer that went down on JUMP or DASH keeps it
  //   held until that finger lifts, wherever it wanders. Losing a jump to a
  //   few px of thumb drift is miserable, and unlike direction there is
  //   nothing you would ever want to slide ONTO mid-press.
  //
  // Multi-touch still works because state is per pointerId, not global: the
  // movement thumb and the jump thumb are independent pointers and neither
  // one's lift can clear the other. (The bug that taught us that: a
  // window-level pointerup that cleared every pad, so releasing the movement
  // thumb cancelled an in-flight jump — i.e. jumping forward, which is most
  // of what you do in a platformer.)
  {
    const MOVE_ACTS = ['left', 'right'];
    const els = {};
    for (const act of TOUCH_ACTS) els[act] = document.querySelector(`#touch [data-act="${act}"]`);

    // A PAD GETS A TICK, NOT A CLICK. The haptic fires on the edge into `on`
    // and nowhere else, so rolling a thumb from ◀ to ▶ ticks once for the new
    // direction rather than twice for the swap.
    //
    // There is deliberately NO SOUND here, and that is a judgement rather than
    // an omission. These four pads are pressed several hundred times in a run;
    // a menu click on every one of them would be a metronome playing over the
    // punches and the money bags, which are the sounds that carry information.
    // The tick is silent, private to the hand holding the phone, and can fire
    // as often as it likes without ever being in the way. Menu buttons — where
    // a press is an occasional, considered thing — get both.
    const set = (act, on) => {
      if (!els[act] || touch[act] === on) return;
      touch[act] = on;
      els[act].classList.toggle('on', on);
      if (on && haptics) haptics.tick();
    };

    // Which movement pad is this point on — or, if it is in the gap between
    // them or just past an edge, which is it nearest? SLOP is generous on
    // purpose: a thumb is ~20px across and lands where it lands.
    const SLOP = 26;
    function movePadAt(x, y) {
      let best = null;
      let bestD = Infinity;
      for (const act of MOVE_ACTS) {
        const el = els[act];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Distance outside the rect, 0 when inside.
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = act; }
      }
      return bestD <= SLOP ? best : null;
    }

    // pointerId -> { kind: 'move' | 'latch', act }
    const active = new Map();

    // Listeners on the container, not the pads, so a pointer that leaves a
    // pad is still ours to route. Capture phase and non-passive so the press
    // is claimed before anything else can treat it as a scroll or a tap.
    const root = document.getElementById('touch');
    if (root) {
      root.addEventListener('pointerdown', (e) => {
        const el = e.target.closest?.('[data-act]');
        if (!el) return;
        e.preventDefault();
        const act = el.dataset.act;
        if (MOVE_ACTS.includes(act)) {
          active.set(e.pointerId, { kind: 'move', act });
          set(act, true);
        } else {
          // Capture only the latching buttons. On a movement pointer capture
          // is the bug; here it is the feature — it guarantees the matching
          // pointerup arrives even if the thumb has wandered off the button.
          root.setPointerCapture?.(e.pointerId);
          active.set(e.pointerId, { kind: 'latch', act });
          set(act, true);
        }
      }, { passive: false });

      root.addEventListener('pointermove', (e) => {
        const cur = active.get(e.pointerId);
        if (!cur || cur.kind !== 'move') return;
        e.preventDefault();
        const act = movePadAt(e.clientX, e.clientY);
        if (act === cur.act) return;
        set(cur.act, false);
        // Off the cluster entirely: stop moving, but keep owning the pointer
        // so sliding back on picks straight back up without a re-press.
        cur.act = act;
        if (act) set(act, true);
      }, { passive: false });

      const release = (e) => {
        const cur = active.get(e.pointerId);
        if (!cur) return;
        active.delete(e.pointerId);
        if (cur.act) set(cur.act, false);
      };
      root.addEventListener('pointerup', release);
      root.addEventListener('pointercancel', release);
      // A capture torn down by the browser (element removed, gesture stolen)
      // fires this and nothing else; without it a latched button sticks on.
      root.addEventListener('lostpointercapture', release);
    }

    const clearAll = () => {
      active.clear();
      for (const act of TOUCH_ACTS) set(act, false);
    };
    // Coming back from a backgrounded tab with a pad stuck "down" would run
    // the player off a ledge on their own. `blur` covers the iOS case that
    // visibilitychange misses: the app switcher and the control centre pull
    // the finger off without ever sending a pointerup.
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });
    window.addEventListener('blur', clearAll);
  }

  function isDown(code) {
    return keys.has(code);
  }

  // DEV ONLY — a way to hold a button for an exact number of ticks.
  //
  // The stomp is the whole offence of this game and its timing window turned
  // out to be three ticks wide, which is not something you can measure by
  // playing: a human tap has tens of milliseconds of jitter in it, so the
  // thing being measured is swamped by the thing doing the measuring. Setting
  // `window.__forceInput = { right: true, jump: true }` drives the same
  // functions the game reads, frame-exactly. Vite folds this out of the build.
  const forced = (k) => import.meta.env.DEV
    && typeof window !== 'undefined' && window.__forceInput
    && !!window.__forceInput[k];

  return {
    isDown,
    left: () => forced('left') || isDown('ArrowLeft') || isDown('KeyA') || touch.left,
    right: () => forced('right') || isDown('ArrowRight') || isDown('KeyD') || touch.right,
    jump: () => forced('jump') || isDown('Space') || isDown('ArrowUp') || isDown('KeyW') || touch.jump,
    dash: () => forced('dash') || isDown('ShiftLeft') || isDown('ShiftRight') || isDown('KeyX') || touch.dash,
  };
}
