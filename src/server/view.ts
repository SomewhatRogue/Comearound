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
      doing: p.attempt?.lane.act ?? null,
      // A catch shows above your head for a few seconds; after that it is your secret.
      last: p.last && room.realClock - p.last.at < 3 ? { act: p.last.act, attrs: p.last.attrs, seq: p.last.seq } : null,
      inPen: p.inPen,
      sign: p.sign,
      spectator: p.spectator,
      connected: p.connected || !!p.bot,
    })),
    taskIdx: room.taskIdx,
    taskCount: room.tasks.length,
    taskAct: room.phase === 'playing' ? room.tasks[room.taskIdx]?.act ?? null : null,
    busy: room.spots.filter((s) => s.busyBy).map((s) => s.id),
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
    task: p.role === 'knower' && room.phase === 'playing' && room.tasks[room.taskIdx] ? { text: room.tasks[room.taskIdx].text, want: room.tasks[room.taskIdx].want } : null,
    basket: p.basket,
    accusationUsed: p.accusationUsed,
    score: p.score,
    meter: Math.floor(p.meter),
    awaitingChoice: p.awaitingChoice,
  };
}
