/**
 * Fields: the levels. Shared by server (rules, collisions) and client (drawing), so what is drawn
 * and what is decided never disagree. Metres on the XZ plane; north is negative z.
 *
 * A pen is a fenced box with a gate gap on one side. Sheep inside the pen's interior are penned.
 */

export interface Box { x: number; z: number; w: number; d: number }
export interface Pen extends Box {
  /** Which side the gate is on, and its width. */
  gate: 'n' | 's' | 'e' | 'w';
  gateW: number;
  /** Versus: which team this pen scores for (co-op pens score for everyone). */
  team: 0 | 1 | null;
}
export interface Obstacle { kind: 'tree' | 'rock' | 'pond' | 'hay'; x: number; z: number; r: number }

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
  goat: { x: number; z: number } | null;
  /** Where dogs start, per team (co-op uses team 0). */
  starts: { x: number; z: number; team: 0 | 1 }[];
  timeLimit: number;
}

export const TRIALS: FieldDef[] = [
  {
    id: 'meadow', name: 'The Meadow', w: 40, d: 30, timeLimit: 120,
    pens: [{ x: 13, z: 0, w: 7, d: 6, gate: 'w', gateW: 3.2, team: null }],
    obstacles: [{ kind: 'tree', x: -6, z: -9, r: 1.2 }, { kind: 'tree', x: 2, z: 10, r: 1.2 }, { kind: 'rock', x: 4, z: -4, r: 0.9 }],
    flocks: [{ x: -8, z: 2, n: 8, team: null }],
    goat: null,
    starts: [{ x: -16, z: -3, team: 0 }, { x: -16, z: 3, team: 0 }, { x: -15, z: 0, team: 0 }],
  },
  {
    id: 'orchard', name: 'Old Orchard', w: 44, d: 32, timeLimit: 150,
    pens: [{ x: 0, z: -11, w: 8, d: 6, gate: 's', gateW: 2.8, team: null }],
    obstacles: [
      ...[-12, -6, 6, 12].flatMap((x) => [{ kind: 'tree' as const, x, z: -2, r: 1.2 }, { kind: 'tree' as const, x: x + 3, z: 4, r: 1.2 }]),
      { kind: 'pond', x: -14, z: 9, r: 3 }, { kind: 'hay', x: 9, z: -9, r: 1 },
    ],
    flocks: [{ x: -7, z: 7, n: 7, team: null }, { x: 11, z: 8, n: 5, team: null }],
    goat: { x: 2, z: 7 },
    starts: [{ x: 2, z: 14.5, team: 0 }, { x: -1, z: 14.5, team: 0 }, { x: 5, z: 14.5, team: 0 }],
  },
  {
    id: 'hillside', name: 'Windy Hillside', w: 48, d: 34, timeLimit: 180,
    pens: [{ x: -17, z: -11, w: 7, d: 6, gate: 'e', gateW: 2.4, team: null }],
    obstacles: [
      { kind: 'pond', x: 0, z: 0, r: 4 }, { kind: 'rock', x: -8, z: -4, r: 1.2 }, { kind: 'rock', x: 9, z: -8, r: 1.4 },
      { kind: 'tree', x: -12, z: 6, r: 1.3 }, { kind: 'tree', x: 13, z: 7, r: 1.3 }, { kind: 'hay', x: -6, z: -12, r: 1 }, { kind: 'hay', x: 4, z: 11, r: 1 },
    ],
    flocks: [{ x: 12, z: 8, n: 8, team: null }, { x: 14, z: -6, n: 8, team: null }],
    goat: { x: 6, z: 2 },
    starts: [{ x: 20, z: 0, team: 0 }, { x: 20, z: 4, team: 0 }, { x: 20, z: -4, team: 0 }],
  },
];

/** Versus: one field, two halves, two pens. Sheep wear their team's colour and only count in their own pen. */
export const VERSUS: FieldDef = {
  id: 'fieldday', name: 'Field Day', w: 52, d: 30, timeLimit: 180,
  pens: [
    { x: -21, z: 0, w: 6, d: 7, gate: 'e', gateW: 3, team: 0 },
    { x: 21, z: 0, w: 6, d: 7, gate: 'w', gateW: 3, team: 1 },
  ],
  obstacles: [{ kind: 'tree', x: -8, z: -8, r: 1.2 }, { kind: 'tree', x: 8, z: 8, r: 1.2 }, { kind: 'rock', x: -9, z: 7, r: 1 }, { kind: 'rock', x: 9, z: -7, r: 1 }, { kind: 'hay', x: 0, z: -11, r: 1 }, { kind: 'hay', x: 0, z: 11, r: 1 }],
  // Both flocks graze in the middle, side by side: you have to get yours out past theirs.
  flocks: [{ x: 1, z: -5, n: 7, team: 0 }, { x: -1, z: 5, n: 7, team: 1 }],
  goat: { x: 0, z: 0 },
  starts: [{ x: -16, z: -9, team: 0 }, { x: -16, z: 9, team: 0 }, { x: -17, z: 0, team: 0 }, { x: 16, z: 9, team: 1 }, { x: 16, z: -9, team: 1 }, { x: 17, z: 0, team: 1 }],
};

/** The pen's interior (inset from the fence) — penned means inside this. */
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
