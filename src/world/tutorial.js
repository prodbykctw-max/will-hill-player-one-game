// WILL HILL TEACHES THE GAME, LIVE — replaces the old static HOW TO PLAY
// screen as the thing that actually teaches a first-time player.
//
// Will Hill's management (Scoon), with a drawing: "Instead of that screen can
// we get rid of that and make a text bubble come from Will describing the
// same instructions. Kinda like Pokémon on gameboy used to be." The drawing
// puts the bubble up and to the right of his head; main.js draws it there.
//
// ⚠️ ALL AT THE START, STANDING STILL, TAPPED THROUGH. Client, after a round
// where the controls were acted out and each hazard got its own bubble the
// first time it came up: "I kinda don't want them to act it out now. I kind
// of want you just to be standing still in the beginning, read off all the
// instructions, let them tap through those... and then we gonna let the
// instructions just be at the beginning stage when you can't move and then go
// from there." So there is ONE lesson, at the start of stage one, and nothing
// interrupts the run after it.
//
// ⚠️ HELLO, THE GOAL, THE INSTRUCTIONS, THEN GO. An earlier cut dropped the
// greeting ("obviously everybody knows he's Will Hill"); the client then asked
// for it back as an opener, with the goal straight after it: "he should say
// like 'Yo, it's Will Hill' then... 'Help me make it to my show.' Then... lead
// with instructions as they are now. Then at the end say 'Let's get it!'
// Where the make it to the show phrase was." The instructions are the old
// HOW TO PLAY screen's (index.html #howList) in the client's order — the
// controls, the bag, the enemies. The money in this game is bags, not coins.
// The numbers are the code's: stomp kills (main.js), CHAMPAGNE_MULT 2,
// CHAMPAGNE_SECONDS 9 — if they change, these change with them.
//
// OPTIONS → HOW TO PLAY keeps the old panel as a static recap (ui/panel.js).
//
// This file owns the WORDS and which picture goes with which line. main.js
// owns the freeze, the paging and the drawing.
export const TUTORIAL_LESSONS = {
  intro: [
    'Yo, it’s Will Hill.',
    'Help me make it to my show.',
    '◀ ▶ to move.',
    'JUMP to jump. Tap it twice for a double jump.',
    'DASH to roll past trouble. You can’t be hit while rolling.',
    'Get the bag.',
    'Defeat enemies. Jump on their heads.',
    'Jump over potholes and open manholes.',
    'Champagne: double money for 9 seconds.',
    'Let’s get it!',
  ],
};

// ⚠️ A PICTURE IN THE BUBBLE WHEN THE LINE NAMES A THING. Client: "the
// champagne bottle, when you mention it, just show an image of the champagne
// bottle; money bags, when you mention it show the money bags; enemies, when
// you mention it show a... HUD image of them inside the bubble as well."
// 'bag' and 'champagne' are the in-game pickup sprites; 'enemy' is a head
// portrait cropped off the stage's own enemy sheet, framed like the HUD's
// portrait of Will. Same indices as TUTORIAL_LESSONS; null is words only.
export const TUTORIAL_PICTURES = {
  intro: [null, null, null, null, null, 'bag', 'enemy', null, 'champagne', null],
};

// Every lesson that has to have been seen, once, ever, before the tutorial
// retires itself (howToSeen()). One now.
export const TUTORIAL_ORDER = ['intro'];

// The lesson to open THIS tick, or null. Pure, so a harness can call it.
export function nextTutorialTrigger(level, player, fired) {
  return fired.has('intro') ? null : 'intro';
}
