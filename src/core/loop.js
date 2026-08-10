// Fixed-timestep accumulator loop — direct port of Jandé's loop(ts) pattern
// (once-upon-a-time/index.html, ~line 5180-5193): 16.6ms physics steps, up to
// 3 per rendered frame, backlog dropped if the accumulator falls too far
// behind (slow devices don't spiral into a death loop). Physics constants
// throughout src/core/physics.js are tuned for this fixed step, so update()
// takes no dt — it always represents exactly one 16.6ms tick.
//
// Note (carried over from the Jandé project's verify workflow): rAF is
// throttled/suspended when the tab or Browser pane is hidden. When wiring up
// a local devserver for in-browser verification, use a timer-driven rAF pump
// for hidden/background tabs rather than relying on the browser's native rAF.

const STEP_MS = 16.6;
const MAX_STEPS_PER_FRAME = 3;

export function createLoop({ update, draw }) {
  let running = false;
  let lastT = 0;
  let acc = 0;

  function frame(ts) {
    if (!running) return;
    if (!lastT) {
      lastT = ts;
      requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(100, ts - lastT);
    lastT = ts;
    acc += dt;

    let steps = 0;
    while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      update();
      acc -= STEP_MS;
      steps++;
    }
    if (acc >= STEP_MS) acc = 0; // drop backlog rather than spiral

    draw();
    requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastT = 0;
      acc = 0;
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
  };
}
