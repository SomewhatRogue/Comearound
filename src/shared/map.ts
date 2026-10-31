/**
 * The village layout, in metres on the XZ plane. Shared by server (rules) and client (drawing),
 * so what is drawn and what is decided can never disagree.
 */
import type { AreaId } from './catalog';

export interface Rect { x: number; z: number; w: number; d: number }
export interface Area { id: AreaId; name: string; x: number; z: number; color: string }
export interface StationDef { id: string; area: AreaId; x: number; z: number }

export const WORLD = { w: 44, d: 34 };

export const AREAS: Area[] = [
  { id: 'kitchen', name: 'Cottage kitchen', x: -13, z: -8, color: '#c99a6b' },
  { id: 'garden', name: 'Garden', x: 13, z: -8, color: '#6f9a4a' },
  { id: 'pond', name: 'Pond', x: 13, z: 8, color: '#4f8a9a' },
  { id: 'chapel', name: 'Chapel of too many candles', x: -13, z: 8, color: '#8a7a9a' },
];

/** Radius of an area's ground patch. */
export const AREA_RADIUS = 7;

/** Three build stations per area, in a triangle around its centre. */
export const STATIONS: StationDef[] = AREAS.flatMap((a) =>
  [0, 1, 2].map((i) => {
    const ang = (i / 3) * Math.PI * 2 + Math.PI / 2;
    return { id: `${a.id}-${i}`, area: a.id, x: a.x + Math.cos(ang) * 3.2, z: a.z + Math.sin(ang) * 3.2 };
  }),
);

/** The board in the village square: guesses and accusations happen here. */
export const BOARD = { x: 0, z: -2 };
/** The Pen, south of the square, in view of everyone (and the goat). */
export const PEN: Rect = { x: 0, z: 13, w: 8, d: 5 };
/** Where everyone stands in the lobby and at round start. */
export const SQUARE = { x: 0, z: 2, r: 3.5 };

export const REACH = {
  /** How close you must be to pick up an item or use a station. */
  item: 1.4,
  station: 1.6,
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
