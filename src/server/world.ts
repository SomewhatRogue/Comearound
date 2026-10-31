/**
 * The physical world: movement, the Pen fence, items and stations. No round rules here.
 */
import { ITEMS, itemById, type AreaId } from '../shared/catalog';
import { fillsAnyPart, thingsMade } from '../shared/judge';
import { AREAS, PEN, PLAYER_RADIUS, PLAYER_SPEED, REACH, SQUARE, STATIONS, WORLD, dist, inRect } from '../shared/map';
import type { Item, Player, Room, Station } from './state';

export const PART_POINTS = 10;
export const FINISH_POINTS = 50;

export function makeStations(): Station[] {
  return STATIONS.map((s) => ({ ...s, owner: null, items: [], finished: new Set<string>() }));
}

/** Copies per item scale with players, kept slightly below demand so key items are a scramble. */
export function spawnItems(room: Room, playerCount: number): Item[] {
  const copies = Math.max(2, Math.ceil(playerCount * 0.6));
  const items: Item[] = [];
  let uid = 1;
  for (const def of ITEMS) {
    const home = AREAS.find((a) => a.id === def.home)!;
    for (let i = 0; i < copies; i++) {
      // Most copies spawn at home, some wander into other areas so nothing is a dead giveaway.
      const area = room.rng.next() < 0.7 ? home : room.rng.pick(AREAS);
      const ang = room.rng.next() * Math.PI * 2;
      const r = room.rng.range(1.5, 6);
      items.push({ uid: uid++, id: def.id, x: area.x + Math.cos(ang) * r, z: area.z + Math.sin(ang) * r, heldBy: null, station: null, gone: false, respawnAt: 0 });
    }
  }
  return items;
}

export function placeInSquare(room: Room, p: Player): void {
  const ang = room.rng.next() * Math.PI * 2;
  p.x = SQUARE.x + Math.cos(ang) * room.rng.range(0, SQUARE.r);
  p.z = SQUARE.z + Math.sin(ang) * room.rng.range(0, SQUARE.r);
}

export function sendToPen(room: Room, p: Player): void {
  dropCarried(room, p);
  p.inPen = true;
  p.x = PEN.x + room.rng.range(-PEN.w / 3, PEN.w / 3);
  p.z = PEN.z + room.rng.range(-PEN.d / 3, PEN.d / 3);
}

export function movePlayer(p: Player, dt: number): void {
  const len = Math.hypot(p.dx, p.dz);
  if (len > 0.01) {
    p.x += (p.dx / Math.max(1, len)) * PLAYER_SPEED * dt;
    p.z += (p.dz / Math.max(1, len)) * PLAYER_SPEED * dt;
  }
  p.x = Math.max(-WORLD.w / 2, Math.min(WORLD.w / 2, p.x));
  p.z = Math.max(-WORLD.d / 2, Math.min(WORLD.d / 2, p.z));
  if (p.inPen) {
    // Jailed: clamp inside the fence.
    p.x = Math.max(PEN.x - PEN.w / 2 + PLAYER_RADIUS, Math.min(PEN.x + PEN.w / 2 - PLAYER_RADIUS, p.x));
    p.z = Math.max(PEN.z - PEN.d / 2 + PLAYER_RADIUS, Math.min(PEN.z + PEN.d / 2 - PLAYER_RADIUS, p.z));
  } else if (inRect(PEN, p.x, p.z, PLAYER_RADIUS)) {
    // Free: pushed out along the shallowest side.
    const ox = PEN.w / 2 + PLAYER_RADIUS - Math.abs(p.x - PEN.x);
    const oz = PEN.d / 2 + PLAYER_RADIUS - Math.abs(p.z - PEN.z);
    if (ox < oz) p.x += Math.sign(p.x - PEN.x || 1) * ox;
    else p.z += Math.sign(p.z - PEN.z || 1) * oz;
  }
}

export function dropCarried(room: Room, p: Player): void {
  if (p.carrying == null) return;
  const it = room.items.find((i) => i.uid === p.carrying);
  if (it) {
    it.heldBy = null;
    it.x = p.x;
    it.z = p.z;
  }
  p.carrying = null;
}

function nearestStation(room: Room, p: Player): Station | null {
  let best: Station | null = null;
  let bd = REACH.station;
  for (const s of room.stations) {
    const d = dist(p.x, p.z, s.x, s.z);
    if (d < bd) [best, bd] = [s, d];
  }
  return best;
}

/** One verb for everything: pick up the nearest item, or put down what you hold. */
export function interact(room: Room, p: Player): void {
  if (p.inPen || p.spectator) return;
  if (p.carrying != null) return putDown(room, p);
  let best: Item | null = null;
  let bd = REACH.item;
  for (const it of room.items) {
    if (it.gone || it.heldBy) continue;
    const s = it.station ? room.stations.find((st) => st.id === it.station)! : null;
    const d = dist(p.x, p.z, s ? s.x : it.x, s ? s.z : it.z);
    if (d < bd) [best, bd] = [it, d];
  }
  if (best) pickUp(room, p, best);
}

/** Take this exact item (bots use this so they never grab the wrong thing by accident). */
export function pickUp(room: Room, p: Player, it: Item): void {
  if (p.carrying != null || it.heldBy || it.gone) return;
  if (it.station) {
    // Taking from any station is allowed. Chaos is a feature.
    const s = room.stations.find((st) => st.id === it.station)!;
    s.items = s.items.filter((u) => u !== it.uid);
    if (s.items.length === 0) s.owner = null;
    it.station = null;
  }
  it.heldBy = p.id;
  p.carrying = it.uid;
}

function putDown(room: Room, p: Player): void {
  const it = room.items.find((i) => i.uid === p.carrying)!;
  const s = nearestStation(room, p);
  const owns = room.stations.find((st) => st.owner === p.id);
  const canUse = s && s.items.length < 4 && (s.owner === p.id || (!s.owner && !owns)) && room.phase !== 'lobby';
  if (!s || !canUse) return dropCarried(room, p);
  const before = s.items.map((u) => room.items.find((i) => i.uid === u)!.id);
  s.owner = p.id;
  s.items.push(it.uid);
  it.heldBy = null;
  it.station = s.id;
  p.carrying = null;
  scorePlacement(room, p, s, before, it.id);
}

function scorePlacement(room: Room, p: Player, s: Station, before: string[], item: string): void {
  if (fillsAnyPart(s.area as AreaId, before, item)) {
    award(room, p, PART_POINTS, `${itemById.get(item)!.name} fits`);
  }
  const after = [...before, item];
  for (const t of thingsMade(s.area, after)) {
    if (s.finished.has(t.id)) continue;
    s.finished.add(t.id);
    award(room, p, FINISH_POINTS, 'Something made!');
  }
}

export function award(room: Room, p: Player, amount: number, label: string): void {
  p.score += amount;
  p.stationPoints += amount;
  room.emit(p.id, { kind: 'pop', amount, label });
}

export function stationItems(room: Room, s: Station): string[] {
  return s.items.map((u) => room.items.find((i) => i.uid === u)!.id);
}
