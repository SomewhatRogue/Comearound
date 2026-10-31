/**
 * Server-side state. Everything here is authoritative and lives only on the server.
 * Clients get a filtered copy built by view.ts.
 */
import type { AreaId } from '../shared/catalog';
import type { Look, Phase, PrivateEvent } from '../shared/protocol';
import type { Rng } from '../shared/rng';

export interface BotBrain {
  /** Thing the bot is working toward (the real one for knowers, its best guess for :( bots). */
  goal: string | null;
  target: { x: number; z: number } | null;
  wait: number;
  /** :( bots: evidence per thing id, from placements they have watched. */
  belief: Record<string, number>;
  wantsBoard: boolean;
}

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
  carrying: number | null;
  inPen: boolean;
  sign: string | null;
  spectator: boolean;
  connected: boolean;
  /** Real seconds (room clock) when the last connection closed. */
  leftAt: number;
  role: 'knower' | 'sad' | null;
  guessesLeft: number;
  accusationUsed: boolean;
  score: number;
  /** Points earned at this round's station, multiplied at the reveal if it was the real thing. */
  stationPoints: number;
  /** Score when this round started, so the reveal can show points earned this round. */
  roundStart: number;
  meter: number;
  meterActive: boolean;
  awaitingChoice: boolean;
  /** For a jailed :( player: who caught them (they can steal that meter). */
  caughtBy: string | null;
  lastChance: string | null;
  bot: BotBrain | null;
}

export interface Item {
  uid: number;
  id: string;
  x: number;
  z: number;
  heldBy: string | null;
  station: string | null;
  /** Eaten by the goat; comes back at respawnAt. */
  gone: boolean;
  respawnAt: number;
}

export interface Station {
  id: string;
  area: AreaId;
  x: number;
  z: number;
  owner: string | null;
  items: number[];
  /** Thing ids already rewarded at this station, so a finish pays once. */
  finished: Set<string>;
}

export interface Goat {
  x: number;
  z: number;
  mood: 'wander' | 'eat' | 'stare' | 'pester';
  target: string | null;
  tx: number;
  tz: number;
  timer: number;
  stareCooldown: number;
  eatItem: number | null;
  pesterCd: number;
  /** Cooldown on staring down someone who is NOT in the Pen. */
  freeStareCd: number;
}

export interface Snowball { id: number; x: number; z: number; vx: number; vz: number; owner: string; life: number }
export interface PenTarget { x: number; z: number; up: boolean; downUntil: number }

export interface Room {
  phase: Phase;
  clock: number;
  timeLeft: number;
  roundSec: number;
  lastCallAt: number;
  hostId: string | null;
  thingId: string | null;
  players: Map<string, Player>;
  items: Item[];
  stations: Station[];
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
