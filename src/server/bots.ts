/**
 * Bots fill empty seats. They only use what a human could see: knower bots know the thing,
 * :( bots read the same public stations everyone sees and guess from them.
 * Bots never accuse in slice 1.
 *
 * Bots act natural: they fill the least telling parts first and hold the most telling part
 * (the one whose items fit the fewest things) until last call, the way a sneaky human would.
 */
import { THINGS, thingById } from '../shared/catalog';
import { filledParts, thingsAccepting } from '../shared/judge';
import { BOARD, REACH, dist } from '../shared/map';
import { guess, lastChance } from './round';
import type { Player, Room, Station } from './state';
import { interact, stationItems } from './world';

function steer(p: Player, x: number, z: number, stopAt = 0.6): boolean {
  const d = dist(p.x, p.z, x, z);
  if (d <= stopAt) {
    p.dx = p.dz = 0;
    return true;
  }
  [p.dx, p.dz] = [(x - p.x) / d, (z - p.z) / d];
  return false;
}

/** Evidence per thing from stations other players are building. */
function readStations(room: Room, p: Player): Record<string, number> {
  const belief: Record<string, number> = {};
  for (const s of room.stations) {
    if (!s.owner || s.owner === p.id) continue;
    const items = stationItems(room, s);
    for (const t of THINGS) if (t.area === s.area) belief[t.id] = (belief[t.id] ?? 0) + filledParts(t, items).filter(Boolean).length;
  }
  return belief;
}

function best(room: Room, belief: Record<string, number>): { id: string; lead: number; top: number } {
  const ranked = THINGS.map((t) => ({ id: t.id, v: belief[t.id] ?? 0 })).sort((a, b) => b.v - a.v || room.rng.next() - 0.5);
  return { id: ranked[0].id, lead: ranked[0].v - ranked[1].v, top: ranked[0].v };
}

function myStation(room: Room, p: Player, area: string): Station | null {
  const owned = room.stations.find((s) => s.owner === p.id);
  if (owned) return owned;
  const free = room.stations.filter((s) => !s.owner && s.area === area);
  free.sort((a, b) => dist(p.x, p.z, a.x, a.z) - dist(p.x, p.z, b.x, b.z));
  return free[0] ?? null;
}

export function tickBot(room: Room, p: Player, dt: number): void {
  const b = p.bot!;
  p.dx = p.dz = 0;
  if (room.phase === 'lastchance' && p.caughtBy && !p.lastChance) {
    return lastChance(room, p, best(room, readStations(room, p)).id);
  }
  if ((room.phase !== 'playing' && room.phase !== 'lastcall') || p.spectator) return;
  if (p.inPen) {
    if (!b.target || steer(p, b.target.x, b.target.z)) b.target = { x: p.x + room.rng.range(-2, 2), z: p.z + room.rng.range(-1.5, 1.5) };
    return;
  }
  b.wait -= dt;
  if (b.wait > 0) return;

  if (p.role === 'sad') {
    b.belief = readStations(room, p);
    const top = best(room, b.belief);
    if (!b.goal || top.top > (b.belief[b.goal] ?? 0)) b.goal = top.top > 0 ? top.id : b.goal ?? room.rng.pick(THINGS).id;
    const settled = room.timeLeft < room.roundSec * 0.6;
    if (room.phase === 'playing' && settled && p.guessesLeft > 0 && top.top >= 5 && top.lead >= 2 && room.rng.next() < 0.04 * dt) b.wantsBoard = true;
    if (b.wantsBoard) {
      if (room.phase !== 'playing') b.wantsBoard = false;
      else if (steer(p, BOARD.x, BOARD.z, REACH.board - 0.4)) {
        b.wantsBoard = false;
        guess(room, p, top.id);
      }
      return;
    }
  }

  const goal = thingById.get(b.goal ?? '');
  if (!goal) return;
  const station = myStation(room, p, goal.area);
  if (!station) return;

  if (p.carrying != null) {
    if (steer(p, station.x, station.z, REACH.station - 0.5)) {
      interact(room, p);
      b.wait = room.rng.range(0.4, 1.5);
    }
    return;
  }
  const have = stationItems(room, station);
  const filled = filledParts(goal, have);
  const telling = (i: number) => Math.max(...goal.parts[i].accepts.map((a) => thingsAccepting(a).length));
  const giveaway = goal.parts.map((_, i) => i).sort((a, b) => telling(a) - telling(b))[0];
  const late = room.phase === 'lastcall' && room.timeLeft <= room.lastCallAt - (Number(p.id.slice(1)) % 4) * 2;
  const open = goal.parts.map((_, i) => i).filter((i) => !filled[i] && (late || i !== giveaway));
  const missing = open.flatMap((i) => goal.parts[i].accepts);
  if (!missing.length) {
    if (!b.target || steer(p, b.target.x, b.target.z)) b.target = { x: station.x + room.rng.range(-3, 3), z: station.z + room.rng.range(-3, 3) };
    return;
  }
  let pick = null as null | { x: number; z: number };
  let bd = Infinity;
  for (const it of room.items) {
    if (it.gone || it.heldBy || it.station || !missing.includes(it.id)) continue;
    const d = dist(p.x, p.z, it.x, it.z);
    if (d < bd) [pick, bd] = [it, d];
  }
  if (!pick) return;
  if (steer(p, pick.x, pick.z, REACH.item - 0.5)) {
    interact(room, p);
    b.wait = room.rng.range(0.3, 1.2);
  }
}
