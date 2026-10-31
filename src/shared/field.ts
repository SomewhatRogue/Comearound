/**
 * Fields: the levels. Shared by server (rules, collisions) and client (drawing), so what is drawn
 * and what is decided never disagree. Metres on the XZ plane; north is negative z.
 *
 * A pen is a fenced box with a gate gap on one side. Sheep inside the pen's interior are penned.
 * The levels themselves live in levels.ts.
 */

export interface Box { x: number; z: number; w: number; d: number }
export interface Pen extends Box {
  /** Which side the gate is on, and its width. */
  gate: 'n' | 's' | 'e' | 'w';
  gateW: number;
  /** Versus: which team this pen scores for (co-op pens score for everyone). */
  team: 0 | 1 | null;
}
/** Solid things. Brambles also frighten sheep that get close. Ponds are water: dogs can wade them. */
export interface Obstacle { kind: 'tree' | 'rock' | 'pond' | 'hay' | 'bramble' | 'windmill'; x: number; z: number; r: number }
/** A stream: a line of water sheep and goats won't cross except at a bridge. Dogs wade it, slowly. */
export interface Stream { pts: [number, number][]; w: number; bridges: { x: number; z: number; w: number }[] }
/** A broken bit of the outer fence: sheep that wander out through it are lost. */
export interface FenceGap { side: 'n' | 's' | 'e' | 'w'; at: number; w: number }
export interface Circle { x: number; z: number; r: number }
/** Wind: the direction it blows toward (radians, 0 = east, +z is south), and 0..1 strength. */
export interface Wind { dir: number; strength: number; gusty?: boolean }

export interface FieldDef {
  id: string;
  name: string;
  /** Field size inside the outer fence. */
  w: number;
  d: number;
  pens: Pen[];
  obstacles: Obstacle[];
  /** Flocks to spawn: where, how many, and (versus) whose. */
  flocks: { x: number; z: number; n: number; team: 0 | 1 | null }[];
  goats: { x: number; z: number }[];
  streams?: Stream[];
  mud?: Circle[];
  gaps?: FenceGap[];
  wind?: Wind;
  /** Rain makes sheep jumpy; a storm adds lightning that panics them and makes dogs cower. */
  weather?: 'rain' | 'storm';
  /** Sorting: two colours of sheep (white = team 0, black = team 1), each with its own pen. */
  sort?: boolean;
  /** Where dogs start, per team (co-op uses team 0). */
  starts: { x: number; z: number; team: 0 | 1 }[];
  timeLimit: number;
}

/** The pen's interior (inset from the fence): penned means inside this. */
export function inPen(p: Pen, x: number, z: number, inset = 0.35): boolean {
  return Math.abs(x - p.x) < p.w / 2 - inset && Math.abs(z - p.z) < p.d / 2 - inset;
}

/** The pen's fence as wall segments, leaving the gate gap open. */
export function penWalls(p: Pen): { ax: number; az: number; bx: number; bz: number }[] {
  const [l, r, t, b] = [p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2];
  const g = p.gateW / 2;
  const side = (ax: number, az: number, bx: number, bz: number, gated: boolean) => {
    if (!gated) return [{ ax, az, bx, bz }];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    return [{ ax, az, bx: mx - ux * g, bz: mz - uz * g }, { ax: mx + ux * g, az: mz + uz * g, bx, bz }];
  };
  return [...side(l, t, r, t, p.gate === 'n'), ...side(l, b, r, b, p.gate === 's'), ...side(l, t, l, b, p.gate === 'w'), ...side(r, t, r, b, p.gate === 'e')];
}

/** The middle of the gate gap, and the direction pointing out of the pen. */
export function gateOf(p: Pen): { x: number; z: number; ox: number; oz: number } {
  switch (p.gate) {
    case 'n': return { x: p.x, z: p.z - p.d / 2, ox: 0, oz: -1 };
    case 's': return { x: p.x, z: p.z + p.d / 2, ox: 0, oz: 1 };
    case 'w': return { x: p.x - p.w / 2, z: p.z, ox: -1, oz: 0 };
    default: return { x: p.x + p.w / 2, z: p.z, ox: 1, oz: 0 };
  }
}


type Seg = { ax: number; az: number; bx: number; bz: number };

/** A stream's water as segments, with the bridges cut out (widened by half the stream's width,
 * so the round ends of the water don't pinch the crossing). */
export function waterSegments(s: Stream): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < s.pts.length - 1; i++) {
    const [ax, az] = s.pts[i];
    const [bx, bz] = s.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const cuts: [number, number][] = [];
    for (const b of s.bridges) {
      const t = ((b.x - ax) * (bx - ax) + (b.z - az) * (bz - az)) / (len * len);
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      if (t < -0.2 || t > 1.2 || Math.hypot(b.x - px, b.z - pz) > s.w) continue;
      const half = (b.w / 2 + s.w / 2) / len;
      cuts.push([t - half, t + half]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let t0 = 0;
    for (const [c0, c1] of cuts) {
      if (c0 > t0) out.push({ ax: ax + (bx - ax) * t0, az: az + (bz - az) * t0, bx: ax + (bx - ax) * Math.min(1, c0), bz: az + (bz - az) * Math.min(1, c0) });
      t0 = Math.max(t0, c1);
    }
    if (t0 < 1) out.push({ ax: ax + (bx - ax) * t0, az: az + (bz - az) * t0, bx, bz });
  }
  return out.filter((q) => Math.hypot(q.bx - q.ax, q.bz - q.az) > 0.05);
}

export function distToSeg(x: number, z: number, q: Seg): number {
  const ex = q.bx - q.ax;
  const ez = q.bz - q.az;
  const t = Math.max(0, Math.min(1, ((x - q.ax) * ex + (z - q.az) * ez) / (ex * ex + ez * ez || 1)));
  return Math.hypot(x - (q.ax + ex * t), z - (q.az + ez * t));
}

/** Standing in water (a stream, off its bridges, or a pond)? Dogs wade slowly there. */
export function inWater(f: FieldDef, x: number, z: number, pad = 0): boolean {
  if (f.obstacles.some((o) => o.kind === 'pond' && Math.hypot(x - o.x, z - o.z) < o.r + pad)) return true;
  return (f.streams ?? []).some((s) => waterSegments(s).some((q) => distToSeg(x, z, q) < s.w / 2 + pad));
}

export function inMud(f: FieldDef, x: number, z: number): boolean {
  return (f.mud ?? []).some((m) => Math.hypot(x - m.x, z - m.z) < m.r);
}

/** Is this point (just inside the fence) in line with a gap in the fence? */
export function gapFor(f: FieldDef, x: number, z: number): FenceGap | null {
  for (const g of f.gaps ?? []) {
    const along = g.side === 'n' || g.side === 's' ? x : z;
    if (Math.abs(along - g.at) > g.w / 2) continue;
    const edge = g.side === 'n' ? -z - f.d / 2 : g.side === 's' ? z - f.d / 2 : g.side === 'w' ? -x - f.w / 2 : x - f.w / 2;
    if (edge > -3) return g;
  }
  return null;
}

/** Outside the fence (past a gap): lost. */
export function outOfField(f: FieldDef, x: number, z: number, margin = 0): boolean {
  return Math.abs(x) > f.w / 2 + margin || Math.abs(z) > f.d / 2 + margin;
}

/** A bridge's two ends (a little way out on each bank) and the way across. */
export function bridgeEnds(s: Stream, b: { x: number; z: number; w: number }): { a: { x: number; z: number }; b: { x: number; z: number }; ux: number; uz: number } {
  // The stream's direction at the bridge, from the nearest stretch of it.
  let best = { d: Infinity, ux: 1, uz: 0 };
  for (let i = 0; i < s.pts.length - 1; i++) {
    const [ax, az] = s.pts[i];
    const [bx, bz] = s.pts[i + 1];
    const d = distToSeg(b.x, b.z, { ax, az, bx, bz });
    const l = Math.hypot(bx - ax, bz - az) || 1;
    if (d < best.d) best = { d, ux: (bx - ax) / l, uz: (bz - az) / l };
  }
  // Across = perpendicular to the flow.
  const [cx, cz] = [-best.uz, best.ux];
  const out = s.w / 2 + 1.8;
  return { a: { x: b.x - cx * out, z: b.z - cz * out }, b: { x: b.x + cx * out, z: b.z + cz * out }, ux: cx, uz: cz };
}

/** Does the straight line from p to q cross water (a stream off its bridges)? */
export function crossesWater(f: FieldDef, p: { x: number; z: number }, q: { x: number; z: number }): boolean {
  const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = p.x + (q.x - p.x) * t;
    const z = p.z + (q.z - p.z) * t;
    if ((f.streams ?? []).some((s) => waterSegments(s).some((w) => distToSeg(x, z, w) < s.w / 2))) return true;
  }
  return false;
}

export { COURSES, TRIALS, VERSUS, VERSUS_FIELDS, fieldById, type CourseId } from './levels';
