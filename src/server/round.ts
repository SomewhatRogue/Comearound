/**
 * Round rules: a sequence of tasks, accusations at the board, the accuser's choice, the Pen,
 * and the reveal, where every best attempt is scored by how close it came to the ask.
 * The :( player never sees the ask; if nobody calls them out, their points are multiplied.
 */
import { describe } from '../shared/activities';
import { BOARD, REACH, dist } from '../shared/map';
import { SAD_MULTIPLIER, TASK_POINTS, closeness, makeTasks } from '../shared/tasks';
import { activePlayers, type Player, type Room } from './state';
import { endAttempt, makeSpots, placeInSquare, sendToPen } from './world';

/** One pool for everyone sent to the Pen, so the sign never says why they are there. */
export const SIGNS = ['Rabble Rouser', 'Known Goat Associate', 'Ask Me About My Crimes', 'Professional Nuisance', 'Under Review', 'Sus'];

export const POINTS = { catch: 150, knowersWin: 50, meterPerSec: 2 };
export const TASKS_PER_ROUND = 3;

export function sadCountFor(n: number): number {
  return n <= 6 ? 1 : n <= 9 ? 2 : 3;
}

export function startRound(room: Room, roundSec: number): void {
  const players = activePlayers(room);
  room.roundSec = roundSec;
  room.tasks = makeTasks(room.rng, TASKS_PER_ROUND);
  room.taskIdx = 0;
  room.taskTime = roundSec / TASKS_PER_ROUND;
  room.timeLeft = room.taskTime;
  room.spots = makeSpots();
  room.reveal = null;
  const sadIds = new Set(room.rng.shuffle(players.map((p) => p.id)).slice(0, sadCountFor(players.length)));
  for (const p of players) {
    p.role = sadIds.has(p.id) ? 'sad' : 'knower';
    p.accusationUsed = false;
    p.inPen = false;
    p.sign = null;
    p.attempt = null;
    p.basket = [];
    p.best = room.tasks.map(() => null);
    p.last = null;
    p.meter = 0;
    p.meterActive = false;
    p.awaitingChoice = false;
    p.caughtBy = null;
    p.roundStart = p.score;
    if (p.bot) p.bot = { target: null, wait: room.rng.range(0.5, 2), belief: {}, seen: {}, pressAt: null, pick: null };
    placeInSquare(room, p);
  }
  room.phase = 'playing';
}

/** Keep each player's best attempt at the current task. Scored only at the reveal. */
export function recordBest(room: Room, p: Player): void {
  const task = room.tasks[room.taskIdx];
  if (!task) return;
  for (const c of p.basket) if (closeness(task, c) >= closeness(task, p.best[room.taskIdx])) p.best[room.taskIdx] = c;
}

function atBoard(p: Player): boolean {
  return dist(p.x, p.z, BOARD.x, BOARD.z) <= REACH.board;
}

export function accuse(room: Room, p: Player, targetId: string): void {
  const target = room.players.get(targetId);
  // :( players only fake it; accusing is for knowers (Kyle, 2026-10-30).
  if (room.phase !== 'playing' || p.role === 'sad' || p.inPen || p.spectator || p.accusationUsed || !atBoard(p)) return;
  if (!target || target === p || target.inPen || target.spectator) return;
  p.accusationUsed = true;
  if (target.role === 'sad') {
    sendToPen(room, target);
    target.sign = room.rng.pick(SIGNS);
    target.caughtBy = p.id;
    p.score += POINTS.catch;
    p.meterActive = true;
    p.awaitingChoice = true;
    room.emit(p.id, { kind: 'pop', amount: POINTS.catch, label: 'You caught one!' });
    room.emit(p.id, { kind: 'caught' });
  } else {
    sendToPen(room, p);
    p.sign = room.rng.pick(SIGNS);
    room.emit(p.id, { kind: 'wrongAccusation' });
  }
}

export function choose(room: Room, p: Player, endNow: boolean): void {
  if (!p.awaitingChoice) return;
  p.awaitingChoice = false;
  if (endNow) finishRound(room);
}

export function tickRound(room: Room, dt: number): void {
  if (room.phase !== 'playing') return;
  room.timeLeft -= dt;
  for (const p of room.players.values()) if (p.meterActive) p.meter += POINTS.meterPerSec * dt;
  if (room.timeLeft > 0) return;
  nextTask(room);
}

/** Close the current task (attempts in progress end) and open the next, or finish the round. */
export function nextTask(room: Room): void {
  for (const p of activePlayers(room)) {
    endAttempt(room, p, null, true);
    recordBest(room, p);
    p.basket = [];
  }
  room.taskIdx++;
  if (room.taskIdx >= room.tasks.length) return finishRound(room);
  room.timeLeft = room.taskTime;
  const act = room.tasks[room.taskIdx].act;
  for (const p of room.players.values()) room.emit(p.id, { kind: 'toast', text: `Task ${room.taskIdx + 1} of ${room.tasks.length}: ${act === 'paint' ? 'painting' : act}` });
}

export function finishRound(room: Room): void {
  const players = activePlayers(room);
  for (const p of players) {
    p.meterActive = false;
    p.awaitingChoice = false;
    endAttempt(room, p, null, true);
    recordBest(room, p);
    p.basket = [];
  }
  const freeSad = players.filter((p) => p.role === 'sad' && !p.inPen);
  const rows = players.map((p) => {
    const perTask = room.tasks.map((t, i) => {
      const c = p.best[i] ?? null;
      return { desc: c ? describe(c.act, c.attrs) : null, pts: Math.round(TASK_POINTS * closeness(t, c)) };
    });
    let pts = perTask.reduce((a, b) => a + b.pts, 0);
    // The :( player's hidden multiplier, unless someone called them out.
    if (p.role === 'sad' && !p.inPen) pts *= SAD_MULTIPLIER;
    p.score += pts + Math.round(p.meter);
    return { p, perTask };
  });
  const sadWon = freeSad.length > 0;
  if (!sadWon) for (const { p } of rows) if (p.role === 'knower') p.score += POINTS.knowersWin;
  room.reveal = {
    tasks: room.tasks.map((t) => ({ act: t.act, text: t.text })),
    winner: sadWon ? 'sad' : 'knowers',
    rows: rows.map(({ p, perTask }) => ({
      id: p.id, sad: p.role === 'sad', inPen: p.inPen, caughtOut: p.role === 'sad' && p.inPen, perTask, points: p.score - p.roundStart, total: p.score,
    })),
  };
  room.phase = 'results';
  room.timeLeft = 0;
}
