/**
 * What else the flock reacts to, besides dogs and each other: goats (sheep give them room, and
 * scatter from a charging one), brambles (shy away; touch one and bolt), the wind carrying a
 * dog's scent (sheep downwind get nervous and drift away), and frights at nothing at all.
 */
import { DOG, GOAT, HAZARD, SCENT, SHEEP, WEATHER } from '../shared/tuning';
import { isDown } from './dogs';
import type { Dog, Room, Sheep } from './state';

export interface Push { ax: number; az: number; push: number }

export function hazardForces(room: Room, s: Sheep, dogs: Dog[], penned: boolean, dt: number): Push {
  const out: Push = { ax: 0, az: 0, push: 0 };
  const away = (dx: number, dz: number, d: number, k: number, p: number) => {
    out.ax += (dx / d) * k;
    out.az += (dz / d) * k;
    out.push = Math.max(out.push, p);
  };

  // Goats: sheep give them room (so a goat in a gateway blocks it); a charging goat scatters them.
  for (const g of room.goats) {
    const dx = s.x - g.x;
    const dz = s.z - g.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    const charging = g.mood === 'charge';
    const r = charging ? GOAT.sheepAvoid * 1.8 : GOAT.sheepAvoid;
    if (d < r) {
      const k = 1 - d / r;
      away(dx, dz, d, k * (charging ? 9 : 5), k * (charging ? 1 : 0.6));
      if (charging) s.fear = Math.min(1, s.fear + k * 1.5 * dt);
    }
  }

  // Brambles: shy away; brush against one and bolt.
  for (const o of room.field.obstacles) {
    if (o.kind !== 'bramble') continue;
    const dx = s.x - o.x;
    const dz = s.z - o.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    const edge = d - o.r - SHEEP.radius;
    if (edge < HAZARD.brambleShy) away(dx, dz, d, 3 * (1 - edge / HAZARD.brambleShy), 0.3);
    if (edge < 0.12 && s.startle < 0.5) {
      s.vx += (dx / d) * HAZARD.brambleKick;
      s.vz += (dz / d) * HAZARD.brambleKick;
      s.startle = 0.9;
      s.fear = Math.min(1, s.fear + 0.6);
    }
  }

  // Wind: a dog upwind of a sheep, within range, sets it drifting downwind (away from the dog).
  const w = room.wind;
  if (w.s > 0.05 && !penned) {
    for (const d of dogs) {
      if (isDown(d) || d.frozen > 0) continue;
      const dx = s.x - d.x;
      const dz = s.z - d.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const range = SCENT.range * (0.5 + w.s);
      if (dist > range) continue;
      const align = (dx * w.x + dz * w.z) / dist;
      if (align < SCENT.cone) continue;
      const k = (1 - dist / range) * ((align - SCENT.cone) / (1 - SCENT.cone)) * w.s * (d.posture === 'crouch' ? SCENT.crouch : 1);
      out.ax += w.x * k * SCENT.push * 2;
      out.az += w.z * k * SCENT.push * 2;
      out.push = Math.max(out.push, k * 0.5);
      s.fear = Math.min(1, s.fear + k * SCENT.fear * dt);
    }
  }

  // Now and then a sheep takes fright at nothing at all and bolts (not near a dog lying down).
  const spookEvery = SHEEP.spookEvery / (room.weather.kind === 'clear' ? 1 : WEATHER.rainSpook);
  if (!penned && room.phase === 'playing' && room.rng.next() < dt / spookEvery && !dogs.some((d) => isDown(d) && Math.hypot(d.x - s.x, d.z - s.z) < DOG.calmRadius)) {
    const a = room.rng.range(0, Math.PI * 2);
    s.vx += Math.cos(a) * SHEEP.spookKick;
    s.vz += Math.sin(a) * SHEEP.spookKick;
    s.startle = Math.max(s.startle, 0.8);
    s.fear = Math.min(1, s.fear + 0.5);
  }
  return out;
}
