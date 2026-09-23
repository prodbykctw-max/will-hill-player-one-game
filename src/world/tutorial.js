// WILL HILL TEACHES THE GAME, LIVE — replaces the old static HOW TO PLAY
// screen as the thing that actually teaches a first-time player.
//
// Will Hill's management (Scoon), with a drawing: "Instead of that screen can
// we get rid of that and make a text bubble come from Will describing the
// same instructions. Kinda like Pokémon on gameboy used to be." The drawing
// puts the bubble up and to the right of his head; main.js draws it there.
//
// ⚠️ THE SAME INSTRUCTIONS, NOT A SCRIPT. Client, on the first cut, which had
// him introducing himself: "obviously everybody knows he's Will Hill so why
// [would] he introduce himself in his own game, it would just be a goal and
// instruction after the goal." Then, on the order: "he tells you how to play
// instructions and then the goal is something simple like make it to the end
// of the stage." And the final order: "the last phrase should be help me make
// it to the show cause it should be the how to — like how to move, jump and
// dash, collect coins, get the bag and... defeat enemies." So: the three
// controls (each one DONE, see TUTORIAL_DRILLS), then the bag, the enemies,
// and the goal; then each hazard as it comes up, in the old HOW TO PLAY
// screen's words (index.html #howList). The money in this game is bags, not
// coins, so the line says the bag. His fuller commentary is a later pass.
// The numbers are the code's — stomp +50 (main.js), CHAMPAGNE_MULT 2,
// CHAMPAGNE_SECONDS 9; if they change, these change with them.
//
// OPTIONS → HOW TO PLAY keeps the old panel as a static recap (ui/panel.js);
// this module is what fires the first time, in stage one, live.
//
// This file owns the WORDS and the trigger MATH — whether a lesson should
// fire right now, given the level and the player's position. It owns no
// rendering and no input: main.js drives the freeze/advance state machine
// and draws the bubble, the same split every other screen in this game
// follows (world/stages describes, main.js orchestrates, render/ paints).
//
// ⚠️ ONE LESSON AT A TIME, NEAREST FIRST, NOT A FIXED SCRIPT ORDER. Stage
// one's layout is procedural (world/generator.js) — which hazard the player
// reaches first is not fixed even though the SEED is, because nothing here
// hardcodes "pothole always comes before the ninja". `nextTutorialTrigger`
// reads whichever of the four hazard arrays is both un-taught and closest
// ahead of the player, so the lesson always matches what is actually about
// to happen rather than a guess at stage order.
export const TUTORIAL_LESSONS = {
  intro: [
    '◀ ▶ to move.',
    'JUMP to jump. Tap it twice for a double jump.',
    'DASH to roll past trouble. You can’t be hit while rolling.',
    'Get the bag.',
    'Defeat enemies.',
    'Help me make it to the show.',
  ],
  pothole: ['Pothole. Jump it.'],
  // ⚠️ CALLED `gap` IN CODE, "MANHOLE" ON SCREEN. The old HOW TO PLAY panel's
  // ✕/✓ pair was labelled MANHOLE (index.html) even though nothing in the
  // engine has a "manhole" entity — it's the same jump-only pit generator.js
  // calls a gap. Kept the player-facing word here; see generator.js's own
  // note on `level.pits` for the code-side name.
  gap: ['Manhole. Jump it.'],
  ninja: ['Ninja. Jump on him. +$50'],
  champagne: ['Champagne. Grab it for double money, 9 seconds.'],
};

// ⚠️ THE CONTROLS ARE DONE, NOT READ. Client: "when it says move, you should
// have to move left and right for like one or two seconds and then you should
// be able to actually press those buttons to demonstrate that you actually
// understand and then start the game." So a page named here is a DRILL: the
// player has the controls while it is up, a tap cannot skip it, and it turns
// by itself the moment the move has actually been made (main.js,
// drillDone()). A null page is read and tapped through, world frozen, the
// way every hazard lesson is. Same indices as TUTORIAL_LESSONS.
export const TUTORIAL_DRILLS = {
  intro: ['move', 'jump', 'dash', null, null, null],
};

// `intro` first, always — everything else is picked by proximity, not by
// this order. Also the full roster `nextTutorialTrigger`'s caller checks
// against to know every lesson has fired at least once (see main.js).
export const TUTORIAL_ORDER = ['intro', 'pothole', 'gap', 'ninja', 'champagne'];

// World-px of lead the player gets before a hazard interrupts play — far
// enough that the thing being taught is still standing there on screen when
// the box opens (a lesson that names something already scrolled past reads
// as a bug), not so far that it fires while the hazard is still off-camera.
const HAZARD_LEAD = 260;

// The nearest hazard of a kind that is still AHEAD of him — not simply the
// first one placed. A lesson can only open while he is standing (main.js
// never freezes him in mid-air), so a player who jumps clean over the first
// pothole lands past it; keyed on index 0 that lesson could never fire again
// and the tutorial could never finish. See generator.js for the arrays:
// obstacles (potholes), pits (gaps/"manholes"), enemies (ninjas),
// champagnes (bottles).
function nextAhead(list, px) {
  let best;
  for (const h of list) {
    if (h.alive === false) continue;              // a stomped ninja
    if (h.x + (h.w || 0) <= px) continue;          // already behind him
    if (best === undefined || h.x < best) best = h.x;
  }
  return best;
}

function hazardX(level, id, px) {
  if (id === 'pothole') return nextAhead(level.obstacles, px);
  if (id === 'gap') return nextAhead(level.pits, px);
  if (id === 'ninja') return nextAhead(level.enemies, px);
  if (id === 'champagne') return nextAhead(level.champagnes, px);
  return undefined;
}

// Returns the lesson id to fire THIS tick, or null. `fired` is the set of
// lesson ids already shown this run (state.tutorialFired) — never returns
// one already in it. Pure function of level/player/fired so it is cheap to
// call every tick and easy to drive from a harness without booting a run.
export function nextTutorialTrigger(level, player, fired) {
  if (!fired.has('intro')) return 'intro';
  let best = null;
  for (const id of TUTORIAL_ORDER) {
    if (id === 'intro' || fired.has(id)) continue;
    const x = hazardX(level, id, player.x);
    if (x == null || player.x + HAZARD_LEAD < x) continue;
    if (!best || x < best.x) best = { id, x };
  }
  return best ? best.id : null;
}
