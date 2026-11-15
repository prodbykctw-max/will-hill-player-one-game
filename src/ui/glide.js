// MOTION FOR THE PANEL — NOTHING JUST APPEARS.
//
// Three rules, and this file is the only place they are implemented:
//
//   1. What you touched grows into the screen it opens.
//   2. Going back shrinks to exactly the control it came from.
//   3. A panel or dialog opened by a button grows out of that button.
//
// ⚠️ MOTION ONLY. Nothing here decides what is on screen — every caller has
// already (or in the same tick) put the DOM into its final state, and the end
// state of every screen is what it was before this file existed. Game state
// (pause, resume, input) never waits on an animation.
//
// Two mechanisms, chosen by whether the DOM change can wait a frame:
//
//   growIn / shrinkOut   Web Animations on the REAL element, for the panel
//                        opening and closing. The DOM changes synchronously,
//                        exactly as it always did — opening the panel pauses
//                        the game and that must stay instantaneous.
//
//   glide                the View Transitions API, for swapping one view of
//                        the panel for another. The browser holds the old
//                        picture, the update runs, and the named element
//                        morphs from the control to the view (or back).
//
// Both are skipped when the user asks for less motion, and glide falls back
// to doing the update at once where View Transitions do not exist.

export const OUT = 'cubic-bezier(.2,.8,.2,1)';   // growing
export const BACK = 'cubic-bezier(.4,0,.2,1)';   // shrinking back

const MQ = '(prefers-reduced-motion: reduce)';

// ⚠️ NO SETTING OF THE GAME'S OWN. There is no reduce-motion switch in this
// game's settings, so the one signal is the OS's — which Safari reports from
// iOS Accessibility. Read live, never cached: it can change while the page
// is open.
export function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia(MQ).matches);
}

const usable = (r) => !!r && r.width > 1 && r.height > 1;

// ── rule 3, the real element ─────────────────────────────────────────────
//
// `from` is a client-space rect (the control that opened it). The element
// grows from the control's centre: scale + opacity, with the transform-origin
// put AT the control, so it reads as coming out of it rather than zooming from
// the middle of the screen.
function originFor(target, from) {
  const to = target.getBoundingClientRect();
  if (!usable(to) || !usable(from)) return null;
  const s = Math.min(0.85, Math.max(0.25, Math.max(from.width / to.width, from.height / to.height)));
  const ox = from.left + from.width / 2 - to.left;
  const oy = from.top + from.height / 2 - to.top;
  return { s, origin: `${ox}px ${oy}px` };
}

// A shrink holds its last frame (fill: forwards) so the element does not flash
// back to full size before the caller hides it. The hold has to be let go
// before anything grows the same element again, or it would reappear faded.
const holds = new WeakMap();
export function release(target) {
  const a = target && holds.get(target);
  if (a) { try { a.cancel(); } catch { /* gone */ } holds.delete(target); }
}

export function growIn(target, from, { duration = 260 } = {}) {
  release(target);
  if (!target || reducedMotion()) return null;
  const o = originFor(target, from);
  if (!o) return null;
  return target.animate(
    [{ opacity: 0, transform: `scale(${o.s})`, transformOrigin: o.origin },
      { opacity: 1, transform: 'scale(1)', transformOrigin: o.origin }],
    { duration, easing: OUT });
}

export function shrinkOut(target, from, { duration = 220 } = {}) {
  release(target);
  if (!target || reducedMotion()) return null;
  const o = originFor(target, from);
  if (!o) return null;
  const a = target.animate(
    [{ opacity: 1, transform: 'scale(1)', transformOrigin: o.origin },
      { opacity: 0, transform: `scale(${o.s})`, transformOrigin: o.origin }],
    { duration, easing: BACK, fill: 'forwards' });
  holds.set(target, a);
  return a;
}

// Fades the dimmed backdrop (the element that holds the card) alongside it.
export function fade(target, to, { duration = 200 } = {}) {
  release(target);
  if (!target || reducedMotion()) return null;
  const a = target.animate([{ opacity: to ? 0 : 1 }, { opacity: to ? 1 : 0 }],
    { duration, easing: to ? OUT : BACK, fill: to ? 'none' : 'forwards' });
  if (!to) holds.set(target, a);
  return a;
}

// ── rules 1 and 2, the views ─────────────────────────────────────────────
//
//   glide(update, { from, to, dir })
//
//   update   applies the DOM change.
//   from     element that is on screen NOW and is the thing being left —
//            the tapped control going in, the view going back.
//   to       () => element that exists AFTER update and is the thing being
//            arrived at — the view going in, the control going back.
//
// The same `view-transition-name` is given to both so the browser morphs one
// into the other. Names are removed again afterwards: a name left behind makes
// every later transition tangle with it.
//
// ⚠️ THE UPDATE RUNS A FRAME LATE, which is how View Transitions work (the old
// picture has to be captured first). `epoch` is how a caller says "something
// more important happened in between" — close(), open(), a second glide — and
// a stale update then does NOT run, instead of re-showing a view the player
// has already left.
let running = null;
let epoch = 0;

export function cancelGlide() {
  epoch++;
  const t = running;
  running = null;
  try { t?.skipTransition?.(); } catch { /* already finished */ }
}

const NAME = 'glide';
const setName = (el) => { if (el) el.style.viewTransitionName = NAME; };
const clearName = (el) => { if (el && el.style.viewTransitionName === NAME) el.style.viewTransitionName = ''; };

export function glide(update, { from, to, dir = 'in' } = {}) {
  const ok = typeof document.startViewTransition === 'function'
    && !reducedMotion() && from && usable(from.getBoundingClientRect());
  if (!ok) { cancelGlide(); update(); return; }
  cancelGlide();
  const mine = epoch;
  let dest = null;
  setName(from);
  document.documentElement.dataset.glide = dir;
  let t;
  try {
    t = document.startViewTransition(() => {
      clearName(from);
      if (mine !== epoch) return;     // superseded before it ran: leave it be
      update();
      dest = to && to();
      setName(dest);
    });
  } catch {
    clearName(from);
    delete document.documentElement.dataset.glide;
    update();
    return;
  }
  running = t;
  const done = () => {
    clearName(from); clearName(dest);
    if (running === t) running = null;
    if (!running) delete document.documentElement.dataset.glide;
  };
  t.finished.then(done, done);
}

// A resize mid-flight leaves the morph pointing at where things WERE.
window.addEventListener('resize', cancelGlide);
