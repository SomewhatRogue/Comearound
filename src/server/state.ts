/**
 * Server-side state. Everything here is authoritative and lives only on the server.
 * Clients get a filtered copy built by view.ts.
 */
import type { ActId, Attrs, Catch, Lane } from '../shared/activities';
import type { Task } from '../shared/tasks';
import type { Look, Phase, PrivateEvent } from '../shared/protocol';
import type { Rng } from '../shared/rng';

export interface BotBrain {
  target: { x: number; z: number } | null;
  wait: number;
  /** :( bots: how often each attribute value has been seen in others' catches this task. */
  belief: Record<string, number>;
  /** Last catch seq seen per player, so a watched catch is counted once. */
  seen: Record<string, number>;
  /** When to press in the current minigame (ms into the lane), decided at the start. */
  pressAt: number | null;
  /** Painting: the medium, colour and subject the bot will choose. */
  pick: Attrs | null;
}

/** A minigame in progress. */
export interface Attempt { spot: string; lane: Lane; startedAt: number }

export interface Player {
  id: string;
  token: string;
  look: Look;
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Last direction moved: where a snowball goes. */
  fx: number;
  fz: number;
  throwCd: number;
  /** The minigame you are in, if any (you cannot walk while in one). */
  attempt: Attempt | null;
  /** Attempts at the current task. */
  basket: Catch[];
  /** Best attempt per task so far (scored only at the reveal). */
  best: (Catch | null)[];
  last: { act: ActId; attrs: Attrs | null; seq: number; at: number } | null;
  inPen: boolean;
  sign: string | null;
  spectator: boolean;
  connected: boolean;
  /** Real seconds (room clock) when the last connection closed. */
  leftAt: number;
  role: 'knower' | 'sad' | null;
  accusationUsed: boolean;
  score: number;
  /** Score when this round started, so the reveal can show points earned this round. */
  roundStart: number;
  meter: number;
  meterActive: boolean;
  awaitingChoice: boolean;
  /** For a jailed :( player: who caught them. */
  caughtBy: string | null;
  bot: BotBrain | null;
}

export interface Spot { id: string; area: string; act: ActId; x: number; z: number; busyBy: string | null }

export interface Goat {
  x: number;
  z: number;
  mood: 'wander' | 'eat' | 'stare' | 'pester';
  target: string | null;
  tx: number;
  tz: number;
  timer: number;
  stareCooldown: number;
  pesterCd: number;
  /** Cooldown on staring down someone who is NOT in the Pen. */
  freeStareCd: number;
}

export interface Snowball { id: number; x: number; z: number; vx: number; vz: number; owner: string; life: number }
export interface PenTarget { x: number; z: number; up: boolean; downUntil: number }

export interface Room {
  phase: Phase;
  clock: number;
  /** Unscaled seconds: minigames run in real time even when tests speed up the round clock. */
  realClock: number;
  timeLeft: number;
  roundSec: number;
  hostId: string | null;
  tasks: Task[];
  taskIdx: number;
  taskTime: number;
  players: Map<string, Player>;
  spots: Spot[];
  goat: Goat;
  snowballs: Snowball[];
  targets: PenTarget[];
  rng: Rng;
  reveal: import('../shared/protocol').PublicView['reveal'];
  emit(playerId: string, ev: PrivateEvent): void;
}

export function freePlayers(room: Room): Player[] {
  return [...room.players.values()].filter((p) => !p.spectator && !p.inPen);
}

export function activePlayers(room: Room): Player[] {
  return [...room.players.values()].filter((p) => !p.spectator);
}
