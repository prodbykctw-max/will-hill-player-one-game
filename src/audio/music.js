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
  // ⚠️ THIS LOOPS NOW. It was the one cue set to play start-to-finish, and
  // the ending screen has no time limit — so anyone who sat on the results
  // board longer than 41 seconds watched the credits play out and then sat
  // in silence. Client had it on the list as "the ending goes silent".
  //
  // Safe to loop because it was never a raw track: tools/cut_loop.py cut
  // every one of these to a length whose end genuinely runs back into its own
  // start, searched by cross-correlation. musiccheck.mjs confirms this file
  // is 41.4s against a cut plan of 41.4, i.e. it is the loop-ready cut, so
  // `loop` here wraps at the point that was chosen for wrapping.
  credits:   { src: mCredits, loop: true,  gain: 0.60, startAt: 0 },  // Project 9          @ 1:57.5
};

// Which cue belongs to which stage index, so main.js never builds a slot name
// by string concatenation — a typo there is a silent missing track.
export const STAGE_SLOTS = ['stage_01', 'stage_02', 'stage_03', 'stage_04'];
export const MAP_SLOTS = ['map_01_02', 'map_02_03', 'map_03_04'];

const FADE = 0.9;      // seconds to cross from one cue to the next
// ── THE LOOP SEAM ────────────────────────────────────────────────────────
// Client: "the songs need to be longer or we need to find better loop
// points." The points are already as good as arithmetic gets them —
// tools/cut_loop.py picks each cut by cross-correlation so the end runs back
// into its own start — but `loop = true` on an MP3 still wraps with a flick:
// the format pads the first frame with encoder priming samples, and the
// element adds its own wrap latency on top. Nothing about the cut can remove
// that; it has to be MASKED.
//
// So a looping cue is TWO elements taking turns. LAP seconds before the end,
// the spare starts from zero and the two cross linearly; at the seam the old
// front is paused and the pair swap roles. The material either side of the
// lap is the same passage by construction (that is what cut_loop.py chose),
// so a sub-second linear cross is inaudible where a native wrap clicks.
//
// ⚠️ THE NATIVE LOOP STAYS ON BOTH ELEMENTS, deliberately. If the graph is
// not running (no gesture yet, WebAudio refused) the lap never arms and the
// cue behaves exactly as it always did — and if a lap ever fails to arm in
// time, the element wraps itself instead of running off the end into
// silence. The crossfade is an improvement layered on the old behaviour,
// never a replacement that can fail worse.
const LAP = 0.9;       // seconds of overlap that mask a loop's wrap
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
// Client asked for another +2 on top of the +3 that was already here, and
// asked for it "an increment at a time" — so this is 5, not a jump to some
// number nobody measured. Headroom re-checked at +5 dB (x1.778): the loudest
// cue is credits at 0.60 -> 1.067, times the file's -1 dBFS peak (0.891) =
// 0.950, times master 0.85 = 0.808 at the destination. Still under full
// scale with room for the effects alongside it, but this is now the last
// increment that is comfortable: past about +6 dB the margin goes, and past
// +7 the no-WebAudio fallback silently stops applying it because an element's
// volume cannot exceed 1.0.
const BOOST_DB = 5.0;
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

    // `slot` lives ON the node so that `current` can be the node ITSELF
    // rather than a copy of it — see play(). Everything that reads `current`
    // (setMuted, duck, tick, status) then sees the live gain instead of a
    // snapshot of what the gain was at the moment the cue started.
    const node = { el, gain: null, cue, slot,
      // The other half of the loop pair. Built lazily at half-distance so
      // its buffer is warm by lap time, graphed only when the context runs.
      spare: null, spareGain: null, lapEndsAt: 0, laps: 0 };
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

  // ── A LOOPING CUE PLAYS FROM A DECODED BUFFER, NOT A MEDIA ELEMENT ──────
  //
  // Client, having cut the intro himself at the bench and then heard it in the
  // game: "at the end of the loop it's a pause before the loop starts again —
  // we need to get rid of whatever that pause is, the loop is perfect." And
  // before that: "never asked for a crossfade — if I picked the perfect loop
  // it wouldn't need the crossfade, it will need to play continuous the same
  // infinite."
  //
  // He was comparing against tools/loopbench.html, and he was comparing fairly:
  // THE BENCH AND THE GAME WERE NOT PLAYING THE SAME THING. The bench uses
  // AudioBufferSourceNode with loopStart/loopEnd, which is sample-accurate and
  // butt-joins. The game used two <audio> elements and crossed them over LAP =
  // 0.9 SECONDS — so at every wrap, most of a second of bar 16 played on top
  // of bar 1. That was the right call for a loop point nobody had listened to,
  // where the raw join is 13x or 104x the track's own sample step and the
  // overlap is hiding a click. It is the wrong call for a loop he cut to be
  // exact, where the two halves are different music and the overlap is the
  // artefact.
  //
  // So: decode the file once, loop the buffer. No overlap, no spare element,
  // and no MP3 encoder gap either — the decoded buffer has no container
  // padding to wrap through, which is the OTHER thing that can put a hole at a
  // seam on Safari.
  //
  // ⚠️ THE ELEMENT PATH STAYS, AND STAYS THE FALLBACK. Everything below is
  // skipped unless the context is genuinely running, the master exists, and
  // the buffer has decoded. A decode that fails or has not finished leaves the
  // cue on the element exactly as before, lap and all — this file has already
  // been the reason the whole soundtrack was silent once (see play()), and a
  // new path that can only ever ADD a way to play is the only safe shape for
  // it this close to a contest.
  const buffers = new Map();      // slot -> AudioBuffer
  const decoding = new Map();     // slot -> Promise
  // Two at a time: the cue playing and the one warm() has fetched ahead of it.
  // A decoded stage track is ~35MB of Float32 — holding all ten would be
  // several hundred megabytes for no benefit, on a phone.
  const MAX_BUFFERS = 2;

  function decodeSlot(slot) {
    const cue = MANIFEST[slot];
    if (!cue || !cue.src || !cue.loop) return Promise.resolve(null);
    if (buffers.has(slot)) return Promise.resolve(buffers.get(slot));
    if (decoding.has(slot)) return decoding.get(slot);
    const ctx = getContext();
    if (!ctx) return Promise.resolve(null);
    const pr = fetch(cue.src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('fetch'))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        buffers.set(slot, buf);
        decoding.delete(slot);
        // Evict the least useful, never what is playing or just decoded.
        for (const k of [...buffers.keys()]) {
          if (buffers.size <= MAX_BUFFERS) break;
          if (k === slot || (current && current.slot === k)) continue;
          buffers.delete(k);
        }
        return buf;
      })
      .catch(() => { decoding.delete(slot); return null; });
    decoding.set(slot, pr);
    return pr;
  }

  function canBuffer(node) {
    const ctx = getContext();
    return !!(node && node.cue.loop && buffers.has(node.slot)
      && ctx && ctx.state === 'running' && getMaster());
  }

  function startBuffer(node, offset = 0) {
    const ctx = getContext();
    const buf = buffers.get(node.slot);
    if (!ctx || !buf) return false;
    stopBufferNow(node);
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = buf.duration;         // the whole cut, which IS the loop
      const gain = ctx.createGain();
      gain.gain.value = 0;                // play() ramps it up, same as before
      src.connect(gain).connect(getMaster());
      src.start(0, Math.max(0, offset % buf.duration));
      // The element's gain node is kept, not disconnected: if the buffer is
      // ever evicted this node has to be able to fall back to the element, and
      // createMediaElementSource cannot be run twice on one element. Ramped to
      // zero instead, so the paused element contributes nothing.
      if (node.gain && node.gain !== gain) {
        node.elGain = node.gain;
        try {
          node.elGain.gain.cancelScheduledValues(ctx.currentTime);
          node.elGain.gain.setValueAtTime(node.elGain.gain.value, ctx.currentTime);
          node.elGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.02);
        } catch (_e) { /* */ }
      }
      // The element must not also be singing. It never played for this cue,
      // but a cue can be promoted from element to buffer between plays.
      try { node.el.pause(); } catch (_e) { /* */ }
      node.bufSrc = src;
      node.gain = gain;
      node.bufAt = ctx.currentTime - offset;
      return true;
    } catch (_e) {
      return false;
    }
  }

  function stopBufferNow(node) {
    if (!node || !node.bufSrc) return;
    try { node.bufSrc.stop(); } catch (_e) { /* */ }
    try { node.bufSrc.disconnect(); } catch (_e) { /* */ }
    node.bufSrc = null;
  }

  // Where a buffer-backed cue is, in its own timeline. status() and the
  // harnesses read this the same way they read el.currentTime.
  function bufTime(node) {
    const ctx = getContext();
    const buf = node && node.bufSrc && node.bufSrc.buffer;
    if (!ctx || !buf) return 0;
    return (ctx.currentTime - node.bufAt) % buf.duration;
  }

  function stopNode(node, secs) {
    if (!node) return;
    ramp(node, 0, secs);
    // A mid-lap cue is TWO playing elements; both retire, or the spare keeps
    // singing underneath the next screen's music.
    if (node.lapEndsAt && node.spareGain) {
      const ctx = getContext();
      if (ctx) {
        node.spareGain.gain.cancelScheduledValues(ctx.currentTime);
        node.spareGain.gain.setValueAtTime(node.spareGain.gain.value, ctx.currentTime);
        node.spareGain.gain.linearRampToValueAtTime(0, ctx.currentTime + secs);
      }
      node.lapEndsAt = 0;
    }
    const el = node.el;
    const spare = node.spare;
    // Pause AFTER the fade, and only if nothing has started it again since.
    setTimeout(() => {
      if (current && current.el === el) return;
      try { el.pause(); } catch (_e) { /* */ }
      if (spare) { try { spare.pause(); } catch (_e) { /* */ } }
      // A buffer source keeps running until it is stopped — it has no
      // `paused` to fall back on, so forgetting this leaves the previous cue
      // playing at zero gain forever and burning CPU.
      stopBufferNow(node);
    }, secs * 1000 + 60);
  }

  // The spare is a second <audio> on the SAME source. Its MediaElementSource
  // is created only while the context is genuinely running — same trap as
  // graph(): adopting an element into a suspended graph silences it for good.
  function buildSpare(node) {
    if (node.spare) return;
    const el = new Audio();
    el.src = node.cue.src;
    el.loop = true;             // the safety net, see the LAP note
    el.preload = 'auto';        // it exists to be ready at the seam
    el.crossOrigin = 'anonymous';
    el.volume = 0;
    node.spare = el;
  }

  function graphSpare(node) {
    if (node.spareGain || !node.spare) return;
    const ctx = getContext();
    if (!ctx || ctx.state !== 'running' || !getMaster()) return;
    try {
      const src = ctx.createMediaElementSource(node.spare);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(getMaster());
      node.spare.volume = 1;    // the gain node owns the level from here
      node.spareGain = gain;
    } catch (_e) { /* element volume stays in charge; lap simply never arms */ }
  }

  // Runs once a frame for the current cue. Arms the lap, drives the swap.
  // ── WHEN THE SECOND ELEMENT WILL NOT PLAY, KEEP THE FIRST ONE ───────────
  //
  // Client, on his phone: "EAV's music stops early and so the criminal
  // records during my run… there was a silence at the end and then it started
  // up after a minute of silence."
  //
  // The lap crossfades between two HTMLAudioElements. iOS Safari frequently
  // refuses `play()` on a second element outside a user gesture — and the
  // rejection was being swallowed by a bare `.catch(() => {})`, after which
  // the crossfade carried on regardless: the front ramped to zero, the spare
  // that never started ramped "up", and at the deadline the front was paused
  // and swapped out. Both elements silent, until play()'s stuck-paused retry
  // eventually re-fired — which is the minute he heard.
  //
  // Aborting restores the front's gain and leaves it playing. Every cue has
  // `loop = true` on the element itself as a safety net, so the wrap still
  // happens; it just happens natively, with a small seam instead of a
  // crossfade. A seam is a detail. A minute of silence is a broken game.
  //
  // Once a node has failed a lap it stops attempting them for the session:
  // the failure is a property of the platform, not of that moment, and
  // retrying every wrap would re-mute the music every wrap.
  function abortLap(node, why) {
    node.lapFailed = why || 'failed';
    node.lapEndsAt = 0;
    const ctx = getContext();
    if (ctx) {
      const now = ctx.currentTime;
      if (node.gain) {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(levelOf(node), now);
      }
      if (node.spareGain) {
        node.spareGain.gain.cancelScheduledValues(now);
        node.spareGain.gain.setValueAtTime(0, now);
      }
    }
    try { if (node.spare) node.spare.pause(); } catch (_e) { /* */ }
  }

  function lapTick(node) {
    // Harness door: setting window.__lapOff reverts to the bare native loop,
    // which is how tools/harness/loopseam.mjs proves the lap is what carries
    // the seam — a check that cannot fail is a comment. Inert otherwise.
    if (typeof window !== 'undefined' && window.__lapOff) return;
    // Crossfading needs BOTH sides on the graph — without it the native
    // loop already does everything this function would.
    if (!node || !node.gain || !node.cue.loop || muted) return;
    // A cue whose spare has already been refused once uses the native loop
    // from here on — see abortLap.
    if (node.lapFailed) return;
    const el = node.el;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= LAP * 3) return;
    const ctx = getContext();

    // Mid-lap: wait for the deadline, then retire the old front and swap.
    if (node.lapEndsAt) {
      if (ctx.currentTime < node.lapEndsAt) return;
      // ⚠️ NEVER RETIRE THE FRONT UNTIL THE SPARE IS PROVABLY AUDIBLE.
      // Retiring first is precisely what turns a refused play() into silence:
      // by the time anything notices, the only element that was making sound
      // has been paused. A spare that is still paused, or still sitting at
      // zero after a full crossfade, has not started.
      const sp = node.spare;
      if (!sp || sp.paused || !(sp.currentTime > 0.05)) {
        abortLap(node, 'spare-stalled');
        return;
      }
      try { el.pause(); } catch (_e) { /* */ }
      if (node.gain) node.gain.gain.value = 0;
      const oldEl = node.el; const oldGain = node.gain;
      node.el = node.spare; node.gain = node.spareGain;
      node.spare = oldEl; node.spareGain = oldGain;
      node.lapEndsAt = 0;
      node.laps++;
      return;
    }

    const t = el.currentTime;
    // Warm the spare from half-distance, so the seam never waits on a fetch.
    if (t > dur / 2) { buildSpare(node); graphSpare(node); }
    if (!node.spareGain || t < dur - LAP) return;

    // ── THE LAP ──. The remaining time IS the ramp length, so a tick that
    // lands late simply crosses faster rather than overshooting the wrap.
    const remain = Math.max(0.15, dur - t);
    const level = levelOf(node);
    try {
      node.spare.currentTime = 0;
      const pr = node.spare.play();
      // ⚠️ THE REJECTION IS THE WHOLE BUG. This used to be `.catch(() => {})`
      // — the one line that turned "iOS declined to start the second
      // element" into a silent stage.
      if (pr && pr.catch) pr.catch(() => abortLap(node, 'play-refused'));
    } catch (_e) { abortLap(node, 'play-threw'); return; }
    const now = ctx.currentTime;
    node.spareGain.gain.cancelScheduledValues(now);
    node.spareGain.gain.setValueAtTime(0, now);
    node.spareGain.gain.linearRampToValueAtTime(level, now + remain);
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setValueAtTime(node.gain.gain.value, now);
    node.gain.gain.linearRampToValueAtTime(0, now + remain);
    node.lapEndsAt = now + remain;
    // ⚠️ Known, accepted: a duck() landing inside this sub-second window
    // re-ramps only the outgoing gain (ramp() writes node.gain), so the
    // cross momentarily carries both at level. It resolves at the deadline
    // and a duck exactly at the seam is rare; the alternative is threading
    // lap-awareness through every ramp call.
  }

  return {
    // ── HAVE THE NEXT CUE IN MEMORY BEFORE IT IS ASKED FOR ─────────────────
    //
    // Client: "I feel like the map music doesn't start soon enough… as soon as
    // the user crosses to the finish, the train map music starts immediately."
    //
    // The transition was never the problem. main.js flips to `stageClear` on
    // the very frame `player.x >= finishLineX(level)`, and that screen already
    // asks for the map cue — that part was built to his earlier note and works.
    // What happens next is the delay: every element is created with
    // `preload = 'none'` (deliberately — ten cues eagerly downloading would be
    // megabytes nobody asked for), so crossing the line is the moment the map
    // track STARTS DOWNLOADING. On a phone on cell data that is the pause he
    // is hearing, and no amount of moving the trigger earlier fixes it,
    // because the trigger is already on the right frame.
    //
    // So the fix is to fetch it early and quietly. warm() builds the node and
    // flips it to `preload = 'auto'` without playing it, wiring nothing into
    // the graph: the browser buffers in the background while the stage is
    // still being played, and the cue that arrives at the finish line is
    // already in memory. Idempotent, so main.js can call it whenever.
    warm(slot) {
      const node = build(slot);
      if (!node || node.warmed) return false;
      // ⚠️ NEVER el.load() THE CUE THAT IS PLAYING (or mid-attempt): load()
      // RESETS a media element, which cuts the soundtrack off mid-note. The
      // background prewarm in main.js can ask for a slot the player just
      // reached; that cue is already fetching by definition, so the only
      // thing left to warm is the decode.
      if ((current && current.slot === slot) || !node.el.paused) {
        node.warmed = true;
        decodeSlot(slot);
        return true;
      }
      node.warmed = true;
      node.el.preload = 'auto';
      // load() is what actually starts the fetch on an element whose preload
      // was 'none' at creation — changing the attribute alone is a hint the
      // browser is free to ignore until something asks.
      try { node.el.load(); } catch (_e) { /* a failed warm must never throw */ }
      // And decode it, so the cue that arrives at the finish line can start on
      // a buffer rather than on the element. This is the right place for it:
      // main.js already calls warm() at 55% of the stage, which is seconds of
      // headroom for a decode that takes a few hundred milliseconds.
      decodeSlot(slot);
      return true;
    },

    // Ask for a cue. Safe to call every frame — asking for the cue that is
    // already playing does nothing, which is what lets main.js state it
    // declaratively at each screen instead of tracking transitions.
    //
    // ⚠️ "DOES NOTHING" USED TO INCLUDE "NEVER RETRIES A STUCK-PAUSED
    // ELEMENT." The title cue is built and asked for on the very first
    // frame, long before any gesture — el.play() there is refused, exactly
    // as expected, and `current` is still set to it. Every frame after that
    // hits the early return above and never touches the element again, so
    // when a real gesture finally arrives (the MUSIC checkbox) there was
    // nothing left in this function for it to unstick — only WebAudio
    // (ambience, effects) shares a resume() path with unlock(); a media
    // element needs its OWN play() inside a real gesture. Client: "when I
    // click music... it just starts the background ambient noise" — that
    // was the WebAudio graph waking up while the <audio> element sat
    // paused forever. Retrying here, still gated on the element actually
    // being paused, means the direct call main.js now makes from inside the
    // tap handler (see hitMusic) is the one that finally lands inside the
    // gesture.
    play(slot) {
      wanted = slot;
      if (current && current.slot === slot) {
        // A buffer-backed cue is already running; there is no paused element
        // to unstick, and calling play() on the silent element would start a
        // second copy of the same music underneath it.
        if (!current.bufSrc && current.el.paused && !muted) {
          const pr = current.el.play();
          if (pr && pr.catch) pr.catch(() => {});
        }
        return;
      }
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
      // ⚠️ THE NODE ITSELF, NEVER `{ ...node }`.
      //
      // This one character of syntax made the whole soundtrack silent, on
      // every platform, and it survived because the harness was asking the
      // wrong question. A spread COPIES, so `current.gain` froze at whatever
      // the gain was in this instant — and on a cold load that is `null`,
      // because the AudioContext has not been unlocked yet and graph() has
      // not run.
      //
      // What then happened, measured end to end: tick() woke the context a
      // few hundred ms later, graph() built the real GainNode on `node` and
      // set it from the element's volume — which was 0, because the sound
      // started muted — and `current.gain` stayed null forever. So every
      // later ramp (setMuted on the MUSIC tap, duck, the tick recovery) took
      // the `else` branch and wrote `el.volume`, which does NOTHING once the
      // element is routed through the graph. The cue played perfectly into a
      // gain of zero: element advancing, readyState 4, no error, and a master
      // bus RMS of 0.000000.
      //
      // Client: "when I click the button... it still doesn't trigger. It
      // shows that the speaker is live inside the browser area on my iPhone,
      // but it doesn't play the music." That is exactly this — the element
      // IS playing, which is what lights Safari's indicator, and none of it
      // reaches the speaker.
      current = node;
      // THE BUFFER FIRST, WHEN THERE IS ONE. Sample-accurate loop, no overlap,
      // no container padding to wrap through. Falls through to the element
      // untouched when the cue is a one-shot, the context is still asleep, or
      // the decode has not landed — see the block above stopNode().
      if (canBuffer(node) && startBuffer(node, node.cue.startAt || 0)) {
        ramp(node, levelOf(node), FADE);
        if (prev && prev !== node) stopNode(prev, FADE);
        return;
      }
      decodeSlot(slot);            // so the NEXT play of this cue is gapless
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

    // Harness door — jump the current cue near its own end so a loop seam
    // can be watched in seconds instead of minutes. Not used by the game.
    seek(t) {
      if (!current || !Number.isFinite(t)) return;
      if (current.bufSrc) {
        // A buffer source cannot be scrubbed — it is replaced at the offset.
        // levelOf() for the same reason as the promotion in tick().
        if (startBuffer(current, Math.max(0, t))) ramp(current, levelOf(current), 0.01);
        return;
      }
      try { current.el.currentTime = t; } catch (_e) { /* */ }
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
      // ── PROMOTE TO THE BUFFER THE MOMENT ONE EXISTS ────────────────────
      //
      // play() cannot do this on its own: main.js re-states the same cue every
      // frame and play() returns early when it is already current, so a decode
      // that lands after the cue started would never be picked up and the cue
      // would run to the end of the session on the element — which is exactly
      // what happened the first time this shipped, with the buffer sitting
      // decoded and unused.
      //
      // Handed over AT THE SAME OFFSET and at the same level, so it is a
      // continuation rather than a restart: the two are decoding the identical
      // file, so the samples line up and the only error is the millisecond or
      // so of scheduling slop. Once promoted, the cue never goes back.
      if (current && !current.bufSrc && canBuffer(current)) {
        const at = current.el.currentTime;
        if (startBuffer(current, at)) {
          current.lapEndsAt = 0;          // any lap in flight is now moot
          // ⚠️ levelOf(), NOT THE GAIN THE ELEMENT HAPPENED TO BE AT.
          //
          // The first version carried the old gain across to avoid a jump, and
          // shipped audible music with the sound switched OFF: an element that
          // is muted is PAUSED, so its gain node can sit at full level and
          // still be silent — the pause is what silences it. Copy that number
          // onto a buffer source, which has no pause, and the cue starts
          // playing at 0.855 with muted true. Measured: bus 0.194 on a title
          // screen whose sound setting was off. levelOf() is the one place
          // that knows about mute and ducking, so it is the only thing allowed
          // to decide a level.
          ramp(current, levelOf(current), 0.02);
        }
      }
      // Keep the cue that is playing decoded even if nobody warmed it.
      if (current && !current.bufSrc && current.cue.loop) decodeSlot(current.slot);

      // ⚠️ NO LAP ON A BUFFER-BACKED CUE. The lap exists to hide a media
      // element's wrap; a looping AudioBufferSourceNode has no wrap to hide,
      // and running it here would fade the cue into a spare element nobody
      // wants — which is the 0.9s overlap he asked to be rid of.
      if (!current || !current.bufSrc) lapTick(current);
      if (wanted && !current) this.play(wanted);
      else if (current && !current.bufSrc && current.el.paused && !muted) {
        const pr = current.el.play();
        if (pr && pr.catch) pr.catch(() => {});
      }
      // A cue that is playing, unmuted, un-ducked and still sitting at zero
      // gain is the failure above in any of its other possible orderings.
      // The copy bug is fixed, but the ordering that exposed it — context
      // waking up mid-cue, between a build and a ramp — is normal and will
      // keep happening, so this asserts the level rather than trusting that
      // every path remembered to. Cheap: one comparison a frame, and it only
      // acts when something is genuinely wrong.
      if (current && current.gain && !muted && ducking <= 0
          && (current.bufSrc || !current.el.paused)) {
        const want = levelOf(current);
        if (want > 0 && current.gain.gain.value < want * 0.5) {
          ramp(current, want, 0.25);
        }
      }
    },

    setMuted(v) {
      muted = !!v;
      if (current) ramp(current, levelOf(current), 0.25);
      if (muted && current) {
        try { current.el.pause(); } catch (_e) { /* */ }
        if (current.spare) { try { current.spare.pause(); } catch (_e) { /* */ } }
        current.lapEndsAt = 0;
        // The buffer keeps running at zero gain rather than being stopped:
        // unmuting should drop back into the track where it would have been,
        // not restart the cue from its downbeat. The ramp at the top of this
        // function is what silences it.
        //
        // ⚠️ NOTHING GOES HERE THAT TOUCHES THE GAIN. A `cancelScheduledValues`
        // "assertion" sat here for one build and cancelled that very ramp, so
        // muting left the music playing at full level — bus 0.48 after the
        // switch went off. An element got away with this because pausing it is
        // what made it silent; a buffer source has only its gain.
      }
    },

    // For the harness, and for anyone wondering why they cannot hear anything.
    //
    // The element fields are the ones that matter and the ones a harness
    // cannot get any other way: these are `new Audio()` objects, never
    // appended to the document, so querySelectorAll('audio') finds nothing and
    // a check written that way reports silence on a game that is playing fine.
    status() {
      const el = current && current.el;
      // A BUFFER-BACKED CUE REPORTS THROUGH THE SAME FIELDS. Every audio
      // harness in this project reads status().el.t / .dur / .paused, and the
      // rule they were written to — grade the master bus, never an element
      // flag — is unchanged. Synthesising these keeps them measuring the cue
      // that is actually playing instead of an element that is now silent by
      // design and would report paused:true on a game that is playing fine.
      const onBuf = !!(current && current.bufSrc);
      const bdur = onBuf ? current.bufSrc.buffer.duration : 0;
      return {
        playing: current ? current.slot : null,
        // Which path this cue is on, so a harness can prove the buffer is in
        // use rather than assume it.
        mode: onBuf ? 'buffer' : 'element',
        decoded: [...buffers.keys()],
        // Which cues warm() has already sent for — the background prewarm in
        // main.js is graded through this (deferboot.mjs), because "the file
        // is on the device before its screen asks" cannot be seen in pixels.
        warmed: [...nodes.entries()].filter(([, n]) => n.warmed).map(([k]) => k),
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
        // The loop-seam crossfade, for tools/harness/loopseam.mjs: how many
        // laps this cue has completed and whether one is in flight.
        lap: current ? { laps: current.laps, active: !!current.lapEndsAt,
          // Why the crossfade gave up, if it did — 'play-refused' on an iOS
          // that would not start the second element, 'spare-stalled' if it
          // accepted play() and then never advanced. Null means the lap is
          // healthy. The cue keeps playing either way, on its own loop.
          failed: current.lapFailed || null } : null,
        el: !el ? null : (onBuf ? {
          paused: false,
          t: +bufTime(current).toFixed(2),
          dur: +bdur.toFixed(2),
          loop: true,
          ready: 4,
          err: null,
          level: current.gain ? +current.gain.gain.value.toFixed(3) : 0,
        } : {
          paused: el.paused,
          t: +el.currentTime.toFixed(2),
          dur: Number.isFinite(el.duration) ? +el.duration.toFixed(2) : null,
          loop: el.loop,
          ready: el.readyState,            // 4 = enough buffered to play through
          err: el.error ? el.error.code : null,
          // What is actually reaching the master bus, gain node or element.
          level: current.gain ? +current.gain.gain.value.toFixed(3) : +el.volume.toFixed(3),
        }),
        // Every cue that has been built, so a cross-fade can be watched: two
        // are audible at once for FADE seconds when one cue hands to the next.
        live: [...nodes.entries()]
          .filter(([, n]) => n.bufSrc || !n.el.paused)
          .map(([slot, n]) => ({
            slot,
            level: +(n.gain ? n.gain.gain.value : n.el.volume).toFixed(3),
            t: +(n.bufSrc ? bufTime(n) : n.el.currentTime).toFixed(2),
          })),
      };
    },
  };
}
