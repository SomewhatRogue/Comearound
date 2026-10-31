/**
 * The goat. A menace with a schedule:
 * - pester: walks into someone's path; if they're carrying something, knocks it loose
 * - nibble: pulls an item off someone's table and drops it nearby
 * - eat: eats a loose item (it comes back later)
 * - stare: now and then, stares down someone in the Pen (NAUGHTY), or a free villager it has
 *   cornered (WHAT ARE YOU DOING); the target gets the close-up
 * Players can't walk through the goat.
 */
import { itemById } from '../shared/catalog';
import { AREAS, PEN, WORLD, inRect } from '../shared/map';
import type { Goat, Player, Room } from './state';
import { dropCarried } from './world';

const SPEED = 2.2;
const PESTER_SPEED = 3.4;
const RADIUS = 0.75;
const STARE_SEC = 3.5;
const STARE_EVERY = 70;
const PESTER_EVERY: [number, number] = [9, 16];
const EAT_CHANCE_PER_SEC = 0.03;
const RESPAWN_SEC = 20;
const FREE_STARE_EVERY = 35;

export function makeGoat(): Goat {
  return { x: 4, z: 6, mood: 'wander', target: null, tx: 4, tz: 6, timer: 0, stareCooldown: 40, eatItem: null, pesterCd: 8, freeStareCd: 20 };
}

function walk(g: Goat, dt: number, speed = SPEED): boolean {
  const dx = g.tx - g.x;
  const dz = g.tz - g.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return true;
  g.x += (dx / d) * Math.min(d, speed * dt);
  g.z += (dz / d) * Math.min(d, speed * dt);
  if (inRect(PEN, g.x, g.z, RADIUS)) g.z = Math.min(g.z, PEN.z - PEN.d / 2 - RADIUS);
  return false;
}

/** Nobody walks through the goat. */
export function pushOffGoat(room: Room, p: Player): void {
  if (p.inPen || p.spectator) return;
  const g = room.goat;
  const dx = p.x - g.x;
  const dz = p.z - g.z;
  const d = Math.hypot(dx, dz);
  const min = RADIUS + 0.4;
  if (d < min && d > 1e-4) [p.x, p.z] = [g.x + (dx / d) * min, g.z + (dz / d) * min];
}

function knockLoose(room: Room, p: Player, g: Goat): void {
  const it = room.items.find((i) => i.uid === p.carrying);
  if (!it) return;
  dropCarried(room, p);
  const ang = Math.atan2(p.z - g.z, p.x - g.x) + room.rng.range(-0.6, 0.6);
  [it.x, it.z] = [p.x + Math.cos(ang) * 1.8, p.z + Math.sin(ang) * 1.8];
  room.emit(p.id, { kind: 'toast', text: `The goat knocked your ${itemById.get(it.id)!.name.toLowerCase()} loose!` });
}

export function tickGoat(room: Room, dt: number): void {
  const g = room.goat;
  g.stareCooldown -= dt;
  g.pesterCd -= dt;
  g.freeStareCd -= dt;
  const live = room.phase === 'playing' || room.phase === 'lastcall';

  for (const it of room.items) {
    if (it.gone && room.clock >= it.respawnAt) {
      const a = room.rng.pick(AREAS);
      [it.gone, it.x, it.z] = [false, a.x + room.rng.range(-4, 4), a.z + room.rng.range(-4, 4)];
    }
  }

  if (g.mood === 'stare') {
    g.timer -= dt;
    const t = g.target ? room.players.get(g.target) : null;
    // A Pen stare ends if they leave the Pen; a free stare ends if they walk away.
    if (!t || (!t.inPen && Math.hypot(t.x - g.x, t.z - g.z) > 3.5)) g.timer = 0;
    if (g.timer <= 0) [g.mood, g.target] = ['wander', null];
    return;
  }

  // Stare at the Pen, rarely (or at once, at whoever hit it with a snowball).
  const jailed = [...room.players.values()].filter((p) => p.inPen);
  if (live && jailed.length && g.stareCooldown <= 0 && (g.mood === 'wander' || g.mood === 'pester')) {
    const t = (g.target && room.players.get(g.target)?.inPen ? room.players.get(g.target)! : null) ?? room.rng.pick(jailed);
    g.mood = 'wander';
    g.target = t.id;
    g.tx = Math.max(PEN.x - PEN.w / 2, Math.min(PEN.x + PEN.w / 2, t.x));
    g.tz = PEN.z - PEN.d / 2 - RADIUS - 0.1;
    if (walk(g, dt, PESTER_SPEED)) {
      g.mood = 'stare';
      g.timer = STARE_SEC;
      g.stareCooldown = STARE_EVERY;
      room.emit(t.id, { kind: 'naughty', words: 'NAUGHTY' });
    }
    return;
  }

  if (g.mood === 'pester') {
    g.timer -= dt;
    const t = g.target ? room.players.get(g.target) : null;
    if (!t || t.inPen || g.timer <= 0) return void ([g.mood, g.target] = ['wander', null]);
    // Get in front of them, the way they are heading.
    const len = Math.hypot(t.dx, t.dz);
    [g.tx, g.tz] = len > 0.1 ? [t.x + (t.dx / len) * 1.1, t.z + (t.dz / len) * 1.1] : [t.x, t.z];
    walk(g, dt, PESTER_SPEED);
    const close = Math.hypot(t.x - g.x, t.z - g.z) < RADIUS + 0.6;
    if (close && t.carrying != null) {
      knockLoose(room, t, g);
      g.timer = Math.min(g.timer, 1.5);
    } else if (close && g.freeStareCd <= 0) {
      g.mood = 'stare';
      g.timer = STARE_SEC;
      g.freeStareCd = FREE_STARE_EVERY;
      room.emit(t.id, { kind: 'naughty', words: 'WHAT ARE YOU DOING' });
    }
    return;
  }

  if (g.mood === 'eat') {
    const it = room.items.find((i) => i.uid === g.eatItem);
    if (!it || it.heldBy || it.gone) return void ([g.mood, g.eatItem] = ['wander', null]);
    const st = it.station ? room.stations.find((s) => s.id === it.station) : null;
    [g.tx, g.tz] = st ? [st.x, st.z + 0.9] : [it.x, it.z];
    if (!walk(g, dt)) return;
    if (st) {
      // Nibble: pull it off the table and drop it on the ground.
      st.items = st.items.filter((u) => u !== it.uid);
      if (!st.items.length) st.owner = null;
      [it.station, it.x, it.z] = [null, st.x + room.rng.range(-1.5, 1.5), st.z + 1.4];
    } else {
      it.gone = true;
      it.respawnAt = room.clock + RESPAWN_SEC;
    }
    [g.mood, g.eatItem] = ['wander', null];
    return;
  }

  if (live && g.pesterCd <= 0) {
    g.pesterCd = room.rng.range(...PESTER_EVERY);
    const free = [...room.players.values()].filter((p) => !p.inPen && !p.spectator);
    const carriers = free.filter((p) => p.carrying != null);
    const onTables = room.items.filter((i) => i.station && !i.heldBy);
    const roll = room.rng.next();
    if (roll < 0.25 && onTables.length) [g.mood, g.eatItem] = ['eat', room.rng.pick(onTables).uid];
    else if (free.length) {
      const t = carriers.length && roll < 0.8 ? room.rng.pick(carriers) : room.rng.pick(free);
      [g.mood, g.target, g.timer] = ['pester', t.id, 7];
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
