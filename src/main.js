// Will Hill: Player One — entry point + game-state orchestration.
// Ties together the ported engine pieces (core/, world/, entities/,
// render/) into an actual playable loop. See docs/GDD.md for design,
// CLAUDE.md for architecture, and the PHASE 2 plan for what was ported from
// Jandé's Action RPG mode vs. reskinned/simplified for Will Hill.

import { createLoop } from './core/loop.js';
import { createCamera } from './core/camera.js';
import { createInput } from './core/input.js';
import { advanceAnim } from './core/animate.js';
import { createPlayer, stepPlayer, stepKnockedDown, isInvulnerable, isChampagne, grantInvulnerability, trip, CHAMPAGNE_SECONDS, PLAYER_SPRITE } from './entities/player.js';
import { createAudio } from './audio/audio.js';
import { WALK_SPEED, RUN_SPEED } from './core/physics.js';
import { ENEMY_SPRITES, updateEnemy, resolveEnemyCollision } from './entities/enemy.js';
import { beginStompOut, stepStompOut, splitStompers } from './entities/knockdown.js';
import { overlapsPlayer, PROP_SPRITES, createDroppedBag, BAG_VALUE, CHAMPAGNE_MULT } from './entities/collectibles.js';
import { createLevel, buildRunway, genAhead, finishLineX } from './world/generator.js';
import { STAGES } from './world/stages.js';
import { T, FLOOR_R, SLAB_R, FALL_DEATH_Y, isSolid } from './world/tilemap.js';
import { createRenderer } from './render/renderer.js';
import { createBackdrop } from './render/backdrop.js';
import { createUndercroft } from './render/undercroft.js';
import { createHud } from './render/hud.js';
import { createMartaMap } from './render/martamap.js';
import { createEnding, statsFrom, endingCards, ENDING_IMAGES, PROMPT as ENDING_PROMPT } from './render/ending.js';
import { createStillScene } from './render/stillscene.js';
import { createTitle, TITLE_IMAGES, INTRO_TICKS as TITLE_INTRO_TICKS,
  SRC_W as STILL_W, SRC_H as STILL_H } from './render/title.js';
import martaMapArt from './assets/backgrounds/marta-map.webp';
import { loadImages } from './render/images.js';
import { createRunLog, lbSubmit, bankLocalRun, isRegistered } from './net/leaderboard.js';
import { createPanel, soundEnabled, setSoundEnabled,
  sfxEnabled, setSfxEnabled } from './ui/panel.js';
import { createHaptics } from './core/haptics.js';
import { STAGE_SLOTS, MAP_SLOTS, MANIFEST } from './audio/music.js';
import { isRelay, setRelay } from './core/relay.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = createRenderer(ctx, canvas);
const backdrop = createBackdrop(ctx, canvas);
const undercroft = createUndercroft(ctx, canvas);
const hud = createHud(ctx, canvas);
const martaMap = createMartaMap(ctx, canvas);
const ending = createEnding(ctx, canvas);
const still = createStillScene(ctx, canvas);
const title = createTitle(ctx, canvas, still);
const haptics = createHaptics();
const input = createInput(haptics);
const audio = createAudio();
// Two switches, restored independently — see setSfxEnabled in ui/panel.js.
audio.setMuted(!soundEnabled());
audio.setSfxMuted(!sfxEnabled());

// PRESSING A THING SHOULD FEEL LIKE PRESSING A THING. One helper rather than
// two calls at every site, because the two halves are one idea and the way
// they drift apart is somebody adding a button and remembering only the sound.
//
//   press()   you touched a control
//   commit()  that control did something irreversible-ish — a run started, a
//             form saved, a stage was left behind
//   back()    you went the other way
function press() { audio.click(); haptics.tap(); }
function commit() { audio.confirm(); haptics.confirm(); }
function goBack() { audio.back(); haptics.tap(); }

// THE PANEL — leaderboard, contest sign-up, settings. Opening it pauses the
// run and takes the pads away with it (syncPads only shows them on `playing`),
// so there is never a frame where you can see controls over a dialog.
const panel = createPanel({
  onClose: () => { if (state.screen === 'paused' && state.resumeTo) resume(); },
  onSoundChange: (on) => audio.setMuted(!on),
  onSfxChange: (on) => audio.setSfxMuted(!on),
  onHapticsChange: (on) => haptics.setEnabled(on),
  // ── TIME OF DAY APPLIES NOW, NOT "NEXT TIME THE GAME LOADS" ──────────
  //
  // The setting always SAVED correctly and always worked after a reload —
  // verified: pick "Always day", reload, and the stage reports tod=day. What
  // it did not do was anything you could see, because `STAGES` is resolved
  // once at module load and this callback was never even passed to the panel.
  // The note said "takes effect next time the game loads", which on a phone —
  // where there is no visible reload — reads as a broken switch. The client:
  // "when I select always day from settings it doesn't change."
  //
  // A RELOAD IS THE FIX, and it is not a cop-out. Changing the time of day
  // changes which of eight background plates and which ~60 multiplane cards
  // the image manifest has to hold, plus the sky gradient, the lighting rig
  // and the rain. Re-resolving all of that live is a large amount of
  // machinery to get one setting applied, and every bit of it is already
  // correct on a cold boot. The choice is in localStorage before the reload
  // happens, so the new page comes up in the half he asked for.
  //
  // MID-RUN IS THE EXCEPTION. Reloading would throw the run away, so the
  // panel is told to say so instead and the change lands at the next boot.
  // Nothing opens the panel mid-run today — OPTIONS on the title and the end
  // of a finished run are the only two doors — but a reload that eats a run
  // is bad enough that the guard is worth having before the third one exists.
  //
  // AND IT COMES BACK TO THE SAME PANE. A settings switch that dumps you out
  // to the title is its own small broken thing: you flip one row and lose the
  // other three. The flag below is read once at boot, so the blink lands you
  // back on SETTINGS with the value you just picked already showing.
  onTimeOfDayChange: () => {
    const midRun = ['playing', 'paused', 'riding', 'stageClear'].includes(state.screen);
    if (midRun) return false;      // panel keeps the "next run" note
    try { sessionStorage.setItem('wh_reopen', 'settings'); } catch (_e) {}
    location.reload();
    return true;
  },
  haptics,
  audio,
});
// Browsers keep an AudioContext suspended until a real gesture, so a key or
// touch is what actually starts the audio thread.
//
// EVERY GESTURE UNTIL IT TAKES, not just the first. These were `once`, which
// gives the context exactly one chance — and a resume() can be refused, or
// land on a page that has not been interacted with the way the browser wanted.
// One refused attempt and the game is silent for the rest of the session.
// They detach themselves as soon as audio.ready() reports a running context,
// so the steady state is still no listeners.
// Ask first, before anyone touches anything. Refused on iOS and in an ordinary
// tab, which is fine and free; allowed for a PWA installed to the home screen
// on Chrome, which is the case the client is actually describing. See
// audio.tryAutostart.
audio.tryAutostart();
{
  // EVERY EVENT THAT COUNTS AS ACTIVATION, not just the three that ought to.
  //
  // The client, on the shipped build: "the home screen music doesn't play
  // unless I hit OPTIONS first." That is the tell. OPTIONS is not special —
  // it is just SEVERAL more gestures (a tap to open the panel, a tap on a
  // button inside it, a tap to close), and if it takes several then a single
  // one is not landing. Safari is the known offender: it does not reliably
  // honour resume() from `pointerdown`, and a handler that calls
  // preventDefault() first — which the title's does, to stop the tap
  // scrolling — can cost the activation outright. `touchend` and `click` are
  // the two it does honour.
  //
  // Cheap to be exhaustive: unlock() is idempotent, the listeners are passive,
  // and they all detach the moment the context reports running.
  const EVENTS = ['keydown', 'keyup', 'pointerdown', 'pointerup',
                  'touchstart', 'touchend', 'click'];
  const unlock = () => {
    audio.unlock();
    if (!audio.ready()) return;
    for (const ev of EVENTS) window.removeEventListener(ev, unlock);
  };
  for (const ev of EVENTS) {
    window.addEventListener(ev, unlock, { passive: true });
  }
}
const camera = createCamera();

function resize() {
  // Prefer visualViewport where it exists — on iOS Safari it's the one that
  // actually tracks the address bar/toolbar showing or hiding; innerWidth/
  // innerHeight can lag a beat behind it.
  const vv = window.visualViewport;
  canvas.width = vv ? Math.round(vv.width) : window.innerWidth;
  canvas.height = vv ? Math.round(vv.height) : window.innerHeight;
  camera.resize(canvas.width, canvas.height);
}
// ── WHERE THE MOUSE IS, FOR HIS EYES TO FOLLOW ───────────────────────────
//
// Client: "when I move the mouse on the home screen... I want Will Hill's
// eyes to follow the mouse." Desktop only, and it stays null until a real
// mousemove arrives — a phone never sends one, so the pupils stay exactly
// where he painted them and nothing about the touch build changes.
//
// ⚠️ `pointermove` would ALSO fire for a finger dragging on the glass, which
// would make the eyes twitch mid-swipe on a phone. `mousemove` from a real
// mouse is what is wanted, and a touch that synthesises one arrives with
// no movement history, so the `movementX/Y` guard drops those too.
let mousePos = null;
window.addEventListener('mousemove', (e) => {
  if (!e.movementX && !e.movementY && mousePos) return;
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  mousePos = { x: (e.clientX - r.left) * (canvas.width / r.width),
               y: (e.clientY - r.top) * (canvas.height / r.height) };
}, { passive: true });

window.addEventListener('resize', resize);
// ⚠️ iOS Safari does not reliably fire `resize` on <window> when its own
// address bar/toolbar toggles — only on visualViewport. Without this, the
// drawing buffer can sit stale one tap behind the CSS box (see the 100dvh
// comment in index.html for the matching CSS-side half of this fix).
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

const RIDE_TICKS = 150; // ~2.5s on the train between neighbourhoods
const GEN_LOOKAHEAD_COLS = 24; // stream this many columns beyond the camera's right edge

const state = {
  stageIndex: 0,
  level: null,
  player: null,
  score: 0,
  hearts: 3,
  screen: 'loading', // loading | title | playing | paused | riding | stageClear | gameOver | complete
  resumeTo: 'playing', // what pausing interrupted, so resume goes back to it
  screenT: 0,
  tick: 0,
  // ── THE FRONT DOOR ───────────────────────────────────────────────────────
  // The game opens on a black card that says TAP ANYWHERE, and that tap does
  // three things at once: it lets the browser release the sound, it starts the
  // theme, and it sets the title card building itself. Client: "I'd rather it
  // just be a black screen at the beginning that says tap anywhere, and that
  // initiates the sliding in of all the components and layers, and then that
  // becomes where I press start — by then the music should already be playing."
  //
  // Which is a better design than what it replaces, where the card assembled
  // itself on load and the tap was a separate thing afterwards. The theme now
  // comes up WITH the world instead of after it.
  //
  // `introTapped` latches once for the session. `introAt` is the tick the
  // assembly started from, reset on every later return to the title so the card
  // rebuilds itself each time you come back to it — the black page does not
  // come back, because by then the sound is already on and it would be a gate
  // asking for something it already has.
  introTapped: false,
  introAt: 0,
  runLog: createRunLog(),
};

// DEV ONLY — a handle on the live state, so a headless browser can drive the
// game into states that are deliberately hard to reach: the knockdown needs
// enemies standing over you at the moment you run out of hearts, and a pit
// fall needs you to walk into a specific hole. Checking those by playing to
// them by hand is how they went unverified long enough to ship broken.
// Vite folds `import.meta.env.DEV` to false and drops this from the build.
// The camera goes too. A verification pass that wants two builds to draw the
// SAME frame has to pin the camera, and pinning the player is not enough —
// the camera lerps toward him in both axes, so a few px of difference in
// where he came to rest shifts the whole frame and swamps whatever was
// actually being compared.
if (import.meta.env.DEV) {
  window.__game = state; window.__camera = camera; window.__audio = audio;
  // The title's controls are geometry, not constants — the OPTIONS word's
  // placement is three caps against the live window — so the harness asks the
  // screen where it put things rather than re-deriving it and grading its own
  // arithmetic. That mistake has already cost this project a day.
  window.__title = title;
  // THE REAL FUNCTION, not `state.stageIndex = n`. A harness that assigns the
  // index without rebuilding the level leaves `state.level` pointing at the
  // previous stage and the next frame throws on `reading 'id'` — which has
  // already happened once, to a harness that was then quietly measuring a
  // frozen loop. Anything that wants stage four gets the same door the game
  // uses.
  window.__startStage = startStage;
  // The loaded image set. A card whose file failed to resolve is SILENTLY
  // skipped by the renderer — it simply never appears — so a harness checking
  // an assembly needs to be able to ask whether the art is actually there
  // rather than infer it from a screenshot that looks plausible.
  Object.defineProperty(window, '__images', { get: () => images });
}

let images = null; // { player, enemy, eav, edgewood, l5p, underground }

function startStage(i) {
  const stage = STAGES[i];
  state.stageIndex = i;
  state.level = createLevel(stage, i);
  // Baked street tiles are keyed by column/row, and every stage restarts at
  // column 0 — so without this the new stage would blit the old one's asphalt.
  renderer.invalidateTiles();
  buildRunway(state.level);
  genAhead(state.level, camera.vw / T + GEN_LOOKAHEAD_COLS);

  state.player = createPlayer(3 * T, (FLOOR_R - 4) * T);
  state.player.hearts = state.hearts; // carry hearts across stages within a run
  // Clear the stomp-out beat, or a death on stage 2 replays stage 1's.
  state.stompT = undefined;
  state.stompers = [];
  state.dust = [];
  camera.x = 0;
  camera.y = 0;
  state.screen = 'playing';
  state.screenT = 0;
  // The ambience follows the stage: three of these plates are rain-slicked
  // night streets and the Underground is a clear afternoon.
  audio.ambience(stage.bg.rain || 0);
}

// ONE CONTINUE PER RUN. Restart from the top of the stage you went down on,
// keeping the money you had banked. Deliberately one, and deliberately per
// RUN rather than per stage — it is the way back in now that the pause menu
// no longer offers a restart, without turning a contest run into unlimited
// retries. It is recorded in the replay log, so a continued run is legible
// to the leaderboard rather than hidden from it.
const CONTINUES_PER_RUN = 1;

function startRun() {
  state.score = 0;
  state.hearts = 3;
  state.continues = CONTINUES_PER_RUN;
  // Distance is banked per stage. The HUD's readout is the CURRENT stage's
  // and resets with it, so the ending board needs its own running total or
  // it would report only the last stage he walked.
  state.distanceM = 0;
  state.runLog = createRunLog();
  state.runLog.start();
  startStage(0);
}

function confirmPressed() {
  return input.jump();
}

// ── PAUSE ────────────────────────────────────────────────────────────────
// Menu buttons are rebuilt each frame so they track the canvas size; their
// rects are what the pointer handler hit-tests against.
const menuButtons = [];
// ⚠️ HOOKED HERE, NOT UP WITH THE OTHER DEV HOOKS. `menuButtons` is a `const`
// declared in this section, so touching it from the block near the top of the
// file lands in the temporal dead zone and throws before the game ever boots.
// The pause menu rebuilds its rects every frame, so a harness has to READ
// them rather than recompute them; the panel needs a door that is not a tap
// on a canvas coordinate.
if (import.meta.env.DEV) {
  window.__menuButtons = menuButtons;
  window.__panel = panel;
}

function pause() {
  if (state.screen !== 'playing') return;
  state.resumeTo = state.screen;
  state.screen = 'paused';
  state.screenT = 0;
}

function resume() {
  if (state.screen !== 'paused') return;
  state.screen = state.resumeTo || 'playing';
  state.screenT = 0;
}

function hit(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// One pointer path for the pause control and the menu. Canvas coordinates
// must be scaled from CSS pixels or every hit-test is wrong on a HiDPI
// screen, where the backing store is larger than the element.
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / r.width);
  const y = (e.clientY - r.top) * (canvas.height / r.height);

  // PRESS START means press anywhere. The jump pad still works, but nobody
  // hunts for a button on a title card or a results board — they tap the
  // picture. Same for the between-screens: every non-run screen whose only
  // interaction is "acknowledge and move on" takes a tap anywhere, which is
  // also why the pads are hidden on them.
  if (state.screen === 'title') {
    if (state.screenT <= TITLE_ARM_TICKS) return;
    e.preventDefault();
    // ── UNLOCK ON ANY INPUT, BUT SWALLOW NOTHING ─────────────────────────
    //
    // A browser will not release sound before a gesture inside the page, and
    // tapping a home-screen icon is a gesture on the OS, not on us. So every
    // input here tries the unlock — but it no longer EATS one to do it.
    //
    // It used to. There was a black TAP ANYWHERE card whose only job was to
    // collect that gesture, and when the client cut the card the swallow stayed
    // behind and quietly ate the first press of anything — including the first
    // press of the MUSIC box, which is now the control that exists to turn the
    // sound on. Caught by the harness: tap the box, and `wh_sound` was still
    // 'off'; tap it again and it finally flipped.
    //
    // Unlocking without returning is free. The gesture is already in hand.
    if (!audio.ready() && (soundEnabled() || sfxEnabled())) audio.unlock();

    // ── THE MUSIC BOX ────────────────────────────────────────────────────
    // Tested first of the three, because it is the smallest and the lowest and
    // a near miss on it should not launch a walkthrough run.
    //
    // THIS TAP IS THE GESTURE. A browser will not release sound without one,
    // and checking the box IS one — so unlock inside the handler, on the same
    // touch that sets the preference, and the theme comes up under the finger.
    // Nothing is swallowed and nothing is deferred; that is the whole point of
    // the control replacing the black card that used to ask for a bare tap.
    if (title.hitMusic(state.titleBox, x, y)) {
      // Stamp the press BEFORE anything that can throw or block, so the box
      // acknowledges the touch even if the audio path has a bad day.
      state.musicPressTick = state.tick;
      const on = !soundEnabled();
      setSoundEnabled(on);
      audio.setMuted(!on);
      if (on && !audio.ready()) audio.unlock();
      // ⚠️ THE THEME NEEDS ITS OWN play() IN THIS HANDLER, NOT NEXT FRAME.
      // unlock() only resumes the WebAudio graph — which is why ambience and
      // the tap/confirm cues came through fine — but the title track is a
      // real <audio> element, and WebKit tracks a media element's gesture
      // unlock SEPARATELY from an AudioContext's. Leaving it to update()'s
      // per-frame `audio.music.play(cueForScreen())` meant the element's
      // first real play() call always landed one requestAnimationFrame after
      // the tap, outside the gesture, and got silently refused — heard as
      // "checking MUSIC starts the background noise but not the song."
      // Calling it here, inside the same synchronous tap, is what actually
      // counts as the gesture.
      if (on) audio.music.play(cueForScreen());
      state.introTapped = true;   // the audio has had its input either way
      press();
      return;
    }
    // THE WORD, not the half-screen it used to be. Client: "I want those
    // buttons isolated so only when I tap the button is OPTIONS. If I tap empty
    // space, that should actually turn the music on." Everything that is not
    // MUSIC or OPTIONS now falls through to START below — including the black
    // band, which is where most of those taps land.
    if (title.hitOptions(state.titleBox, x, y)) { press(); panel.open('board'); return; }
    // The run starting is the biggest commitment on the screen, so it gets the
    // triad rather than the click.
    //
    // AND IT ALWAYS CLEARS RELAY. Client: "the champagne relay is not going to
    // be there, that's like a dev/dashboard thing" — there is no button on this
    // screen for a player to opt into it any more, only `?relay=1` in the URL
    // or the dev hooks in core/relay.js, neither of which goes through this
    // handler. So a human tapping the title card, whatever the URL happened to
    // carry in, always gets a normal run. Nothing here can put a player into
    // the walkthrough build by accident.
    setRelay(false);
    commit();
    startRun();
    return;
  }
  if (state.screen === 'stageClear' || state.screen === 'gameOver'
      || state.screen === 'complete') {
    if (state.screenT > 20) { press(); advanceFromScreen(); e.preventDefault(); }
    return;
  }
  if (state.screen === 'playing') {
    if (hit(hud.pauseRect, x, y)) { press(); pause(); e.preventDefault(); }
    return;
  }
  if (state.screen === 'paused') {
    for (const b of menuButtons) {
      if (hit(b, x, y)) { press(); b.action(); e.preventDefault(); return; }
    }
  }
});

// Keyboard parity, and the convention players expect.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    state.screen === 'paused' ? resume() : pause();
  }
});

// Losing focus mid-run should pause rather than let the player walk into a
// pothole they can't see.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// THE ATTRACT SCREEN. The game boots here rather than straight into stage
// one, which is what the client's painting is FOR — it carries the logo, the
// PRESS START and the HI SCORE line, and a game that skips past its own title
// card has thrown away its front door.
//
// The delay before it will accept a press is not politeness, it is a bug
// fix waiting to happen: `confirmPressed()` is the jump button, so without it
// the tap that ends a run's GAME KNOCKED screen carries straight through the
// title and into the next run.
const TITLE_ARM_TICKS = 24;
// How long the title card spends assembling itself after the front-door tap,
// with room for the two controls to fade up behind it. Kept a little longer
// than title.js's own INTRO_END so the last frames of that fade still get the
// assembling path rather than snapping to the finished menu mid-fade.
// Imported, never re-declared: title.js owns the assembly's length and this
// file used to keep a second copy of it that was 40 ticks short.
const INTRO_TICKS = TITLE_INTRO_TICKS;


function showTitle() {
  state.screen = 'title';
  state.introAt = 0;
  state.screenT = 0;
  audio.ambience(0);
}

// WHAT "CONTINUE" DOES ON EACH BETWEEN-SCREEN. One function rather than a
// branch inside update(), because the same decision is now reachable two
// ways — the JUMP button and a tap anywhere on the art — and having the tap
// path re-implement it is how the two drift apart.
function advanceFromScreen() {
  if (state.screen === 'stageClear') {
    state.distanceM += Math.max(0, (state.player.x - 3 * T) / T);
    if (state.stageIndex + 1 < STAGES.length) {
      state.rideFrom = STAGES[state.stageIndex].id;
      state.rideTo = state.stageIndex + 1;
      state.screen = 'riding';
      state.screenT = 0;
    } else {
      state.screen = 'complete';
      state.screenT = 0;
      state.finalLog = state.runLog.finish();
      // Banked on the device FIRST, and unconditionally. The Worker is not
      // deployed yet and a phone at a party is not always on a network;
      // either way the run happened and the player should be able to see it.
      bankLocalRun(state.score);
      lbSubmit(state.finalLog);
    }
    return;
  }
  // Spend the continue if there is one and this was a knockdown, not the end
  // of the game. Hearts come back full and the stage restarts from its
  // beginning; the score carries, because the money was already earned and
  // taking it back would make the continue worthless.
  if (state.screen === 'gameOver' && state.continues > 0) {
    state.continues--;
    state.runLog.record('continue');
    state.hearts = 3;
    startStage(state.stageIndex);
    return;
  }
  // FINISHED A FULL RUN? The tap off the results board opens the panel rather
  // than dropping straight to the title — this is the one moment the player
  // definitely cares what their score was worth, which makes it the only
  // moment worth asking for a phone number. Somebody who has not entered gets
  // the form; somebody who has gets the board with their name on it. Closing
  // it lands on the title.
  if (state.screen === 'complete') {
    showTitle();
    panel.open(isRegistered() ? 'board' : 'form');
    return;
  }
  // Otherwise back to the attract screen. Restarting the instant you
  // acknowledge the last run gives you no moment to stop playing.
  showTitle();
}

// THE PADS BELONG TO THE RUN AND NOTHING ELSE.
//
// Not the boot, not the title card, not the MARTA ride between stages, not
// the results board — and not the pause menu either, which is not a playable
// stage and has its own buttons. The client's words: "we only wanna see the
// controls on our live stage that is playable at that time."
//
// This sets a POSITIVE class. It used to clear a negative one, which meant
// the pads were visible by default and had to be told to hide — and until the
// loop's first tick nothing had told them, so they flashed over the title card
// on every launch. There is now no state in which they appear unless the game
// has explicitly said the stage is live.
let padsShown = null;
function syncPads() {
  const want = state.screen === 'playing';
  if (want === padsShown) return;
  padsShown = want;
  document.body.classList.toggle('playing', want);
}


// ── WHICH SONG IS PLAYING, DERIVED FROM THE SCREEN ───────────────────────
//
// Stated declaratively and re-stated every frame rather than fired at each
// transition. `music.play()` on the cue already playing is a no-op, so this
// cannot double-trigger — and more importantly it cannot MISS a transition,
// which is the failure mode of hanging a play() call on every screen change:
// there are nine ways into `title` and the day somebody adds a tenth is the
// day the music stops.
//
// Slots are looked up in the tables from audio/music.js, never built by
// concatenating a stage index into a string. A typo there is a silent missing
// track, which is the hardest kind of audio bug to notice.
// DAY AND NIGHT CAN HAVE DIFFERENT MUSIC, and adding it costs one manifest
// line per cue rather than a change here. The client: "I definitely want
// different music for day versus night of each stage."
//
// A stage cue prefers `<slot>_day` / `<slot>_night` when the manifest has one
// and falls back to the shared `<slot>` when it does not — so today every
// stage plays one track in both halves, and the day EAV gets its own the
// moment `stage_01_day` exists. Nothing else has to know.
function todSlot(base) {
  if (!base) return null;
  const tod = state.level && state.level.stage && state.level.stage.tod;
  const specific = tod && `${base}_${tod}`;
  return specific && MANIFEST[specific] && MANIFEST[specific].src ? specific : base;
}

function cueForScreen() {
  const st = state;
  switch (st.screen) {
    case 'title':
    case 'loading':
      return 'title';
    case 'playing':
      return todSlot(STAGE_SLOTS[st.stageIndex]);
    case 'riding':
      // Named for the pair it bridges, so the map cue is the one the cue
      // sheet says it is regardless of which stage the ride starts from.
      return MAP_SLOTS[st.stageIndex] || null;
    case 'paused':
      return 'ui_pause';
    case 'complete':
      // ARRIVING AT THE SHOW. The one cue that plays start to finish.
      return 'credits';
    case 'stageClear':
      // Hold whatever the stage was playing — the card is a beat, not a
      // scene, and cutting the track for two seconds reads as a glitch. Which
      // means it has to resolve the same day/night slot `playing` did, or the
      // card would cross-fade to the other half's track for one beat.
      return todSlot(STAGE_SLOTS[st.stageIndex]);
    case 'gameOver':
      return null;
    default:
      return null;
  }
}

function update() {
  state.tick++;
  // The panel is modal. The art behind it keeps breathing — a frozen title
  // card under a dialog looks like a crash — but nothing the player presses
  // reaches the game while it is up, or a Space bar meant for the form would
  // also start a run.
  audio.music.play(cueForScreen());
  if (panel.isOpen) { audio.ambienceTick(); return; }
  // ON EVERY SCREEN, not just during play. This is the heartbeat that starts
  // the ambience once the audio context has actually woken up — it used to sit
  // below the between-screen early-returns, so a context that came up a beat
  // after the gesture had nothing to notice it until the next stage began.
  audio.ambienceTick();
  if (state.screen === 'loading') return;

  if (state.screen === 'title') {
    state.screenT++;
    if (state.screenT > TITLE_ARM_TICKS && confirmPressed()) {
      // Same as the tap path: try the unlock, swallow nothing. See there.
      if (!audio.ready() && (soundEnabled() || sfxEnabled())) audio.unlock();
      commit();
      startRun();
    }
    return;
  }
  // Paused freezes the world but keeps drawing, so the menu sits over a
  // still frame of the run rather than a black screen.
  if (state.screen === 'paused') { state.screenT++; return; }

  // THE RIDE. Between stages he takes MARTA, because these are real places on
  // a real system and the route the stage order describes is one you could
  // actually make. See render/martamap.js.
  if (state.screen === 'riding') {
    state.screenT++;
    if (state.screenT >= RIDE_TICKS) startStage(state.rideTo);
    return;
  }

  if (state.screen === 'stageClear' || state.screen === 'gameOver'
      || state.screen === 'complete') {
    state.screenT++;
    if (state.screenT > 20 && confirmPressed()) { press(); advanceFromScreen(); }
    return;
  }

  // ── screen === 'playing' ──
  const level = state.level;
  const player = state.player;
  const now = Date.now();

  genAhead(level, camera.visibleRight() / T + GEN_LOOKAHEAD_COLS);
  stepPlayer(player, input, level.map);

  // ── CHAMPAGNE RELAY ──────────────────────────────────────────────────
  // The walkthrough build. Three changes and no others — see core/relay.js.
  // The aura is topped up every tick rather than granted once, so it cannot
  // run out mid-stage however long he spends looking at a fence.
  if (isRelay()) {
    // ⚠️ TOP UP ONLY WHEN IT IS ABOUT TO LAPSE, not every tick.
    //
    // Re-granting the full window on every frame pins the remaining time at
    // its maximum, and the grow ramp is driven by how much has ELAPSED — so
    // `since` never left zero and the walkthrough build never showed the
    // transformation at all. Will Hill stayed his normal size for the whole
    // board with a full aura around him, which is the one combination that
    // looks like a bug. Found by screenshotting the bags in relay and noticing
    // that neither they NOR he had grown.
    //
    // A single 1.2s-from-lapse top-up lets the ramp run to its settled +30%
    // and hold there. The cost is that the Mario stutter replays on each
    // renewal, roughly every eight seconds — a tic, in a build whose whole
    // purpose is standing still and looking at scenery.
    if (player.invulnerableUntil - now < 1200) {
      grantInvulnerability(player, now, CHAMPAGNE_SECONDS);
    }
    // Remember the last ground he actually stood on. Catching a fall by
    // snapping him back to standing height at his CURRENT x would drop him
    // straight back down the same hole; putting him where he took off from
    // sets him on the lip of it, which is what "not subject to the platform
    // gaps" has to mean if he is going to keep walking.
    if (player.onGround) { state.safeX = player.x; state.safeY = player.y; }
  }
  if (player.y > FALL_DEATH_Y) {
    if (isRelay() && state.safeX !== undefined) {
      player.x = state.safeX;
      player.y = state.safeY;
      player.vx = 0;
      player.vy = 0;
    } else {
      player.dead = true;
      player.deathCause = 'fall';
    }
  }

  // enemies: patrol/defeat-timer update, then collision resolution
  for (let i = level.enemies.length - 1; i >= 0; i--) {
    const e = level.enemies[i];
    const gone = updateEnemy(e, level.map);
    if (gone) {
      level.enemies.splice(i, 1);
      continue;
    }
    const result = resolveEnemyCollision(e, player, now);
    if (result === 'stomp') {
      audio.play('punch');
      state.score += 50; // matches SCORE_RULES.stomp in cloudflare/leaderboard-worker.js
      state.runLog.record('stomp');
    } else if (result === 'contact') {
      // AN ENEMY KNOCKS THE MONEY OUT OF YOU. Deliberately different from a
      // pothole, which only trips you: a pothole is the street, an enemy robs
      // you. It also self-sequences into the three-touch rule without any
      // hit counter — the first touch is the only one you still have money
      // for, so touch one costs the cash and a heart, touch two a heart,
      // touch three kills you.
      //
      // SONIC'S RINGS. ALL of it comes out — not a capped slice — because
      // that is what makes a full purse worth being scared of. The three-touch
      // escalation still stands on top of it: touch one empties you and costs
      // a heart, touch two a heart, touch three kills.
      //
      // Sonic does not spawn one sprite per ring either; it loses every ring
      // and draws a bounded burst of them. Same here. MAX_SCATTER sprites go
      // out, each carrying an equal share of the whole loss, so recovering
      // them returns the money in proportion and the frame cost is fixed no
      // matter how rich the run is.
      const MAX_SCATTER = 24;
      const lost = Math.floor(state.score / BAG_VALUE);
      if (lost > 0) {
        const n = Math.min(MAX_SCATTER, lost);
        // WHOLE BAGS PER SPRITE, remainder handed to the first few. A flat
        // round() drifts: 50 bags across 24 sprites rounds to 208 each, which
        // hands back 4992 of 5000 and leaves the Worker's recomputed score
        // 200 adrift from the screen. Integer division plus remainder is
        // exact, and it keeps every sprite worth a whole number of `bag`
        // events, which is the only way the two logs can agree at all.
        const per = Math.floor(lost / n);
        const extra = lost % n;
        const away = player.x < e.x ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const worth = (per + (i < extra ? 1 : 0)) * BAG_VALUE;
          // A fan, alternating either side of the arc the way a ring burst
          // does, rather than a single spray in one direction.
          const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
          const side = i % 2 === 0 ? 1 : -1;
          const speed = 2.2 + Math.abs(t) * 3.4;
          level.bags.push(createDroppedBag(
            player.x + player.w * 0.5, player.y + player.h * 0.35,
            away * speed * 0.5 + side * t * 5.0,
            -5.4 - Math.abs(t) * 4.0 - Math.random() * 1.6, now, worth,
          ));
        }
        // ONE EVENT PER BAG, not per sprite. The server recomputes the score
        // from this log at -100 a bagLost (SCORE_RULES in the Worker), so if
        // the log counted the 24 sprites instead of the bags they stand for,
        // a big loss would score as a small one and the contest board would
        // disagree with the screen.
        for (let i = 0; i < lost; i++) state.runLog.record('bagLost');
        state.score -= lost * BAG_VALUE;
      }
    }
  }

  // money bags
  // Knocked-loose bags arc out, bounce once or twice and settle. Only the
  // dropped ones move; the placed ones stay exactly where the generator put
  // them.
  for (const bag of level.bags) {
    if (!bag.dropped || bag.got || bag.settled) continue;
    bag.vy += 0.42;
    bag.x += bag.vx;
    bag.y += bag.vy;
    const rest = FLOOR_R * T - bag.h;
    if (bag.y >= rest) {
      bag.y = rest;
      bag.vx *= 0.62;
      bag.vy = -bag.vy * 0.34;
      if (Math.abs(bag.vy) < 1.2) { bag.vy = 0; bag.vx = 0; bag.settled = true; }
    }
  }

  for (const bag of level.bags) {
    if (overlapsPlayer(bag, player, now)) {
      bag.got = true;
      audio.play('coin');
      // DOUBLE WHILE THE CHAMPAGNE IS LIT. isChampagne, NOT isInvulnerable —
      // the latter is also true during the i-frames from taking a hit, and
      // paying a bonus for getting hit rewards the thing the game is asking
      // you to avoid.
      const lit = isChampagne(player, now);
      state.score += bag.value * (lit ? CHAMPAGNE_MULT : 1);
      // Mirror of the loss above: a scattered bag can be worth several bags,
      // so it logs several events. Keeps the Worker's recomputed score
      // identical to the one on screen — which is why a boosted bag logs its
      // OWN event name rather than just logging `bag` twice. Two `bag`s and
      // one boosted bag are the same number and a different run, and the
      // Worker has to be able to tell them apart.
      const units = Math.max(1, Math.round(bag.value / BAG_VALUE));
      for (let i = 0; i < units; i++) state.runLog.record(lit ? 'bagx2' : 'bag');
    }
  }

  // champagne bottles
  for (const bottle of level.champagnes) {
    if (overlapsPlayer(bottle, player, now)) {
      bottle.got = true;
      audio.play('glisten');
      audio.powerUp();
      grantInvulnerability(player, now, CHAMPAGNE_SECONDS);
      state.runLog.record('champagne');
    }
  }

  // POWER DOWN, on the tick the champagne actually runs out. Watched here
  // rather than scheduled at pickup because the timer is a timestamp the
  // player can outlive in several ways — finishing the stage, dying, taking
  // the continue — and a sound scheduled 9 seconds ahead would fire over the
  // MARTA map or the results board. This only speaks when he was powered on
  // the previous tick and is not now.
  const poweredNow = player.invulnerableUntil > now;
  if (state.wasPowered && !poweredNow && !player.dead) audio.powerDown();
  state.wasPowered = poweredNow;

  // POTHOLES. Not an overlap test. A pothole is sunk INTO the road surface —
  // its box starts a pixel below the walking plane — and the player's feet
  // rest exactly on that plane, so `player.y + player.h > hz.y` was never
  // true and the hazard could never fire. They were decoration you could
  // stand on.
  //
  // What actually matters is whether a foot is over the hole while you are on
  // the road, so that is what is tested: on the ground, and the middle of the
  // body horizontally inside the pothole's span. Jump it and you clear it.
  for (const hz of level.obstacles) {
    if (!player.onGround) continue;
    const foot = player.x + player.w * 0.5;
    if (foot > hz.x && foot < hz.x + hz.w) {
      if (trip(player, now)) state.runLog.record('pothole');
    }
  }

  camera.follow(player);
  // Stretch the locomotion clips to the speed he is actually moving at. Both
  // were authored for one speed, and with a walk gear and a run gear the same
  // clip now has to cover a range — without this the feet skate whenever the
  // two disagree.
  const sp = Math.abs(player.vx);
  let animScale = 1;
  if (player.anim === 'walk') animScale = WALK_SPEED / Math.max(sp, 0.8);
  else if (player.anim === 'run') animScale = RUN_SPEED / Math.max(sp, 0.8);
  advanceAnim(player, PLAYER_SPRITE.atlas, 4, Math.min(2.2, Math.max(0.55, animScale)));
  for (const e of level.enemies) advanceAnim(e, ENEMY_SPRITES[e.variant].atlas);

  state.hearts = player.hearts;

  if (player.dead) {
    // THE KNOCKDOWN. He is not dead — he got jumped and robbed. Only fires
    // when an ENEMY put him down; a hole or a pothole goes straight to the
    // fade, because there is nobody standing there to do it. Short on
    // purpose, ~1.6s. See entities/stompout.js.
    if (player.deathCause === 'enemy') {
      // HE HAS TO LAND FIRST. Taken down in mid-air he used to hang there —
      // stepPlayer stops running the moment he is dead, so nothing applied
      // gravity — while the beat below started regardless and three men
      // gathered on the pavement to stomp an empty patch of road under him.
      // Nobody is stomped in the air, so nothing begins until he is down.
      if (!player.onGround) {
        // WHICH CLIP DEPENDS ON THE DROP, and `fall` is usually the wrong one.
        // That clip is the MANHOLE — arms up, legs kicking, tumbling, authored
        // to read as final (see stepPlayer's note on it). Coming off a
        // mistimed jump at an enemy is not that: he got clipped and is
        // dropping a metre onto the pavement, so `knockback` is the honest
        // read and it is what the sheet has that clip for.
        //
        // Keyed on speed rather than on a measured height because speed IS
        // the drop — he has to have been falling a while to build it. 10.6
        // units/tick is about 108 units of fall, a metre and a bit, which is
        // further than any failed stomp and about where a tumble stops
        // looking overdone.
        player.anim = player.vy > 10.6 ? 'fall' : 'knockback';
        stepKnockedDown(player, level.map);
        return;
      }
      if (state.stompT === undefined) {
        state.stompT = 0;
        state.stompers = beginStompOut(player, level.enemies);
        state.dust = [];
      }
      player.anim = 'knockdown';
      player.vx = 0;
      // CLEAR THE I-FRAMES, or he is invisible for the whole beat.
      //
      // drawPlayer flickers the sprite while `inv` is counting down, and the
      // countdown lives in stepPlayer — which stops being called the moment
      // he is dead. So `inv` freezes at whatever it was, and 75 happens to
      // land on an OFF frame of the flicker: three men stomping a bare patch
      // of pavement, for 98 ticks, every single time, because a knockdown is
      // always preceded by the hit that caused it. Invulnerability means
      // nothing to a man already on the ground; zero it and he stays drawn.
      player.inv = 0;
      const done = stepStompOut(state.stompT++, player, state.stompers, state.dust);
      for (const e of state.stompers) advanceAnim(e, ENEMY_SPRITES[e.variant].atlas);
      if (!done) return;
    }
    // A POTHOLE OR A LAST-HEART HIT ALSO DROPS HIM. Same reason: nothing is
    // applying gravity to a dead player, and a body that stops in mid-air on
    // the way to the fade reads as the game hanging. A fall down a hole is the
    // exception — falling IS the death, and main's FALL_DEATH_Y already owns
    // it — so that one goes straight through.
    if (player.deathCause !== 'fall' && !player.onGround) {
      player.anim = player.vy > 10.6 ? 'fall' : 'knockback';
      stepKnockedDown(player, level.map);
      return;
    }
    state.screen = 'gameOver';
    state.screenT = 0;
    lbSubmit(state.runLog.finish());
    // Banked locally too, exactly like the complete path. A knocked-down run
    // already SUBMITS to the contest (the line above), but it never reached
    // wh_local_runs — so "your best on this device" and the share card lied
    // for the most common way a run actually ends. bankLocalRun ignores
    // score 0, so dying broke on the first stage stays unrecorded.
    bankLocalRun(state.score);
    return;
  }

  if (player.x >= finishLineX(level)) {
    state.screen = 'stageClear';
    state.screenT = 0;
  }
}

// Pause menu. Buttons are laid out and registered every frame so they stay
// correct through rotation and resize — a menu whose hitboxes are computed
// once goes wrong the first time someone turns their phone.
function drawPauseMenu(stage) {
  menuButtons.length = 0;

  ctx.save();
  ctx.fillStyle = 'rgba(6,3,12,0.80)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd66e';
  ctx.font = '700 30px sans-serif';
  ctx.fillText('PAUSED', cx, canvas.height * 0.26);

  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = 'rgba(232,217,160,0.9)';
  ctx.fillText(stage.name.toUpperCase(), cx, canvas.height * 0.26 + 26);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`$${state.score.toLocaleString()}  ·  ${state.hearts}/${state.player.maxHearts} hearts`,
    cx, canvas.height * 0.26 + 48);

  // ── WHAT IS ON THIS MENU, AND WHY RESTART CAME BACK ──────────────────
  //
  // This was RESUME only for a while: RESTART STAGE and RESTART RUN were
  // here, the client had them removed outright, and the contest reasoning
  // agreed with him — the leaderboard scores a RUN (see the replay log and
  // cloudflare/leaderboard-worker.js), so a free restart would let anyone
  // reroll a bad start over and over without it ever showing in the log.
  //
  // He has since asked for it back, in his own words, "a restart button on
  // pause styled like Resume", along with a way out to the main menu. Both
  // are in, and the contest argument above does NOT actually stand against
  // them: MAIN MENU -> PRESS START already starts a fresh run from stage
  // one, so RESTART is a shortcut for something the player can do anyway in
  // two taps. It abandons the run rather than scoring it; nothing
  // unfinished is ever submitted. What would genuinely break the contest is
  // a restart that KEPT the score, and neither of these does.
  //
  // Both are the same shape as RESUME — his instruction — so the menu reads
  // as one stack of choices rather than a main action with afterthoughts.
  const items = [
    { label: 'RESUME', action: resume },
    { label: 'RESTART', action: () => { commit(); startRun(); } },
    { label: 'MAIN MENU', action: () => { goBack(); showTitle(); } },
  ];

  // The two switches, as CHECKBOXES and with no slider — his call, and the
  // right one for a phone: a slider is a drag target on a screen where every
  // other control is a tap, and nobody balances a mix mid-run. They are the
  // same two settings the OPTIONS panel shows, read and written through the
  // same helpers, so the two screens can never disagree.
  const toggles = [
    { label: 'MUSIC', on: soundEnabled(),
      set: (v) => { setSoundEnabled(v); audio.setMuted(!v); if (v) audio.unlock(); } },
    { label: 'SOUND EFFECTS', on: sfxEnabled(),
      set: (v) => { setSfxEnabled(v); audio.setSfxMuted(!v); } },
  ];

  const bw = Math.min(300, canvas.width * 0.72);
  const bh = 52;
  const gap = 14;
  let by = canvas.height * 0.44;

  for (const it of items) {
    const bx = cx - bw / 2;
    ctx.fillStyle = 'rgba(20,16,30,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255,214,110,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = '#ffd66e';
    ctx.font = '700 17px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, cx, by + bh / 2);
    ctx.textBaseline = 'alphabetic';

    menuButtons.push({ x: bx, y: by, w: bw, h: bh, action: it.action, label: it.label });
    by += bh + gap;
  }

  // The switches sit under the buttons, narrower and quieter, so they read as
  // settings rather than as two more things to press on the way out.
  by += 4;
  for (const t of toggles) {
    const rowW = bw;
    const rowH = 40;
    const bx = cx - rowW / 2;
    const boxSz = 22;
    const boxX = bx + rowW - boxSz - 10;
    const boxY = by + (rowH - boxSz) / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '700 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, bx + 10, by + rowH / 2);
    ctx.textAlign = 'center';

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxSz, boxSz, 4);
    else ctx.rect(boxX, boxY, boxSz, boxSz);
    ctx.fillStyle = t.on ? 'rgba(255,214,110,0.92)' : 'rgba(10,8,16,0.68)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = t.on ? 'rgba(255,236,190,0.95)' : 'rgba(226,214,236,0.55)';
    ctx.stroke();
    if (t.on) {
      // Drawn, not typed, so it lands on the pixel grid — same tick the
      // title card's MUSIC box uses.
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(18,12,6,0.95)';
      ctx.lineWidth = Math.max(2, boxSz * 0.16);
      ctx.lineCap = 'round';
      ctx.moveTo(boxX + boxSz * 0.24, boxY + boxSz * 0.52);
      ctx.lineTo(boxX + boxSz * 0.44, boxY + boxSz * 0.72);
      ctx.lineTo(boxX + boxSz * 0.78, boxY + boxSz * 0.30);
      ctx.stroke();
    }
    ctx.textBaseline = 'alphabetic';

    // The WHOLE ROW is the target, not the 22px box — the box is the
    // indicator, and a thumb should not have to find it.
    menuButtons.push({ x: bx, y: by, w: rowW, h: rowH,
      action: () => t.set(!t.on), label: t.label });
    by += rowH + 6;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 12px sans-serif';
  ctx.fillText('tap a button  ·  P or ESC to resume', cx, by + 14);
  ctx.restore();
}

function drawOverlayText(lines) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,3,12,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd66e';
  let y = canvas.height / 2 - (lines.length - 1) * 16;
  for (const [text, size, color] of lines) {
    ctx.font = `700 ${size}px sans-serif`;
    ctx.fillStyle = color || '#ffd66e';
    ctx.fillText(text, canvas.width / 2, y);
    y += size + 14;
  }
  ctx.restore();
}

function draw() {
  // FIRST, AND IN draw() RATHER THAN update(). The screen can change part way
  // through update() — the playing branch is what sets `stageClear` — so a
  // sync at the top of update() is reading a state that is one tick stale, and
  // the frame gets painted with the pads still up over the stage-clear card.
  // Measured: exactly three such frames in a four-stage run, one per
  // transition. draw() is the last thing to run before the browser's paint,
  // and a class set inside a rAF callback lands in that same paint, so this
  // costs nothing and there is no frame in between.
  syncPads();
  if (state.screen === 'loading' || !images) {
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlayText([['LOADING…', 22]]);
    return;
  }

  // The attract screen replaces the world entirely — there is no level behind
  // it to draw, and on boot there is not even one built yet.
  if (state.screen === 'title') {
    // Keep where the painting landed — the OPTIONS hit test converts through
    // it, so the button follows the art on any screen instead of living at a
    // guessed screen coordinate.
    // NO BLACK CARD. It is gone at the client's call — "we're removing the tap
    // anywhere blank screen, we'll figure out another way to get the music to
    // play from the home screen." So the card reveals itself the moment the
    // game loads, and the first input is still spent on the audio, over his
    // painting with PRESS START pulsing rather than over an empty screen.
    const introT = state.screenT - state.introAt;
    state.titleBox = title.draw(images, state.tick, introT <= INTRO_TICKS, introT,
      soundEnabled(),
      // Ticks since the MUSIC box was last pressed, so it can flash back. A
      // press that has never happened is effectively infinitely old.
      state.musicPressTick == null ? 1e9 : state.tick - state.musicPressTick,
      mousePos);
    return;
  }

  // The results board is a whole screen of its own, and it covers the frame.
  // It used to be checked further down, AFTER a full world render that it
  // then painted over — a wasted backdrop, undercroft, tile and entity pass
  // every frame you sat looking at your score, and a hard crash if it was
  // ever reached without a level built.
  if (state.screen === 'complete') {
    // The painting first, with its swaying crowd, then the run's numbers
    // drawn onto the panel the painting already has. `box` is where the
    // painting landed, so everything lands on its own coordinates.
    //
    // The base is the INPAINTED plate (tools/cut_still.py), not the original:
    // the crowd and Will Hill have been lifted off it onto cards so they can
    // move, and leaving them in the base as well would show a second, still
    // crowd behind the moving one the moment it swayed.
    const box = still.draw(images.ending_base, endingCards(images), state.tick);
    ending.draw(statsFrom(state.finalLog, state.score, state.distanceM || 0),
      state.screenT, box);
    still.pulsePrompt(box, ENDING_PROMPT, STILL_W, STILL_H, state.tick);
    return;
  }

  // Riding MARTA between neighbourhoods — the map replaces the world
  // entirely, so it returns before any of the stage draw runs.
  if (state.screen === 'riding') {
    // The Underground plate IS Five Points, so the interstitial stands in the
    // game's own art rather than in a pattern invented for this screen.
    martaMap.draw(state.rideFrom, STAGES[state.rideTo].id,
      Math.min(1, state.screenT / RIDE_TICKS), STAGES[state.rideTo].name,
      images.martamap);
    return;
  }

  const level = state.level;
  const player = state.player;
  const stage = STAGES[state.stageIndex];
  // The stage's image set: `base` plus one entry per multiplane card. Stages
  // that have not been cut yet just get `base`.
  const bgImages = { base: images[stage.id] };
  for (const c of stage.bg.cards || []) bgImages[c.key] = images[`${stage.id}_${c.key}`];

  // Paint order mirrors Jandé's: screen-space backdrop, screen-space
  // undercroft, then ONE world-transformed block, then screen-space HUD.
  const groundY = camera.groundScreenY();
  const slabPx = SLAB_R * T * camera.zoom;

  backdrop.drawFar(bgImages, stage, camera, state.tick);
  undercroft.draw(stage, groundY, slabPx, camera, state.tick);

  renderer.withCameraTransform(camera, () => {
    // `genC` is the streaming generator's write head — the renderer needs it
    // to know which columns have stopped changing and can be baked.
    renderer.drawTiles(level.map, camera, (c, r) => isSolid(level.map, c, r), level.genC);
    // Straight after the tiles and before anything else: the holes have to be
    // drawn, not just left undrawn. See drawPitMouths in render/renderer.js.
    renderer.drawPitMouths(level.map, camera,
      (c, r) => isSolid(level.map, c, r), level.genC);
    // Light pools go down BEFORE the entities, so characters stand in the
    // light rather than having it painted over them.
    renderer.lighting.drawGroundPools(camera, stage);
    renderer.drawFinishLine(finishLineX(level), state.tick);
    // The bags ride Will Hill's own power curve — they swell while they are
    // paying double and shrink back when that stops. The BOTTLES do not: a
    // bottle you have not picked up yet is not part of the effect, and growing
    // the next one while the last is still burning would say it is.
    // Date.now() here, not the update loop's `now` — that one is local to
    // stepWorld and this is the draw. Same clock, read again.
    const champMs = Math.max(0, player.invulnerableUntil - Date.now());
    // Grown AND blue while the champagne is lit — the two say the same thing,
    // that these are paying double right now. The glow goes cool with them.
    const bagImg = champMs > 0 ? images.bagBlue : images.bag;
    const bagGlow = champMs > 0 ? 'rgba(120,180,255,0.34)' : 'rgba(255,206,110,0.30)';
    for (const bag of level.bags) renderer.drawPickup(bag, bagImg, state.tick, bagGlow, champMs);
    for (const bottle of level.champagnes) renderer.drawPickup(bottle, images.champagne, state.tick, 'rgba(255,240,170,0.34)');
    for (const hz of level.obstacles) renderer.drawHazard(hz);
    // STOMP-OUT draw order: the enemy in the `back` slot goes down BEFORE the
    // body so the body reads as lying in front of it, and the two side
    // stompers go down after. Outside the beat this is just the normal loop.
    const [behind, infront] = state.stompT !== undefined
      ? splitStompers(state.stompers) : [[], []];
    const back = new Set(behind);
    for (const e of level.enemies) {
      if (back.has(e)) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    }
    for (const e of level.enemies) {
      if (!back.has(e) && !infront.includes(e)) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    }
    renderer.drawPlayer(player, images.player, PLAYER_SPRITE.atlas, stage, state.tick);
    for (const e of infront) renderer.drawEnemy(e, images['enemy_' + e.variant], ENEMY_SPRITES[e.variant].atlas, stage);
    if (state.dust && state.dust.length) renderer.drawDust(state.dust);
    // The getaway: each one running off with a bag of your money.
    for (const e of state.stompers || []) {
      if (e.carrying) renderer.drawCarriedBag(e, images.bag, ENEMY_SPRITES[e.variant].atlas, state.tick);
    }
    renderer.lighting.drawBloom(camera, stage);
  });

  backdrop.drawVignette();

  const champLeft = Math.max(0, player.invulnerableUntil - Date.now());
  hud.draw({
    score: state.score,
    distanceM: Math.max(0, (player.x - 3 * T) / T),
    hearts: state.hearts,
    maxHearts: player.maxHearts,
    stageName: stage.name,
    champagneFrac: champLeft / (CHAMPAGNE_SECONDS * 1000),
    portraitImg: images.player,
    portraitAtlas: PLAYER_SPRITE.atlas,
  });

  if (state.screen === 'paused') {
    drawPauseMenu(stage);
  } else if (state.screen === 'stageClear') {
    drawOverlayText([
      ['STAGE CLEAR', 28],
      [stage.name.toUpperCase(), 15, '#e8d9a0'],
      ['press JUMP to continue', 13, 'rgba(255,255,255,0.7)'],
    ]);
  } else if (state.screen === 'gameOver') {
    // GAME KNOCKED — the client's wording, and it is player slang, not a
    // typo for "knocked out". Leave it exactly as written. He is not dead:
    // "GAME OVER" in blood red over a body reads far grimmer than this game
    // is meant to be. He got jumped and robbed; he gets back up.
    // The prompt has to say WHICH it is. Pressing JUMP either spends the
    // continue and puts you back at the top of this stage, or starts a fresh
    // run — and a player who thinks they are continuing when they are not
    // has lost a run to an ambiguous line of text.
    drawOverlayText(state.continues > 0 ? [
      ['GAME KNOCKED', 28, '#e8a13f'],
      [`$${state.score.toLocaleString()}`, 18],
      [`${state.continues} CONTINUE`, 15, '#8fe08f'],
      [`press JUMP to get back up in ${STAGES[state.stageIndex].name}`, 13, 'rgba(255,255,255,0.7)'],
    ] : [
      ['GAME KNOCKED', 28, '#e8a13f'],
      [`$${state.score.toLocaleString()}`, 18],
      ['no continues left', 13, 'rgba(255,140,120,0.85)'],
      ['press JUMP to start a new run', 13, 'rgba(255,255,255,0.7)'],
    ]);
  }
}

const loop = createLoop({ update, draw });

const imageManifest = {
  player: PLAYER_SPRITE.url,
  bag: PROP_SPRITES.bag,
  bagBlue: PROP_SPRITES.bagBlue,
  champagne: PROP_SPRITES.champagne,
  // The client's stylized MARTA rail map, for the between-stage screen.
  martamap: martaMapArt,
  // The two still scenes: an inpainted base plus the pieces cut off it that
  // move. See render/title.js and render/ending.js.
  ...TITLE_IMAGES,
  ...ENDING_IMAGES,
};
for (const [v, sp] of Object.entries(ENEMY_SPRITES)) imageManifest['enemy_' + v] = sp.url;
for (const s of STAGES) {
  imageManifest[s.id] = s.bg.img;
  for (const c of s.bg.cards || []) imageManifest[`${s.id}_${c.key}`] = c.img;
}

loadImages(imageManifest)
  .then((loaded) => {
    images = loaded;
    showTitle();
    loop.start();
    // Coming back from the TIME OF DAY reload — see onTimeOfDayChange. Read
    // and cleared in one go, so a plain refresh never reopens it.
    let reopen = null;
    try {
      reopen = sessionStorage.getItem('wh_reopen');
      sessionStorage.removeItem('wh_reopen');
    } catch (_e) {}
    if (reopen === 'settings') panel.open('settings');
  })
  .catch((err) => {
    // A rejected asset load used to leave a permanently black canvas with
    // no clue why (loop.start() simply never ran). Fail loudly instead.
    console.error('Asset load failed:', err);
    ctx.fillStyle = '#140a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlayText([
      ['ASSET LOAD FAILED', 20, '#e0435f'],
      ['check the console', 13, 'rgba(255,255,255,0.7)'],
    ]);
  });
