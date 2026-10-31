/**
 * The goat. A menace with a schedule:
 * - pester: walks up to someone. Mid-minigame? It spooks them and the attempt fails. Otherwise it
 *   may eat something from their basket, or give them a WHAT ARE YOU DOING close-up.
 * - stare: now and then, stares down someone in the Pen (NAUGHTY).
 * - wander, and stand in the way: players can't walk through the goat.
 */
import { describe } from '../shared/activities';
import { PEN, WORLD, inRect } from '../shared/map';
import type { Goat, Player, Room } from './state';
import { endAttempt } from './world';

const SPEED = 2.2;
const PESTER_SPEED = 3.4;
const RADIUS = 0.75;
const STARE_SEC = 3.5;
const STARE_EVERY = 70;
const FREE_STARE_EVERY = 35;
const PESTER_EVERY: [number, number] = [9, 16];
/** Chance the goat eats from a basket when it reaches someone who isn't busy. */
const NIBBLE_CHANCE = 0.45;

export function makeGoat(): Goat {
  return { x: 4, z: 6, mood: 'wander', target: null, tx: 4, tz: 6, timer: 0, stareCooldown: 40, pesterCd: 8, freeStareCd: 20 };
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
  if (p.inPen || p.spectator || p.attempt) return;
  const g = room.goat;
  const dx = p.x - g.x;
  const dz = p.z - g.z;
  const d = Math.hypot(dx, dz);
  const min = RADIUS + 0.4;
  if (d < min && d > 1e-4) [p.x, p.z] = [g.x + (dx / d) * min, g.z + (dz / d) * min];
}

/** The goat reached its target. Something happens. */
function mischief(room: Room, g: Goat, t: Player): void {
  // Spook someone mid-minigame (not at the easel: choosing colours is not fair game).
  if (t.attempt && t.attempt.lane.act !== 'paint') {
    endAttempt(room, t, null, true);
    room.emit(t.id, { kind: 'knocked' });
    room.emit(t.id, { kind: 'toast', text: 'The goat spooked you. That one did not count.' });
    return;
  }
  if (t.basket.length && room.rng.next() < NIBBLE_CHANCE) {
    const [eaten] = t.basket.splice(room.rng.int(t.basket.length), 1);
    room.emit(t.id, { kind: 'knocked' });
    room.emit(t.id, { kind: 'toast', text: `The goat ate your ${describe(eaten.act, eaten.attrs)}!` });
    return;
  }
  if (g.freeStareCd <= 0) {
    g.mood = 'stare';
    g.timer = STARE_SEC;
    g.freeStareCd = FREE_STARE_EVERY;
    room.emit(t.id, { kind: 'naughty', words: 'WHAT ARE YOU DOING' });
  }
}

export function tickGoat(room: Room, dt: number): void {
  const g = room.goat;
  g.stareCooldown -= dt;
  g.pesterCd -= dt;
  g.freeStareCd -= dt;
  const live = room.phase === 'playing';

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
  if (live && jailed.length && g.stareCooldown <= 0 && g.mood !== 'pester') {
    const marked = g.target ? room.players.get(g.target) : undefined;
    const t = marked?.inPen ? marked : room.rng.pick(jailed);
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
    [g.tx, g.tz] = len > 0.1 ? [t.x + (t.dx / len) * 1.1, t.z + (t.dz / len) * 1.1] : [t.x + 0.9, t.z + 0.4];
    walk(g, dt, PESTER_SPEED);
    if (Math.hypot(t.x - g.x, t.z - g.z) < RADIUS + 0.7) {
      mischief(room, g, t);
      if (g.mood === 'pester') [g.mood, g.target] = ['wander', null];
    }
    return;
  }

  if (live && g.pesterCd <= 0) {
    g.pesterCd = room.rng.range(...PESTER_EVERY);
    const free = [...room.players.values()].filter((p) => !p.inPen && !p.spectator);
    // Busy players are the most fun to bother.
    const busy = free.filter((p) => p.attempt);
    if (free.length) [g.mood, g.target, g.timer] = ['pester', (busy.length && room.rng.next() < 0.6 ? room.rng.pick(busy) : room.rng.pick(free)).id, 7];
    return;
  }

  if (walk(g, dt)) {
    g.tx = room.rng.range(-WORLD.w / 2 + 3, WORLD.w / 2 - 3);
    g.tz = room.rng.range(-WORLD.d / 2 + 3, PEN.z - PEN.d);
  }
}
