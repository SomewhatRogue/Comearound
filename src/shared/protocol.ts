/**
 * Every message that crosses the wire. Secrets never appear in PublicView: the thing, other
 * players' roles, why anyone is in the Pen, and whether an accusation was right. A test reads
 * the views a :( player receives and fails if the secret thing id appears anywhere in them.
 */

export type Phase = 'lobby' | 'playing' | 'lastcall' | 'lastchance' | 'results';

export interface Look { color: string; hat: string; name: string }

export type ClientMsg =
  | { t: 'hello'; token: string; look: Look }
  | { t: 'input'; dx: number; dz: number }
  | { t: 'interact' }
  | { t: 'guess'; thingId: string }
  | { t: 'accuse'; targetId: string }
  | { t: 'choice'; endNow: boolean }
  | { t: 'look'; look: Look }
  | { t: 'start'; roundSec: number; fillBots: boolean }
  | { t: 'toLobby' }
  /** Host only: skip to the reveal now. */
  | { t: 'endRound' };

export interface PlayerPub {
  id: string;
  look: Look;
  x: number;
  z: number;
  carrying: string | null;
  inPen: boolean;
  /** Sign worn in the Pen, from one shared pool. Never depends on why they are there. */
  sign: string | null;
  spectator: boolean;
  connected: boolean;
}

export interface ItemPub { uid: number; id: string; x: number; z: number; heldBy: string | null; station: string | null }
export interface StationPub { id: string; owner: string | null; items: string[] }
export interface GoatPub { x: number; z: number; mood: 'wander' | 'eat' | 'stare' | 'pester'; target: string | null }
export interface SnowballPub { id: number; x: number; z: number }

export interface RevealRow {
  id: string;
  sad: boolean;
  inPen: boolean;
  creation: string | null;
  passed: boolean;
  points: number;
  total: number;
}

export interface PublicView {
  phase: Phase;
  hostId: string | null;
  timeLeft: number;
  sadCount: number;
  players: PlayerPub[];
  items: ItemPub[];
  stations: StationPub[];
  goat: GoatPub;
  /** The Pen minigame: snowballs in flight and which crow targets are standing. */
  snowballs: SnowballPub[];
  targets: boolean[];
  /** Filled only in 'results'. */
  reveal: { thingId: string; winner: 'knowers' | 'sad'; rows: RevealRow[] } | null;
}

export interface PrivateView {
  you: string;
  role: 'knower' | 'sad' | null;
  /** Only ever set for knowers. */
  thingId: string | null;
  guessesLeft: number;
  accusationUsed: boolean;
  score: number;
  /** A correct accuser's push-your-luck meter, private to them. */
  meter: number;
  awaitingChoice: boolean;
  canLastChance: boolean;
}

export type PrivateEvent =
  | { kind: 'pop'; amount: number; label: string }
  | { kind: 'caught' }
  | { kind: 'wrongAccusation' }
  | { kind: 'wrongGuess' }
  | { kind: 'naughty'; words: string }
  | { kind: 'bonked' }
  | { kind: 'toast'; text: string };

export type ServerMsg =
  | { t: 'state'; pub: PublicView; me: PrivateView }
  | { t: 'event'; ev: PrivateEvent };
