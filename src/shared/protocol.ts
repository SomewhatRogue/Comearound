/**
 * Every message that crosses the wire. Secrets never appear in PublicView: the ask, other players'
 * roles, why anyone is in the Pen, whether an accusation was right, anyone's score this round, and
 * what anyone has in their basket. What everyone DOES see: the current activity, what each player
 * is doing, and what they just caught (or painted).
 */
import type { ActId, Attrs, Catch, Lane } from './activities';

export type Phase = 'lobby' | 'playing' | 'results';

export interface Look { color: string; hat: string; name: string }

export type ClientMsg =
  | { t: 'hello'; token: string; look: Look }
  | { t: 'input'; dx: number; dz: number }
  /** Start the activity at the spot you are standing at, or throw a snowball in the Pen. */
  | { t: 'interact' }
  /** Press during a minigame: ms since the lane started on your screen. Painting adds your picks. */
  | { t: 'press'; at: number; pick?: Attrs }
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
  /** The activity this player is in the middle of, for everyone to see. */
  doing: ActId | null;
  /** What they just caught (attrs null for a miss), shown above their head for a moment. */
  last: { act: ActId; attrs: Attrs | null; seq: number } | null;
  inPen: boolean;
  /** Sign worn in the Pen, from one shared pool. Never depends on why they are there. */
  sign: string | null;
  spectator: boolean;
  connected: boolean;
}

export interface GoatPub { x: number; z: number; mood: 'wander' | 'eat' | 'stare' | 'pester'; target: string | null }
export interface SnowballPub { id: number; x: number; z: number }

export interface RevealRow {
  id: string;
  sad: boolean;
  inPen: boolean;
  /** Called out correctly: a :( player who loses their multiplier. */
  caughtOut: boolean;
  /** Best attempt per task: what it was and the points it scored. */
  perTask: { desc: string | null; pts: number }[];
  points: number;
  total: number;
}

export interface PublicView {
  phase: Phase;
  hostId: string | null;
  timeLeft: number;
  sadCount: number;
  /** Which task we are on (0-based), of how many, and its activity. Everyone sees the activity. */
  taskIdx: number;
  taskCount: number;
  taskAct: ActId | null;
  players: PlayerPub[];
  /** Which activity spots are in use, by spot id. */
  busy: string[];
  goat: GoatPub;
  /** The Pen minigame: snowballs in flight and which crow targets are standing. */
  snowballs: SnowballPub[];
  targets: boolean[];
  /** Filled only in 'results'. */
  reveal: { tasks: { act: ActId; text: string }[]; winner: 'knowers' | 'sad'; rows: RevealRow[] } | null;
}

export interface PrivateView {
  you: string;
  role: 'knower' | 'sad' | null;
  /** The current ask. Only ever set for knowers. */
  task: { text: string; want: Attrs } | null;
  /** Your attempts at the current task. Private: others only saw each one as it happened. */
  basket: Catch[];
  accusationUsed: boolean;
  score: number;
  /** A correct accuser's push-your-luck meter, private to them. */
  meter: number;
  awaitingChoice: boolean;
}

export type PrivateEvent =
  | { kind: 'pop'; amount: number; label: string }
  /** Your minigame starts now: draw this lane and report your press time. */
  | { kind: 'lane'; lane: Lane }
  /** Your minigame result. */
  | { kind: 'result'; act: ActId; attrs: Attrs | null; spoiled: boolean }
  | { kind: 'caught' }
  | { kind: 'wrongAccusation' }
  | { kind: 'naughty'; words: string }
  | { kind: 'bonked' }
  | { kind: 'knocked' }
  | { kind: 'toast'; text: string };

export type ServerMsg =
  | { t: 'state'; pub: PublicView; me: PrivateView }
  | { t: 'event'; ev: PrivateEvent };
