// CHAMPAGNE RELAY — the walkthrough build.
//
// Named for one of Will Hill's own projects, at the client's suggestion, and
// the name says what it does: the champagne power-up is on for the whole board
// instead of for eight seconds at a time.
//
// WHAT IT IS FOR. He needs to look at the game, not survive it: "I just wanna
// be able to walk through the stage and examine each stage in the whole game
// and the transitions." So three things change and NOTHING else does — bags,
// champagne bottles, the undercroft (rats and all), the MARTA rides, the
// score, the music, the stage clear: all of it behaves exactly as it does in
// the real build. (The one thing that IS gone is the masked ENEMIES — see 1
// below. They are a different thing from the undercroft rats, which are
// scenery and stay.) His words:
// "the game as is except no enemies, no subject to platform gap, and the
// champagne power up is on the whole time."
//
//   1. No enemies spawn.
//   2. Falling into a gap puts him back on the last ground he stood on.
//   3. Invulnerability is topped up every tick, so the aura never drops.
//
// IT IS NOT A SEPARATE BUILD. Same deploy, chosen with `?relay=1` in the URL.
// A second build would be a second thing to keep in step, and the contest
// version is the one that must not drift.
//
// ⚠️ THERE IS NO BUTTON FOR IT ANY MORE. Client: "the champagne relay is not
// going to be there, that's like a dev/dashboard thing" — a player is meant
// to see PRESS START, OPTIONS and MUSIC and nothing else. This flag, and the
// `window.__startStage` dev hook, are that dashboard: the door a developer or
// a harness uses, not one a player is ever shown. `setRelay()` is still
// exported for exactly that — tooling can still flip it directly.
//
// MUTABLE, NOT A BOOT CONSTANT, because `generator.js` asks at spawn time, so
// the answer has to be able to change between one run and the next without a
// reload.
let relay = typeof location !== 'undefined' && /[?&]relay=1\b/.test(location.search);

export function isRelay() { return relay; }
export function setRelay(v) { relay = !!v; }
