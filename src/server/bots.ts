/**
 * Bots fill empty seats and only use what a human could know. Knower bots know the ask; :( bots
 * watch the catches everyone can see during the task and copy what seems popular. They play the
 * minigames with a skill roll (they miss, and rarely hit bullseyes or paint perfectly), make a few
 * attempts per task, and never accuse.
 */
import { ACTS, CHOSEN, type Attrs, type Lane } from '../shared/activities';
import { closeness } from '../shared/tasks';
import { REACH, dist } from '../shared/map';
import { throwSnowball } from './pen';
import type { Player, Room } from './state';
import { openAct, press, startAttempt } from './world';

/** Timing error in ms (uniform, +/-). */
const AIM_ERR = { normal: 210, archery: 110, paint: 90 };
const PICKS_RIGHT = 0.85;
const MAX_TRIES = 3;

function steer(p: Player, x: number, z: number, stopAt = 0.4): boolean {
  const d = dist(p.x, p.z, x, z);
  if (d <= stopAt) {
    p.dx = p.dz = 0;
    return true;
  }
  [p.dx, p.dz] = [(x - p.x) / d, (z - p.z) / d];
  return false;
}

/** Choose when to press: aim at something matching `want` (usually), with human-ish error. */
function planPress(room: Room, lane: Lane, want: Attrs): number {
  const right = lane.objs.filter((o) => Object.entries(want).every(([k, v]) => !(k in o.attrs) || o.attrs[k] === v));
  const pool = right.length && room.rng.next() < PICKS_RIGHT ? right : lane.objs;
  const o = room.rng.pick(pool);
  const ideal = o.enter + (1 / lane.speed) * 1000;
  const err = lane.act === 'archery' ? AIM_ERR.archery : lane.act === 'paint' ? AIM_ERR.paint : AIM_ERR.normal;
  return Math.max(0, ideal + room.rng.range(-err, err));
}

/** :( bots: tally the attribute values of catches other players made this task. */
function watch(p: Player, room: Room, act: string): Attrs {
  const b = p.bot!;
  for (const q of room.players.values()) {
    if (q === p || !q.last?.attrs || q.last.act !== act || b.seen[q.id] === q.last.seq) continue;
    b.seen[q.id] = q.last.seq;
    for (const [k, v] of Object.entries(q.last.attrs)) b.belief[`${k}=${v}`] = (b.belief[`${k}=${v}`] ?? 0) + 1;
  }
  const guess: Attrs = {};
  for (const [k, values] of Object.entries(ACTS[act as keyof typeof ACTS].attrs)) {
    const ranked = values.map((v) => ({ v, n: b.belief[`${k}=${v}`] ?? 0 })).sort((x, y) => y.n - x.n || room.rng.next() - 0.5);
    guess[k] = ranked[0].v;
  }
  return guess;
}

export function tickBot(room: Room, p: Player, dt: number): void {
  const b = p.bot!;
  p.dx = p.dz = 0;
  if (room.phase !== 'playing' || p.spectator) return;

  // Mid-minigame: press when the planned moment comes (painting brings its picks).
  if (p.attempt) {
    if (b.pressAt != null && (room.realClock - p.attempt.startedAt) * 1000 >= b.pressAt) {
      press(room, p, b.pressAt, b.pick ?? undefined);
      b.pressAt = null;
      b.wait = room.rng.range(0.6, 1.8);
    }
    return;
  }
  if (p.inPen) {
    if (!b.target || steer(p, b.target.x, b.target.z)) b.target = { x: p.x + room.rng.range(-2, 2), z: p.z + room.rng.range(-1.5, 1.5) };
    if (room.rng.next() < 0.5 * dt) throwSnowball(room, p);
    return;
  }
  b.wait -= dt;
  if (b.wait > 0) return;

  const task = room.tasks[room.taskIdx];
  const act = openAct(room);
  if (!task || !act) return;
  // A :( bot hangs back at the start of a task to watch what others catch.
  const watching = p.role === 'sad' && room.timeLeft > room.taskTime * 0.8;
  const want = p.role === 'knower' ? task.want : watch(p, room, act);
  const nailed = p.role === 'knower' && p.basket.some((c) => closeness(task, c) >= 1);
  if (watching || nailed || p.basket.length >= MAX_TRIES) {
    if (!b.target || steer(p, b.target.x, b.target.z)) b.target = { x: room.rng.range(-14, 14), z: room.rng.range(-12, 8) };
    return;
  }
  const spot = room.spots.filter((s) => s.act === act && !s.busyBy).sort((a, c) => dist(p.x, p.z, a.x, a.z) - dist(p.x, p.z, c.x, c.z))[0];
  if (!spot) return;
  if (steer(p, spot.x, spot.z, REACH.spot - 0.3) && startAttempt(room, p, spot)) {
    b.pressAt = planPress(room, p.attempt!.lane, want);
    const chosen = CHOSEN[act as keyof typeof CHOSEN];
    b.pick = chosen ? Object.fromEntries(chosen.map((k) => [k, want[k]])) : null;
  }
}
