// Audio — four samples, everything else synthesised.
//
// The fallback punch is built from oscillators and filtered noise at runtime,
// so it costs bytes of code rather than kilobytes of file. That matters for a
// game that has to load on a phone over mobile data at a party.
//
// The four shipped files total ~29kB, which is worth it for the sounds the
// game makes most often. See src/assets/audio/CREDITS.md for what they are
// and where they came from; tools/make_sfx.py rebuilds them.
//
// AUTOPLAY. Browsers create an AudioContext in the `suspended` state and will
// not start it until a real user gesture. Nothing is heard until `unlock()`
// runs off a keydown or a pointerdown — src/main.js wires that up. Building
// the context lazily on first use also keeps us from spinning up an audio
// thread for a player who never touches the game.

// The stomp is prodbyKCTW's own voice; the pickups are Kenney CC0. Every sound
// falls back to synthesis if its sample has not decoded yet or fails to —
// silence would be worse than a synthesised approximation.
import punchAUrl from '../assets/audio/punch-a.mp3';
import punchBUrl from '../assets/audio/punch-b.mp3';
import coinUrl from '../assets/audio/coin.mp3';
import glistenUrl from '../assets/audio/glisten.mp3';
// MUSIC SHARES THIS MODULE'S CONTEXT AND MASTER BUS, and is handed accessors
// rather than the nodes themselves because both are created lazily — the
// context does not exist until the first gesture, and a music player that
// captured `null` at construction would never find it.
import { createMusic } from './music.js';

const SAMPLES = { punchA: punchAUrl, punchB: punchBUrl, coin: coinUrl, glisten: glistenUrl };

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  let punchBus = null;
  let lastPunch = -99;
  let combo = 0;
  const buffers = {};
  let loading = false;
  let alt = 0;
  let probe = null;
  let probeBuf = null;
  // The ambience the game has ASKED for, held until there is a context that
  // is actually running to put it on. See ambience() / startPending().
  let pendingAmb = null;
  const music = createMusic(() => ctx, () => master);

  // ── OUTDOOR AMBIENCE ────────────────────────────────────────────────────
  //
  // A bed, not a track. Every stage is an Atlanta street at street level, and
  // silence between sound effects is what makes a game read as a diagram of a
  // place rather than a place. Deliberately SUBTLE: the whole thing sits about
  // 25dB under the effects, and if you notice it as "a sound" it is too loud.
  //
  // Procedural for the same reason the effects are — a looping field
  // recording would be a few hundred kB and would audibly loop, whereas three
  // filtered noise sources and a slow random car never repeat.
  //
  //   BED     brown-ish noise through a low-pass at 320Hz — the distance
  //           rumble of a city, traffic on other streets, HVAC, the sound a
  //           quiet outdoor space actually has.
  //   AIR     a whisper of high-passed noise for open air, panned wide.
  //   PASSES  one car every 7-16s: band-passed noise swelling and dying,
  //           panned across, so the bed has events in it and never settles
  //           into a drone the ear can lock onto.
  //   RAIN    keyed off the STAGE. Three of the four plates are rain-slicked
  //           night streets and one is a clear afternoon, so this reads
  //           stage.bg.rain rather than raining everywhere.
  let amb = null;

  function ambientStart(c, rain) {
    if (amb) return;
    const out = c.createGain();
    out.gain.value = 0.0;
    out.connect(master);

    // Long noise buffer, looped — a 1s loop is short enough to hear repeat.
    const len = c.sampleRate * 8;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // Brown noise: integrate white and bleed, which is what gives it the
        // low tilt a distant city has. White noise alone hisses.
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.2;
      }
    }

    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    const bedGain = c.createGain(); bedGain.gain.value = 0.55;
    src.connect(lp).connect(bedGain).connect(out);

    const air = c.createBufferSource();
    air.buffer = buf; air.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2200;
    const airGain = c.createGain(); airGain.gain.value = 0.05;
    air.connect(hp).connect(airGain).connect(out);

    const rainSrc = c.createBufferSource();
    rainSrc.buffer = buf; rainSrc.loop = true;
    const rainBp = c.createBiquadFilter();
    rainBp.type = 'bandpass'; rainBp.frequency.value = 3400; rainBp.Q.value = 0.6;
    const rainGain = c.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(rainBp).connect(rainGain).connect(out);

    src.start(); air.start(); rainSrc.start();

    // FADE IN OVER 0.8s, LINEARLY. It was an exponential ramp over three
    // seconds, on the reasoning that an ambience which snaps on announces
    // itself — true, but three seconds of exponential from 0.0001 is not a
    // fade, it is silence followed by a fade. Measured against the 0.06
    // target: 0.6% of level at 150ms, 1.6% at 600ms, still only 11% at 1.5s.
    //
    // That is most of what the client was hearing. You start the stage, run
    // two seconds in silence, pick up a bag — which fires at full level
    // instantly — and the bed has crept up under it, so it reads as the coin
    // having switched the sound on.
    //
    // Linear, because an exponential ramp in AMPLITUDE always crowds its
    // travel into the last moments; linear reaches half level at 400ms, which
    // is present immediately without slamming.
    out.gain.setValueAtTime(0, c.currentTime);
    out.gain.linearRampToValueAtTime(0.06, c.currentTime + 0.8);

    amb = { out, bedGain, rainGain, buf, nextPass: c.currentTime + 4, passes: [] };
    ambientRain(c, rain);
  }

  function ambientRain(c, rain) {
    if (!amb) return;
    const g = Math.max(0, Math.min(1, rain || 0)) * 0.16;
    amb.rainGain.gain.setTargetAtTime(g, c.currentTime, 1.2);
  }

  // One car going past, somewhere. Called from the frame tick; schedules
  // itself forward so there is no timer to leak.
  function ambientTick(c) {
    if (!amb || c.currentTime < amb.nextPass) return;
    const t = c.currentTime;
    const dur = 2.2 + Math.random() * 2.4;

    const s = c.createBufferSource();
    s.buffer = amb.buf; s.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    // Doppler-ish: the passing car's band sweeps down as it goes by.
    bp.frequency.setValueAtTime(900 + Math.random() * 500, t);
    bp.frequency.exponentialRampToValueAtTime(280, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      pan.pan.setValueAtTime(-dir, t);
      pan.pan.linearRampToValueAtTime(dir, t + dur);
      s.connect(bp).connect(g).connect(pan).connect(amb.out);
    } else {
      s.connect(bp).connect(g).connect(amb.out);
    }
    s.start(t);
    s.stop(t + dur + 0.1);
    amb.nextPass = t + dur + 7 + Math.random() * 9;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (_e) {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    // One second of white noise, reused by every percussive sound.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // Decode every sample once, off the first gesture. Until they land, and if
  // anything about them fails, each sound falls back to its synthesised
  // version — silence would be worse than an approximation.
  function loadSamples(c) {
    if (loading) return;
    loading = true;
    for (const [key, url] of Object.entries(SAMPLES)) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b))
        .then((buf) => { buffers[key] = buf; })
        .catch(() => {});
    }
  }

  function playBuffer(c, key, t, { gain = 1, rate = 1 }) {
    const buf = buffers[key];
    if (!buf) return false;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start(t);
    return true;
  }

  // Soft-clip bus. THE ingredient that separates an arcade impact from a
  // polite one: the layers are deliberately driven past unity and folded back
  // by a tanh curve, so the hit reads as compressed and solid rather than as
  // three tidy sounds played at once. Overlapping hits clip into each other
  // through the same curve, which is exactly what a beat-em-up wants when you
  // chain stomps.
  function makePunchBus(c) {
    const shaper = c.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    const k = 2.6;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    const trim = c.createGain();
    trim.gain.value = 0.78;      // claw back most of the level the drive added
    shaper.connect(trim);
    trim.connect(master);
    return shaper;
  }

  function burst(c, t, { freq, q, gain, decay, type = 'bandpass', dest = null }) {
    const n = c.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    n.playbackRate.value = 0.8 + Math.random() * 0.4; // never twice the same
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    n.connect(f);
    f.connect(g);
    g.connect(dest || master);
    n.start(t);
    n.stop(t + decay + 0.02);
  }

  // Noise through a SWEPT bandpass. A static filter gives you a drum; moving
  // the filter is what turns the same noise into air being cut (sweeping up)
  // or a whip landing (sweeping down).
  function swish(c, t, { f0, f1, q, gain, dur, dest = null, peak = 0.3 }) {
    const n = c.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    n.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * peak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(dest || master);
    n.start(t);
    n.stop(t + dur + 0.02);
  }

  // A single struck partial: sine with a fast attack and an exponential
  // tail. Struck things decay exponentially, which is the whole difference
  // between a bell and a beep.
  function chime(c, t, freq, gain, dur) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    // Landing on an enemy — a KUNG-FU MOVIE PUNCH, not a drum.
    //
    // The previous version was four layers stacked on a sub and it came out
    // as a dry kick: a bump, like a foot. What makes a martial-arts punch is
    // almost the reverse — hardly any low end, and two things the ear reads
    // as one event: the fist CUTTING AIR (a short swept whisper) and then the
    // SLAP landing (a bright whip-crack). The whisper is the tell. Take it
    // away and you are back to a thud.
    punch(c, t) {
      const bus = punchBus || (punchBus = makePunchBus(c));

      // Chained stomps pitch up, the way a combo escalates. Resets once you
      // go ~1.2s without connecting, so it never runs away.
      if (t - lastPunch > 1.2) combo = 0;
      else combo = Math.min(combo + 1, 4);
      lastPunch = t;
      const step = Math.pow(2, combo / 12);            // up to +4 semitones
      const jitter = 0.94 + Math.random() * 0.12;      // never twice the same
      const p = step * jitter;

      // prodbyKCTW's two takes, alternating so consecutive stomps never sound
      // identical, pitched by the same combo/jitter the synth uses. Returns
      // early only if a sample actually played — the synth below is the
      // fallback for the window before they decode, and for the case where
      // decoding fails outright. A silent stomp would be worse than a
      // synthesised one.
      alt ^= 1;
      const key = alt ? 'punchA' : 'punchB';
      if (playBuffer(c, key, t, { gain: 0.95, rate: p })) return;

      // 1. THE WHISPER — the fist travelling. Bandpass swept UPWARD, which is
      //    what air moving past something sounds like. It leads the slap by
      //    22ms: far enough to be heard as a swing, close enough that the ear
      //    binds the two into one hit rather than hearing a lag.
      swish(c, t, { f0: 360 * p, f1: 2700 * p, q: 1.7, gain: 0.55,
        dur: 0.075, peak: 0.62, dest: bus });

      // 2. THE SLAP — bandpass swept DOWNWARD and fast, which is the whip.
      //    This is the loudest thing here; a punch is a mid-and-treble event.
      swish(c, t + 0.022, { f0: 3100 * p, f1: 850 * p, q: 1.0, gain: 1.9,
        dur: 0.055, peak: 0.12, dest: bus });
      // the crack right on top of it
      burst(c, t + 0.022, { freq: 5000 * p, q: 0.7, gain: 0.75, decay: 0.013,
        type: 'highpass', dest: bus });
      // a little leather/cloth so it lands on a person, not on a snare
      burst(c, t + 0.026, { freq: 900 * p, q: 1.4, gain: 0.7, decay: 0.055,
        dest: bus });

      // 3. MEAT — deliberately small. Just enough weight to say the punch
      //    connected with a body. Any more and the kick drum comes back.
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(180 * p, t + 0.022);
      o.frequency.exponentialRampToValueAtTime(96 * p, t + 0.075);
      og.gain.setValueAtTime(0.0001, t + 0.022);
      og.gain.exponentialRampToValueAtTime(0.45, t + 0.03);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(og);
      og.connect(bus);
      o.start(t + 0.022);
      o.stop(t + 0.13);
    },

    // Power-up — the glisten. A bright ascending arpeggio with an inharmonic
    // sparkle on top, which is what "magic pickup" sounds like: partials that
    // are NOT whole-number multiples of the root, so it rings like a bell or
    // a chime rather than like an organ. The tail twinkles by re-striking the
    // top notes quieter and slightly late.
    glisten(c, t) {
      if (playBuffer(c, 'glisten', t, { gain: 0.85 })) return;
      // A major pentatonic run — no semitones, so no note in it can clash
      // with whatever is playing underneath.
      const steps = [0, 4, 7, 12, 16, 19];
      const root = 784;                       // G5
      steps.forEach((semi, i) => {
        const f = root * Math.pow(2, semi / 12);
        const at = t + i * 0.045;
        // fundamental
        chime(c, at, f, 0.34, 0.55);
        // inharmonic partial — 2.76x is the classic bell ratio, and it is
        // what stops this sounding like a synth lead.
        chime(c, at, f * 2.76, 0.16, 0.30);
        // twinkle: a quieter, later re-strike of the top of the run
        if (i >= 3) chime(c, at + 0.16, f * 2, 0.09, 0.42);
      });
    },

    // Money bag — a short two-note ping. Deliberately much smaller than the
    // power-up: you collect a lot of these and anything longer would turn
    // into a stream of noise.
    coin(c, t) {
      // Slight pitch jitter so a run of bags does not machine-gun.
      if (playBuffer(c, 'coin', t, { gain: 0.7, rate: 0.97 + Math.random() * 0.06 })) return;
      chime(c, t, 1245, 0.50, 0.09);
      chime(c, t + 0.055, 1865, 0.44, 0.20);
    },
  };

  // Build the ambience the game has asked for, but ONLY once there is a
  // context that is genuinely running.
  //
  // WHY IT WAITS. The graph used to be built the moment the game asked for it,
  // which is at boot, on the title screen, before the player has touched
  // anything. A context created and wired up before any user gesture is the
  // classic iOS trap: Safari will hand you a context and let you build the
  // whole graph on it, and produce nothing, until something is played from
  // inside a real gesture. Every later effect — a coin, a punch — creates its
  // nodes after the gesture and so wakes the context, at which point the
  // ambience that had been sitting there silent becomes audible too. Which is
  // exactly the reported symptom: no sound until you pick up a bag.
  function startPending() {
    if (pendingAmb === null || muted) return;
    if (!ctx || ctx.state !== 'running') return;
    const rain = pendingAmb;
    pendingAmb = null;
    if (!amb) ambientStart(ctx, rain);
    else ambientRain(ctx, rain);
  }

  // A single sample of silence, played from inside the gesture. This, not
  // resume(), is what actually convinces iOS the context is real.
  function silentPing(c) {
    try {
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, c.sampleRate);
      s.connect(c.destination);
      s.start(0);
    } catch (_e) { /* older engines; resume alone will have to do */ }
  }

  // ── POWER UP / POWER DOWN ─────────────────────────────────────────────
  //
  // The Mario shape, and the shape is the whole point: a RISING run of notes
  // for growing and the SAME run inverted for shrinking. Two cues that are
  // obviously each other's opposite need no explanation — you hear the second
  // one once and you already know what it means, because you heard the first.
  //
  // Synthesised rather than sampled for the same reason as everything else
  // here: it is a few lines against a few kilobytes, on a game that has to
  // load over mobile data at a party.
  //
  // Square waves, because that is the timbre the reference is made of. A sine
  // arpeggio is a wind chime; the square's odd harmonics are what make it read
  // as a game.
  function arpeggio(c, t0, notes, step, gain) {
    for (let i = 0; i < notes.length; i++) {
      const t = t0 + i * step;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(notes[i], t);
      const g = c.createGain();
      // Each note gets its own tiny envelope. Without the attack ramp a square
      // wave starting at full amplitude clicks, and eight clicks in a row is
      // what a broken sound effect sounds like.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.9);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + step * 2.2);
    }
  }

  // Two octaves of a major arpeggio climbing, the way a mushroom does.
  const UP_NOTES = [392, 523.25, 659.25, 784, 1046.5, 1318.5, 1568];
  // The same notes falling, and slower — a loss should land heavier than a
  // gain, not just play the tape backwards at the same speed.
  const DOWN_NOTES = [784, 659.25, 523.25, 440, 349.23, 261.63];

  // ── THE UI CUES ───────────────────────────────────────────────────────
  //
  // Three of them, and they are three rather than one because a menu makes
  // three different KINDS of statement and a single beep for all of them
  // teaches you nothing. You learn these in one pass each and then you can
  // work the menu without reading it:
  //
  //   click    "I heard you."          — moving between things
  //   confirm  "that did something."   — a decision that committed
  //   back     "we went the other way." — closing, cancelling, going up
  //
  // ALL THREE ARE UNDER 130ms. A UI sound is heard hundreds of times in a
  // session, and the ONLY sin available to it is being long enough to notice
  // twice. The click is 45ms — shorter than a single frame of animation at
  // this game's tick rate would suggest is even audible, and it is plenty.
  //
  // They share the square-wave timbre of the power-up cues rather than being
  // sine beeps, so the menu sounds like it belongs to the same machine as the
  // game. And they are quiet — 0.09 against the punch's 0.95 — because
  // feedback that competes with the action is not feedback, it is noise.

  // The click: a tight blip with a physical transient on the front. The blip
  // alone is a beep; the noise tick is what makes it read as a BUTTON, the
  // same way the punch needs its whisper before the slap. 6ms apart, which
  // binds them into one event.
  function clickAt(c, t) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(1560, t + 0.018);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.06);
    burst(c, t, { freq: 5200, q: 0.6, gain: 0.10, decay: 0.011, type: 'highpass' });
  }

  // The happy one. A major triad taken at a run — root, third, fifth — which
  // is the shortest arrangement of notes that is unambiguously PLEASED. Two
  // notes could be going anywhere; a minor third would be the wrong news.
  const CONFIRM_NOTES = [784, 987.77, 1318.5];   // G5 B5 E6

  // And its opposite: a fifth dropping. Not a sad sound, just a downward one —
  // closing a menu is not a failure and should not be scored like one.
  const BACK_NOTES = [880, 587.33];

  // Run a UI cue against a context that is definitely awake. See the note on
  // click()/confirm()/back() for why the deferral is not paranoia.
  function uiCue(fn) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') { startPending(); fn(c); return; }
    c.resume().then(() => { startPending(); fn(c); }).catch(() => {});
  }

  return {
    // Call from EVERY user gesture until it takes, not just the first — a
    // resume() can be refused, and a listener registered `once` gives the
    // context no second chance. Cheap after it has worked: ensure() returns
    // the existing context and loadSamples() no-ops.
    unlock() {
      const c = ensure();
      if (!c) return;
      silentPing(c);
      if (c.state === 'suspended') {
        c.resume().then(startPending).catch(() => {});
      } else {
        startPending();
      }
      loadSamples(c);
    },
    // Has the context actually woken up? main.js uses this to know when to
    // stop listening for gestures.
    ready() {
      return !!ctx && ctx.state === 'running';
    },
    setMuted(v) {
      muted = !!v;
      music.setMuted(muted);
      if (amb && ctx) amb.out.gain.setTargetAtTime(muted ? 0 : 0.06, ctx.currentTime, 0.2);
    },

    // Call once play starts, and again whenever the stage changes so the rain
    // layer follows the weather in the plate.
    //
    // This RECORDS the request rather than acting on it. It deliberately does
    // not call ensure(): creating the AudioContext is itself the thing that
    // must wait for a gesture, and the first caller is the title screen at
    // boot. startPending() picks it up the moment there is a running context,
    // which is the same gesture that starts the run — so the bed comes up
    // with the stage rather than a bag or two later.
    ambience(rain) {
      pendingAmb = rain || 0;
      startPending();
    },

    // Once a frame, on EVERY screen. Schedules the next passing car when one
    // is due, and is also the heartbeat that gets a pending ambience going if
    // the context woke up a moment after the gesture rather than during it.
    ambienceTick() {
      // Music ticks even while muted: it is what recovers a cue the browser
      // refused before the first gesture, and a muted player still has to
      // know which slot it should be on when the sound comes back.
      music.tick();
      if (muted) return;
      if (pendingAmb !== null) startPending();
      if (!ctx || !amb) return;
      ambientTick(ctx);
    },
    // The soundtrack, addressed by screen. See audio/music.js — the slots are
    // named by FUNCTION so swapping a song is a manifest edit.
    music,
    play(name) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      const fn = SOUNDS[name];
      if (fn) fn(c, c.currentTime);
      // A stomp disappearing into a chorus is a stomp that did not land.
      if (name === 'punch') music.duck();
    },
    stop() {},

    // Called when a champagne bottle is picked up, and when the power runs
    // out. See the arpeggio note above for why these are each other's mirror.
    powerUp() {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      arpeggio(c, c.currentTime, UP_NOTES, 0.055, 0.16);
    },
    powerDown() {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      arpeggio(c, c.currentTime, DOWN_NOTES, 0.075, 0.13);
    },

    // ── UI ────────────────────────────────────────────────────────────
    //
    // These are also the game's most reliable UNLOCK, and that is not an
    // accident of ordering. Every one of them fires from inside a pointerdown
    // or a click — a real user gesture — which is the exact condition an
    // AudioContext needs to start. So the first button the player touches
    // both makes its noise AND wakes the context, and startPending() picks up
    // the ambience that has been waiting since boot. See the note on
    // startPending for the iOS trap this belongs to.
    //
    // THE FIRST ONE IS THE AWKWARD ONE, and it needed `uiCue` to get right.
    // The canvas pointerdown handler runs before the window-level unlock
    // listener — events bubble outward — so the very first press reaches this
    // code with a context that has only just been constructed and is still
    // suspended. Scheduling the cue at `currentTime` on a suspended context
    // schedules it in a clock that is not running: by the time resume() lands,
    // that moment is in the past and the note is dropped or clipped. Measured
    // on the first tap of a session at a peak bus RMS of 0.00075 against
    // 0.030-0.067 for every press after it — audible as "the first button on
    // the title screen is silent".
    //
    // So a suspended context defers the cue until resume() resolves. Slightly
    // late once, at boot, rather than missing once, at boot.
    click: () => uiCue((c) => clickAt(c, c.currentTime)),
    confirm: () => uiCue((c) => arpeggio(c, c.currentTime, CONFIRM_NOTES, 0.042, 0.11)),
    back: () => uiCue((c) => arpeggio(c, c.currentTime, BACK_NOTES, 0.055, 0.09)),

    // ── IS ANYTHING ACTUALLY COMING OUT? ────────────────────────────────
    //
    // Not decoration. "The sound does not start until you pick up a bag" is a
    // report that cannot be checked by reading the code — the graph looked
    // correct the whole time it was silent — and it cannot be checked by
    // listening either, in a headless browser. So the master bus is tapped
    // and the RMS of the last frame of samples is readable, which turns
    // "is there sound" into a number.
    //
    // The analyser is built on first use, so a player who never calls this
    // never pays for it.
    level() {
      if (!ctx || !master) return 0;
      if (!probe) {
        probe = ctx.createAnalyser();
        probe.fftSize = 256;
        probeBuf = new Float32Array(probe.fftSize);
        master.connect(probe);   // a tap, not a link in the chain
      }
      probe.getFloatTimeDomainData(probeBuf);
      let sum = 0;
      for (let i = 0; i < probeBuf.length; i++) sum += probeBuf[i] * probeBuf[i];
      return Math.sqrt(sum / probeBuf.length);
    },

    status() {
      return {
        ctx: ctx ? ctx.state : 'none',
        time: ctx ? +ctx.currentTime.toFixed(2) : 0,
        amb: !!amb,
        ambGain: amb ? +amb.out.gain.value.toFixed(5) : 0,
        pending: pendingAmb,
        muted,
      };
    },
  };
}
