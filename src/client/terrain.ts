/**
 * Gentle elevation: soft rises and dips across each field, so the ground isn't a flat sheet.
 * Purely visual: the rules play on the flat plane, everything drawn sits at heightAt(x, z).
 * The ground stays flat where flat matters: by the outer fence, round pens and their gates,
 * water, mud, and anything else built on the level.
 */
import { distToSeg, gateOf, waterSegments, type FieldDef } from '../shared/field';

const cache = new WeakMap<FieldDef, (x: number, z: number) => number>();

/** Height of the ground at (x, z) on this field, in metres (0 to about 0.8). */
export function heightAt(f: FieldDef, x: number, z: number): number {
  let h = cache.get(f);
  if (!h) cache.set(f, (h = build(f)));
  return h(x, z);
}

/** 0 where the ground must stay level, rising to 1 a few metres away. */
const ease = (d: number, inner: number, width: number) => Math.max(0, Math.min(1, (d - inner) / width));
const smooth = (t: number) => t * t * (3 - 2 * t);

function build(f: FieldDef): (x: number, z: number) => number {
  // A few long, crossed swells with phases from the field's name: each field has its own lie of the land.
  let seed = 0;
  for (const c of f.id) seed = (seed * 31 + c.charCodeAt(0)) % 100003;
  seed += 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves = Array.from({ length: 4 }, () => ({ a: rnd() * 6.28, k: 0.17 + rnd() * 0.2, p: rnd() * 6.28, amp: 0.5 + rnd() * 0.5 }));
  const total = waves.reduce((n, w) => n + w.amp, 0);
  const amp = f.w * f.d > 1500 ? 1.15 : 0.95;
  const water = (f.streams ?? []).flatMap((s) => waterSegments(s).map((q) => ({ q, r: s.w / 2 })));
  const [hw, hd] = [f.w / 2, f.d / 2];
  return (x, z) => {
    let v = 0;
    for (const w of waves) v += Math.sin((x * Math.cos(w.a) + z * Math.sin(w.a)) * w.k + w.p) * w.amp;
    // Mostly rises (0..1), with a softer dip now and then.
    const raw = (v / total) * 0.5 + 0.5;
    let k = ease(Math.min(hw - Math.abs(x), hd - Math.abs(z)), 1, 4);
    for (const p of f.pens) {
      const d = Math.max(Math.abs(x - p.x) - p.w / 2, Math.abs(z - p.z) - p.d / 2);
      k = Math.min(k, ease(d, 0.8, 3));
      const g = gateOf(p);
      k = Math.min(k, ease(Math.hypot(x - (g.x + g.ox * 2.5), z - (g.z + g.oz * 2.5)), 2.5, 3));
    }
    for (const o of f.obstacles) if (o.kind === 'pond' || o.kind === 'windmill') k = Math.min(k, ease(Math.hypot(x - o.x, z - o.z) - o.r, 0.6, 2.5));
    for (const w of water) k = Math.min(k, ease(distToSeg(x, z, w.q) - w.r, 0.8, 2.5));
    for (const m of f.mud ?? []) k = Math.min(k, ease(Math.hypot(x - m.x, z - m.z) - m.r, 0.3, 2));
    return smooth(raw) * amp * smooth(k);
  };
}
