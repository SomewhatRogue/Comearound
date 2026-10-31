/**
 * Wind: each field has a prevailing wind (direction and strength). It wanders a little either side
 * of that, breathes stronger and weaker, and on gusty fields it gusts. It carries your scent
 * (hazards.ts) and the client sways the grass with it.
 */
import type { Room } from './state';

const gusts = new WeakMap<Room, { next: number; left: number }>();

export function startWind(room: Room): void {
  const w = room.field.wind;
  room.wind = { x: Math.cos(w?.dir ?? 0), z: Math.sin(w?.dir ?? 0), s: w?.strength ?? 0 };
  gusts.set(room, { next: room.rng.range(5, 10), left: 0 });
}

export function tickWind(room: Room, dt: number): void {
  const w = room.field.wind;
  if (!w || w.strength <= 0) {
    room.wind.s = 0;
    return;
  }
  const t = room.clock;
  const dir = w.dir + Math.sin(t * 0.045) * 0.35 + Math.sin(t * 0.13 + 1.7) * 0.12;
  let s = w.strength * (0.8 + 0.2 * Math.sin(t * 0.31));
  const g = gusts.get(room) ?? { next: 8, left: 0 };
  if (w.gusty) {
    g.next -= dt;
    if (g.next <= 0) [g.left, g.next] = [room.rng.range(1.5, 3), room.rng.range(6, 14)];
    if (g.left > 0) {
      g.left -= dt;
      s = Math.min(1, s + 0.35 * Math.sin(Math.PI * Math.min(1, g.left / 2)) + 0.15);
    }
    gusts.set(room, g);
  }
  room.wind = { x: Math.cos(dir), z: Math.sin(dir), s };
}
