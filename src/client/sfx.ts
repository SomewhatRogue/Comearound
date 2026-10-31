/**
 * Every sound in the game, synthesized with Web Audio: no files, nothing to load or block.
 * Cute and round on purpose: woofs, baas, plinks, chimes, a goat. One master volume with mute (M).
 * Browsers start audio suspended until the first click or key press; unlock() handles that.
 * iPhones are the fussy ones: only a tap that ends (touchend/click, not touchdown) unlocks audio,
 * a silent buffer has to play inside that tap, the context is "interrupted" after the phone was
 * away, and Web Audio follows the ringer switch unless the page says it plays media.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let muted = (() => {
  try {
    return localStorage.getItem('tac-muted') === '1';
  } catch {
    return false;
  }
})();

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      // Play like a game or video (heard with the ringer on silent), not like a notification.
      // The Sound off button is the way to quiet it.
      try {
        const session = (navigator as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
      } catch { /* older Safari */ }
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** One voice: an oscillator with a pitch glide and an envelope, optionally filtered. */
function voice(o: { f0: number; f1?: number; dur: number; type?: OscillatorType; gain?: number; at?: number; vib?: number; vibRate?: number; lp?: number; trem?: number }): void {
  const a = ac();
  if (!a || !master || muted) return;
  const t = a.currentTime + (o.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur * 0.8);
  if (o.vib) {
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = o.vibRate ?? 6;
    lg.gain.value = o.vib;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  let out: AudioNode = g;
  if (o.lp) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    g.connect(f);
    out = f;
  }
  const peak = o.gain ?? 0.15;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  if (o.trem) {
    // Tremolo: the bleat's "meh-eh-eh".
    for (let k = 0; k < o.dur * o.trem; k++) g.gain.setTargetAtTime(k % 2 ? peak : peak * 0.35, t + k / o.trem, 0.01);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  out.connect(master);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

/** A burst of filtered noise: whooshes, rustles, poofs. */
function noise(o: { dur: number; f0: number; f1?: number; gain?: number; at?: number; q?: number }): void {
  const a = ac();
  if (!a || !master || muted) return;
  const t = a.currentTime + (o.at ?? 0);
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * o.dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = a.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const semi = (base: number, n: number) => base * 2 ** (n / 12);

/** For the music: the shared audio context and the master output (so Sound off mutes it too). */
export function audioOut(): { ctx: AudioContext; out: AudioNode } | null {
  const a = ac();
  return a && master ? { ctx: a, out: master } : null;
}

export const sfx = {
  /** Call from any click or key press so the browser lets sound start. */
  unlock() {
    const a = ac();
    if (!a || unlocked) return;
    try {
      // iOS: a sound must start inside the tap itself to unlock the context for good.
      const src = a.createBufferSource();
      src.buffer = a.createBuffer(1, 1, 22050);
      src.connect(a.destination);
      src.start(0);
      if (a.state === 'running') unlocked = true;
    } catch { /* not yet */ }
  },
  get muted() {
    return muted;
  },
  toggleMute(): boolean {
    muted = !muted;
    try {
      localStorage.setItem('tac-muted', muted ? '1' : '0');
    } catch { /* storage blocked */ }
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
    return muted;
  },

  /** Points: a chime that climbs a semitone step each time pops come in a row. */
  chime(step: number) {
    const f = semi(784, step);
    voice({ f0: f, dur: 0.4, gain: 0.14 });
    voice({ f0: f * 2, dur: 0.25, type: 'triangle', gain: 0.04, at: 0.03 });
  },
  /** Picking something up: a bubble rising. */
  pickup() {
    voice({ f0: 260, f1: 720, dur: 0.12, gain: 0.16 });
    voice({ f0: 520, f1: 1200, dur: 0.08, gain: 0.05, at: 0.04 });
  },
  /** Putting something on a table: a soft wooden plunk. */
  place() {
    voice({ f0: 420, f1: 180, dur: 0.14, gain: 0.18, type: 'triangle' });
    noise({ dur: 0.05, f0: 900, gain: 0.05 });
  },
  /** Dropping something on the grass. */
  drop() {
    voice({ f0: 300, f1: 140, dur: 0.12, gain: 0.12 });
  },
  /** Something finished: a little sparkle fanfare. */
  fanfare() {
    [0, 4, 7, 12].forEach((s, i) => voice({ f0: semi(523, s), dur: 0.32, type: 'triangle', gain: 0.13, at: i * 0.08 }));
    [19, 24].forEach((s, i) => voice({ f0: semi(523, s), dur: 0.5, gain: 0.05, at: 0.32 + i * 0.06 }));
  },
  /** The round begins. */
  roundStart() {
    [0, 7, 12, 16].forEach((s, i) => voice({ f0: semi(392, s), dur: 0.28, type: 'triangle', gain: 0.12, at: i * 0.11 }));
  },
  /** Last call: a chapel bell, ding-dong. */
  bell() {
    for (const [f, at] of [[659, 0], [523, 0.45]] as const) {
      voice({ f0: f, dur: 1.6, gain: 0.14, at });
      voice({ f0: f * 2.76, dur: 0.9, gain: 0.04, at });
      voice({ f0: f * 5.4, dur: 0.4, gain: 0.02, at });
    }
  },
  /** The goat. Meh-eh-eh. Quieter when it is further away. */
  bleat(volume = 1) {
    voice({ f0: 330, f1: 290, dur: 0.75, type: 'sawtooth', gain: 0.07 * volume, lp: 1400, vib: 14, vibRate: 7, trem: 14 });
    voice({ f0: 660, f1: 580, dur: 0.75, type: 'triangle', gain: 0.025 * volume, trem: 14 });
  },
  /** Snowball thrown. */
  whoosh() {
    noise({ dur: 0.22, f0: 600, f1: 2400, gain: 0.12, q: 2 });
  },
  /** Snowball hit someone. */
  poof() {
    noise({ dur: 0.18, f0: 1800, f1: 500, gain: 0.16 });
    voice({ f0: 220, f1: 110, dur: 0.15, gain: 0.1 });
  },
  /** A crow knocked off the fence. */
  squawk() {
    voice({ f0: 900, f1: 500, dur: 0.18, type: 'square', gain: 0.05, lp: 2200 });
    voice({ f0: 800, f1: 420, dur: 0.16, type: 'square', gain: 0.045, lp: 2200, at: 0.2 });
  },
  /** The goat knocked your thing loose. */
  boing() {
    voice({ f0: 180, f1: 420, dur: 0.35, gain: 0.14, vib: 40, vibRate: 18 });
  },
  /** Wrong accusation or wrong guess: the sad trombone. */
  sad() {
    [0, -1, -2].forEach((s, i) => voice({ f0: semi(311, s), dur: 0.36, type: 'sawtooth', gain: 0.07, lp: 900, at: i * 0.36 }));
    voice({ f0: semi(311, -3), dur: 1.0, type: 'sawtooth', gain: 0.07, lp: 900, vib: 6, vibRate: 5, at: 1.08 });
  },
  /** You caught a :( player. */
  caught() {
    [0, 4, 7, 11, 14].forEach((s, i) => voice({ f0: semi(587, s), dur: 0.3, type: 'triangle', gain: 0.12, at: i * 0.07 }));
  },
  /** Opening the board: a paper rustle. */
  rustle() {
    noise({ dur: 0.2, f0: 3000, f1: 1500, gain: 0.07, q: 0.8 });
  },
  /** The reveal: a short drumroll, then each tally row ticks in. */
  drumroll() {
    for (let i = 0; i < 14; i++) noise({ dur: 0.06, f0: 180, gain: 0.08 + i * 0.006, at: i * 0.05, q: 0.7 });
  },
  tick(at = 0) {
    voice({ f0: 1400, f1: 1800, dur: 0.06, gain: 0.08, at });
  },
  /** The goat's close-up: a low, uneasy drone. */
  naughty() {
    voice({ f0: 110, dur: 2.4, type: 'sawtooth', gain: 0.05, lp: 500 });
    voice({ f0: 116.5, dur: 2.4, type: 'sawtooth', gain: 0.04, lp: 500, at: 0.05 });
    sfx.bleat(0.8);
  },
  /** A dog. pitch > 1 for small dogs (a pug yips), < 1 for big ones. Two quick barks: ruff-ruff. */
  woof(pitch = 1, volume = 1) {
    for (const at of [0, 0.16]) {
      voice({ f0: 260 * pitch, f1: 140 * pitch, dur: 0.13, type: 'sawtooth', gain: 0.11 * volume, lp: 900 * pitch, at });
      noise({ dur: 0.08, f0: 700 * pitch, f1: 300 * pitch, gain: 0.08 * volume, at, q: 1.5 });
    }
  },
  /** A sheep: baa, softer and lower than the goat, with a wobble. */
  baa(volume = 1, pitch = 1) {
    voice({ f0: 240 * pitch, f1: 210 * pitch, dur: 0.6, type: 'sawtooth', gain: 0.05 * volume, lp: 1100, vib: 9, vibRate: 9 });
    voice({ f0: 480 * pitch, f1: 420 * pitch, dur: 0.6, type: 'triangle', gain: 0.02 * volume, vib: 9, vibRate: 9 });
  },
  /** A sheep goes through the gate: a soft wooden clack and a rising plink. */
  penned(step = 0) {
    voice({ f0: 180, f1: 140, dur: 0.08, gain: 0.08, type: 'triangle' });
    voice({ f0: semi(523, step), dur: 0.35, type: 'triangle', gain: 0.12, at: 0.05 });
    voice({ f0: semi(1046, step), dur: 0.25, gain: 0.04, at: 0.05 });
  },
  /** Uh oh: the goat is heading for you. */
  uhoh() {
    voice({ f0: 520, f1: 500, dur: 0.16, type: 'triangle', gain: 0.1 });
    voice({ f0: 390, f1: 370, dur: 0.3, type: 'triangle', gain: 0.1, at: 0.18 });
  },
  /** A whistle: the shepherd starting a field. */
  whistle() {
    voice({ f0: 1500, f1: 2300, dur: 0.25, gain: 0.08 });
    voice({ f0: 2300, f1: 1700, dur: 0.35, gain: 0.08, at: 0.28 });
  },
  /** Thunder: a crack, then a long low rumble. `delay` is the gap after the flash. */
  thunder(volume = 1, delay = 0.3) {
    noise({ dur: 0.35, f0: 2400, f1: 600, gain: 0.18 * volume, at: delay, q: 0.6 });
    noise({ dur: 2.8, f0: 160, f1: 60, gain: 0.32 * volume, at: delay + 0.05, q: 0.5 });
    noise({ dur: 2.2, f0: 90, f1: 45, gain: 0.25 * volume, at: delay + 0.5, q: 0.7 });
  },
  /** Rain: a looping hiss of filtered noise. Returns controls (level 0..1, stop). */
  rainLoop(): { stop: () => void; setLevel: (v: number) => void } {
    const a = ac();
    if (!a || !master) return { stop: () => {}, setLevel: () => {} };
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600;
    f.Q.value = 0.4;
    const g = a.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(master);
    src.start();
    return {
      stop: () => {
        g.gain.setTargetAtTime(0, a.currentTime, 0.4);
        setTimeout(() => src.stop(), 1500);
      },
      setLevel: (v: number) => g.gain.setTargetAtTime(0.07 * v, a.currentTime, 0.3),
    };
  },
  thud() {
    voice({ f0: 120, f1: 70, dur: 0.22, gain: 0.16 });
  },
  click() {
    voice({ f0: 1200, f1: 900, dur: 0.05, gain: 0.05, type: 'triangle' });
  },
};
