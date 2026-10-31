/**
 * Tiny Web Audio synth so feedback has sound before real audio assets exist.
 * Chimes climb in semitones (2^(n/12)) when points come in a row.
 */
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0): void {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  chime(step: number) {
    const f = 660 * 2 ** (step / 12);
    tone(f, 0.35, 'sine', 0.18);
    tone(f * 2, 0.2, 'triangle', 0.05, 0.03);
  },
  fanfare() {
    [0, 4, 7, 12].forEach((s, i) => tone(523 * 2 ** (s / 12), 0.3, 'triangle', 0.15, i * 0.09));
  },
  thud() {
    tone(90, 0.25, 'square', 0.12);
  },
  naughty() {
    tone(110, 1.6, 'sawtooth', 0.06);
    tone(116, 1.6, 'sawtooth', 0.05, 0.05);
  },
  click() {
    tone(880, 0.06, 'square', 0.04);
  },
};
