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
import { STAGES, resolveStages, timeOfDay } from './world/stages.js';
import { T, FLOOR_R, SLAB_R, FALL_DEATH_Y, isSolid } from './world/tilemap.js';
import { createRenderer } from './render/renderer.js';
import { createBackdrop } from './render/backdrop.js';
import { createUndercroft } from './render/undercroft.js';
import { createHud } from './render/hud.js';
import { createMartaMap } from './render/martamap.js';
import { createEnding, statsFrom, ENDING_IMAGES, RESTART as ENDING_RESTART,
  SRC_W as ENDING_W, SRC_H as ENDING_H } from './render/ending.js';
import { createStillScene } from './render/stillscene.js';
import { createTitle, TITLE_IMAGES,
  INTRO_TICKS as TITLE_INTRO_TICKS } from './render/title.js';
import martaMapArt from './assets/backgrounds/marta-map.webp';
import { loadImages } from './render/images.js';
// ⚠️ signupOffered/markSignupOffered/localRuns are deliberately NOT imported
// any more. They were the two guards on the pre-run sign-up gate and both are
// retired: the offer now repeats every start until the player actually
// enters. leaderboard.js still exports them — the stored `wh_signup_offered`
// key is harmless and other callers may want the latch — but main.js reads
// registration and nothing else. See beginFromTitle().
import { createRunLog, lbSubmit, bankLocalRun, isRegistered, hasPendingRun,
  recordRunStats, pendingRunCount, flushPendingRun } from './net/leaderboard.js';
import { createPanel, soundEnabled, setSoundEnabled,
  sfxEnabled, setSfxEnabled, howToSeen } from './ui/panel.js';
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
  onClose: () => {
    // A sign-up offered on the way INTO a run must not eat the run. Whether
    // they entered or tapped NOT NOW, closing the panel is the green light.
    if (state.pendingRun) { state.pendingRun = false; startRun(); return; }
    if (state.screen === 'paused' && state.resumeTo) resume();
  },
  isPendingRun: () => !!state.pendingRun,
  onSoundChange: (on) => audio.setMuted(!on),
  onSfxChange: (on) => audio.setSfxMuted(!on),
  onHapticsChange: (on) => haptics.setEnabled(on),
  // ── TIME OF DAY APPLIES NOW, LIVE, WITHOUT RESTARTING ANYTHING ───────
  //
  // ⚠️ THIS USED TO CALL location.reload() AND THAT WAS WRONG. The comment
  // that lived here argued a reload "is not a cop-out" because re-resolving
  // eight plates, ~60 multiplane cards, the sky, the lighting rig and the rain
  // live is a lot of machinery for one setting. All true, and all beside the
  // point. The client: "setting the time and settings shouldn't restart the
  // whole damn game man, it shouldn't reset everything, it shouldn't stop the
  // music. Nothing, no changes or edits in the game should restart the whole
  // game." A reload stops the music, drops the audio graph he had to gesture
  // to unlock, empties the panel and blinks the screen — to change a sky.
  //
  // IT TURNED OUT TO BE SMALL. Nothing outside this file imports STAGES, and
  // nothing anywhere imports TIME_OF_DAY: every renderer reads `stage.tod` off
  // the stage object it is handed, freshly, per frame. So the whole switch is
  // "swap the four stage objects and have the images for them ready".
  //
  // LOADED FIRST, SWAPPED SECOND, so there is never an in-between. The other
  // half's plates are fetched while the current ones stay live and playable;
  // only once they have all decoded do STAGES and `images` change, in the same
  // tick. Hit START in the middle of that and you get the half you were
  // already in, correctly, rather than a stage with holes in it.
  onTimeOfDayChange: (choice) => {
    const midRun = ['playing', 'paused', 'riding', 'stageClear'].includes(state.screen);
    if (midRun) return false;      // panel keeps the "next run" note
    return applyTimeOfDay(choice);
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
  // ⚠️ MEASURE THE BOX, NOT THE VIEWPORT — they are not the same rectangle
  // any more and the difference is exactly the bug the client photographed.
  //
  // #game is `position: fixed; inset: 0` (see index.html), so its box now
  // spans the physical screen including the home-indicator strip, while
  // visualViewport still reports the safe area — 34pt shorter on his iPhone.
  // Sizing the bitmap off the viewport would leave the CSS box scaling a
  // too-short bitmap up to fill it: the black band would be gone and the
  // whole painting would be stretched by 4% instead, which is the mistake
  // that got made once already with letterbox filler and was thrown out.
  //
  // clientWidth/clientHeight are that box, in CSS px, from the element
  // itself. visualViewport stays as the fallback for the first frame if the
  // element has not been laid out yet (clientHeight 0 would give a 1px
  // canvas and a divide-by-zero in the fit).
  const vv = window.visualViewport;
  const w = canvas.clientWidth || (vv ? Math.round(vv.width) : window.innerWidth);
  let h = canvas.clientHeight || (vv ? Math.round(vv.height) : window.innerHeight);

  // ⚠️ IN THE INSTALLED APP THE BOX CAN STILL COME UP SHORT, AND THE CSS
  // CANNOT ALWAYS TELL. He reported the strip again after
  // `calc(100dvh + env(safe-area-inset-bottom))` shipped and visibly moved the
  // painting down: whatever his standalone reports, the two together are not
  // reaching the foot of the screen. Rather than guess a third time at which
  // unit is lying, measure the disagreement and close it — `screen.height` is
  // the physical screen, and a full-width standalone web view owns all of it.
  //
  // Fires only when there IS a shortfall, only in standalone, only in
  // portrait-ish full width, and only for a gap small enough to be an inset
  // (never a resized window). Worst case it draws a few px of wet street past
  // the bottom edge, which is nothing; the alternative is the bar he keeps
  // photographing. The overrides let a harness prove the path — Chromium
  // cannot launch as an installed iOS app — the same way __safeTopOverride
  // proves the island path in stillscene.
  const standalone = typeof window.__standaloneOverride === 'boolean'
    ? window.__standaloneOverride
    : ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true);
  const scrH = window.__screenHeightOverride
    || (window.screen && window.screen.height) || 0;
  const scrW = (window.screen && window.screen.width) || 0;
  if (standalone && scrH > h && scrH - h <= 80
      && (!scrW || Math.abs(window.innerWidth - scrW) <= 2)) {
    canvas.style.height = scrH + 'px';
    h = scrH;
  }

  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
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
  // ── THE COMBO CHAIN ────────────────────────────────────────────────────
  // Client: "I plan on working a combo system into the game."
  //
  // `combo` is the chain in the air right now; `comboBest` is the best of
  // this run, which is what the dashboard's MAX COMBO reads. Deliberately
  // TWO numbers: the live one has to fall to zero the instant he lands, and
  // the run's best must survive that, a death, and a continue.
  //
  // ⚠️ IT SCORES NOTHING, ON PURPOSE. Every point in this game is recomputed
  // server-side and checked against a MEASURED ceiling (61,650 perfect,
  // 70,000 refused) and a 400/second rate limit. A combo bonus would move
  // both, re-open the Will Hill calibration, and risk refusing a genuinely
  // great run mid-contest as "implausible-rate". So the chain is a flourish
  // and a statistic — it changes what the run FEELS like and what the
  // dashboard can say about it, and touches nothing that decides the prize.
  combo: 0,
  comboBest: 0,
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
  // ⚠️ THE HELD RUN, EXPOSED FROM HERE AND NOT RE-IMPORTED. A harness that
  // does `await import('/src/net/leaderboard.js')` gets a SECOND instance of
  // the module under Vite dev — the app's copy is fetched with an HMR
  // timestamp on the URL and a bare specifier is a different URL — so it reads
  // a `pendingRun` that is always null and reports the held run as lost. This
  // hook hands out the app's own copy.
  // `pendingRunCount` and not just `hasPendingRun`: the single-slot bug that
  // dropped a 25,800 run was invisible to a boolean — one run was held right
  // up until a second one silently replaced it, and "true" was the honest
  // answer both times. A harness can only catch that by counting.
  // lbSubmit and flushPendingRun go through the door too, so the OUTBOX can
  // be graded without playing four stages to reach a death. Handing out the
  // app's own copy is the whole point — `await import()` under Vite dev gives
  // a SECOND module instance whose queue is always empty, which once had a
  // harness reporting a held run as lost when it was fine.
  window.__lb = { hasPendingRun, pendingRunCount, lbSubmit, flushPendingRun };
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
  // THE LIVE TIME-OF-DAY SWAP, graded through these two. `__tod` is the half
  // the stage objects are ACTUALLY in this instant — not what localStorage
  // says, which was true the whole time the setting appeared broken — and
  // `__panel` lets a harness prove the panel survived the switch, the entire
  // point being that nothing restarts and nothing is thrown away.
  Object.defineProperty(window, '__tod', { get: () => (STAGES[0] ? STAGES[0].tod : null) });
  window.__panel = panel;
  // A getter, not a value: `images` is declared with `let` further down and
  // reading it here would hit the temporal dead zone and kill the module.
  Object.defineProperty(window, '__titleImages', { get: () => images });
  // WHERE THE HOLES ARE, IN SCREEN SPACE — the same question drawPitMouths
  // answers, answered from the same numbers rather than re-derived. A harness
  // that recomputes FLOOR_R * T * zoom for itself is grading its own
  // arithmetic, and this project has paid for that mistake more than once.
  // Returns one entry per run of missing floor currently on screen:
  //   x, w     the mouth, in canvas px
  //   top      the road surface — the top of the throat
  //   slab     the thickness of the slab band below it, which is the band the
  //            undercroft does NOT cover and where the backdrop shows through
  window.__pits = () => {
    const lv = state.level;
    if (!lv || state.screen !== 'playing') return [];
    const z = camera.zoom;
    const top = camera.groundScreenY();
    const slab = SLAB_R * T * z;
    const c0 = Math.max(0, Math.floor(camera.x / T) - 1);
    const c1 = Math.min(lv.genC - 1, Math.floor((camera.x + camera.vw) / T) + 1);
    const out = [];
    let c = c0;
    while (c <= c1) {
      if (isSolid(lv.map, c, FLOOR_R)) { c += 1; continue; }
      let end = c;
      while (end + 1 <= c1 && !isSolid(lv.map, end + 1, FLOOR_R)) end += 1;
      const sx = (c * T - camera.x) * z;
      const sw = (end + 1 - c) * T * z;
      if (sx + sw > 0 && sx < camera.vw * z) out.push({ x: sx, w: sw, top, slab });
      c = end + 1;
    }
    return out;
  };
}

let images = null; // { player, enemy, eav, edgewood, l5p, underground }
// ⚠️ DECLARED HERE, NOT BESIDE THE LOAD THAT FILLS IT. draw() reads this on
// its very first frame and the loader lives at the bottom of the file — a
// `let` down there would put the whole boot inside a temporal dead zone and
// throw before a pixel appeared. This file has been bitten by exactly that
// twice (the menuButtons hook, and buildIosSwitch).
let bootPlate = null;

function startStage(i) {
  const stage = STAGES[i];
  state.stageIndex = i;
  // Per stage, not per run: each one warms its OWN map cue partway through
  // (see the finish-line check in update). Left set, only stage one would
  // ever prefetch and every later ride would be back to fetching at the line.
  state.mapWarmed = false;
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

// ── WHAT "START" MEANS — ONE ROUTE, TAP OR KEY ─────────────────────────────
//
// Client, spelling the order out: "once you hit start game, you should be
// presented with registering for the contest with an option to skip if you
// want to, and then you should be presented with the instructions on how to
// play and then you can go." So START is no longer a synonym for startRun():
// it is the head of a three-stop chain — CONTEST → HOW TO PLAY → run — and
// the run is only ever launched by the far end of it (panel onClose, holding
// `state.pendingRun`).
//
// ⚠️ IT LIVES IN A FUNCTION BECAUSE THERE ARE TWO STARTS. The pointer handler
// on the title card and the keyboard/JUMP path both mean START, and the gate
// used to exist only on the pointer one — so anybody who pressed Space, or
// tapped the JUMP pad on the title, walked straight past the sign-up that the
// tap path stopped at. One function, both callers, no second door.
//
// ⚠️ AND IT ASKS EVERY TIME, NOT ONCE. It used to latch on `signupOffered()`
// — one NOT NOW and the offer never came back, ever, on any visit. Client:
// "ask again next time they start until they're registered." So the only
// thing that retires the ask is actually entering. The old
// `localRuns().length` guard is gone with it for the same reason: it made the
// gate unreachable for the exact person it exists for, a brand-new player,
// who by definition has no runs banked yet.
//
// The one guard that stays is `introDone`. A tap during the title assembly
// means "skip this animation", and a skip must stay a skip — landing a
// first-time player on a contact form because they were impatient is how this
// was broken the first time.
function beginFromTitle() {
  const introDone = (state.screenT - state.introAt) > INTRO_TICKS;
  if (!introDone) { startRun(); return; }
  state.pendingRun = true;        // whatever they choose, the run follows
  // ── WHAT STILL STANDS BETWEEN THE TAP AND THE RUN ────────────────────
  //
  // The contest, until they enter it — that offer repeats every start, his
  // instruction, and it is the whole point of the gate.
  //
  // ⚠️ THE TUTORIAL DOES NOT REPEAT. Client: "you only show me how to play
  // before a stage one time in the beginning… that's the only time you show me
  // how to play." It used to be on every start down BOTH branches — straight
  // to it if registered, onto it off NOT NOW if not — which meant a player who
  // kept declining the contest was taught the game again every single run.
  // docs/NEXT_CHAT.md had this written down as a question to put to him.
  //
  // Somebody already entered, who has already been shown it, has nothing left
  // to answer: the run just starts. NOT NOW and SAVE on the form take the same
  // decision from the other side — see onwardFromStart() in ui/panel.js.
  if (isRegistered() && howToSeen()) {
    state.pendingRun = false;
    startRun();
    return;
  }
  panel.open(isRegistered() ? 'how' : 'form', { flow: 'start' });
}

function startRun() {
  state.score = 0;
  state.hearts = 3;
  state.continues = CONTINUES_PER_RUN;
  // Distance is banked per stage. The HUD's readout is the CURRENT stage's
  // and resets with it, so the ending board needs its own running total or
  // it would report only the last stage he walked.
  state.distanceM = 0;
  state.combo = 0;
  state.comboBest = 0;
  state.runLog = createRunLog();
  state.runLog.start();
  // The results are offered ONCE per run, on the ending. Without a latch,
  // dismissing the board would reopen it on the next frame and the RESTART
  // button underneath could never be reached.
  state.resultsShown = false;
  startStage(startStageIndex());
}

// ── ?stage=1..4 — START WHERE YOU NEED TO LOOK ───────────────────────────
//
// Client, wanting to inspect the backgrounds rather than play them: "add me
// to champagne relay back so I can look at them that way, and I guess I'll
// screenshot any locations." CHAMPAGNE RELAY (core/relay.js, `?relay=1`)
// already takes the enemies and the pits out of his way — but he still had to
// walk stages one, two and three to reach the Underground, which is where he
// found the thing he wanted to photograph.
//
// Same rule as `?relay=1`: URL only, no button, nothing a player is ever
// shown. It is one-INDEXED because it is typed by a human on a phone — the
// Underground is stage 3 on his list, not stage 2. Out-of-range or missing
// falls through to the real beginning, so a typo costs a normal run and not
// a broken one.
function startStageIndex() {
  if (typeof location === 'undefined') return 0;
  const m = /[?&]stage=([1-9])\b/.exec(location.search);
  if (!m) return 0;
  const n = +m[1];
  // ⚠️ OUT OF RANGE FALLS THROUGH TO STAGE ONE, IT DOES NOT CLAMP. Clamping
  // was the first version and it silently answered `?stage=9` with Little 5
  // Points — a fat-fingered 9 would have dropped him at the last stage
  // wondering why the URL lied. Landing at the ordinary beginning is a typo
  // he can see.
  return n >= 1 && n <= STAGES.length ? n - 1 : 0;
}

function confirmPressed() {
  return input.jump();
}

// ── PAUSE ────────────────────────────────────────────────────────────────
// Menu buttons are rebuilt each frame so they track the canvas size; their
// rects are what the pointer handler hit-tests against.
const menuButtons = [];
// ── AND THE BETWEEN-SCREENS HAVE BUTTONS NOW TOO ────────────────────────
//
// PM, watching someone play: "we're really not pressing jump to continue,
// we're just tapping the screen to continue so should we just add a next
// stage button?"
//
// He was right twice over. Tapping anywhere HAS worked all along — the
// pointer handler has had a branch for it — so the card's "press JUMP to
// continue" was describing one of two live inputs and naming the one nobody
// used. And neither of them was visible: there was nothing on the screen that
// looked like it could be pressed.
//
// So STAGE CLEAR and GAME KNOCKED get real buttons, drawn exactly like the
// pause menu's so the player only has one thing to learn, and tap-anywhere is
// gone. Same array shape as menuButtons and hit-tested the same way.
const screenButtons = [];
// ⚠️ HOOKED HERE, NOT UP WITH THE OTHER DEV HOOKS. `menuButtons` is a `const`
// declared in this section, so touching it from the block near the top of the
// file lands in the temporal dead zone and throws before the game ever boots.
// The pause menu rebuilds its rects every frame, so a harness has to READ
// them rather than recompute them; the panel needs a door that is not a tap
// on a canvas coordinate.
if (import.meta.env.DEV) {
  window.__menuButtons = menuButtons;
  window.__screenButtons = screenButtons;
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
      // ⚠️ TOGGLE FROM WHAT THE BOX SHOWS, NOT FROM WHAT IS STORED. They are
      // the same thing until the audio is gesture-blocked, and then they are
      // opposites: a returning player sees an UNCHECKED box (see the draw
      // call below) while wh_sound is still 'on', and toggling off the stored
      // value would turn the music OFF on the very press he made to turn it
      // on. Reading the drawn state keeps the control honest — a tap on an
      // unchecked box always ends with sound.
      const on = !musicIsLive();
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
    // OPTIONS opens the SHELF, not the board. Client: "under options —
    // leaderboard is there, instructions could also be found under the
    // options, the settings button should be found under the options, and
    // then back to the game should be filed under the options."
    if (title.hitOptions(state.titleBox, x, y)) { press(); panel.open('menu'); return; }
    // ── STRAIGHT INTO THE CONTEST, FROM THE HOME PAGE ──────────────────────
    //
    // Client: "from that page, I want someone to be able to immediately enter
    // the contest." Before this, entering meant PRESS START and sitting
    // through the form on the way into a run, or OPTIONS -> LEADERBOARD ->
    // ENTER THE CONTEST. Three taps, behind a menu, for the one action the
    // whole build exists to drive.
    //
    // Somebody already in has nothing to fill in, so the same banner takes
    // them to the board instead — the rule everywhere else in this flow.
    if (title.hitBanner(state.titleBox, x, y)) {
      press();
      panel.open(isRegistered() ? 'board' : 'form', { flow: 'title' });
      return;
    }
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
    beginFromTitle();
    return;
  }
  // ⚠️ A BUTTON, NOT ANYWHERE. This used to advance on a tap on any pixel, and
  // that is what the PM caught: it worked, so nobody pressed JUMP, and the
  // card said "press JUMP to continue" while the whole room tapped the screen.
  // A tap that lands off a button now does nothing, deliberately — on the
  // ending screen the button is his own painted PRESS START TO CONTINUE.
  //
  // ⚠️ `screenT > 20` STAYS, and it is not politeness. confirmPressed() is the
  // jump button, so without the arming delay the press that ends one screen
  // carries straight through into the next.
  if (state.screen === 'stageClear' || state.screen === 'gameOver'
      || state.screen === 'complete') {
    if (state.screenT > 20) {
      for (const b of screenButtons) {
        if (hit(b, x, y)) { press(); b.action(); e.preventDefault(); return; }
      }
    }
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

// WHAT EACH BUTTON ON A BETWEEN-SCREEN DOES.
//
// One function per outcome rather than one function that re-derives the
// outcome from `state`. The old shape was a single advanceFromScreen() that
// branched on the screen AND on state.continues, which was fine while every
// screen offered exactly one thing — and stopped being fine the moment GAME
// KNOCKED offered two. A button now names its own action and nothing has to
// guess.

// STAGE CLEAR. Bank the distance, then either ride to the next neighbourhood
// or finish the run.
function nextStage() {
  state.distanceM += Math.max(0, (state.player.x - 3 * T) / T);
  if (state.stageIndex + 1 < STAGES.length) {
    state.rideFrom = STAGES[state.stageIndex].id;
    state.rideTo = state.stageIndex + 1;
    state.screen = 'riding';
    state.screenT = 0;
    return;
  }
  state.screen = 'complete';
  state.screenT = 0;
  state.finalLog = state.runLog.finish();
  recordRunStats(state.finalLog, state.score);
  // Banked on the device FIRST, and unconditionally. A phone at a party is not
  // always on a network; either way the run happened and the player should be
  // able to see it.
  bankLocalRun(state.score);
  lbSubmit(state.finalLog);
}

// GAME KNOCKED, with a continue to spend. Hearts come back full and the stage
// restarts from its beginning; the score carries, because the money was
// already earned and taking it back would make the continue worthless.
function getBackUp() {
  state.continues--;
  state.runLog.record('continue');
  // ⚠️ THE RUN THAT JUST SUBMITTED IS NOT THE RUN HE IS ABOUT TO FINISH.
  //
  // Death submits immediately, so by the time this line runs the Worker has
  // already recorded the score as it stood at the knockdown. Carrying the same
  // runId forward meant the FINISHED run — the one worth more — was refused as
  // a replay and thrown away: measured live at 18,300 recorded against 25,800
  // actually played. Renewing here makes the finished run its own submission,
  // and `supersedes` tells the Worker to drop the partial row so that stretch
  // of play is not counted twice.
  state.runLog.renew();
  state.hearts = 3;
  startStage(state.stageIndex);
}

// THE END OF A RUN, however it ended. The results open over the title rather
// than dropping straight to it — this is the one moment the player definitely
// cares what their score was worth, which makes it the only moment worth
// asking for a phone number.
//
// ⚠️ `flow: 'post'` — THE BOARD IS THE END OF THE JOURNEY HERE.
// Client: "die or win? Ending scene then Leaderboard and registration. If
// already registered, no registration offer, only leaderboard." So an
// unregistered player gets the sign-up card with the board behind it; a
// registered one goes straight to the board with their name on it. Either way
// BACK off that board closes out to the title in one tap rather than stepping
// sideways into OPTIONS — showTitle() has already run, so the title card is
// what the closing panel reveals.
function showResults() {
  panel.open(isRegistered() ? 'board' : 'form', { flow: 'post' });
}

function endRun() {
  showTitle();
  showResults();
}

// ── AND WHEN THERE IS AN ENDING, THE BOARD OPENS ON TOP OF IT ────────────
//
// Client: "die or win? Ending scene then Leaderboard and registration." On a
// knockdown there is no scene, so endRun() puts the title behind the board.
// On a WIN there is one, and it is the best thing in the game — so the board
// opens over the ending and the ending stays where it is. Dismissing it
// reveals his painting again with RESTART on it, which is what that button
// says and now what it does.
//
// ⚠️ IT IS THE SAME OVERLAY THE SIGN-UP CARD ALREADY IS. Nothing new was
// needed: panel.open with flow 'post' already lays the card over the board,
// and #panel has always drawn over whatever the canvas is showing. The only
// change is not calling showTitle() first.
//
// ⚠️ AND screenT STOPS WHILE IT IS UP. update() returns early when the panel
// is open, so the tally does not run on behind the board and the delay below
// is measured in ticks the player actually saw.
const RESULTS_AFTER = 140;      // ticks: the eight rows tally in 56, then a beat

function restartRun() {
  commit();
  startRun();
}

// The buttons each screen offers, in order. First is the primary — it is what
// JUMP and Space press, and what the eye lands on.
//
// ⚠️ GAME KNOCKED OFFERS TWO THINGS NOW AND USED TO OFFER ONE. Pressing JUMP
// spent a continue with no way to decline, and the prompt had to carry the
// whole distinction in a line of text: "press JUMP to get back up in EAST
// ATLANTA VILLAGE" against "press JUMP to start a new run". A player who
// misread that line lost a run to it. Two buttons cannot be misread.
function buttonsFor(screen) {
  if (screen === 'stageClear') return [{ label: 'NEXT STAGE', action: nextStage }];
  if (screen === 'gameOver') {
    return state.continues > 0
      ? [{ label: 'GET BACK UP', action: getBackUp },
        { label: 'END RUN', action: endRun }]
      : [{ label: 'SEE YOUR SCORE', action: endRun }];
  }
  // 'complete' is not here: its button is PAINTED, on his ending plate, and is
  // registered where that plate is drawn. Nothing of mine goes on that artwork.
  return [];
}

// JUMP and Space PRESS THE FIRST BUTTON. They do not decide anything of their
// own — that is the whole point. The previous version had the tap path and the
// key path both call a third function that branched on state, and its own
// comment said re-implementing the decision per path "is how the two drift
// apart"; routing both through the drawn buttons means there is only one
// decision and it is the one the player can see.
function advanceFromScreen() {
  const b = screenButtons[0];
  if (b) b.action();
  else showTitle();   // any screen with nothing to offer falls back to attract
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

// ⚠️ ONE ANSWER TO "IS THE MUSIC ON", USED BY THE BOX AND BY THE TAP.
// The preference and the reality are the same thing until the platform is
// holding audio behind a gesture, and then they are OPPOSITES — which is the
// whole bug this exists for. Two call sites computing it separately is how
// the box and the toggle would drift back apart, so there is one.
// Named rather than inlined so a harness can read what the box was told:
// state.musicShown is written every frame the title is drawn.
function musicIsLive() {
  return soundEnabled() && audio.ready();
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
      // ── THE RIDE STARTS AT THE FINISH LINE, NOT AT THE NEXT TAP ─────────
      //
      // Client: "as soon as you cross the finish line on the stage I want the
      // map travel music to come in — instead of finishing the stage and
      // having to press jump, as soon as you cross the finish line the music
      // for the transition map should already start."
      //
      // This used to hold the stage's own track on the clear card, on the
      // reasoning that the card is a beat rather than a scene. His point is
      // better: the card is where the stage ENDS, so the journey should
      // already be under way behind it, and the player taps into a ride whose
      // music is running rather than triggering it.
      //
      // Returning the SAME cue `riding` will ask for means the tap changes
      // nothing at all in the audio — no restart, no cross-fade, no seam. The
      // track simply keeps playing across the screen change.
      //
      // ⚠️ THE LAST STAGE HAS NO MAP AFTER IT. MAP_SLOTS holds the three
      // BRIDGES (01_02, 02_03, 03_04), so on the final clear the lookup is
      // undefined — and what belongs there is the ENDING's cue, not the
      // stage's. This first held the stage track and let `complete` start the
      // credits at the tap; client, having heard it: "the music from the
      // ending scene should start sooner." Same principle as the maps, applied
      // to the last scene there is — the show the player is arriving at should
      // already be playing behind its clear card, and the tap into the results
      // changes nothing in the audio.
      return MAP_SLOTS[st.stageIndex] || 'credits';
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
      // ⚠️ beginFromTitle, NOT startRun. This is the second START and it used
      // to be the hole in the gate — Space, or the JUMP pad on the title,
      // skipped the sign-up the tap path stops at.
      beginFromTitle();
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
    // The ending plays, and then the board arrives on top of it — his order,
    // not a tap. Once per run; see state.resultsShown in startRun().
    if (state.screen === 'complete' && !state.resultsShown
        && state.screenT > RESULTS_AFTER) {
      state.resultsShown = true;
      showResults();
      return;
    }
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

  // ⚠️ THE CHAIN BREAKS ON THE GROUND — AND THIS LINE LIVED INSIDE
  // `if (isRelay())` FOR ONE COMMIT, WHICH IS WHY combo.mjs EXISTS.
  // The relay block a few lines up ends with an onGround test of its own, and
  // putting this beside it read perfectly and shipped a combo that never
  // reset in the actual game — only in the dev flag nobody plays. It counted
  // up all run and every check but one went green. The harness caught it.
  //
  // It sits BEFORE the enemy loop deliberately, and that is safe: a stomp
  // requires !player.onGround and leaves him rising at vy -10.5, so he can
  // never be on the ground in the same frame he stomps, and this can never
  // zero a chain it is part of. Written as an assignment rather than a
  // transition check because standing still should hold it at zero.
  if (player.onGround) state.combo = 0;

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
      // ── CHAIN ────────────────────────────────────────────────────────
      // The mechanic this counts was ALREADY HERE and nobody was reading
      // it: resolveEnemyCollision pogos him off a stomp at vy -10.5 and
      // hands back an air jump. That bounce alone carries 258px at run
      // speed (2*10.5/0.52 = 40 ticks x 6.4), and the generator's
      // MIN_ENEMY_SPACING_COLS is 8 columns = 256px. So a chain clears the
      // tightest spacing in the game by two pixels BEFORE the free air jump
      // is spent. Measured, not hoped at — tools/harness/combo.mjs walks it.
      // That is the whole reason the rule below is "without landing" rather
      // than a forgiving timer: the jump arc already makes it exactly, and
      // barely, possible, which is what a combo should be.
      state.combo += 1;
      if (state.combo > state.comboBest) {
        state.comboBest = state.combo;
        // ⚠️ LOGGED ON EACH NEW BEST, NOT ONCE AT THE END. A run can finish
        // at a death, at a continue that renews the run id, or at the last
        // stage clear, and an end-of-run hook would have to be right on all
        // three — the continue path already cost this contest a real score
        // once by being missed. Recording the new high as it happens is
        // correct on every path with no hook at all, costs at most
        // (best - 1) events, and the Worker takes MAX of what it finds.
        if (state.comboBest >= 2) state.runLog.record('combo', { n: state.comboBest });
        audio.combo(state.combo);
      }
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
    // ⚠️ RECORDED BEFORE finish(), or it is not in the log that gets sent.
    //
    // Client: "can we count stats like how many deaths throughout the entire
    // time of you playing, how many kills." Kills were already in the log as
    // `stomp`; a death was not in it at all — the run simply stopped, so
    // neither the device nor the dashboard could ever count one.
    //
    // The cause rides in the type rather than a second field, because the
    // whole log is `{t, type}` pairs and the Worker scores it with
    // `SCORE_RULES[ev.type] || 0` — an unknown type is worth zero, so new
    // event names are score-neutral by construction and cannot inflate a
    // contest run. player.deathCause is set in three places: 'enemy' and
    // 'pothole' in entities/player.js, 'fall' here at FALL_DEATH_Y.
    state.runLog.record(`death_${player.deathCause || 'enemy'}`);
    const log = state.runLog.finish();
    recordRunStats(log, state.score);
    lbSubmit(log);
    // Banked locally too, exactly like the complete path. A knocked-down run
    // already SUBMITS to the contest (the line above), but it never reached
    // wh_local_runs — so "your best on this device" and the share card lied
    // for the most common way a run actually ends. bankLocalRun ignores
    // score 0, so dying broke on the first stage stays unrecorded.
    bankLocalRun(state.score);
    return;
  }

  // ── FETCH THE RIDE'S MUSIC BEFORE HE GETS THERE ────────────────────────
  //
  // Client: "I feel like the map music doesn't start soon enough… as soon as
  // the user crosses to the finish, the train map music starts immediately."
  //
  // The cue is already asked for on the crossing frame — see cueForScreen's
  // `stageClear` case, which was built to his earlier note. The lateness is
  // underneath that: music elements are created `preload = 'none'` so ten
  // cues do not download at boot, which makes the finish line the moment the
  // map track begins its FETCH. Warming it in advance is the only fix that
  // touches the actual cause; moving the trigger earlier cannot help a file
  // that is not in memory yet.
  //
  // At 55% rather than at stage start: by then the stage's own track has long
  // since buffered, so the two are not competing for a phone's uplink, and
  // there is still a good half-minute of running left to fetch under a
  // megabyte. Guarded by a flag on state so it fires once per stage, not
  // sixty times a second.
  if (!state.mapWarmed && player.x >= finishLineX(level) * 0.55) {
    state.mapWarmed = true;
    const next = MAP_SLOTS[state.stageIndex];
    if (next) audio.music.warm(next);
  }

  if (player.x >= finishLineX(level)) {
    // How far people actually get is the one question the log could not
    // answer — a run that ends on stage two and a run that ends on stage four
    // looked identical in it. One event per stage cleared makes the drop-off
    // countable, on the device and in the dashboard both. Score-neutral, same
    // as the death events.
    state.runLog.record(`stage_clear_${state.stageIndex + 1}`);
    state.screen = 'stageClear';
    state.screenT = 0;
  }
}

// Pause menu. Buttons are laid out and registered every frame so they stay
// correct through rotation and resize — a menu whose hitboxes are computed
// once goes wrong the first time someone turns their phone.
// ONE BUTTON, DRAWN ONCE. The pause menu and the between-screens have to look
// identical or they read as two different systems, and two copies of the same
// twelve lines is how they stop being identical.
function drawButtonPlate(x, y, w, h, label, size = 17) {
  ctx.fillStyle = 'rgba(20,16,30,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,214,110,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#ffd66e';
  ctx.font = `700 ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textBaseline = 'alphabetic';
}

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
    drawButtonPlate(bx, by, bw, bh, it.label);
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

// The card, and under it whatever this screen actually lets you do.
//
// ⚠️ THE BUTTONS ARE THE ONLY RECORD OF WHAT A SCREEN DOES. advanceFromScreen()
// presses the first one rather than re-deciding for itself, so the keyboard and
// the thumb cannot drift apart — which is the failure the old version's own
// comment warned about and then invited, by having two code paths agree on a
// third function.
function drawOverlayText(lines, buttons = []) {
  screenButtons.length = 0;
  ctx.save();
  ctx.fillStyle = 'rgba(6,3,12,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd66e';
  const bh = 52;
  const gap = 12;
  // Centre the WHOLE card — text plus buttons — rather than the text alone,
  // or adding a button pushes the heading off centre and the screen looks like
  // it slipped.
  const textH = lines.reduce((n, [, size]) => n + size + 14, -14);
  const stackH = textH + (buttons.length ? 26 + buttons.length * bh
    + (buttons.length - 1) * gap : 0);
  let y = (canvas.height - stackH) / 2 + lines[0][1] / 2;
  for (const [text, size, color] of lines) {
    ctx.font = `700 ${size}px sans-serif`;
    ctx.fillStyle = color || '#ffd66e';
    ctx.fillText(text, canvas.width / 2, y);
    y += size + 14;
  }
  const bw = Math.min(300, canvas.width * 0.72);
  const bx = canvas.width / 2 - bw / 2;
  let by = y + 12;
  for (const b of buttons) {
    drawButtonPlate(bx, by, bw, bh, b.label);
    screenButtons.push({ x: bx, y: by, w: bw, h: bh, action: b.action, label: b.label });
    by += bh + gap;
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
    // ── THE BACKGROUND LOADS FIRST, AND THE LOADER SHOWS IT ──────────────
    //
    // Client: "loading screen transition — background needs to load first."
    // The boot used to be a black rectangle with LOADING on it until every
    // image in the game had arrived, which on a phone is the first thing
    // anybody sees of this and says nothing about what they are waiting for.
    // The title plate is now fetched in its own first pass (see the two-stage
    // load at the bottom of this file) and painted here the moment it lands,
    // so the wait happens ON the artwork and the title screen comes up out of
    // the same picture instead of cutting to it.
    if (bootPlate && bootPlate.width) {
      const cover = Math.max(canvas.width / bootPlate.width,
        canvas.height / bootPlate.height);
      const w = bootPlate.width * cover;
      const h = bootPlate.height * cover;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bootPlate, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.restore();
    }
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
    state.musicShown = musicIsLive();
    state.titleBox = title.draw(images, state.tick, introT <= INTRO_TICKS, introT,
      // ⚠️ THE BOX SHOWS WHETHER SOUND CAN ACTUALLY COME OUT, NOT WHAT IS
      // STORED. Client, on the installed PWA: "shows checked when no music is
      // on in first load of game... when I hit options music starts."
      //
      // This drew soundEnabled() alone, which is the PREFERENCE. A player who
      // ticked MUSIC on a previous visit comes back to wh_sound === 'on', so
      // the box drew itself CHECKED — while iOS had released no audio yet,
      // because opening a PWA from the home screen is a gesture on the OS and
      // not on us. Ticked box, total silence, and nothing on screen asking
      // for the tap that would fix it. His next tap landed on OPTIONS, that
      // counted as the gesture, and the theme came up from a control that has
      // nothing to do with music — which is exactly how he found it.
      //
      // The box exists to COLLECT that gesture. Showing it already satisfied
      // is the one state in which it cannot do its job, and that state is
      // every returning player's first load. So it now reads unchecked and
      // breathing whenever the audio is not actually live, whatever is
      // stored, and the tap handler above toggles from what is SHOWN so the
      // press always moves toward sound.
      //
      // ⚠️ NOT REPRODUCIBLE IN THIS CONTAINER. Headless Chromium resumes its
      // AudioContext without a gesture even when started with
      // --autoplay-policy=document-user-activation-required — measured, it
      // reports 'running' and a loud bus on first load. This is a Safari/PWA
      // behaviour and the harness cannot see it, which is the standing
      // warning in docs/STATUS.md about Chrome checks and a Safari phone.
      state.musicShown,
      // Ticks since the MUSIC box was last pressed, so it can flash back. A
      // press that has never happened is effectively infinitely old.
      state.musicPressTick == null ? 1e9 : state.tick - state.musicPressTick,
      mousePos,
      // The banner says ENTER THE CONTEST or SEE THE BOARD depending on this.
      isRegistered());
    return;
  }

  // The results board is a whole screen of its own, and it covers the frame.
  // It used to be checked further down, AFTER a full world render that it
  // then painted over — a wasted backdrop, undercroft, tile and entity pass
  // every frame you sat looking at your score, and a hard crash if it was
  // ever reached without a level built.
  if (state.screen === 'complete') {
    // ⚠️ ONE PLATE, NO CARDS. The old ending was cut into base/crowd/hero so
    // the crowd could sway; those cards came off the LANDSCAPE painting and
    // mean nothing on this one. His call was "ship it flat first, re-cut
    // after", so the sway is a separate pass over the new art.
    const box = still.draw(images.ending_base, [], state.tick);
    // His plate carries its own SHOWTIME, its own eight stat LABELS and its
    // own RESTART button. The only thing drawn onto it is eight numbers.
    ending.draw(statsFrom(state.finalLog, state.score, state.distanceM || 0),
      state.screenT, box);
    // ⚠️ ENDING_W/ENDING_H, NOT THE TITLE PLATE'S. Mapping this rect through
    // title.js's SRC_W/SRC_H is what put the old ending's prompt glow at x=605
    // on a 430px phone — off the right edge, so it never once appeared. Both
    // constants were called SRC_W. docs/LESSONS.md 21.
    still.pulsePrompt(box, ENDING_RESTART, ENDING_W, ENDING_H, state.tick);
    // ── AND THE BUTTON HERE IS ALREADY PAINTED ─────────────────────────
    //
    // RESTART is a gold plate in his artwork and pulsePrompt is throbbing it.
    // Drawing one of mine on top would be a live copy of his own control on
    // his own painting — the objection that put every cabinet button under his
    // lettering rather than beside it. So his plate IS the hit target, with
    // nothing drawn.
    //
    // ⚠️ AND IT HAS TO BE REGISTERED, not left to tap-anywhere, because
    // tap-anywhere is gone. Without this the ending is a dead end on a phone.
    screenButtons.length = 0;
    if (box) {
      const S = box.dw / ENDING_W;
      screenButtons.push({
        x: box.dx + ENDING_RESTART.x * S, y: box.dy + ENDING_RESTART.y * S,
        w: ENDING_RESTART.w * S, h: ENDING_RESTART.h * S,
        action: restartRun, label: 'RESTART',
      });
    }
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
    // `stage.under` goes in so the mouth can be backed with the section's own
    // strata: the slab band is the one band the undercroft does not cover, and
    // without a backing the hole showed the sky gradient through it.
    renderer.drawPitMouths(level.map, camera,
      (c, r) => isSolid(level.map, c, r), level.genC, stage.under);
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
    combo: state.combo,
    portraitImg: images.player,
    portraitAtlas: PLAYER_SPRITE.atlas,
  });

  if (state.screen === 'paused') {
    drawPauseMenu(stage);
  } else if (state.screen === 'stageClear') {
    // PM: "let's add a score here. So people can see how much they have before
    // entering a new level." Same line GAME KNOCKED already draws, at the same
    // size, so the two cards read as one family.
    drawOverlayText([
      ['STAGE CLEAR', 28],
      [stage.name.toUpperCase(), 15, '#e8d9a0'],
      [`$${state.score.toLocaleString()}`, 18],
    ], buttonsFor('stageClear'));
  } else if (state.screen === 'gameOver') {
    // GAME KNOCKED — the client's wording, and it is player slang, not a
    // typo for "knocked out". Leave it exactly as written. He is not dead:
    // "GAME OVER" in blood red over a body reads far grimmer than this game
    // is meant to be. He got jumped and robbed; he gets back up.
    // The prompt has to say WHICH it is. Pressing JUMP either spends the
    // continue and puts you back at the top of this stage, or starts a fresh
    // run — and a player who thinks they are continuing when they are not
    // has lost a run to an ambiguous line of text.
    // The prompt no longer has to carry which-thing-JUMP-does — the buttons
    // say it. What is left is the state: the score, and whether there is a
    // continue to spend.
    drawOverlayText(state.continues > 0 ? [
      ['GAME KNOCKED', 28, '#e8a13f'],
      [`$${state.score.toLocaleString()}`, 18],
      [`${state.continues} CONTINUE`, 15, '#8fe08f'],
      [`back at ${STAGES[state.stageIndex].name}`, 13, 'rgba(255,255,255,0.7)'],
    ] : [
      ['GAME KNOCKED', 28, '#e8a13f'],
      [`$${state.score.toLocaleString()}`, 18],
      ['no continues left', 13, 'rgba(255,140,120,0.85)'],
    ], buttonsFor('gameOver'));
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
const stagePlates = (stages) => {
  const m = {};
  for (const s of stages) {
    m[s.id] = s.bg.img;
    for (const c of s.bg.cards || []) m[`${s.id}_${c.key}`] = c.img;
  }
  return m;
};
Object.assign(imageManifest, stagePlates(STAGES));

// ── SWAPPING DAY FOR NIGHT WITHOUT RESTARTING THE GAME ───────────────────
//
// See onTimeOfDayChange. The music keeps playing, the audio graph stays
// unlocked, the panel stays open and on the same pane, and nothing blinks.
//
// The ONLY reason this is cheap: `STAGES` is imported by this file and no
// other, `TIME_OF_DAY` is imported by nothing at all, and every renderer
// reads `stage.tod` off the stage object handed to it on the frame it draws.
// So there is no rig to tear down — there are four objects to replace.
//
// ⚠️ LOAD FIRST, SWAP SECOND, both halves valid throughout. The incoming
// plates are fetched while the outgoing ones stay live; STAGES and `images`
// change together, in one tick, only once every new image has decoded. START
// pressed mid-swap gives the half you were already in, whole. The array is
// mutated in place rather than reassigned because it is an imported binding.
//
// A second switch while one is in flight simply supersedes it: `todWant`
// records what was last asked for, and a resolved load that is no longer the
// answer is discarded rather than applied on top of the newer one.
let todWant = STAGES[0] ? STAGES[0].tod : 'night';
function applyTimeOfDay() {
  const want = timeOfDay();          // the panel has already written the choice
  todWant = want;
  if (STAGES[0] && STAGES[0].tod === want) return Promise.resolve(true);
  const next = resolveStages(want);
  return loadImages(stagePlates(next)).then((loaded) => {
    if (todWant !== want) return false;   // superseded by a later switch
    Object.assign(images, loaded);
    Object.assign(imageManifest, stagePlates(next));
    STAGES.length = 0;
    STAGES.push(...next);
    return true;
  }).catch(() => false);              // keep the half that still works
}

// ── TWO-STAGE LOAD: THE PICTURE, THEN THE GAME ─────────────────────────
//
// Everything used to arrive in one pass, so the first paint of the whole
// product was a black rectangle for as long as the slowest stage plate took.
// The title art is a handful of files and it is the only thing anybody looks
// at during the wait, so it is fetched on its own first and handed to the
// loading screen (bootPlate) while the remaining plates, cards and sprites
// come down behind it.
//
// The second pass re-lists the title images deliberately: loadImages resolves
// a whole manifest to one object and `images` has to end up holding every key
// the renderer asks for. They are in cache by then, so it costs nothing.
//
// ⚠️ AND THE LOOP STARTS FIRST OF ALL. It used to be started inside the
// load's .then(), which meant draw() never ran while loading and the
// LOADING… screen it carefully painted was never once on screen — the boot
// was just the page's own black. update() returns early on the loading
// screen, so running the loop this early is free.
loop.start();
loadImages({ ...TITLE_IMAGES })
  .then((first) => { bootPlate = first.title_base || null; })
  .catch(() => { /* the loader just stays black — not worth failing boot for */ })
  .then(() => loadImages(imageManifest))
  .then((loaded) => {
    images = loaded;
    showTitle();
    // The TIME OF DAY reload used to leave a breadcrumb here so the panel could
    // be reopened on the settings pane afterwards. There is no reload now, so
    // the panel never closed and there is nothing to restore. One stale key is
    // cleared for anyone whose last visit was on the old build and left one
    // behind — without it, their next plain refresh would pop the panel open
    // for no reason they could connect to anything.
    try { sessionStorage.removeItem('wh_reopen'); } catch (_e) {}
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
