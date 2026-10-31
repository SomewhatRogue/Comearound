/**
 * Runs: Co-op Trials (three fields, scores add up, best runs go on the leaderboard) and Versus
 * (two teams, one field, own-colour sheep only count in your own pen).
 * Each field: a 3-second intro, play until every sheep is penned and held (or time runs out),
 * then a score card. Score = penned sheep + time left (only if you penned them all) + calm
 * herding (fewer barks per sheep) + the goat, if you managed to pen it.
 */
import { COURSES, VERSUS_FIELDS } from '../shared/field';
import type { FieldScore, Mode } from '../shared/protocol';
import { DOG, HAZARD, SCORE } from '../shared/tuning';
import { isPenned, spawnFlock } from './flock';
import { goatPenned, makeGoats } from './goat';
import { startWind } from './wind';
import { activeDogs, type Room } from './state';

export const INTRO_SEC = 3;
export const CARD_SEC = 6;

export function startRun(room: Room, mode: Mode): void {
  room.mode = mode;
  room.fieldIdx = 0;
  room.fieldCount = mode === 'trials' ? COURSES[room.course].fields.length : VERSUS_FIELDS.length;
  room.fieldScores = [];
  const dogs = room.rng.shuffle(activeDogs(room));
  // Versus: alternate so teams stay even (humans were added first, so they spread across teams).
  dogs.sort((a, b) => Number(!!a.bot) - Number(!!b.bot)).forEach((d, i) => (d.team = mode === 'versus' ? ((i % 2) as 0 | 1) : 0));
  startField(room);
}

export function startField(room: Room): void {
  room.field = room.mode === 'trials' ? COURSES[room.course].fields[room.fieldIdx] : VERSUS_FIELDS[room.fieldIdx];
  room.sheep = spawnFlock(room);
  room.goats = makeGoats(room);
  startWind(room);
  room.holdFor = [0, 0];
  room.doneAt = [null, null];
  const counts = [0, 0];
  for (const d of activeDogs(room)) {
    const starts = room.field.starts.filter((s) => s.team === d.team);
    const s = starts[counts[d.team]++ % starts.length];
    Object.assign(d, { x: s.x + room.rng.range(-0.5, 0.5), z: s.z + room.rng.range(-0.5, 0.5), dx: 0, dz: 0, stamina: DOG.staminaMax, frozen: 0, barkCd: 0, fieldBarks: 0, stillFor: 0 });
  }
  room.phase = 'intro';
  room.timeLeft = INTRO_SEC;
}

/** Sheep a team still has to pen, and how many it has penned. */
export function tally(room: Room, team: 0 | 1 | null): { penned: number; total: number } {
  // Lost sheep (out through a gap) no longer count toward "all in": they cost points instead.
  const mine = room.sheep.filter((s) => (team === null || s.team === team) && !s.lost);
  return { penned: mine.filter((s) => isPenned(room.field, s)).length, total: mine.length };
}

export function tickRound(room: Room, dt: number): void {
  if (room.phase === 'intro') {
    room.timeLeft -= dt;
    if (room.timeLeft <= 0) [room.phase, room.timeLeft] = ['playing', room.field.timeLimit];
    return;
  }
  if (room.phase === 'fieldEnd') {
    room.timeLeft -= dt;
    if (room.timeLeft > 0) return;
    room.fieldIdx++;
    if (room.fieldIdx < room.fieldCount) return startField(room);
    return finishRun(room);
  }
  if (room.phase !== 'playing') return;
  room.timeLeft -= dt;
  const teams: (0 | 1 | null)[] = room.mode === 'versus' ? [0, 1] : [null];
  for (const t of teams) {
    const i = t ?? 0;
    const { penned, total } = tally(room, t);
    room.holdFor[i] = total > 0 && penned === total ? room.holdFor[i] + dt : 0;
    if (room.holdFor[i] >= SCORE.holdToFinish && room.doneAt[i] === null) {
      room.doneAt[i] = Math.max(0, room.timeLeft);
      // Versus: the other team plays on. Tell everyone who's in.
      if (room.mode === 'versus') for (const d of activeDogs(room)) room.emit(d.id, { kind: 'toast', text: d.team === i ? 'All yours are in! Hold the gate, or go make mischief.' : 'They have all theirs in. Hurry!' });
    }
  }
  if (teams.every((t) => room.doneAt[t ?? 0] !== null) || room.timeLeft <= 0) endField(room);
}

export function scoreField(room: Room, team: 0 | 1 | null): FieldScore {
  const { penned, total } = tally(room, team);
  const dogs = activeDogs(room).filter((d) => team === null || d.team === team);
  const barks = dogs.reduce((n, d) => n + d.fieldBarks, 0);
  const all = penned === total && total > 0;
  // Time bonus: the time left when you finished, if they're all still in at the end.
  const doneAt = room.doneAt[team ?? 0];
  const timeBonus = all && doneAt !== null ? Math.round(doneAt * SCORE.perSecondLeft) : 0;
  const calm = Math.max(0, 1 - barks / Math.max(1, total * 1.5));
  const calmBonus = Math.round(SCORE.calmBonus * calm * (penned / Math.max(1, total)));
  const goatBonus = room.goats.filter((g) => goatPenned(room, g, team)).length * SCORE.goatPenned;
  const lost = room.sheep.filter((s) => s.lost && (team === null || s.team === team)).length;
  const lostPenalty = lost * HAZARD.lostPenalty;
  const score = Math.max(0, penned * SCORE.perSheep + timeBonus + calmBonus + goatBonus - lostPenalty);
  return { team, penned, total, timeBonus, calmBonus, goatBonus, lost, lostPenalty, score };
}

export function endField(room: Room): void {
  const teams: (0 | 1 | null)[] = room.mode === 'versus' ? [0, 1] : [null];
  room.fieldScores.push(teams.map((t) => scoreField(room, t)));
  for (const d of room.dogs.values()) [d.dx, d.dz] = [0, 0];
  room.phase = 'fieldEnd';
  room.timeLeft = CARD_SEC;
}

export function finishRun(room: Room): void {
  room.phase = 'results';
  room.timeLeft = 0;
  if (room.mode !== 'trials') return;
  const score = room.fieldScores.reduce((n, f) => n + f[0].score, 0);
  const names = activeDogs(room).map((d) => d.look.name);
  room.leaderboard.push({ names, score, mode: 'trials', course: room.course, when: Date.now() });
  room.leaderboard.sort((a, b) => b.score - a.score);
  // Top 10 per course.
  const seen: Record<string, number> = {};
  room.leaderboard = room.leaderboard.filter((row) => (seen[row.course] = (seen[row.course] ?? 0) + 1) <= 10);
}
