/**
 * What each client sees. Herding has no secrets, so the public half is nearly everything;
 * the private half is your own stamina and bark cooldown.
 */
import type { PrivateView, PublicView } from '../shared/protocol';
import { isDown } from './dogs';
import { isPenned } from './flock';
import { goatPenned } from './goat';
import { penCounts } from './round';
import type { Dog, Room } from './state';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function publicView(room: Room): PublicView {
  return {
    phase: room.phase,
    mode: room.mode,
    hostId: room.hostId,
    fieldId: room.field.id,
    fieldIdx: Math.min(room.fieldIdx, room.fieldCount - 1),
    fieldCount: room.fieldCount,
    timeLeft: Math.max(0, Math.ceil(room.timeLeft)),
    dogs: [...room.dogs.values()].map((d) => ({
      id: d.id, look: d.look, team: d.team, x: r2(d.x), z: r2(d.z), rot: r2(d.rot), posture: d.posture,
      down: isDown(d), frozen: d.frozen > 0, cower: d.cower > 0, barks: d.barks, bot: !!d.bot, connected: d.connected || !!d.bot, spectator: d.spectator,
    })),
    sheep: room.sheep.map((s) => ({ id: s.id, x: r2(s.x), z: r2(s.z), rot: r2(s.rot), fear: r2(s.fear), team: s.team, penned: !s.lost && isPenned(room.field, s), lost: s.lost })),
    goats: room.goats.map((g) => ({ id: g.id, x: r2(g.x), z: r2(g.z), rot: r2(g.rot), mood: g.mood, annoy: r2(g.annoy), target: g.target, bleats: g.bleats, penned: goatPenned(room, g) })),
    course: room.course,
    pens: penCounts(room).map((c, i) => ({ count: c.count, quota: c.quota, closed: room.closedPens.includes(room.field.pens[i]) })),
    weather: { kind: room.weather.kind, flashes: room.weather.flashes, fx: r2(room.weather.fx), fz: r2(room.weather.fz) },
    wind: { x: r2(room.wind.x), z: r2(room.wind.z), s: r2(room.wind.s) },
    fieldScores: room.fieldScores,
    leaderboard: room.leaderboard,
  };
}

export function privateView(_room: Room, d: Dog): PrivateView {
  return { you: d.id, stamina: Math.round(d.stamina), barkReady: d.barkCd <= 0 };
}
