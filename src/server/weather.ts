/**
 * Weather. Rain makes sheep jumpy (they bolt at nothing more often). A storm adds lightning:
 * every so often a strike lands somewhere in the field, every sheep panics and runs from it,
 * and every dog cowers for a moment (slow and low). Clients see the flash and hear the thunder.
 */
import { WEATHER } from '../shared/tuning';
import type { Room } from './state';

export function startWeather(room: Room): void {
  room.weather = { kind: room.field.weather ?? 'clear', flashes: room.weather?.flashes ?? 0, nextFlash: room.rng.range(8, 14), fx: 0, fz: 0 };
}

export function tickWeather(room: Room, dt: number): void {
  const w = room.weather;
  if (w.kind !== 'storm' || room.phase !== 'playing') return;
  w.nextFlash -= dt;
  if (w.nextFlash > 0) return;
  w.nextFlash = room.rng.range(...WEATHER.strikeEvery);
  w.flashes++;
  // Strikes land near the flock more often than not: that's where it hurts.
  const loose = room.sheep.filter((s) => !s.lost);
  const near = loose.length && room.rng.next() < 0.7 ? loose[Math.floor(room.rng.next() * loose.length)] : null;
  const f = room.field;
  w.fx = near ? near.x + room.rng.range(-8, 8) : room.rng.range(-f.w / 2, f.w / 2);
  w.fz = near ? near.z + room.rng.range(-8, 8) : room.rng.range(-f.d / 2, f.d / 2);
  w.fx = Math.max(-f.w / 2 + 1, Math.min(f.w / 2 - 1, w.fx));
  w.fz = Math.max(-f.d / 2 + 1, Math.min(f.d / 2 - 1, w.fz));
  room.noises.push({ kind: 'thunder', x: w.fx, z: w.fz, by: null });
  for (const d of room.dogs.values()) if (!d.spectator) d.cower = WEATHER.cowerSec;
}
