/**
 * Shared collision helpers: field fence, pen fences (with their gate gaps), obstacles.
 * Everything is a circle pushed out of walls and other circles. Cheap, stable, good enough.
 */
import { penWalls, type FieldDef } from '../shared/field';

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

export interface CollideOpts {
  /** Ponds are solid (sheep and dogs walk around them). */
  water?: boolean;
  /** Where the circle was before this move: walls push back to that side, so nothing tunnels through a fence. */
  from?: { x: number; z: number };
  /** Treat pen gates as shut (dogs). */
  gateShut?: boolean;
}

/** Push a circle at (x, z) with radius r out of everything solid. Returns the corrected position. */
export function collide(f: FieldDef, x: number, z: number, r: number, opts: CollideOpts = {}): [number, number] {
  const isWater = opts.water ?? true;
  // Outer fence.
  x = Math.max(-f.w / 2 + r, Math.min(f.w / 2 - r, x));
  z = Math.max(-f.d / 2 + r, Math.min(f.d / 2 - r, z));
  for (const o of f.obstacles) {
    if (o.kind === 'pond' && !isWater) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + r;
    if (d < min && d > 1e-6) [x, z] = [o.x + (dx / d) * min, o.z + (dz / d) * min];
  }
  for (const w of walls(f, !!opts.gateShut)) {
    const ex = w.bx - w.ax;
    const ez = w.bz - w.az;
    const len2 = ex * ex + ez * ez;
    if (len2 < 1e-9) continue;
    const len = Math.sqrt(len2);
    const raw = ((x - w.ax) * ex + (z - w.az) * ez) / len2;
    const from = opts.from;
    if (from && raw > 0 && raw < 1) {
      // Along the wall's length: stay on the side we came from.
      const side = Math.sign((ex * (from.z - w.az) - ez * (from.x - w.ax)) / len) || 1;
      const now = (ex * (z - w.az) - ez * (x - w.ax)) / len;
      const min = r + 0.08;
      if (Math.abs(now) > r + 1.5) continue;
      if (now * side < min) {
        const fix = side * min - now;
        x += (-ez / len) * fix;
        z += (ex / len) * fix;
      }
      continue;
    }
    const t = Math.max(0, Math.min(1, raw));
    const px = w.ax + ex * t;
    const pz = w.az + ez * t;
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    const min = r + 0.08;
    if (d < min) {
      if (d > 1e-6) [x, z] = [px + (dx / d) * min, pz + (dz / d) * min];
      else [x, z] = [px - (ez / Math.sqrt(len2)) * min, pz + (ex / Math.sqrt(len2)) * min];
    }
  }
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
