/**
 * Music: warm spring lofi, made live in the browser (no files). Six tracks, each a little chord
 * loop with a soft electric piano, a round bass, lazy brushed drums with a swing, a wandering
 * music-box melody through a dreamy echo, and vinyl crackle underneath. A gentle wobble on
 * everything, like an old tape. Rain fields get the rainy track; otherwise tracks take turns.
 *
 * And piano in the next room (`room` tracks, in musicroom.ts): a felt piano rolling slow chords
 * with a little melody on top, heard muffled through a wall into a small room, a kick thumping
 * faintly through the floor at most.
 */
import { RoomPiano, type RoomStyle } from './musicroom';
import { audioOut } from './sfx';

type Q = 'maj7' | 'maj9' | 'm7' | 'm9' | '7' | '6' | 'sus' | 'add9';
const QUAL: Record<Q, number[]> = { maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], '7': [0, 4, 7, 10], '6': [0, 4, 7, 9], sus: [0, 5, 7, 10], add9: [0, 4, 7, 14] };

interface Track { name: string; bpm: number; root: number; minor?: boolean; prog: [number, Q][]; drums: 0 | 1; seed: number; mel: number; rain?: boolean; room?: RoomStyle }

export const TRACKS: Track[] = [
  { name: 'Clover Field', bpm: 74, root: 53, prog: [[0, 'maj9'], [4, 'm7'], [9, 'm9'], [5, 'maj7']], drums: 0, seed: 11, mel: 0.55 },
  { name: 'Upstairs at the Farmhouse', bpm: 64, root: 48, prog: [[0, 'maj9'], [9, 'm9'], [5, 'maj7'], [7, 'sus']], drums: 0, seed: 101, mel: 0.5, room: { arp: [0, 1, 2, 3, 2, 1, 2, 3], thump: false } },
  { name: 'Morning Dew', bpm: 80, root: 50, prog: [[0, 'maj7'], [9, 'm7'], [2, 'm9'], [7, '6']], drums: 0, seed: 23, mel: 0.6 },
  { name: 'Kettle On', bpm: 70, root: 51, prog: [[5, 'maj7'], [4, 'm7'], [2, 'm9'], [0, 'maj9']], drums: 0, seed: 113, mel: 0.55, room: { arp: null, thump: true } },
  { name: 'Woolly Nap', bpm: 66, root: 46, prog: [[0, 'maj9'], [9, 'm9'], [5, 'maj7'], [7, 'sus']], drums: 1, seed: 37, mel: 0.4 },
  { name: 'Through the Wall', bpm: 58, root: 50, minor: true, prog: [[0, 'm9'], [8, 'maj7'], [3, 'maj7'], [10, '6']], drums: 0, seed: 127, mel: 0.45, room: { arp: [0, 2, 1, 3, 0, 2, 1, 3], thump: false } },
  { name: 'Lambs in the Lane', bpm: 84, root: 55, prog: [[0, 'maj7'], [2, 'm7'], [4, 'm7'], [5, 'maj9']], drums: 0, seed: 41, mel: 0.65 },
  { name: 'Muddy Boots by the Door', bpm: 68, root: 53, prog: [[0, 'add9'], [7, '6'], [9, 'm7'], [5, 'maj9']], drums: 0, seed: 131, mel: 0.6, room: { arp: [0, 3, 1, 2, 0, 3, 1, 2], thump: true } },
  { name: 'Golden Hour', bpm: 76, root: 52, prog: [[5, 'maj7'], [4, 'm7'], [2, 'm9'], [0, 'add9']], drums: 1, seed: 53, mel: 0.5 },
  { name: 'Rain on the Barn', bpm: 70, root: 45, minor: true, prog: [[0, 'm9'], [8, 'maj7'], [5, 'm7'], [7, 'm7']], drums: 1, seed: 67, mel: 0.45, rain: true },
];

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Music {
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private keysBus!: GainNode;
  private echoIn!: GainNode;
  private wobble!: OscillatorNode;
  private wobbleAmt!: GainNode;
  private noiseBuf!: AudioBuffer;
  private crackle: AudioBufferSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track = TRACKS[0];
  private trackIdx = 0;
  private step = 0;
  private bar = 0;
  private next = 0;
  private rand = mulberry(1);
  private mel = 76;
  private rainy = false;
  private room: RoomPiano | null = null;
  on = (() => {
    try {
      return localStorage.getItem('tac-music') !== '0';
    } catch {
      return true;
    }
  })();

  /** Call after a click or key press (browsers only allow audio then). */
  start(): void {
    if (this.ctx || !this.on) return;
    const a = audioOut();
    if (!a) return;
    const c = (this.ctx = a.ctx);
    // Music bus: a warm low-pass (the lofi part), then out through the game's master volume.
    this.bus = c.createGain();
    this.bus.gain.value = 0;
    const warm = c.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 5200;
    this.bus.connect(warm).connect(a.out);
    this.keysBus = c.createGain();
    this.keysBus.gain.value = 0.9;
    const keysLp = c.createBiquadFilter();
    keysLp.type = 'lowpass';
    keysLp.frequency.value = 2400;
    this.keysBus.connect(keysLp).connect(this.bus);
    // A dreamy echo for the melody and a touch of the keys.
    this.echoIn = c.createGain();
    const delay = c.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const fbLp = c.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 1800;
    this.echoIn.connect(delay).connect(fbLp).connect(fb).connect(delay);
    const wet = c.createGain();
    wet.gain.value = 0.45;
    fbLp.connect(wet).connect(this.bus);
    // Tape wobble: a slow LFO that detunes the tuned voices a few cents.
    this.wobble = c.createOscillator();
    this.wobble.frequency.value = 0.55;
    this.wobbleAmt = c.createGain();
    this.wobbleAmt.gain.value = 7;
    this.wobble.connect(this.wobbleAmt);
    this.wobble.start();
    // Noise for drums and vinyl.
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.vinyl();
    this.room = new RoomPiano(c, this.bus, this.noiseBuf);
    this.pick(this.rainy);
    this.next = c.currentTime + 0.1;
    this.bus.gain.setTargetAtTime(0.55, c.currentTime, 1.5);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setOn(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem('tac-music', on ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (!this.ctx) return on ? this.start() : undefined;
    this.bus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.5);
  }

  /** Rainy fields get the rainy track (switches at the next bar line). */
  setRain(rain: boolean): void {
    if (rain === this.rainy) return;
    this.rainy = rain;
    if (this.ctx) this.fadeTo(() => this.pick(rain));
  }

  /** Dip the music for a moment (the NAUGHTY close-up). */
  duck(sec: number): void {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(0.12, t, 0.2);
    this.bus.gain.setTargetAtTime(0.55, t + sec, 0.8);
  }

  get trackName(): string {
    return this.track.name;
  }

  private fadeTo(then: () => void): void {
    const c = this.ctx!;
    this.bus.gain.setTargetAtTime(0, c.currentTime, 0.6);
    setTimeout(() => {
      then();
      if (this.on) this.bus.gain.setTargetAtTime(0.55, c.currentTime, 1.2);
    }, 1800);
  }

  private pick(rain: boolean): void {
    if (rain) this.track = TRACKS.find((t) => t.rain)!;
    else {
      const calm = TRACKS.filter((t) => !t.rain);
      this.trackIdx = (this.trackIdx + 1) % calm.length;
      this.track = calm[this.trackIdx];
    }
    this.rand = mulberry(this.track.seed);
    [this.step, this.bar, this.mel] = [0, 0, this.track.root + 24 + (this.track.minor ? 7 : 4)];
  }

  private schedule(): void {
    const c = this.ctx!;
    const t = this.track;
    const stepDur = 60 / t.bpm / 4;
    while (this.next < c.currentTime + 0.15) {
      // Swing: the off-beat sixteenths land late.
      const swing = this.step % 2 === 1 ? stepDur * 0.18 : 0;
      this.playStep(this.next + swing, stepDur);
      this.next += stepDur;
      if (++this.step === 16) {
        this.step = 0;
        // After 16 bars, the next track (unless it's raining).
        if (++this.bar === 16 && !this.rainy) this.fadeTo(() => this.pick(false));
      }
    }
  }

  private playStep(time: number, sd: number): void {
    const t = this.track;
    const s = this.step;
    const [deg, q] = t.prog[this.bar % t.prog.length];
    const chordRoot = t.root + deg;
    const r = this.rand;
    if (t.room && this.room) {
      const scale = t.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      this.mel = this.room.step(s, this.bar, time, sd, chordRoot, QUAL[q], t.root, scale, t.mel, this.mel, t.room, r);
      return;
    }
    // Chords: a soft strum on beat one, and sometimes a lazy re-hit.
    if (s === 0 || (s === 10 && r() < 0.45)) {
      const tones = QUAL[q].map((iv) => {
        let n = chordRoot + 12 + iv;
        while (n < 55) n += 12;
        while (n > 77) n -= 12;
        return n;
      }).sort((a, b) => a - b);
      tones.forEach((n, i) => this.keys(n, time + i * 0.018, s === 0 ? sd * 14 : sd * 5, s === 0 ? 1 : 0.6));
    }
    // Bass: root on one, a passing fifth or octave later in the bar.
    if (s === 0) this.bass(chordRoot - 12, time, sd * 6);
    if (s === 10 && r() < 0.7) this.bass(chordRoot - 12 + (r() < 0.5 ? 7 : 12), time, sd * 2);
    // Drums.
    if (t.drums === 0) {
      if (s === 0 || s === 10 || (s === 7 && r() < 0.35)) this.kick(time, s === 7 ? 0.5 : 1);
      if (s === 4 || s === 12) this.snare(time, 1);
      if (s % 2 === 0) this.hat(time, s % 4 === 0 ? 0.7 : 1, s === 14 && r() < 0.3);
    } else {
      if (s === 0 || (s === 9 && r() < 0.6)) this.kick(time, 1);
      if (s === 8) this.snare(time, 0.9);
      if (s % 4 === 2) this.hat(time, 0.8, false);
    }
    // Melody: a wandering pentatonic line, resting every fourth bar.
    if (this.bar % 4 !== 3 && [0, 3, 6, 8, 10, 12, 14].includes(s) && r() < t.mel * (s % 4 === 0 ? 0.9 : 0.55)) {
      const scale = t.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
      const choices: number[] = [];
      for (let o = -12; o <= 24; o += 12) for (const iv of scale) choices.push(t.root + 24 + o + iv);
      const near = choices.filter((n) => Math.abs(n - this.mel) <= 4 && n >= 69 && n <= 88);
      this.mel = near[Math.floor(r() * near.length)] ?? this.mel;
      this.bell(this.mel, time, sd * (1 + Math.floor(r() * 3)));
    }
  }

  private osc(type: OscillatorType, f: number, time: number, detune = true): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, time);
    if (detune) this.wobbleAmt.connect(o.detune);
    return o;
  }

  private env(time: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    return g;
  }

  /** Electric piano: a sine body plus a short bright tine, with a slow tremolo. */
  private keys(n: number, time: number, dur: number, vel: number): void {
    const c = this.ctx!;
    const f = mtof(n);
    const body = this.osc('sine', f, time);
    const tine = this.osc('sine', f * 2.01, time);
    const g1 = this.env(time, 0.055 * vel, 0.006, dur + 0.8);
    const g2 = this.env(time, 0.02 * vel, 0.002, 0.35);
    const trem = c.createOscillator();
    trem.frequency.value = 4.2;
    const tremAmt = c.createGain();
    tremAmt.gain.value = 0.012 * vel;
    trem.connect(tremAmt).connect(g1.gain);
    body.connect(g1).connect(this.keysBus);
    tine.connect(g2).connect(this.keysBus);
    g1.connect(this.echoIn);
    const end = time + dur + 1;
    for (const o of [body, tine, trem]) {
      o.start(time);
      o.stop(end);
    }
  }

  private bass(n: number, time: number, dur: number): void {
    const c = this.ctx!;
    const o = this.osc('triangle', mtof(n), time, false);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = c.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.16, time + 0.02);
    g.gain.setTargetAtTime(0.0001, time + dur * 0.7, dur * 0.25);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + dur + 0.6);
  }

  /** The melody voice: a soft music-box bell (sine + quiet octave), into the echo. */
  private bell(n: number, time: number, dur: number): void {
    const o = this.osc('sine', mtof(n), time);
    const o2 = this.osc('triangle', mtof(n) * 2, time);
    const g = this.env(time, 0.05, 0.008, dur + 0.6);
    const g2 = this.env(time, 0.012, 0.004, 0.25);
    o.connect(g).connect(this.bus);
    o2.connect(g2).connect(this.bus);
    g.connect(this.echoIn);
    for (const x of [o, o2]) {
      x.start(time);
      x.stop(time + dur + 0.8);
    }
  }

  private kick(time: number, vel: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(115, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = this.env(time, 0.32 * vel, 0.003, 0.28);
    o.connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + 0.35);
  }

  private noise(time: number, dur: number, type: BiquadFilterType, f: number, q: number, peak: number): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = this.env(time, peak, 0.002, dur);
    src.connect(flt).connect(g).connect(this.bus);
    src.start(time, Math.random() * 1.5);
    src.stop(time + dur + 0.05);
  }

  /** A brushed snare: soft noise with a hint of tone. */
  private snare(time: number, vel: number): void {
    this.noise(time, 0.22, 'bandpass', 1900, 0.7, 0.09 * vel);
    const o = this.ctx!.createOscillator();
    o.frequency.value = 185;
    const g = this.env(time, 0.03 * vel, 0.002, 0.08);
    o.connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + 0.12);
  }

  private hat(time: number, vel: number, open: boolean): void {
    this.noise(time, open ? 0.22 : 0.035, 'highpass', 7500, 0.5, (open ? 0.025 : 0.03) * vel * (0.7 + Math.random() * 0.3));
  }

  /** Vinyl: a quiet hiss with the odd crackle, looping under everything. */
  private vinyl(): void {
    const c = this.ctx!;
    const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.06 + (Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 0.9 : 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.11;
    src.connect(bp).connect(g).connect(this.bus);
    src.start();
    this.crackle = src;
  }
}
