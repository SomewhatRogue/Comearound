/**
 * The physical world: movement, the Pen fence, and activity spots (start a minigame, judge it).
 * No round rules here.
 */
import { ACTS, CHOSEN, describe, judgePress, makeLane, type Attrs } from '../shared/activities';
import { PEN, PLAYER_RADIUS, PLAYER_SPEED, REACH, SPOTS, SQUARE, WORLD, dist, inRect } from '../shared/map';
import type { Player, Room, Spot } from './state';

export const CATCH_POINTS = 5;
/** Grace after the lane ends before an unanswered attempt counts as a miss (covers lag). */
const PRESS_GRACE_MS = 1500;

export function makeSpots(): Spot[] {
  return SPOTS.map((s) => ({ id: s.id, area: s.area, act: s.act, x: s.x, z: s.z, busyBy: null }));
}

export function placeInSquare(room: Room, p: Player): void {
  const ang = room.rng.next() * Math.PI * 2;
  p.x = SQUARE.x + Math.cos(ang) * room.rng.range(0, SQUARE.r);
  p.z = SQUARE.z + Math.sin(ang) * room.rng.range(0, SQUARE.r);
}

export function sendToPen(room: Room, p: Player): void {
  endAttempt(room, p, null, true);
  p.inPen = true;
  p.x = PEN.x + room.rng.range(-PEN.w / 3, PEN.w / 3);
  p.z = PEN.z + room.rng.range(-PEN.d / 3, PEN.d / 3);
}

export function movePlayer(p: Player, dt: number): void {
  const len = Math.hypot(p.dx, p.dz);
  if (len > 0.01 && !p.attempt) {
    p.x += (p.dx / Math.max(1, len)) * PLAYER_SPEED * dt;
    p.z += (p.dz / Math.max(1, len)) * PLAYER_SPEED * dt;
  }
  p.x = Math.max(-WORLD.w / 2, Math.min(WORLD.w / 2, p.x));
  p.z = Math.max(-WORLD.d / 2, Math.min(WORLD.d / 2, p.z));
  if (p.inPen) {
    p.x = Math.max(PEN.x - PEN.w / 2 + PLAYER_RADIUS, Math.min(PEN.x + PEN.w / 2 - PLAYER_RADIUS, p.x));
    p.z = Math.max(PEN.z - PEN.d / 2 + PLAYER_RADIUS, Math.min(PEN.z + PEN.d / 2 - PLAYER_RADIUS, p.z));
  } else if (inRect(PEN, p.x, p.z, PLAYER_RADIUS)) {
    const ox = PEN.w / 2 + PLAYER_RADIUS - Math.abs(p.x - PEN.x);
    const oz = PEN.d / 2 + PLAYER_RADIUS - Math.abs(p.z - PEN.z);
    if (ox < oz) p.x += Math.sign(p.x - PEN.x || 1) * ox;
    else p.z += Math.sign(p.z - PEN.z || 1) * oz;
  }
}

/** Only the current task's activity is open. */
export function openAct(room: Room): string | null {
  return room.phase === 'playing' ? room.tasks[room.taskIdx]?.act ?? null : null;
}

export function nearestFreeSpot(room: Room, p: Player): Spot | null {
  let best: Spot | null = null;
  let bd = REACH.spot;
  for (const s of room.spots) {
    if (s.act !== openAct(room)) continue;
    const d = dist(p.x, p.z, s.x, s.z);
    if (!s.busyBy && d < bd) [best, bd] = [s, d];
  }
  return best;
}

/** Step up to a spot: the server deals a lane and sends it to you alone. */
export function startAttempt(room: Room, p: Player, spot: Spot | null = nearestFreeSpot(room, p)): boolean {
  if (!spot || spot.busyBy || p.attempt || p.inPen || p.spectator || spot.act !== openAct(room)) return false;
  const lane = makeLane(room.rng, spot.act);
  spot.busyBy = p.id;
  p.attempt = { spot: spot.id, lane, startedAt: room.realClock };
  [p.x, p.z, p.dx, p.dz] = [spot.x, spot.z, 0, 0];
  room.emit(p.id, { kind: 'lane', lane });
  return true;
}

/** Your press, in ms since the lane started on your screen. The server decides what it hit. */
export function press(room: Room, p: Player, at: number, pick?: Attrs): void {
  if (!p.attempt) return;
  const act = p.attempt.lane.act;
  let attrs = judgePress(p.attempt.lane, Number(at));
  const chosen = CHOSEN[act];
  if (chosen && attrs) {
    // Painting: your choices, checked against what the easel offers (default to the first option).
    const picks: Attrs = {};
    for (const k of chosen) picks[k] = ACTS[act].attrs[k].includes(String(pick?.[k])) ? String(pick![k]) : ACTS[act].attrs[k][0];
    attrs = { ...picks, ...attrs };
  }
  endAttempt(room, p, attrs, false);
}

/** Finish an attempt: record the catch (or miss), free the spot, tell everyone what you got. */
export function endAttempt(room: Room, p: Player, attrs: ReturnType<typeof judgePress>, spoiled: boolean): void {
  const a = p.attempt;
  if (!a) return;
  const spot = room.spots.find((s) => s.id === a.spot);
  if (spot) spot.busyBy = null;
  p.attempt = null;
  const act = a.lane.act;
  if (attrs) {
    p.basket.push({ act, attrs });
    p.score += CATCH_POINTS;
    room.emit(p.id, { kind: 'pop', amount: CATCH_POINTS, label: describe(act, attrs) });
  }
  p.last = { act, attrs, seq: (p.last?.seq ?? 0) + 1, at: room.realClock };
  room.emit(p.id, { kind: 'result', act, attrs, spoiled });
}

/** Attempts nobody answered (closed the tab, lag) end as a miss after the lane plus a grace. */
export function tickAttempts(room: Room): void {
  for (const p of room.players.values()) {
    const a = p.attempt;
    // Painting holds the easel while you choose medium, colour and subject, so it gets longer.
    const grace = PRESS_GRACE_MS + (a?.lane.act === 'paint' ? 30000 : 0);
    if (a && (room.realClock - a.startedAt) * 1000 > a.lane.dur + grace) endAttempt(room, p, null, false);
  }
}

export { ACTS };
