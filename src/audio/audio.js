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

  function burst(c, t, { freq, q, gain, decay, type = 'bandpass' }) {
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
    g.connect(master);
    n.start(t);
    n.stop(t + decay + 0.02);
  }

  const SOUNDS = {
    // Landing on an enemy. Three parts, which is what separates a punch from
    // a beep: a click of contact, a bright slap, and a low body thump that
    // pitches down fast. The thump is what you feel; the slap is what you
    // hear first.
    punch(c, t) {
      burst(c, t, { freq: 3200, q: 0.6, gain: 0.34, decay: 0.022, type: 'highpass' });
      burst(c, t + 0.004, { freq: 1500, q: 0.8, gain: 0.55, decay: 0.085 });

      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.9, t + 0.007);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(og);
      og.connect(master);
      o.start(t);
      o.stop(t + 0.19);
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
