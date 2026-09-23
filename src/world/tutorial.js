// WILL HILL TEACHES THE GAME, LIVE — replaces the old static HOW TO PLAY
// screen as the thing that actually teaches a first-time player.
//
// Client: "what we'll be doing is replacing the gameplay how to play
// instruction section completely with the portion of the first stage where
// Will Hill describes how to play with talk bubbles" — Pokémon-Game-Boy-NPC
// style: the world freezes, a box opens, and Will Hill (the player himself,
// there is no separate NPC) says what the ✕/✓ screenshots used to show.
// OPTIONS → HOW TO PLAY keeps the old panel as a static recap (ui/panel.js);
// this module is what fires the first time, in stage one, live.
//
// This file owns the WORDS and the trigger MATH — whether a lesson should
// fire right now, given the level and the player's position. It owns no
// rendering and no input: main.js drives the freeze/advance state machine
// and draws the box, the same split every other screen in this game follows
// (world/stages describes, main.js orchestrates, render/ paints).
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
    "Yo — I'm Will Hill. Money's flying everywhere between here and the "
      + 'show. Let’s get it.',
    '◀ ▶ to move. Tap JUMP to jump — tap it again in the air '
      + 'for a double jump.',
    "Hold DASH to roll past trouble. Can't be touched while I'm rolling.",
  ],
  pothole: [
    "Pothole. Jump it, don't step in it — twists my ankle every time.",
  ],
  // ⚠️ CALLED `gap` IN CODE, "MANHOLE" ON SCREEN. The old HOW TO PLAY panel's
  // ✕/✓ pair was labelled MANHOLE (index.html) even though nothing in the
  // engine has a "manhole" entity — it's the same jump-only pit generator.js
  // calls a gap. Kept the player-facing word here; see generator.js's own
  // note on `level.pits` for the code-side name.
  gap: [
    "Open manhole up ahead. Jump it, or I'm going down.",
  ],
  ninja: [
    "Street ninja. Don't walk into him — jump on his head. That's plus "
      + 'fifty for the stomp.',
  ],
  champagne: [
    'Champagne bottle. Grab it — doubles every bag I pick up, and '
      + "nothing can touch me for a few seconds.",
  ],
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

// The four hazard arrays this stage's generator streams forward-only, so
// index 0 is always "the first one placed" — i.e. the first one the player
// will reach. See generator.js: obstacles (potholes), pits (gaps/"manholes"),
// enemies (ninjas), champagnes (bottles).
function hazardX(level, id) {
  if (id === 'pothole') return level.obstacles[0]?.x;
  if (id === 'gap') return level.pits[0]?.x;
  if (id === 'ninja') return level.enemies[0]?.x;
  if (id === 'champagne') return level.champagnes[0]?.x;
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
    const x = hazardX(level, id);
    if (x == null || player.x + HAZARD_LEAD < x) continue;
    if (!best || x < best.x) best = { id, x };
  }
  return best ? best.id : null;
}
