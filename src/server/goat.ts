/**
 * The goat: an agent of chaos among the sheep.
 * - It ambles about and every so often bleats, scattering the sheep near it.
 * - It barely gives way to dogs: only a dog giving it the eye (crouched, facing it) moves it.
 * - Barking annoys it. Bark too much within earshot and it marches over to whoever barked last,
 *   freezes them with a stare, and they get the NAUGHTY close-up. Time lost.
 * Pen it for a bonus. In versus, drive it onto the other team's side and let it bleat there.
 */
import { DOG, GOAT } from '../shared/tuning';
import { isPenned } from './flock';
import { clampLen, collide, separate } from './physics';
import type { Goat, Room } from './state';

export function makeGoat(room: Room): Goat | null {
  const g = room.field.goat;
  if (!g) return null;
  return { x: g.x, z: g.z, vx: 0, vz: 0, rot: 0, mood: 'wander', target: null, timer: 0, bleatIn: room.rng.range(...GOAT.bleatEvery), bleats: 0, annoy: 0, lastBarker: null, stareCd: 6, wx: g.x, wz: g.z };
}

export function goatPenned(room: Room): boolean {
  const g = room.goat;
  return !!g && room.field.pens.some((p) => isPenned(room.field, { x: g.x, z: g.z, team: p.team }));
}

export function tickGoat(room: Room, dt: number): void {
  const g = room.goat;
  if (!g || room.phase !== 'playing') return;
  const from = { x: g.x, z: g.z };
  g.stareCd -= dt;
  g.annoy = Math.max(0, g.annoy - GOAT.annoyDecay * dt);

  for (const nz of room.noises) {
    if (nz.kind !== 'bark' || Math.hypot(nz.x - g.x, nz.z - g.z) > GOAT.earshot) continue;
    g.annoy = Math.min(1, g.annoy + GOAT.annoyPerBark);
    g.lastBarker = nz.by;
  }

  let ax = 0;
  let az = 0;
  let speed = GOAT.wander;

  if (g.mood === 'stare') {
    g.timer -= dt;
    if (g.timer <= 0) [g.mood, g.target] = ['wander', null];
    g.vx = g.vz = 0;
    return;
  }

  // Too much barking: march over and stare the barker down.
  if (g.mood !== 'coming' && g.annoy >= 1 && g.stareCd <= 0 && g.lastBarker && room.dogs.has(g.lastBarker)) {
    [g.mood, g.target] = ['coming', g.lastBarker];
  }
  if (g.mood === 'coming') {
    const t = room.dogs.get(g.target ?? '');
    if (!t) g.mood = 'wander';
    else {
      const dx = t.x - g.x;
      const dz = t.z - g.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6) {
        g.mood = 'stare';
        g.timer = GOAT.stareSec;
        g.stareCd = GOAT.stareCooldown;
        g.annoy = 0;
        g.rot = Math.atan2(dx, dz);
        t.frozen = GOAT.stareSec;
        room.emit(t.id, { kind: 'naughty', words: 'NAUGHTY' });
        return;
      }
      ax += (dx / d) * 6;
      az += (dz / d) * 6;
      speed = GOAT.speed;
    }
  } else {
    // Bleat now and then.
    g.bleatIn -= dt;
    if (g.bleatIn <= 0) {
      g.bleatIn = room.rng.range(...GOAT.bleatEvery);
      g.bleats++;
      g.mood = 'bleat';
      g.timer = 1;
      room.noises.push({ kind: 'bleat', x: g.x, z: g.z, by: null });
    }
    if (g.mood === 'bleat' && (g.timer -= dt) <= 0) g.mood = 'wander';
    // Only the eye moves the goat.
    let fled = false;
    for (const d of room.dogs.values()) {
      if (d.spectator || d.posture !== 'crouch') continue;
      const dx = g.x - d.x;
      const dz = g.z - d.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const facing = (Math.sin(d.rot) * -dx + Math.cos(d.rot) * -dz) / dist < -Math.cos(DOG.eyeCone);
      if (dist < GOAT.flight && facing) {
        ax += (dx / dist) * 5;
        az += (dz / dist) * 5;
        speed = GOAT.speed * 0.6;
        fled = true;
      }
    }
    if (fled && g.mood === 'wander') g.mood = 'flee';
    if (!fled && g.mood === 'flee') g.mood = 'wander';
    if (!fled) {
      if (Math.hypot(g.wx - g.x, g.wz - g.z) < 0.5 || room.rng.next() < 0.1 * dt) [g.wx, g.wz] = [g.x + room.rng.range(-5, 5), g.z + room.rng.range(-5, 5)];
      const gx = g.wx - g.x;
      const gz = g.wz - g.z;
      const gd = Math.hypot(gx, gz) || 1;
      ax += (gx / gd) * 1.5;
      az += (gz / gd) * 1.5;
    }
  }

  g.vx = (g.vx + ax * dt) * Math.exp(-dt * 2);
  g.vz = (g.vz + az * dt) * Math.exp(-dt * 2);
  [g.vx, g.vz] = clampLen(g.vx, g.vz, speed);
  g.x += g.vx * dt;
  g.z += g.vz * dt;
  [g.x, g.z] = collide(room.field, g.x, g.z, GOAT.radius, { from });
  if (Math.hypot(g.vx, g.vz) > 0.1) g.rot = Math.atan2(g.vx, g.vz);
  for (const s of room.sheep) separate(g, s, GOAT.radius + 0.5, 0.3);
  for (const d of room.dogs.values()) if (!d.spectator) separate(g, d, GOAT.radius + DOG.radius, 0.2);
  [g.x, g.z] = collide(room.field, g.x, g.z, GOAT.radius, { from });
}
