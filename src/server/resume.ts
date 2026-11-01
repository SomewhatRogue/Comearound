/**
 * Keeping a game going when its host's page goes away. The game runs in the host's browser, so
 * when that page restarts (a crash, a reload) the room would start over in the lobby. Instead:
 * - The host saves the room every couple of seconds (`saveRoom`); its page coming back to the same
 *   room picks up where it was (`restoreRoom`).
 * - A friend who takes over a room whose host has gone builds the same save from the last snapshot
 *   it saw (`saveFromView`), and carries on from there.
 * Players get their seats back with their tokens (the host's own save has them) or, after a
 * takeover, by their dog's name (the room's usual way back in after a crash).
 */
import { COURSES, VERSUS_POOL, fieldById, type CourseId } from '../shared/field';
import type { FieldScore, LeaderRow, Look, Mode, PublicView } from '../shared/protocol';
import { DOG } from '../shared/tuning';
import { makeBrain } from './bots';
import { startField } from './round';
import type { Dog, Room } from './state';

export interface DogSave { id: string; token: string; look: Look; team: 0 | 1; x: number; z: number; rot: number; bot: boolean; spectator: boolean }
export interface RoomSave {
  v: 1;
  /** When it was taken (ms since 1970): an old save isn't worth resuming. */
  at: number;
  phase: 'intro' | 'playing' | 'fieldEnd' | 'results';
  mode: Mode;
  course: CourseId;
  fieldIdx: number;
  fieldCount: number;
  fieldId: string;
  /** The versus match's fields, when known (a takeover only knows the current one). */
  versusIds?: string[];
  timeLeft: number;
  fieldScores: FieldScore[][];
  leaderboard: LeaderRow[];
  dogs: DogSave[];
  sheep: { x: number; z: number; rot: number; team: 0 | 1 | null; lost: boolean }[];
  goats: { x: number; z: number }[];
}

/** Saves older than this aren't resumed: the friends have moved on. */
export const SAVE_FRESH_MS = 3 * 60_000;

type Resumable = Room & { nextId: number; hostId: string | null };

/** The host's save of its own room (with every player's token). Null in the lobby: nothing to keep. */
export function saveRoom(room: Room): RoomSave | null {
  if (room.phase === 'lobby') return null;
  return {
    v: 1, at: Date.now(), phase: room.phase, mode: room.mode, course: room.course, fieldIdx: room.fieldIdx, fieldCount: room.fieldCount,
    fieldId: room.field.id, versusIds: room.versusFields.map((f) => f.id), timeLeft: room.timeLeft, fieldScores: room.fieldScores, leaderboard: room.leaderboard,
    dogs: [...room.dogs.values()].map((d) => ({ id: d.id, token: d.token, look: d.look, team: d.team, x: d.x, z: d.z, rot: d.rot, bot: !!d.bot || d.token.startsWith('bot-'), spectator: d.spectator })),
    sheep: room.sheep.map((s) => ({ x: s.x, z: s.z, rot: s.rot, team: s.team, lost: s.lost })),
    goats: room.goats.map((g) => ({ x: g.x, z: g.z })),
  };
}

/**
 * A friend taking over: the save, from the last snapshot it saw. Nobody's token is in a snapshot,
 * so every player comes back by name; `me` (the friend's own dog) keeps its seat as `myToken`.
 */
export function saveFromView(pub: PublicView, me: string, myToken: string): RoomSave | null {
  if (pub.phase === 'lobby') return null;
  return {
    v: 1, at: Date.now(), phase: pub.phase, mode: pub.mode, course: pub.course, fieldIdx: pub.fieldIdx, fieldCount: pub.fieldCount, fieldId: pub.fieldId,
    timeLeft: pub.timeLeft, fieldScores: pub.fieldScores, leaderboard: pub.leaderboard,
    dogs: pub.dogs.map((d) => ({ id: d.id, token: d.id === me ? myToken : d.bot ? `bot-${d.id}` : `back-${d.id}`, look: d.look, team: d.team, x: d.x, z: d.z, rot: d.rot, bot: d.bot, spectator: d.spectator })),
    sheep: pub.sheep.map((s) => ({ x: s.x, z: s.z, rot: s.rot, team: s.team, lost: s.lost })),
    goats: pub.goats.map((g) => ({ x: g.x, z: g.z })),
  };
}

/**
 * Pick the game up from a save: the same field, clock, scores, flock, goats and dogs. Players
 * other than `connected` (the tokens already here, i.e. the host's own) start away, so their seats
 * are held for them; bots carry on herding.
 */
export function restoreRoom(room: Resumable, save: RoomSave, connected: string[] = []): void {
  room.mode = save.mode;
  room.course = save.course in COURSES ? save.course : 'gentle';
  room.fieldIdx = save.fieldIdx;
  room.fieldCount = save.fieldCount;
  if (save.mode === 'versus') {
    const known = (save.versusIds ?? []).map((id) => VERSUS_POOL.find((f) => f.id === id)).filter((f) => !!f);
    // A takeover only knows this field: the rest of the match is drawn from the others.
    const others = room.rng.shuffle(VERSUS_POOL.filter((f) => f.id !== save.fieldId));
    room.versusFields = known.length === save.fieldCount ? known : Array.from({ length: save.fieldCount }, (_, i) => (i === save.fieldIdx ? fieldById(save.fieldId) : others[i % others.length]));
  }
  room.fieldScores = save.fieldScores;
  room.leaderboard = save.leaderboard;
  // The dogs, as they were (startField below places them at the starts; put them back after).
  room.dogs.clear();
  for (const s of save.dogs) {
    const d: Dog = {
      id: s.id, token: s.token, look: s.look, team: s.team, x: s.x, z: s.z, dx: 0, dz: 0, rot: s.rot, wantSprint: false, wantCrouch: false, posture: 'walk', stillFor: 0,
      stamina: DOG.staminaMax, frozen: 0, cower: 0, barkCd: 0, barks: 0, fieldBarks: 0, connected: s.bot || connected.includes(s.token), leftAt: room.realClock, heardAt: room.realClock,
      spectator: s.spectator, bot: null, practising: false, pets: 0, petAt: -9, mud: 0,
    };
    room.dogs.set(d.id, d);
  }
  room.nextId = Math.max(room.nextId, ...save.dogs.map((d) => Number(d.id.replace(/\D/g, '')) + 1 || 0));
  room.hostId = null;
  // The field afresh (pens, wind, weather, goats' moods), then everything back where it was.
  startField(room);
  for (const s of save.dogs) Object.assign(room.dogs.get(s.id)!, { x: s.x, z: s.z, rot: s.rot });
  if (room.sheep.length === save.sheep.length) save.sheep.forEach((s, i) => Object.assign(room.sheep[i], { x: s.x, z: s.z, rot: s.rot, team: s.team, lost: s.lost, wx: s.x, wz: s.z }));
  if (room.goats.length === save.goats.length) save.goats.forEach((g, i) => Object.assign(room.goats[i], { x: g.x, z: g.z, wx: g.x, wz: g.z }));
  room.phase = save.phase;
  room.timeLeft = save.timeLeft;
  // Bots back at work, flanking as before.
  for (const team of [0, 1] as const) {
    const bots = [...room.dogs.values()].filter((d) => d.team === team && d.token.startsWith('bot-'));
    bots.forEach((d, i) => (d.bot = makeBrain([-1, 1, 0, -0.5, 0.5][i % 5], save.mode === 'versus' && i === 2)));
  }
}
