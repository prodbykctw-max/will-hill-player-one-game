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
 * Tap PRESS START and walk whatever the start chain puts in the way, until
 * the run is actually going. Returns the screen it ended on, so a caller can
 * assert on it.
 *
 * ⚠️ THE TAP LANDS ON HIS LETTERING NOW, NOT ON OPEN ART. Client: "I can
 * still tap anywhere and start the game. I thought we removed that." Since
 * that landed, a tap anywhere that is not a control does NOTHING — so this
 * asks the title for its own promptRect and taps its centre. The old x/y
 * arguments are accepted and ignored, so existing callers keep working;
 * they used to name a patch of empty skyline anyway.
 */
export async function startFromTitle(p, { x = 0, y = 0, tap = 'touch' } = {}) {
  // ⚠️ SEEDED AS A RETURNING PLAYER, ON PURPOSE. Will Hill's live tutorial
  // (world/tutorial.js) now teaches stage one instead of the old HOW TO PLAY
  // panel screen, and it FREEZES THE WORLD to do it — the same "get past the
  // stop, don't make every caller learn its shape" job this file already
  // does for the contest form. A harness that wants to test the tutorial
  // itself needs the opposite of this seed; everything else — which is
  // nearly every harness in this repo, per the header note above — wants
  // stage one playable the instant this function returns, exactly as it was
  // before the tutorial moved off its own screen. See tools/harness/
  // tutorial.mjs for the one that tests it un-skipped.
  await p.evaluate(() => { try { localStorage.setItem('wh_intro_v3', '1'); } catch (_e) {} });
  const pt = await p.evaluate(() => {
    const r = window.__title.promptRect(window.__game.titleBox);
    const cv = document.querySelector('canvas');
    const s = cv.getBoundingClientRect().width / cv.width;
    return { x: (r.x + r.w / 2) * s, y: (r.y + r.h / 2) * s };
  });
  if (tap === 'mouse') await p.mouse.click(pt.x, pt.y);
  else await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(900);
  // NOT NOW past the contest form (a registered player never sees it).
  // `btnHowBack` has not been reachable from this chain since HOW TO PLAY
  // moved off its own screen — kept as a no-op click rather than deleted, in
  // case OPTIONS ever routes back through here for some future chain shape.
  await clickIfShown(p, 'btnSkip');
  await clickIfShown(p, 'btnHowBack');
  await p.waitForTimeout(1200);
  return p.evaluate(() => window.__game.screen);
}
