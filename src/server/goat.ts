/**
 * The goat. Wanders, eats loose items now and then, and stares down someone in the Pen.
 * The stare sends one private 'naughty' event to its target: their screen cuts to the goat.
 */
import { AREAS, PEN, WORLD } from '../shared/map';
import type { Goat, Room } from './state';

const SPEED = 2.2;
const STARE_SEC = 4;
const STARE_EVERY = 25;
const EAT_CHANCE_PER_SEC = 0.04;
const RESPAWN_SEC = 20;

export function makeGoat(): Goat {
  return { x: 4, z: 6, mood: 'wander', target: null, tx: 4, tz: 6, timer: 0, stareCooldown: 12, eatItem: null };
}

function walk(g: Goat, dt: number): boolean {
  const dx = g.tx - g.x;
  const dz = g.tz - g.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return true;
  g.x += (dx / d) * Math.min(d, SPEED * dt);
  g.z += (dz / d) * Math.min(d, SPEED * dt);
  return false;
}

export function tickGoat(room: Room, dt: number): void {
  const g = room.goat;
  g.stareCooldown -= dt;
  const live = room.phase === 'playing' || room.phase === 'lastcall';

  // Eaten items come back after a while, somewhere in their home area.
  for (const it of room.items) {
    if (it.gone && room.clock >= it.respawnAt) {
      const a = room.rng.pick(AREAS);
      [it.gone, it.x, it.z] = [false, a.x + room.rng.range(-4, 4), a.z + room.rng.range(-4, 4)];
    }
  }

  if (g.mood === 'stare') {
    g.timer -= dt;
    const t = g.target ? room.players.get(g.target) : null;
    if (!t || !t.inPen) g.timer = 0;
    if (g.timer <= 0) [g.mood, g.target] = ['wander', null];
    return;
  }

  const jailed = [...room.players.values()].filter((p) => p.inPen);
  if (live && jailed.length && g.stareCooldown <= 0 && g.mood === 'wander') {
    const t = room.rng.pick(jailed);
    g.target = t.id;
    g.tx = PEN.x + room.rng.range(-PEN.w / 3, PEN.w / 3);
    g.tz = PEN.z - PEN.d / 2 - 0.8;
    if (walk(g, dt)) {
      g.mood = 'stare';
      g.timer = STARE_SEC;
      g.stareCooldown = STARE_EVERY;
      room.emit(t.id, { kind: 'naughty' });
    }
    return;
  }

  if (g.mood === 'eat') {
    const it = room.items.find((i) => i.uid === g.eatItem);
    if (!it || it.heldBy || it.station || it.gone) [g.mood, g.eatItem] = ['wander', null];
    else {
      [g.tx, g.tz] = [it.x, it.z];
      if (walk(g, dt)) {
        it.gone = true;
        it.respawnAt = room.clock + RESPAWN_SEC;
        [g.mood, g.eatItem] = ['wander', null];
      }
    }
    return;
  }

  if (live && room.rng.next() < EAT_CHANCE_PER_SEC * dt) {
    const loose = room.items.filter((i) => !i.heldBy && !i.station && !i.gone);
    if (loose.length) [g.mood, g.eatItem] = ['eat', room.rng.pick(loose).uid];
    return;
  }

  if (walk(g, dt)) {
    g.tx = room.rng.range(-WORLD.w / 2 + 3, WORLD.w / 2 - 3);
    g.tz = room.rng.range(-WORLD.d / 2 + 3, PEN.z - PEN.d);
  }
}
