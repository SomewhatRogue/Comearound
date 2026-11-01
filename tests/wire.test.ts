import { describe, expect, it } from 'vitest';
import { GameRoom } from '../src/server/game';
import { publicView } from '../src/server/view';
import { decodeView, encodeView } from '../src/shared/wire';
import { fieldById } from '../src/shared/field';

describe('the live-room snapshot', () => {
  it('round-trips a snapshot and the biggest field fits in the 4 KB presence limit', () => {
    const room = new GameRoom(() => {}, { seed: 3 });
    for (let i = 0; i < 8; i++) {
      room.connect(`c${i}`);
      room.message(`c${i}`, JSON.stringify({ t: 'hello', token: `t${i}`, look: { name: `Wigglebottom${i}x`, breed: 'poodle', coat: 'apricot', collar: '#e0457b', eyes: 'blue' } }));
    }
    room.message('c0', JSON.stringify({ t: 'start', mode: 'trials', fillBots: true, course: 'wild' }));
    // Jump to the biggest pasture, mid-field, with a full run of scores and a full leaderboard.
    for (let t = 0; t < 12; t++) room.tick(0.05);
    const score = { team: null, penned: 23, total: 24, timeBonus: 240, calmBonus: 180, goatBonus: 250, lost: 1, lostPenalty: 75, cleanBonus: 120, score: 2895 };
    room.fieldScores = [[score], [score], [score]];
    room.leaderboard = Array.from({ length: 10 }, (_, i) => ({ names: ['Wigglebottom1', 'Wigglebottom2', 'Wigglebottom3', 'Wigglebottom4'], score: 9000 - i, mode: 'trials' as const, course: 'wild' as const, when: 1793000000000 + i }));
    const big = fieldById('bigsky');
    room.field = big;
    // A squeaky chonk, half caked in mud.
    const first = [...room.dogs.values()][0];
    first.look = { ...first.look, build: 2, voice: 2 };
    first.mud = 0.45;
    const v = publicView(room);
    v.sheep = Array.from({ length: big.flocks.reduce((n, f) => n + f.n, 0) }, (_, i) => ({ id: i, x: -33.33 + i, z: 21.17, rot: -3.14, fear: 0.73, team: null, penned: i % 2 === 0, lost: i === 5 }));
    const json = JSON.stringify(encodeView(v));
    expect(json.length).toBeLessThan(3800);
    const back = decodeView(JSON.parse(json));
    expect(back.phase).toBe(v.phase);
    expect(back.dogs.map((d) => [d.id, d.look, d.team, d.posture, d.bot, d.connected])).toEqual(v.dogs.map((d) => [d.id, d.look, d.team, d.posture, d.bot, d.connected]));
    back.sheep.forEach((s, i) => {
      expect(Math.abs(s.x - v.sheep[i].x)).toBeLessThan(0.03);
      expect([s.penned, s.lost, s.team]).toEqual([v.sheep[i].penned, v.sheep[i].lost, v.sheep[i].team]);
    });
    expect(back.dogs.map((d) => d.mud)).toEqual(v.dogs.map((d) => d.mud));
    expect(back.dogs[0].look.voice).toBe(2);
    expect(back.dogs[1].look.voice).toBeUndefined();
    expect(back.pens).toEqual(v.pens);
    expect(back.fieldScores).toEqual(v.fieldScores);
    expect(back.leaderboard).toEqual(v.leaderboard.slice(0, 5));
    expect(back.goats.map((g) => [g.id, g.mood, g.target])).toEqual(v.goats.map((g) => [g.id, g.mood, g.target]));
  });
});
