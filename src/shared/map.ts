/**
 * The village layout, in metres on the XZ plane. Shared by server (rules) and client (drawing),
 * so what is drawn and what is decided can never disagree.
 */
import type { ActId } from './activities';

export type AreaId = 'kitchen' | 'garden' | 'pond' | 'chapel' | 'range' | 'square';

export interface Rect { x: number; z: number; w: number; d: number }
export interface Area { id: AreaId; name: string; x: number; z: number; color: string; act: ActId }
/** Where you stand to do an activity (x, z) and the prop you face (px, pz): stool, tree, oven... */
export interface SpotDef { id: string; area: AreaId; act: ActId; x: number; z: number; px: number; pz: number }

export const WORLD = { w: 44, d: 34 };

export const AREAS: Area[] = [
  { id: 'kitchen', name: 'Cottage kitchen', x: -13, z: -8, color: '#c99a6b', act: 'bake' },
  { id: 'garden', name: 'Orchard', x: 13, z: -8, color: '#6f9a4a', act: 'fruit' },
  { id: 'pond', name: 'Pond', x: 13, z: 8, color: '#4f8a9a', act: 'fish' },
  { id: 'chapel', name: 'Chapel of too many candles', x: -13, z: 8, color: '#8a7a9a', act: 'candle' },
  { id: 'range', name: 'Archery range', x: 0, z: -12, color: '#9aa45a', act: 'archery' },
];

/** Radius of an area's ground patch. */
export const AREA_RADIUS = 7;

const ring = (id: AreaId, act: ActId, cx: number, cz: number, rs: number, rp: number, angles: number[]): SpotDef[] =>
  angles.map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    return { id: `${id}-${i}`, area: id, act, x: cx + Math.cos(a) * rs, z: cz + Math.sin(a) * rs, px: cx + Math.cos(a) * rp, pz: cz + Math.sin(a) * rp };
  });

/**
 * Five spots per area, enough for a 12-player game (an attempt takes about six seconds).
 * Angles are degrees from +x toward +z (south); north is negative z.
 */
export const SPOTS: SpotDef[] = [
  ...ring('pond', 'fish', 13, 8, 3.1, 2.1, [90, 162, 234, 306, 18]),
  ...ring('garden', 'fruit', 13, -8, 2.2, 3.6, [90, 162, 234, 306, 18]),
  ...[-3.6, -1.8, 0, 1.8, 3.6].map((dx, i) => ({ id: `kitchen-${i}`, area: 'kitchen' as AreaId, act: 'bake' as ActId, x: -13 + dx, z: -8 - 2.9, px: -13 + dx, pz: -8 - 4.2 })),
  ...ring('chapel', 'candle', -13, 8, 2.3, 3.3, [-80, -35, 10, 55, 100]),
  ...[-4, -2, 0, 2, 4].map((dx, i) => ({ id: `range-${i}`, area: 'range' as AreaId, act: 'archery' as ActId, x: dx, z: -9.6, px: dx, pz: -15.2 })),
  // Easels around the village square, facing outward, for painting.
  ...ring('square', 'paint', 0, 2, 5.4, 6.3, [20, 70, 110, 160, 200]),
];

/** The board in the village square: guesses and accusations happen here. */
export const BOARD = { x: 0, z: -2 };
/** The Pen, south of the square, in view of everyone (and the goat). */
export const PEN: Rect = { x: 0, z: 13, w: 8, d: 5 };
/** Crow targets for the Pen snowball fight, along the back fence inside the Pen. */
export const PEN_TARGETS = [-1, 0, 1].map((i) => ({ x: PEN.x + i * (PEN.w / 3), z: PEN.z + PEN.d / 2 - 0.35 }));

/** Where everyone stands in the lobby and at round start. */
export const SQUARE = { x: 0, z: 2, r: 3.5 };

export const REACH = {
  /** How close you must be to use an activity spot or the board. */
  spot: 1.3,
  board: 2.4,
};

export const PLAYER_SPEED = 5.5;
export const PLAYER_RADIUS = 0.45;

export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  return Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
