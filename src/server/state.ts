/**
 * Server-side state. Everything here is authoritative and lives only on the server.
 */
import type { CourseId, FieldDef, Pen } from '../shared/field';
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
  /** Scared by lightning: cowering, slow, for this many seconds. */
  cower: number;
  /** Test hook (AUTOPILOT): a human seat driven by the bot brain, so probes can watch a real run. */
  auto?: BotBrain | null;
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
  /** Got out through a gap in the fence: gone for this field. */
  lost: boolean;
}

export interface Goat {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  rot: number;
  mood: 'wander' | 'bleat' | 'coming' | 'stare' | 'flee' | 'stroll' | 'block' | 'escape' | 'charge';
  /** What it's up to next, and for how long. */
  plan: 'graze' | 'flock' | 'gate' | 'charge' | 'raid';
  /** Where a charge is headed (straight through the flock and out the other side). */
  cx: number;
  cz: number;
  planT: number;
  /** Pushed around by dogs recently: plans wait. */
  pushedT: number;
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
  goats: Goat[];
  /** Wind: the unit direction it blows toward, and strength 0..1 (gusts included). */
  wind: { x: number; z: number; s: number };
  course: CourseId;
  /** Challenge fields: pens whose gates are shut right now (their count is exactly right). */
  closedPens: Pen[];
  weather: { kind: 'clear' | 'rain' | 'storm'; flashes: number; nextFlash: number; fx: number; fz: number };
  fieldScores: FieldScore[][];
  leaderboard: LeaderRow[];
  /** Barks and bleats this tick, for the flock to react to. */
  noises: { kind: 'bark' | 'bleat' | 'thunder'; x: number; z: number; by: string | null; power?: number }[];
  rng: Rng;
  emit(dogId: string, ev: PrivateEvent): void;
}

export function activeDogs(room: Room): Dog[] {
  return [...room.dogs.values()].filter((d) => !d.spectator);
}
