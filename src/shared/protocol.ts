/**
 * Every message that crosses the wire. Herding has no secrets, so the public view is most of it;
 * the private view carries your own stamina and cooldowns.
 */
import type { CourseId } from './field';
import type { Breed } from './looks';

export type Phase = 'lobby' | 'intro' | 'playing' | 'fieldEnd' | 'results';
export type Mode = 'trials' | 'versus';
export type Posture = 'walk' | 'sprint' | 'crouch';

export interface Look { name: string; breed: Breed; coat: string; collar: string; eyes: string }

export type ClientMsg =
  | { t: 'hello'; token: string; look: Look }
  /** Movement plus posture; sent when any of it changes. */
  | { t: 'input'; dx: number; dz: number; sprint: boolean; crouch: boolean }
  | { t: 'bark' }
  | { t: 'look'; look: Look }
  | { t: 'start'; mode: Mode; fillBots: boolean; course?: CourseId }
  | { t: 'toLobby' }
  /** Host only: skip the rest of this field. */
  | { t: 'endField' };

export interface DogPub {
  id: string;
  look: Look;
  team: 0 | 1;
  x: number;
  z: number;
  /** Facing, radians (atan2(dx, dz)). */
  rot: number;
  posture: Posture;
  /** Lying down (crouched and still): calms nearby sheep. */
  down: boolean;
  frozen: boolean;
  /** Cowering after a lightning strike. */
  cower: boolean;
  /** Increments on every bark, so clients can play one woof per bark. */
  barks: number;
  bot: boolean;
  connected: boolean;
  spectator: boolean;
}

export interface SheepPub {
  id: number;
  x: number;
  z: number;
  rot: number;
  /** 0 calm to 1 panicked: drives the wobble and the sweat drops. */
  fear: number;
  team: 0 | 1 | null;
  penned: boolean;
  /** Got out through a gap in the fence. */
  lost: boolean;
}

export interface GoatPub {
  id: number;
  x: number;
  z: number;
  rot: number;
  /** stroll: heading for the flock to make trouble; block: loitering in a gateway; escape: leaving a pen. */
  mood: 'wander' | 'bleat' | 'coming' | 'stare' | 'flee' | 'stroll' | 'block' | 'escape' | 'charge';
  /** 0 to 1: how close the goat is to coming over to stare someone down. */
  annoy: number;
  target: string | null;
  bleats: number;
  penned: boolean;
}

export interface FieldScore {
  team: 0 | 1 | null;
  penned: number;
  total: number;
  timeBonus: number;
  calmBonus: number;
  goatBonus: number;
  /** Sheep lost through gaps in the fence, and the points that cost. */
  lost: number;
  lostPenalty: number;
  score: number;
}

export interface LeaderRow { names: string[]; score: number; mode: Mode; course: CourseId; when: number }

export interface PublicView {
  phase: Phase;
  mode: Mode;
  hostId: string | null;
  /** The field being played (or shown in the lobby): look it up with fieldById. */
  fieldId: string;
  /** Which field of the run this is (0-based) and how many fields this run has. */
  fieldIdx: number;
  fieldCount: number;
  timeLeft: number;
  dogs: DogPub[];
  sheep: SheepPub[];
  goats: GoatPub[];
  /** Which trials course this run is (gentle or tricky). */
  course: CourseId;
  /** The direction the wind blows toward (unit x, z) and its strength 0..1. */
  wind: { x: number; z: number; s: number };
  /** Weather, and a counter that ticks up on every lightning strike (with where it struck). */
  weather: { kind: 'clear' | 'rain' | 'storm'; flashes: number; fx: number; fz: number };
  /** Scores per field so far this run; filled in as each field ends. */
  fieldScores: FieldScore[][];
  /** Best runs in this room (and, for solo, this browser keeps its own). */
  leaderboard: LeaderRow[];
}

export interface PrivateView {
  you: string;
  stamina: number;
  barkReady: boolean;
}

export type PrivateEvent =
  | { kind: 'naughty'; words: string }
  | { kind: 'toast'; text: string }
  | { kind: 'pop'; amount: number; label: string };

export type ServerMsg =
  | { t: 'state'; pub: PublicView; me: PrivateView }
  | { t: 'event'; ev: PrivateEvent };
