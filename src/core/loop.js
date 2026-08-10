// Fixed-step-friendly requestAnimationFrame loop.
//
// Note (carried over from the Jandé project's verify workflow): rAF is
// throttled/suspended when the tab or Browser pane is hidden. When wiring up
// a local devserver for in-browser verification, use a timer-driven rAF pump
// for hidden/background tabs rather than relying on the browser's native rAF.

export function createLoop(update) {
  let running = false;
  let last = 0;

  function frame(t) {
    if (!running) return;
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    update(dt);
    requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
  };
}
