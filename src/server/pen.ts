/**
 * The Pen minigame: a snowball fight. Pen players throw (E) the way they last walked.
 * Hit another Pen player: Bonk! Knock down a crow target on the fence: points, and it pops back up.
 * Hit the goat: it notices you. Snowballs stay inside the fence.
 */
import { PEN, PEN_TARGETS, inRect } from '../shared/map';
import type { PenTarget, Player, Room } from './state';

export const PEN_POINTS = { bonk: 5, crow: 10 };
const SPEED = 10;
const LIFE = 1.1;
const COOLDOWN = 0.5;
const TARGET_DOWN_SEC = 4;
let nextId = 1;

/** Three crow targets along the back fence, inside the Pen. */
export function makeTargets(): PenTarget[] {
  return PEN_TARGETS.map((t) => ({ ...t, up: true, downUntil: 0 }));
}

export function throwSnowball(room: Room, p: Player): void {
  if (!p.inPen || p.throwCd > 0) return;
  const len = Math.hypot(p.fx, p.fz) || 1;
  p.throwCd = COOLDOWN;
  room.snowballs.push({ id: nextId++, x: p.x, z: p.z, vx: (p.fx / len) * SPEED, vz: (p.fz / len) * SPEED, owner: p.id, life: LIFE });
}

function pop(room: Room, p: Player, amount: number, label: string): void {
  p.score += amount;
  room.emit(p.id, { kind: 'pop', amount, label });
}

export function tickPen(room: Room, dt: number): void {
  for (const t of room.targets) if (!t.up && room.clock >= t.downUntil) t.up = true;
  const alive = [];
  for (const s of room.snowballs) {
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    const thrower = room.players.get(s.owner);
    let hit = s.life <= 0 || !inRect(PEN, s.x, s.z, 0.3);
    if (!hit && thrower) {
      for (const q of room.players.values()) {
        if (q === thrower || !q.inPen || Math.hypot(q.x - s.x, q.z - s.z) > 0.5) continue;
        pop(room, thrower, PEN_POINTS.bonk, `Bonked ${q.look.name}!`);
        room.emit(q.id, { kind: 'bonked' });
        hit = true;
        break;
      }
    }
    if (!hit && thrower) {
      for (const t of room.targets) {
        if (!t.up || Math.hypot(t.x - s.x, t.z - s.z) > 0.55) continue;
        t.up = false;
        t.downUntil = room.clock + TARGET_DOWN_SEC;
        pop(room, thrower, PEN_POINTS.crow, 'Crow down!');
        hit = true;
        break;
      }
    }
    const g = room.goat;
    if (!hit && thrower && Math.hypot(g.x - s.x, g.z - s.z) < 0.8) {
      // The goat noticed. It will come and stare at you next.
      g.target = thrower.id;
      g.stareCooldown = 0;
      room.emit(thrower.id, { kind: 'toast', text: 'You hit the goat. The goat will remember this.' });
      hit = true;
    }
    if (!hit) alive.push(s);
  }
  room.snowballs = alive;
}
