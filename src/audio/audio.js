// Audio — synthesised, not sampled.
//
// Every sound here is built from oscillators and filtered noise at runtime.
// No .wav or .mp3 ships, which matters for a game that has to load fast on a
// phone over mobile data at a party: the whole module is a couple of kB
// against a couple of hundred for even one short sample.
//
// AUTOPLAY. Browsers create an AudioContext in the `suspended` state and will
// not start it until a real user gesture. Nothing is heard until `unlock()`
// runs off a keydown or a pointerdown — src/main.js wires that up. Building
// the context lazily on first use also keeps us from spinning up an audio
// thread for a player who never touches the game.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  let punchBus = null;
  let lastPunch = -99;
  let combo = 0;

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
      chime(c, t, 1245, 0.50, 0.09);
      chime(c, t + 0.055, 1865, 0.44, 0.20);
    },
  };

  return {
    // Call from the first real user gesture, or nothing will ever be heard.
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    setMuted(v) {
      muted = !!v;
    },
    play(name) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      const fn = SOUNDS[name];
      if (fn) fn(c, c.currentTime);
    },
    stop() {},
  };
}
