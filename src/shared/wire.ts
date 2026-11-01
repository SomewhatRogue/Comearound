/**
 * A compact snapshot for playing over the artifact page's live room, where each player's shared
 * state must fit in 4 KB. Same PublicView in and out; numbers are rounded (positions to 5 cm,
 * angles to 0.01 rad) and records become arrays. The room's leaderboard is cut to the top 5.
 */
import type { CourseId } from './field';
import type { Breed } from './looks';
import type { DogPub, FieldScore, GoatPub, LeaderRow, Mode, Phase, Posture, PublicView } from './protocol';

const PHASES: Phase[] = ['lobby', 'intro', 'playing', 'fieldEnd', 'results'];
const MODES: Mode[] = ['trials', 'versus'];
const POSTURES: Posture[] = ['walk', 'sprint', 'crouch'];
const MOODS: GoatPub['mood'][] = ['wander', 'bleat', 'coming', 'stare', 'flee', 'stroll', 'block', 'escape', 'charge'];
const WEATHERS: PublicView['weather']['kind'][] = ['clear', 'rain', 'storm'];

const q = (n: number) => Math.round(n * 20);
const uq = (n: number) => n / 20;
const a = (n: number) => Math.round(n * 100);
const ua = (n: number) => n / 100;
const team = (t: 0 | 1 | null) => (t === null ? -1 : t);
const unteam = (t: number): 0 | 1 | null => (t < 0 ? null : (t as 0 | 1));

export type WireView = {
  h: [number, number, string | null, string, number, number, number, CourseId];
  w: number[];
  we: number[];
  p: number[][];
  d: (string | number)[][];
  s: number[];
  g: (number | string | null)[][];
  fs: number[][][];
  lb: (string[] | number | string)[][];
};

export function encodeView(v: PublicView): WireView {
  return {
    h: [PHASES.indexOf(v.phase), MODES.indexOf(v.mode), v.hostId, v.fieldId, v.fieldIdx, v.fieldCount, v.timeLeft, v.course],
    w: [a(v.wind.x), a(v.wind.z), a(v.wind.s)],
    we: [WEATHERS.indexOf(v.weather.kind), v.weather.flashes, q(v.weather.fx), q(v.weather.fz)],
    p: v.pens.map((p) => [p.count, p.quota ?? -1, p.closed ? 1 : 0]),
    d: v.dogs.map((d) => [
      d.id, d.look.name, d.look.breed, d.look.coat, d.look.collar, d.look.eyes, d.team, q(d.x), q(d.z), a(d.rot), POSTURES.indexOf(d.posture),
      (d.down ? 1 : 0) | (d.frozen ? 2 : 0) | (d.cower ? 4 : 0) | (d.bot ? 8 : 0) | (d.connected ? 16 : 0) | (d.spectator ? 32 : 0) | (d.lineup ? 64 : 0), d.barks, d.pets, d.look.build ?? 0,
    ]),
    s: v.sheep.flatMap((s) => [s.id, q(s.x), q(s.z), a(s.rot), Math.round(s.fear * 20), (team(s.team) + 1) | (s.penned ? 4 : 0) | (s.lost ? 8 : 0)]),
    g: v.goats.map((g) => [g.id, q(g.x), q(g.z), a(g.rot), MOODS.indexOf(g.mood), a(g.annoy), g.target, g.bleats, g.penned ? 1 : 0]),
    fs: v.fieldScores.map((f) => f.map((s) => [team(s.team), s.penned, s.total, s.timeBonus, s.calmBonus, s.goatBonus, s.lost, s.lostPenalty, s.score])),
    lb: v.leaderboard.slice(0, 5).map((r) => [r.names.map((n) => n.slice(0, 14)), r.score, MODES.indexOf(r.mode), r.course, r.when]),
  };
}

export function decodeView(w: WireView): PublicView {
  const sheep: PublicView['sheep'] = [];
  for (let i = 0; i + 5 < w.s.length; i += 6) {
    const f = w.s[i + 5];
    sheep.push({ id: w.s[i], x: uq(w.s[i + 1]), z: uq(w.s[i + 2]), rot: ua(w.s[i + 3]), fear: w.s[i + 4] / 20, team: unteam((f & 3) - 1), penned: !!(f & 4), lost: !!(f & 8) });
  }
  return {
    phase: PHASES[w.h[0]] ?? 'lobby',
    mode: MODES[w.h[1]] ?? 'trials',
    hostId: w.h[2],
    fieldId: w.h[3],
    fieldIdx: w.h[4],
    fieldCount: w.h[5],
    timeLeft: w.h[6],
    course: w.h[7],
    wind: { x: ua(w.w[0]), z: ua(w.w[1]), s: ua(w.w[2]) },
    weather: { kind: WEATHERS[w.we[0]] ?? 'clear', flashes: w.we[1], fx: uq(w.we[2]), fz: uq(w.we[3]) },
    pens: w.p.map(([count, quota, closed]) => ({ count, quota: quota < 0 ? null : quota, closed: !!closed })),
    dogs: w.d.map((d): DogPub => {
      const f = d[11] as number;
      return {
        id: d[0] as string,
        look: { name: d[1] as string, breed: d[2] as Breed, coat: d[3] as string, collar: d[4] as string, eyes: d[5] as string, build: (d[14] as number) || 0 },
        team: d[6] as 0 | 1, x: uq(d[7] as number), z: uq(d[8] as number), rot: ua(d[9] as number), posture: POSTURES[d[10] as number] ?? 'walk',
        down: !!(f & 1), frozen: !!(f & 2), cower: !!(f & 4), bot: !!(f & 8), connected: !!(f & 16), spectator: !!(f & 32), barks: d[12] as number,
        lineup: !!(f & 64), pets: (d[13] as number) || 0,
      };
    }),
    sheep,
    goats: w.g.map((g): GoatPub => ({
      id: g[0] as number, x: uq(g[1] as number), z: uq(g[2] as number), rot: ua(g[3] as number), mood: MOODS[g[4] as number] ?? 'wander',
      annoy: ua(g[5] as number), target: g[6] as string | null, bleats: g[7] as number, penned: !!g[8],
    })),
    fieldScores: w.fs.map((f) => f.map((s): FieldScore => ({ team: unteam(s[0]), penned: s[1], total: s[2], timeBonus: s[3], calmBonus: s[4], goatBonus: s[5], lost: s[6], lostPenalty: s[7], score: s[8] }))),
    leaderboard: w.lb.map((r): LeaderRow => ({ names: r[0] as string[], score: r[1] as number, mode: MODES[r[2] as number] ?? 'trials', course: r[3] as CourseId, when: r[4] as number })),
  };
}
