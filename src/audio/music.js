// MUSIC — one cue per screen, addressed by FUNCTION, never by song.
//
// The client's instruction, and it is the right one: "name your audio assets
// by function (stage_01, map_01_02, ui_pause) rather than by song and the
// swap is a manifest edit, not a refactor." Four of the ten slots are
// explicitly volatile — the stage cues are the ones most likely to change when
// the project tracks arrive, and BLOCK HOT is already circling STAGE_02 — so
// nothing outside MANIFEST is allowed to know a title.
//
// WIRED, with prodbyKCTW's own instrumentals — his pairing, made off the cue
// bench and recorded in tools/cue_sheet.json. `null` is still a supported
// state for any slot: `play()` on an empty one stops whatever was playing and
// returns, so a cue can be pulled without touching anything else.
//
// ── WHY <audio> AND NOT decodeAudioData ──────────────────────────────────
//
// The rest of this game's sound is decoded into AudioBuffers, which is right
// for a 40ms punch and catastrophic for a 3:51 song: decoded to 48kHz stereo
// float, JAPANESE PANTS alone is about 90MB of RAM, and ten cues would be
// most of a gigabyte on a phone at a party. A media element STREAMS — it
// starts on the first few seconds and never holds the whole thing.
//
// It is still routed THROUGH the WebAudio graph via createMediaElementSource,
// so the music shares the master bus with everything else: one mute switch,
// one place to duck, and the ambience/effects balance stays where it was
// tuned. The fallback path (no WebAudio) drives element.volume directly, so a
// browser that refuses the graph still gets music, just without the ducking.
//
// ── THE FILES ARE CUT, NOT WHOLE SONGS ───────────────────────────────────
//
// A stage runs 40-50s flat out (measured off a 4.80 px/tick run against each
// stage's real length) and longer in real play, against tracks of 1:34 to
// 3:29. Nobody ever hears the end of a stage cue.
//
// `startAt` used to be the answer: open the cue at its hook and skip the
// intro. It only half worked. A media element with `loop = true` wraps to
// ZERO, not to startAt — so the first pass opened on the hook and every pass
// after it played the intro the offset existed to avoid. Invisible on a stage,
// obvious on the title card, which loops for as long as somebody sits there.
//
// So the files themselves now START at the hook. tools/cut_loop.py takes the
// track, cuts from the hook, and picks the length whose end genuinely runs
// back into its own start — searched by cross-correlation rather than snapped
// to a bar, because a beat tracker read one of these at 89 BPM when its own
// filename says 135. That makes every startAt below 0 and the native loop
// correct and gapless.
//
// ⚠️ A LOOPING CUE MUST KEEP startAt 0. The field stays for one-shot cues and
// for anyone wiring a full track in a hurry; on a looping slot a non-zero
// value is the bug described above, not a feature.
//
// Sizes: 6.84MB for all ten, from 30.4MB of source. Cut, then VBR ~120kbps —
// the masters are untouched and live in prodbyKCTW's own library.

import mTitle from '../assets/music/title.mp3';
import mStage01 from '../assets/music/stage_01.mp3';
import mMap0102 from '../assets/music/map_01_02.mp3';
import mStage02 from '../assets/music/stage_02.mp3';
import mMap0203 from '../assets/music/map_02_03.mp3';
import mStage03 from '../assets/music/stage_03.mp3';
import mMap0304 from '../assets/music/map_03_04.mp3';
import mStage04 from '../assets/music/stage_04.mp3';
import mPause from '../assets/music/ui_pause.mp3';
import mCredits from '../assets/music/credits.mp3';

// ── THE MANIFEST ─────────────────────────────────────────────────────────
// Slot -> file. Order is play order. `loop` false means it runs once and
// stops. Every cue is already trimmed to its hook, so startAt is 0 throughout.
//
// The song names are here as COMMENTS ONLY, so this file can be read against
// tools/cue_sheet.json, and so that changing a song never means changing a
// key. All prodbyKCTW; the number after each is where the hook was found in
// the full track, which is where that file now begins.
export const MANIFEST = {
  // Loops longest of anything here — players sit on this screen.
  title:     { src: mTitle,   loop: true,  gain: 0.55, startAt: 0 },  // Knowledge x POLO   @ 0:18.5
  // No map before this one — straight in from the title.
  stage_01:  { src: mStage01, loop: true,  gain: 0.50, startAt: 0 },  // 3.10.26 (2)        @ 0:56.6
  map_01_02: { src: mMap0102, loop: true,  gain: 0.50, startAt: 0 },  // Knowledge B.Jordan @ 0:40.5
  stage_02:  { src: mStage02, loop: true,  gain: 0.50, startAt: 0 },  // salvador/Knowledge @ 0:16.1
  map_02_03: { src: mMap0203, loop: true,  gain: 0.50, startAt: 0 },  // Project 6          @ 0:57.5
  stage_03:  { src: mStage03, loop: true,  gain: 0.50, startAt: 0 },  // Project 9          @ 1:57.5
  map_03_04: { src: mMap0304, loop: true,  gain: 0.50, startAt: 0 },  // 2GetHer            @ 0:09.8
  stage_04:  { src: mStage04, loop: true,  gain: 0.50, startAt: 0 },  // lonliness 2        @ 0:26.8
  // An interlude, under a frozen screen — quieter, so it does not pull focus.
  ui_pause:  { src: mPause,   loop: true,  gain: 0.38, startAt: 0 },  // doggzzz            @ 0:40.0
  // The ONLY cue that plays start to finish instead of looping.
  credits:   { src: mCredits, loop: false, gain: 0.60, startAt: 0 },  // Project 9          @ 1:57.5
};

// Which cue belongs to which stage index, so main.js never builds a slot name
// by string concatenation — a typo there is a silent missing track.
export const STAGE_SLOTS = ['stage_01', 'stage_02', 'stage_03', 'stage_04'];
export const MAP_SLOTS = ['map_01_02', 'map_02_03', 'map_03_04'];

const FADE = 0.9;      // seconds to cross from one cue to the next
const DUCK_TO = 0.42;  // how far the music drops under a punch
const DUCK_MS = 260;   // how long it stays down before recovering

// ── ONE KNOB FOR THE WHOLE SOUNDTRACK ────────────────────────────────────
// The client's report, in a car with the stereo maxed: "they're very low. I
// got the car on Max and it sounds like I got it on 25%." He is right, and
// the arithmetic says so. The files are mastered to -16 LUFS, then the cue
// gain (0.50) and the master bus (0.85) each take a bite: 0.50 x 0.85 =
// 0.425, which is -7.4 dB, so the music actually reaches the speaker around
// -23 LUFS. That is bed level for something playing under dialogue, not for
// the thing you are meant to be listening to.
//
// Raise it HERE and not in the files. The mp3s are already matched to each
// other track-for-track by tools/cut_loop.py, and re-encoding them louder
// would throw away that matching, requantise ten files, and push their
// peaks toward the -1 dBFS ceiling. One multiplier over the top keeps the
// balance exactly as measured and is a single number to nudge — he asked
// for it "an increment at a time," so leave it that way.
//
// Headroom check at +3 dB (x1.413): the loudest cue is credits at 0.60 ->
// 0.848, times the file's -1 dBFS peak (0.891) = 0.755, times master 0.85 =
// 0.642 at the destination. Still a third of full scale spare for the SFX
// sitting alongside it, so nothing clips. Anything past about +6 dB starts
// eating that margin, and past +7 the no-WebAudio fallback clamps (element
// volume cannot exceed 1.0) and the boost silently stops applying.
const BOOST_DB = 3.0;
const BOOST = 10 ** (BOOST_DB / 20);

export function createMusic(getContext, getMaster) {
  const nodes = new Map();   // slot -> { el, src, gain }
  let current = null;
  let muted = false;
  let ducking = 0;
  let wanted = null;         // the slot asked for, honoured once unlocked

  function build(slot) {
    const cue = MANIFEST[slot];
    if (!cue || !cue.src) return null;
    if (nodes.has(slot)) return nodes.get(slot);

    const el = new Audio();
    el.src = cue.src;
    el.loop = !!cue.loop;
    el.preload = 'none';     // nothing downloads until a cue is actually asked for
    el.crossOrigin = 'anonymous';
    // A media element that fails to load must not take the game with it.
    el.addEventListener('error', () => { nodes.delete(slot); });

    const node = { el, gain: null, cue };
    nodes.set(slot, node);
    graph(node);              // only if the context can actually deliver it
    if (!node.gain) el.volume = 0;
    return node;
  }

  // ── DO NOT TAKE THE ELEMENT OUT OF THE SPEAKERS UNTIL THE GRAPH WORKS ──
  //
  // This is the bug behind "the home screen music doesn't play unless I hit
  // OPTIONS first", and it was ours, not Safari's.
  //
  // `createMediaElementSource` PERMANENTLY redirects an element's audio into
  // the WebAudio graph. build() used to call it whenever a context object
  // existed — including a SUSPENDED one. A suspended graph outputs nothing, so
  // the cue played into a void, and el.volume could not rescue it because the
  // element's output no longer went to the speakers at all. Nothing was heard
  // until enough gestures accumulated to resume the context, and OPTIONS is
  // several gestures. Measured on a cold load: element unpaused, currentTime
  // climbing, ctx suspended, silence.
  //
  // So while the context is asleep the element just plays, normally, through
  // its own volume — which is allowed anywhere plain <audio> autoplay is
  // allowed. It is adopted into the graph the moment the context is genuinely
  // running, which is what tick() checks.
  function graph(node) {
    if (node.gain) return;
    const ctx = getContext();
    if (!ctx || ctx.state !== 'running' || !getMaster()) return;
    try {
      const src = ctx.createMediaElementSource(node.el);
      const gain = ctx.createGain();
      // Hand over at the level it is already playing at, or the swap is an
      // audible jump in the middle of a track.
      gain.gain.value = node.el.volume;
      src.connect(gain).connect(getMaster());
      node.el.volume = 1;     // the gain node owns the level from here
      node.gain = gain;
    } catch (_e) {
      // Some engines refuse a second source for one element. Element volume
      // stays in charge; that loses ducking and nothing else.
    }
  }

  function levelOf(node) {
    if (muted) return 0;
    return node.cue.gain * BOOST * (ducking > 0 ? DUCK_TO : 1);
  }

  function ramp(node, to, secs) {
    const ctx = getContext();
    if (node.gain && ctx) {
      node.gain.gain.cancelScheduledValues(ctx.currentTime);
      node.gain.gain.setValueAtTime(node.gain.gain.value, ctx.currentTime);
      node.gain.gain.linearRampToValueAtTime(to, ctx.currentTime + secs);
    } else {
      node.el.volume = Math.max(0, Math.min(1, to));
    }
  }

  function stopNode(node, secs) {
    if (!node) return;
    ramp(node, 0, secs);
    const el = node.el;
    // Pause AFTER the fade, and only if nothing has started it again since.
    setTimeout(() => {
      if (current && current.el === el) return;
      try { el.pause(); } catch (_e) { /* */ }
    }, secs * 1000 + 60);
  }

  return {
    // Ask for a cue. Safe to call every frame — asking for the cue that is
    // already playing does nothing, which is what lets main.js state it
    // declaratively at each screen instead of tracking transitions.
    play(slot) {
      wanted = slot;
      if (current && current.slot === slot) return;
      const node = build(slot);
      const prev = current;
      if (!node) {
        // An empty slot still STOPS the previous cue. Carrying stage one's
        // track into stage two because stage two has no file yet would be
        // worse than silence, and much harder to notice.
        current = null;
        stopNode(prev, FADE);
        return;
      }
      current = { slot, ...node };
      try {
        if (node.cue.startAt && node.el.currentTime < 0.05) {
          node.el.currentTime = node.cue.startAt;
        }
        const pr = node.el.play();
        if (pr && pr.catch) pr.catch(() => {});   // refused before a gesture
      } catch (_e) { /* */ }
      ramp(node, levelOf(node), FADE);
      if (prev && prev.el !== node.el) stopNode(prev, FADE);
    },

    stop() {
      wanted = null;
      const prev = current;
      current = null;
      stopNode(prev, FADE);
    },

    // The punch is the loudest thing in the game and the music is the widest.
    // Ducking is what stops a stomp disappearing into a chorus.
    duck() {
      if (!current) return;
      ducking = DUCK_MS;
      ramp(current, levelOf(current), 0.05);
    },

    // Once a frame. Recovers the duck, and retries a cue the browser refused
    // before the first gesture — the same trap the ambience fell into, where
    // a context exists and produces nothing until something plays inside a
    // real user interaction.
    tick(dtMs = 16.6) {
      // Adopt anything still playing outside the graph, now that the context
      // may have woken up. See graph() — this is the second half of the fix.
      if (getContext() && getContext().state === 'running') {
        for (const n of nodes.values()) {
          if (!n.gain) { graph(n); if (n.gain) ramp(n, levelOf(n), 0.2); }
        }
      }
      if (ducking > 0) {
        ducking -= dtMs;
        if (ducking <= 0 && current) ramp(current, levelOf(current), 0.35);
      }
      if (wanted && !current) this.play(wanted);
      else if (current && current.el.paused && !muted) {
        const pr = current.el.play();
        if (pr && pr.catch) pr.catch(() => {});
      }
    },

    setMuted(v) {
      muted = !!v;
      if (current) ramp(current, levelOf(current), 0.25);
      if (muted && current) { try { current.el.pause(); } catch (_e) { /* */ } }
    },

    // For the harness, and for anyone wondering why they cannot hear anything.
    //
    // The element fields are the ones that matter and the ones a harness
    // cannot get any other way: these are `new Audio()` objects, never
    // appended to the document, so querySelectorAll('audio') finds nothing and
    // a check written that way reports silence on a game that is playing fine.
    status() {
      const el = current && current.el;
      return {
        playing: current ? current.slot : null,
        wanted,
        wired: Object.entries(MANIFEST).filter(([, c]) => c.src).map(([k]) => k),
        missing: Object.entries(MANIFEST).filter(([, c]) => !c.src).map(([k]) => k),
        // The resolved URLs. A harness cannot check a cue by calling play() —
        // main.js re-states the cue for the current screen EVERY frame, so a
        // manual play() is overridden before it can be read, and ten slots all
        // report whichever one the game is actually on. Load these directly.
        srcs: Object.fromEntries(Object.entries(MANIFEST).map(([k, c]) => [k, c.src])),
        muted,
        ducking: ducking > 0,
        el: !el ? null : {
          paused: el.paused,
          t: +el.currentTime.toFixed(2),
          dur: Number.isFinite(el.duration) ? +el.duration.toFixed(2) : null,
          loop: el.loop,
          ready: el.readyState,            // 4 = enough buffered to play through
          err: el.error ? el.error.code : null,
          // What is actually reaching the master bus, gain node or element.
          level: current.gain ? +current.gain.gain.value.toFixed(3) : +el.volume.toFixed(3),
        },
        // Every cue that has been built, so a cross-fade can be watched: two
        // are audible at once for FADE seconds when one cue hands to the next.
        live: [...nodes.entries()]
          .filter(([, n]) => !n.el.paused)
          .map(([slot, n]) => ({
            slot,
            level: +(n.gain ? n.gain.gain.value : n.el.volume).toFixed(3),
            t: +n.el.currentTime.toFixed(2),
          })),
      };
    },
  };
}
