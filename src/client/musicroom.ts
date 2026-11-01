/**
 * Piano in the next room: a felt piano (a few soft partials, a little hammer thump, long pedalled
 * decays) playing rolled chords or slow arpeggios with a simple melody on top, a touch of human
 * timing in every note. All of it heard through a wall: muffled (a low-pass with a little warmth
 * underneath) into a small room's echo. A kick and a brush thump faintly through the floor on some
 * tracks. The lofi hiss and crackle from music.ts stay on top, in your room.
 */

/** How a room track plays: an arpeggio (which chord tone on each eighth note) or rolled chords, and whether a beat comes through the floor. */
export interface RoomStyle { arp: number[] | null; thump: boolean }

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class RoomPiano {
  private in: GainNode;

  constructor(private c: AudioContext, out: AudioNode, private noiseBuf: AudioBuffer) {
    this.in = c.createGain();
    // A touch quieter than the other tracks (it is in the next room), not much.
    this.in.gain.value = 2.4;
    // The wall: most of the top end gone, a little warmth left down low.
    const wall = c.createBiquadFilter();
    wall.type = 'lowpass';
    wall.frequency.value = 1150;
    wall.Q.value = 0.4;
    const warmth = c.createBiquadFilter();
    warmth.type = 'peaking';
    warmth.frequency.value = 220;
    warmth.gain.value = 3;
    this.in.connect(wall).connect(warmth);
    const dry = c.createGain();
    dry.gain.value = 0.7;
    warmth.connect(dry).connect(out);
    // The other room: a short, soft echo off its walls.
    const verb = c.createConvolver();
    verb.buffer = roomImpulse(c, 1.5);
    const wet = c.createGain();
    wet.gain.value = 0.6;
    warmth.connect(verb).connect(wet).connect(out);
  }

  /**
   * One sixteenth step of the bar. Returns the melody's new note (so it can wander on from it).
   * `scale`: the key's seven notes as intervals from `key`.
   */
  step(s: number, bar: number, time: number, sd: number, root: number, chord: number[], key: number, scale: number[], melP: number, mel: number, style: RoomStyle, r: () => number): number {
    // A person playing: never quite on the grid.
    const at = time + (r() - 0.5) * 0.026;
    const tones = chord.map((iv) => {
      let n = root + 12 + iv;
      while (n < 55) n += 12;
      while (n > 74) n -= 12;
      return n;
    }).sort((a, b) => a - b);
    // Left hand: the root, held under the pedal; sometimes a fifth or octave halfway through.
    let low = root - 12;
    while (low < 36) low += 12;
    if (s === 0) this.piano(low, at, sd * 16, 0.75);
    if (s === 8 && r() < 0.5) this.piano(low + (r() < 0.5 ? 7 : 12), at, sd * 8, 0.45);
    // Right hand: a slow arpeggio, or a rolled chord with a soft re-strike.
    if (style.arp) {
      if (s % 2 === 0 && r() > 0.1) this.piano(tones[style.arp[s / 2] % tones.length], at, sd * 6, s === 0 ? 0.5 : 0.38);
    } else {
      if (s === 0) tones.forEach((n, i) => this.piano(n, at + i * 0.028, sd * 14, 0.48));
      if (s === 10 && r() < 0.5) tones.slice(-3).forEach((n, i) => this.piano(n, at + i * 0.02, sd * 6, 0.3));
    }
    // A melody on top: sparse, stepwise, landing on chord tones on the downbeat; resting every fourth bar.
    const chance = s % 4 === 0 ? melP * (s === 0 ? 0.8 : 0.5) : s === 6 || s === 14 ? melP * 0.25 : 0;
    if (bar % 4 !== 3 && chance && r() < chance) {
      const pool: number[] = [];
      for (let o = 0; o <= 36; o += 12) for (const iv of s === 0 ? chord : scale) pool.push((s === 0 ? root : key) + o + iv);
      const near = pool.filter((n) => n !== mel && Math.abs(n - mel) <= 4 && n >= 67 && n <= 84);
      mel = near[Math.floor(r() * near.length)] ?? mel;
      this.piano(mel, at, sd * (4 + Math.floor(r() * 6)), 0.52);
    }
    // Through the floor: a soft kick on one and three, a brush on two and four.
    if (style.thump) {
      if (s === 0 || s === 8) this.kick(at);
      if (s === 4 || s === 12) this.brush(at);
    }
    return mel;
  }

  /** A felt piano note: soft partials (slightly stretched, the top ones dying first), a hammer thump, and the pedal. */
  private piano(n: number, time: number, hold: number, vel: number): void {
    const c = this.c;
    const f = mtof(n);
    // Low notes ring longer.
    const ring = Math.max(0.9, Math.min(3.6, 3.6 - (n - 40) * 0.055));
    const end = time + hold + 0.6;
    for (const [k, amp] of [[1, 1], [2, 0.32], [3, 0.11], [4, 0.04]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f * k * (1 + 0.0004 * k * k);
      const g = c.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.07 * vel * amp, time + 0.005);
      g.gain.setTargetAtTime(0, time + 0.005, ring / (k * 2.2));
      // Off the pedal: the damper comes down.
      g.gain.setTargetAtTime(0, time + hold, 0.12);
      o.connect(g).connect(this.in);
      o.start(time);
      o.stop(end);
    }
    this.noise(time, 0.035, 'lowpass', 900, 0.02 * vel);
  }

  private kick(time: number): void {
    const o = this.c.createOscillator();
    o.frequency.setValueAtTime(80, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    const g = this.c.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.16, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    o.connect(g).connect(this.in);
    o.start(time);
    o.stop(time + 0.35);
  }

  private brush(time: number): void {
    this.noise(time, 0.2, 'bandpass', 1500, 0.035);
  }

  private noise(time: number, dur: number, type: BiquadFilterType, f: number, peak: number): void {
    const c = this.c;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(flt).connect(g).connect(this.in);
    src.start(time, Math.random() * 1.5);
    src.stop(time + dur + 0.05);
  }
}

/** A small room's echo: two channels of noise dying away, the early part denser. */
function roomImpulse(c: AudioContext, sec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * (1 - t) ** 3 * (t < 0.02 ? 1.6 : 1) * 0.5;
    }
  }
  return buf;
}
