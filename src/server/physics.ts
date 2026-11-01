/**
 * Shared collision helpers: field fence, pen fences (with their gate gaps), obstacles.
 * Everything is a circle pushed out of walls and other circles. Cheap, stable, good enough.
 */
import { gapFor, jumpableHalf, penWalls, waterSegments, type FieldDef, type Pen } from '../shared/field';

type Wall = { ax: number; az: number; bx: number; bz: number };
const wallCache = new WeakMap<FieldDef, Wall[]>();
const dogWallCache = new WeakMap<FieldDef, Wall[]>();

/** Pen fences. Dogs also get the gate gap as a wall: the pen is for sheep (and the goat). */
function walls(f: FieldDef, gateShut: boolean): Wall[] {
  const cache = gateShut ? dogWallCache : wallCache;
  let w = cache.get(f);
  if (!w) cache.set(f, (w = f.pens.flatMap((p) => (gateShut ? penWalls({ ...p, gateW: 0 }) : penWalls(p)))));
  return w;
}

type Water = Wall & { r: number };
const waterCache = new WeakMap<FieldDef, Water[]>();
function water(f: FieldDef): Water[] {
  let w = waterCache.get(f);
  if (!w) waterCache.set(f, (w = (f.streams ?? []).flatMap((s) => waterSegments(s).map((q) => ({ ...q, r: s.w / 2 })))));
  return w;
}

/** Push (x, z) out of a thick line (a wall of half-width `half`), staying on the side it came from. */
function pushOff(w: Wall, half: number, x: number, z: number, r: number, from?: { x: number; z: number }): [number, number] {
  const ex = w.bx - w.ax;
  const ez = w.bz - w.az;
  const len2 = ex * ex + ez * ez;
  if (len2 < 1e-9) return [x, z];
  const len = Math.sqrt(len2);
  const raw = ((x - w.ax) * ex + (z - w.az) * ez) / len2;
  const min = r + half + 0.08;
  if (from && raw > 0 && raw < 1) {
    // Along the line: stay on the side we came from (nothing tunnels through).
    const side = Math.sign((ex * (from.z - w.az) - ez * (from.x - w.ax)) / len) || 1;
    const now = (ex * (z - w.az) - ez * (x - w.ax)) / len;
    if (Math.abs(now) > min + 1.5) return [x, z];
    if (now * side < min) {
      const fix = side * min - now;
      return [x + (-ez / len) * fix, z + (ex / len) * fix];
    }
    return [x, z];
  }
  const t = Math.max(0, Math.min(1, raw));
  const px = w.ax + ex * t;
  const pz = w.az + ez * t;
  const dx = x - px;
  const dz = z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= min) return [x, z];
  if (d > 1e-6) return [px + (dx / d) * min, pz + (dz / d) * min];
  return [px - (ez / len) * min, pz + (ex / len) * min];
}

/** The gate gap of a pen, as a wall (for when the gate is shut). */
function gateLine(p: Pen): Wall[] {
  const g = p.gateW / 2;
  const [l, r, t, b] = [p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2];
  switch (p.gate) {
    case 'n': return [{ ax: p.x - g, az: t, bx: p.x + g, bz: t }];
    case 's': return [{ ax: p.x - g, az: b, bx: p.x + g, bz: b }];
    case 'w': return [{ ax: l, az: p.z - g, bx: l, bz: p.z + g }];
    default: return [{ ax: r, az: p.z - g, bx: r, bz: p.z + g }];
  }
}

export interface CollideOpts {
  /** Water (ponds, streams) is solid: true for sheep and goats; dogs wade (and are slowed). */
  water?: boolean;
  /** Sheep can slip out through gaps in the outer fence (and are then lost). */
  leak?: boolean;
  /** Where the circle was before this move: walls push back to that side, so nothing tunnels through a fence. */
  from?: { x: number; z: number };
  /** Treat pen gates as shut (dogs). */
  gateShut?: boolean;
  /** Pens whose gates are closed right now (challenge fields), for sheep and goats too. */
  closed?: Pen[];
  /** Dogs hop low fences (and walk through table skirts); sheep and goats can't. Tunnel sides stop everyone. */
  hop?: boolean;
}

/** Push a circle at (x, z) with radius r out of everything solid. Returns the corrected position. */
export function collide(f: FieldDef, x: number, z: number, r: number, opts: CollideOpts = {}): [number, number] {
  const isWater = opts.water ?? true;
  // Outer fence (with gaps, for sheep).
  const gap = opts.leak ? gapFor(f, opts.from?.x ?? x, opts.from?.z ?? z) : null;
  const [mx, mz] = [f.w / 2 - r, f.d / 2 - r];
  x = Math.max(gap?.side === 'w' ? -Infinity : -mx, Math.min(gap?.side === 'e' ? Infinity : mx, x));
  z = Math.max(gap?.side === 'n' ? -Infinity : -mz, Math.min(gap?.side === 's' ? Infinity : mz, z));
  if (isWater) for (const w of water(f)) [x, z] = pushOff(w, w.r, x, z, r, opts.from);
  for (const o of f.obstacles) {
    if (o.kind === 'pond' && !isWater) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + r;
    if (d < min && d > 1e-6) [x, z] = [o.x + (dx / d) * min, o.z + (dz / d) * min];
  }
  for (const w of walls(f, !!opts.gateShut)) [x, z] = pushOff(w, 0, x, z, r, opts.from);
  for (const l of f.lowFences ?? []) if (!opts.hop || l.kind === 'edge') [x, z] = pushOff({ ax: l.a[0], az: l.a[1], bx: l.b[0], bz: l.b[1] }, jumpableHalf(l), x, z, r, opts.from);
  if (!opts.gateShut) for (const p of opts.closed ?? []) for (const w of gateLine(p)) [x, z] = pushOff(w, 0, x, z, r, opts.from);
  return [x, z];
}

/** Two circles shouldn't overlap: nudge both apart, weighted by `push` (0..1 share for a). */
export function separate(a: { x: number; z: number }, b: { x: number; z: number }, min: number, push = 0.5): void {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d >= min || d < 1e-6) return;
  const k = (min - d) / d;
  a.x += dx * k * push;
  a.z += dz * k * push;
  b.x -= dx * k * (1 - push);
  b.z -= dz * k * (1 - push);
}

export function clampLen(x: number, z: number, max: number): [number, number] {
  const l = Math.hypot(x, z);
  return l > max ? [(x / l) * max, (z / l) * max] : [x, z];
}
