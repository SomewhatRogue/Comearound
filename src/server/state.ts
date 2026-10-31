/**
 * Server-side state. Everything here is authoritative and lives only on the server.
 */
import type { FieldDef } from '../shared/field';
import type { FieldScore, LeaderRow, Look, Mode, Phase, Posture, PrivateEvent } from '../shared/protocol';
import type { Rng } from '../shared/rng';

export interface BotBrain {
  /** Which side of the flock this bot covers (-1 left, 0 behind, 1 right). */
  flank: number;
  barkCd: number;
  /** Versus: some bots go and make trouble on the other side. */
  raider: boolean;
  /** Stuck detection: where we were, how long we've been wedged, and how long to circle the other way. */
  lastX: number;
  lastZ: number;
  stuckT: number;
  flipT: number;
}

export interface Dog {
  id: string;
  token: string;
  look: Look;
  team: 0 | 1;
  x: number;
  z: number;
  dx: number;
  dz: number;
  rot: number;
  wantSprint: boolean;
  wantCrouch: boolean;
  posture: Posture;
  /** Seconds crouched and still: past a moment, the dog lies down and gives the sheep "eye". */
  stillFor: number;
  stamina: number;
  /** Seconds left frozen under the goat's stare. */
  frozen: number;
  barkCd: number;
  barks: number;
  /** Barks this field, for the calm-herding bonus. */
  fieldBarks: number;
  connected: boolean;
  leftAt: number;
  spectator: boolean;
  bot: BotBrain | null;
}

export interface Sheep {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  rot: number;
  fear: number;
  /** A bark or bleat just went off nearby: keeps them galloping for a moment. */
  startle: number;
  team: 0 | 1 | null;
  /** Each sheep wanders toward its own idea of a nice patch of grass. */
  wx: number;
  wz: number;
  wanderT: number;
}

export interface Goat {
  x: number;
  z: number;
  vx: number;
  vz: number;
  rot: number;
  mood: 'wander' | 'bleat' | 'coming' | 'stare' | 'flee';
  target: string | null;
  timer: number;
  bleatIn: number;
  bleats: number;
  /** Seconds since a dog barked near it: the goat only really moves for barking. */
  annoy: number;
  /** The last dog to bark within earshot: the one the goat comes for. */
  lastBarker: string | null;
  stareCd: number;
  wx: number;
  wz: number;
}

export interface Room {
  phase: Phase;
  mode: Mode;
  clock: number;
  realClock: number;
  timeLeft: number;
  /** Seconds all sheep have been penned (finishes the field early when held). */
  /** Per team: how long every sheep has been in, and the time left when that first held (finished). */
  holdFor: [number, number];
  doneAt: [number | null, number | null];
  hostId: string | null;
  field: FieldDef;
  fieldIdx: number;
  fieldCount: number;
  dogs: Map<string, Dog>;
  sheep: Sheep[];
  goat: Goat | null;
  fieldScores: FieldScore[][];
  leaderboard: LeaderRow[];
  /** Barks and bleats this tick, for the flock to react to. */
  noises: { kind: 'bark' | 'bleat'; x: number; z: number; by: string | null }[];
  rng: Rng;
  emit(dogId: string, ev: PrivateEvent): void;
}

export function activeDogs(room: Room): Dog[] {
  return [...room.dogs.values()].filter((d) => !d.spectator);
}
