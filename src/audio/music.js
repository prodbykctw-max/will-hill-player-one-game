// MUSIC — one cue per screen, addressed by FUNCTION, never by song.
//
// The client's instruction, and it is the right one: "name your audio assets
// by function (stage_01, map_01_02, ui_pause) rather than by song and the
// swap is a manifest edit, not a refactor." Four of the ten slots are
// explicitly volatile — the stage cues are the ones most likely to change when
// the project tracks arrive, and BLOCK HOT is already circling STAGE_02 — so
// nothing outside MANIFEST is allowed to know a title.
//
// ⚠️ NO FILES ARE WIRED YET. Every entry is `null`, which is a supported state
// rather than a stub: `play()` on an empty slot stops whatever was playing and
// returns, so the game runs silent-but-correct today and gains music the day
// the mp3s land in src/assets/music/ and the nulls become paths.
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
// ── WHAT A STAGE CUE ACTUALLY GETS HEARD ─────────────────────────────────
//
// Worth knowing before anyone cuts a track to length: a stage is 30-37s flat
// out and longer in real play, against songs of 3-4 minutes. NOBODY WILL EVER
// HEAR THE END OF A STAGE CUE. `startAt` exists for exactly that — a cue can
// begin at its hook instead of its intro — and it is per-slot because the
// answer is different for every song.

// ── THE MANIFEST ─────────────────────────────────────────────────────────
// Slot -> file. Order is play order. `loop` false means it runs once and
// stops; `startAt` is seconds into the file to begin, for cues whose opening
// is longer than the screen it plays under.
//
// The song names are here as COMMENTS ONLY, so this file can be read against
// the cue sheet, and so that changing a song never means changing a key.
export const MANIFEST = {
  // Loops longest of anything here — players sit on this screen.
  title:     { src: null, loop: true,  gain: 0.55, startAt: 0 },  // En Vogue
  // No map before this one — straight in from the title.
  stage_01:  { src: null, loop: true,  gain: 0.50, startAt: 0 },  // TAKE A RISK
  map_01_02: { src: null, loop: true,  gain: 0.50, startAt: 0 },  // Million Dollar Baby
  stage_02:  { src: null, loop: true,  gain: 0.50, startAt: 0 },  // BENDING CORNERS (alt: BLOCK HOT)
  map_02_03: { src: null, loop: true,  gain: 0.50, startAt: 0 },  // Don't Wanna Leave
  stage_03:  { src: null, loop: true,  gain: 0.50, startAt: 0 },  // JAPANESE PANTS
  map_03_04: { src: null, loop: true,  gain: 0.50, startAt: 0 },  // Pretty Girls Love Me
  stage_04:  { src: null, loop: true,  gain: 0.50, startAt: 0 },  // LOVE THE HUSTLE
  // An interlude, under a frozen screen — quieter, so it does not pull focus.
  ui_pause:  { src: null, loop: true,  gain: 0.38, startAt: 0 },  // Creepin' (Interlude)
  // The ONLY cue that plays start to finish instead of looping.
  credits:   { src: null, loop: false, gain: 0.60, startAt: 0 },  // I'm The Man
};

// Which cue belongs to which stage index, so main.js never builds a slot name
// by string concatenation — a typo there is a silent missing track.
export const STAGE_SLOTS = ['stage_01', 'stage_02', 'stage_03', 'stage_04'];
export const MAP_SLOTS = ['map_01_02', 'map_02_03', 'map_03_04'];

const FADE = 0.9;      // seconds to cross from one cue to the next
const DUCK_TO = 0.42;  // how far the music drops under a punch
const DUCK_MS = 260;   // how long it stays down before recovering

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

    const ctx = getContext();
    let gain = null;
    let src = null;
    if (ctx && getMaster()) {
      try {
        src = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(getMaster());
      } catch (_e) {
        // Some engines refuse a second source for the same element, and
        // Safari has historically refused it before a gesture. Element volume
        // is the fallback; it loses ducking and nothing else.
        gain = null;
      }
    }
    if (!gain) el.volume = 0;
    const node = { el, gain, cue };
    nodes.set(slot, node);
    return node;
  }

  function levelOf(node) {
    if (muted) return 0;
    return node.cue.gain * (ducking > 0 ? DUCK_TO : 1);
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
    status() {
      return {
        playing: current ? current.slot : null,
        wanted,
        wired: Object.entries(MANIFEST).filter(([, c]) => c.src).map(([k]) => k),
        missing: Object.entries(MANIFEST).filter(([, c]) => !c.src).map(([k]) => k),
        muted,
        ducking: ducking > 0,
      };
    },
  };
}
