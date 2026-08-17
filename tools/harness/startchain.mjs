// START IS A CHAIN NOW, AND EVERY HARNESS THAT WANTED A RUN HAS TO WALK IT.
//
// A tap on the title card used to be a run. Since the flow rewire it is the
// head of CONTEST → HOW TO PLAY → run: the sign-up cabinet opens first, and
// the run is launched by the far end of the chain. Three harnesses that only
// ever wanted "get me into gameplay" broke the day that landed, all with the
// same symptom — `screen` stuck on `title` — and all for a reason that has
// nothing to do with what they were testing.
//
// So the walk lives in one place. If a fifth stop is ever added to the chain,
// it is added here and the harnesses that merely pass through it do not care.
// The ORDER of the chain is startflow.mjs's job to assert; this file exists
// only to get past it.
//
//   import { startFromTitle } from './startchain.mjs';
//   await startFromTitle(p);          // -> screen === 'playing'

// Click the DOM button by id if it is actually on screen. Not touchscreen.tap
// and not p.click: the panel's buttons sit under a canvas that also takes
// pointer events, and a touch's delayed synthetic click has landed on the
// wrong element here before.
async function clickIfShown(p, id) {
  const shown = await p.evaluate((i) => {
    const el = document.getElementById(i);
    return !!(el && el.offsetParent);
  }, id);
  if (!shown) return false;
  await p.evaluate((i) => document.getElementById(i).click(), id);
  await p.waitForTimeout(700);
  return true;
}

/**
 * Tap the title card and walk whatever the start chain puts in the way, until
 * the run is actually going. `x`/`y` default to the middle of a 430x932 phone.
 * Returns the screen it ended on, so a caller can assert on it.
 */
export async function startFromTitle(p, { x = 215, y = 300, tap = 'touch' } = {}) {
  if (tap === 'mouse') await p.mouse.click(x, y);
  else await p.touchscreen.tap(x, y);
  await p.waitForTimeout(900);
  // NOT NOW past the contest form (a registered player never sees it), then
  // PLAY off the end of HOW TO PLAY. Both are no-ops if the stop is absent.
  await clickIfShown(p, 'btnSkip');
  await clickIfShown(p, 'btnHowBack');
  await p.waitForTimeout(1200);
  return p.evaluate(() => window.__game.screen);
}
