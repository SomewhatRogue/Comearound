/**
 * Builds what each client may see. The public half is built once per tick and shared;
 * the private half is per player. Nothing secret goes in the public half, ever:
 * no roles, no thing id (until the reveal), no reasons for the Pen.
 */
import type { PrivateView, PublicView } from '../shared/protocol';
import type { Player, Room } from './state';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function publicView(room: Room): PublicView {
  return {
    phase: room.phase,
    hostId: room.hostId,
    timeLeft: Math.max(0, Math.ceil(room.timeLeft)),
    sadCount: [...room.players.values()].filter((p) => p.role === 'sad').length,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      look: p.look,
      x: r2(p.x),
      z: r2(p.z),
      carrying: p.carrying == null ? null : room.items.find((i) => i.uid === p.carrying)?.id ?? null,
      inPen: p.inPen,
      sign: p.sign,
      spectator: p.spectator,
      connected: p.connected || !!p.bot,
    })),
    items: room.items.filter((i) => !i.gone && !i.heldBy).map((i) => ({ uid: i.uid, id: i.id, x: r2(i.x), z: r2(i.z), heldBy: null, station: i.station })),
    stations: room.stations.map((s) => ({ id: s.id, owner: s.owner, items: s.items.map((u) => room.items.find((i) => i.uid === u)!.id) })),
    goat: { x: r2(room.goat.x), z: r2(room.goat.z), mood: room.goat.mood, target: room.goat.target },
    snowballs: room.snowballs.map((s) => ({ id: s.id, x: r2(s.x), z: r2(s.z) })),
    targets: room.targets.map((t) => t.up),
    reveal: room.phase === 'results' ? room.reveal : null,
  };
}

export function privateView(room: Room, p: Player): PrivateView {
  return {
    you: p.id,
    role: p.role,
    thingId: p.role === 'knower' && room.phase !== 'lobby' ? room.thingId : null,
    guessesLeft: p.guessesLeft,
    accusationUsed: p.accusationUsed,
    score: p.score,
    meter: Math.floor(p.meter),
    awaitingChoice: p.awaitingChoice,
    canLastChance: room.phase === 'lastchance' && !!p.caughtBy && !p.lastChance,
  };
}
