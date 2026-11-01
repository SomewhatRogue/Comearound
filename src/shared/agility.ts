/**
 * Agility courses: hurdles, a tyre, a tunnel, weave poles and a pause table, numbered in order.
 * Just for fun (no points). The pieces are field data like everything else, and turn into low
 * fences for the rules: hurdles and the tyre are jumpables (sheep go round, dogs jump), the
 * tunnel's sides are solid to everyone (dogs go in one end and out the other), and the table has
 * a skirt that keeps sheep off it while dogs hop up freely. Weave poles are too thin to matter.
 */
import type { LowFence } from './field';

export type AgilityKind = 'hurdle' | 'tire' | 'tunnel' | 'weave' | 'table';
/** One piece: where its middle is, which way the dog runs through it (radians, 0 = east, +z south), and its number on the course. */
export interface AgilityPiece { kind: AgilityKind; x: number; z: number; dir: number; n: number }

export const AG = {
  hurdleW: 1.5,
  tireW: 1.2,
  /** Height of the middle of the tyre. */
  tireY: 0.95,
  tunnelLen: 3.4,
  /** The tunnel's half width: room for a dog (radius 0.45) with a little to spare. */
  tunnelR: 0.62,
  weaveN: 6,
  weaveGap: 1.1,
  /** The table's side, and how high a dog stands on it. */
  table: 1.2,
  tableH: 0.4,
  /** Seconds on the table to count it. */
  tableStay: 1.2,
};

/** The piece's own axes: `u` along the run, `n` across it. */
export function axes(p: AgilityPiece): { ux: number; uz: number; nx: number; nz: number } {
  const ux = Math.cos(p.dir);
  const uz = Math.sin(p.dir);
  return { ux, uz, nx: -uz, nz: ux };
}

/** A point in the piece's own frame: how far along the run, and how far to the side. */
export function local(p: AgilityPiece, x: number, z: number): { along: number; lat: number } {
  const { ux, uz, nx, nz } = axes(p);
  const [dx, dz] = [x - p.x, z - p.z];
  return { along: dx * ux + dz * uz, lat: dx * nx + dz * nz };
}

/** Where the weave poles stand, as distances along the run. */
export function weavePoles(): number[] {
  return Array.from({ length: AG.weaveN }, (_, i) => (i - (AG.weaveN - 1) / 2) * AG.weaveGap);
}

/** Is (x, z) standing on this table? */
export function onTable(p: AgilityPiece, x: number, z: number): boolean {
  const { along, lat } = local(p, x, z);
  return p.kind === 'table' && Math.abs(along) < AG.table / 2 && Math.abs(lat) < AG.table / 2;
}

/** A course from its pieces (numbered in the order given), and the low fences it adds to the field. */
export function course(pieces: Omit<AgilityPiece, 'n'>[]): { agility: AgilityPiece[]; lowFences: LowFence[] } {
  const agility = pieces.map((p, i) => ({ ...p, n: i + 1 }));
  const lowFences: LowFence[] = [];
  const seg = (p: AgilityPiece, a0: number, l0: number, a1: number, l1: number, kind: LowFence['kind']) => {
    const { ux, uz, nx, nz } = axes(p);
    const pt = (a: number, l: number): [number, number] => [p.x + ux * a + nx * l, p.z + uz * a + nz * l];
    lowFences.push({ a: pt(a0, l0), b: pt(a1, l1), kind });
  };
  for (const p of agility) {
    if (p.kind === 'hurdle') seg(p, 0, -AG.hurdleW / 2, 0, AG.hurdleW / 2, 'hurdle');
    if (p.kind === 'tire') seg(p, 0, -AG.tireW / 2, 0, AG.tireW / 2, 'tire');
    if (p.kind === 'tunnel') for (const s of [-1, 1]) seg(p, -AG.tunnelLen / 2, s * AG.tunnelR, AG.tunnelLen / 2, s * AG.tunnelR, 'edge');
    if (p.kind === 'table') {
      const h = AG.table / 2;
      for (const [a0, l0, a1, l1] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) seg(p, a0, l0, a1, l1, 'skirt');
    }
  }
  return { agility, lowFences };
}
