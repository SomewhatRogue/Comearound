import { describe, expect, it } from 'vitest';
import { COURSES, TRIALS, VERSUS, inPen, inWater } from '../src/shared/field';
import { GOAT } from '../src/shared/tuning';
import { makeBrain } from '../src/server/bots';
import { isPenned } from '../src/server/flock';
import { GameRoom } from '../src/server/game';
import { tally } from '../src/server/round';
import type { Dog } from '../src/server/state';

/** A room with a fake transport that records every message per connection. */
function harness(humans: number, seed = 7) {
  const inbox = new Map<string, string[]>();
  const room = new GameRoom((id, msg) => inbox.get(id)!.push(msg), { seed });
  for (let i = 0; i < humans; i++) {
    inbox.set(`c${i}`, []);
    room.connect(`c${i}`);
    room.message(`c${i}`, JSON.stringify({ t: 'hello', token: `tok${i}`, look: { name: `H${i}`, breed: 'collie', eyes: 'blue' } }));
  }
  const dog = (i: number) => [...room.dogs.values()].find((d) => d.token === `tok${i}`)!;
  const say = (i: number, m: object) => room.message(`c${i}`, JSON.stringify(m));
  const run = (sec: number) => { for (let t = 0; t < sec; t += 0.05) room.tick(0.05); };
  const toPlaying = () => { while (room.phase !== 'playing') room.tick(0.05); };
  const events = (i: number) => inbox.get(`c${i}`)!.map((m) => JSON.parse(m)).filter((m) => m.t === 'event').map((m) => m.ev);
  return { room, inbox, dog, say, run, toPlaying, events };
}

const centroid = (s: { x: number; z: number }[]) => ({ x: s.reduce((a, o) => a + o.x, 0) / s.length, z: s.reduce((a, o) => a + o.z, 0) / s.length });
/** Park every dog except one far out of the way, so a test sees one dog's effect. */
const parkOthers = (h: ReturnType<typeof harness>, keep: Dog) => { for (const d of h.room.dogs.values()) if (d !== keep) Object.assign(d, { x: -19, z: -14, bot: null, dx: 0, dz: 0 }); };

describe('the flock', () => {
  it('sheep move away from a walking dog, and much less from a dog lying down', () => {
    const away = (crouch: boolean) => {
      const h = harness(1);
      h.say(0, { t: 'start', mode: 'trials', fillBots: false });
      h.toPlaying();
      const d = h.dog(0);
      parkOthers(h, d);
      const c = centroid(h.room.sheep);
      Object.assign(d, { x: c.x - 3.5, z: c.z });
      h.say(0, { t: 'input', dx: 0, dz: 0, sprint: false, crouch });
      h.run(2);
      return centroid(h.room.sheep).x - c.x;
    };
    const walk = away(false);
    const down = away(true);
    expect(walk).toBeGreaterThan(1);
    expect(down).toBeLessThan(walk / 2);
  });

  it('a bark moves the sheep away much faster than quietly waiting, and has a cooldown', () => {
    const moved = (barkIt: boolean) => {
      const h = harness(1);
      h.say(0, { t: 'start', mode: 'trials', fillBots: false });
      h.toPlaying();
      const d = h.dog(0);
      parkOthers(h, d);
      const c = centroid(h.room.sheep);
      Object.assign(d, { x: c.x - 4, z: c.z });
      h.say(0, { t: 'input', dx: 0, dz: 0, sprint: false, crouch: true });
      h.run(1);
      const before = centroid(h.room.sheep).x;
      if (barkIt) {
        h.say(0, { t: 'bark' });
        h.say(0, { t: 'bark' });
        expect(d.barks).toBe(1);
      }
      h.run(1.5);
      return centroid(h.room.sheep).x - before;
    };
    const quiet = moved(false);
    const loud = moved(true);
    expect(loud).toBeGreaterThan(1.2);
    expect(loud).toBeGreaterThan(quiet * 2);
  });

  it('sheep never end up inside a pen fence, even when shoved at it', () => {
    const h = harness(1);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.toPlaying();
    const pen = TRIALS[0].pens[0];
    const s = h.room.sheep[0];
    // Just outside the north fence, running hard at it.
    Object.assign(s, { x: pen.x + 1, z: pen.z - pen.d / 2 - 0.7, vx: 0, vz: 40 });
    h.run(0.5);
    expect(s.z).toBeLessThan(pen.z - pen.d / 2);
    expect(isPenned(h.room.field, s)).toBe(false);
  });

  it('dogs cannot walk into the pen through the gate', () => {
    const h = harness(1);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.toPlaying();
    const d = h.dog(0);
    const pen = TRIALS[0].pens[0];
    Object.assign(d, { x: pen.x - pen.w / 2 - 2, z: pen.z });
    h.say(0, { t: 'input', dx: 1, dz: 0, sprint: false, crouch: false });
    h.run(2);
    expect(inPen(pen, d.x, d.z, -0.5)).toBe(false);
  });
});

describe('the goat', () => {
  it('barking near it annoys it until it comes over, stares, freezes you and says NAUGHTY', () => {
    const h = harness(2);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    // Field 2 (the orchard) has the goat: end field 1 to get there.
    h.room.fieldIdx = 0;
    (h.room as any).phase = 'fieldEnd';
    h.room.timeLeft = 0;
    h.toPlaying();
    const [a, b] = [h.dog(0), h.dog(1)];
    const g = h.room.goats[0];
    Object.assign(a, { x: g.x - 6, z: g.z });
    Object.assign(b, { x: -19, z: -14 });
    g.stareCd = 0;
    for (let i = 0; i < Math.ceil(1 / GOAT.annoyPerBark); i++) {
      h.say(0, { t: 'bark' });
      h.run(1.7);
    }
    let t = 0;
    while (g.mood !== 'stare' && t < 15) { h.run(0.25); t += 0.25; }
    expect(g.mood).toBe('stare');
    expect(g.target).toBe(a.id);
    expect(a.frozen).toBeGreaterThan(0);
    expect(h.events(0).some((e) => e.kind === 'naughty')).toBe(true);
    expect(h.events(1).some((e) => e.kind === 'naughty')).toBe(false);
    // Frozen: input does nothing, and you can't bark.
    const x = a.x;
    h.say(0, { t: 'input', dx: 1, dz: 0, sprint: true, crouch: false });
    h.say(0, { t: 'bark' });
    h.run(0.5);
    expect(a.x).toBeCloseTo(x, 1);
  });
});

describe('goat mischief', () => {
  const orchard = () => {
    const h = harness(1);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.room.fieldIdx = 0;
    (h.room as any).phase = 'fieldEnd';
    h.room.timeLeft = 0;
    h.toPlaying();
    for (const d of h.room.dogs.values()) Object.assign(d, { x: -20, z: 14, bot: null });
    return h;
  };

  it('a goat standing in the gateway keeps sheep out of it', () => {
    const h = orchard();
    const pen = h.room.field.pens[0];
    const g = h.room.goats[0];
    const gt = { x: pen.x, z: pen.z + pen.d / 2 };
    Object.assign(g, { x: gt.x, z: gt.z + 0.9, plan: 'gate', planT: 99, timer: 0, bleatIn: 99 });
    const s = h.room.sheep[0];
    Object.assign(s, { x: gt.x + 0.3, z: gt.z + 1.6, vx: 0, vz: 0 });
    h.run(1.5);
    expect(Math.hypot(s.x - g.x, s.z - g.z)).toBeGreaterThan(1.6);
  });

  it('a penned goat wanders back out, unless a dog lies down at the gate', () => {
    const escaped = (guard: boolean) => {
      const h = orchard();
      const pen = h.room.field.pens[0];
      const g = h.room.goats[0];
      Object.assign(g, { x: pen.x, z: pen.z, planT: 0, bleatIn: 99 });
      const d = h.dog(0);
      if (guard) {
        Object.assign(d, { x: pen.x + 1.8, z: pen.z + pen.d / 2 + 1.2 });
        h.say(0, { t: 'input', dx: 0, dz: 0, sprint: false, crouch: true });
      }
      h.run(12);
      return !inPen(pen, g.x, g.z, 0);
    };
    expect(escaped(false)).toBe(true);
    expect(escaped(true)).toBe(false);
  });
});

describe('fields, scores and bots', () => {
  it('a field ends once every sheep is in and held; you score sheep, time and calm', () => {
    const h = harness(1);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.toPlaying();
    const pen = h.room.field.pens[0];
    h.room.sheep.forEach((s, i) => Object.assign(s, { x: pen.x + ((i % 3) - 1) * 1.2, z: pen.z + (Math.floor(i / 3) - 1) * 1.2, vx: 0, vz: 0 }));
    for (const d of h.room.dogs.values()) Object.assign(d, { x: -15, z: 10, bot: null });
    h.run(3.5);
    expect(h.room.phase).toBe('fieldEnd');
    const s = h.room.fieldScores[0][0];
    expect(s.penned).toBe(s.total);
    expect(s.timeBonus).toBeGreaterThan(0);
    expect(s.calmBonus).toBe(200);
    expect(s.score).toBe(s.penned * 100 + s.timeBonus + s.calmBonus + s.goatBonus);
  });

  it('bots alone clear The Meadow most of the time (it is meant to be a challenge now)', () => {
    let clears = 0;
    let penned = 0;
    for (const seed of [1, 2, 3, 4]) {
      const h = harness(1, seed);
      h.say(0, { t: 'start', mode: 'trials', fillBots: true });
      h.dog(0).bot = makeBrain(0);
      while (h.room.phase !== 'fieldEnd') h.room.tick(0.05);
      const s = h.room.fieldScores[0][0];
      penned += s.penned / s.total;
      if (s.penned === s.total) clears++;
    }
    expect(clears).toBeGreaterThanOrEqual(2);
    expect(penned / 4).toBeGreaterThan(0.8);
  });

  it('versus: teams are even, sheep only count in their own pen, and three fields make a match', () => {
    const h = harness(3);
    h.say(0, { t: 'start', mode: 'versus', fillBots: true });
    const dogs = [...h.room.dogs.values()];
    expect(dogs.length).toBe(4);
    expect(dogs.filter((d) => d.team === 0).length).toBe(2);
    expect(h.room.fieldCount).toBe(3);
    const s = h.room.sheep.find((o) => o.team === 0)!;
    const theirs = VERSUS.pens.find((p) => p.team === 1)!;
    Object.assign(s, { x: theirs.x, z: theirs.z });
    expect(isPenned(h.room.field, s)).toBe(false);
  });
});

describe('joining', () => {
  it('a rejoin with the same token gets the same seat back, mid-run', () => {
    const h = harness(2);
    h.say(0, { t: 'start', mode: 'trials', fillBots: true });
    h.toPlaying();
    const id = h.dog(1).id;
    h.room.disconnect('c1');
    h.run(5);
    h.inbox.set('c9', []);
    h.room.message('c9', JSON.stringify({ t: 'hello', token: 'tok1', look: { name: 'H1' } }));
    expect(h.dog(1).id).toBe(id);
    expect(h.dog(1).connected).toBe(true);
    expect(h.dog(1).spectator).toBe(false);
  });

  it('someone new mid-run watches until the next run', () => {
    const h = harness(1);
    h.say(0, { t: 'start', mode: 'trials', fillBots: true });
    h.inbox.set('c5', []);
    h.room.message('c5', JSON.stringify({ t: 'hello', token: 'late', look: { name: 'Late' } }));
    expect([...h.room.dogs.values()].find((d) => d.token === 'late')!.spectator).toBe(true);
  });

  it('a host who drops in the lobby keeps host within the grace, and hands it on after', () => {
    const h = harness(2);
    expect(h.room.hostId).toBe(h.dog(0).id);
    h.room.disconnect('c0');
    h.run(10);
    expect(h.room.hostId).toBe(h.dog(0).id);
    h.run(25);
    expect(h.room.hostId).toBe(h.dog(1).id);
  });

  it('looks are checked: unknown breeds, coats and eyes fall back to defaults', () => {
    const h = harness(0);
    h.inbox.set('x', []);
    h.room.message('x', JSON.stringify({ t: 'hello', token: 't', look: { name: '<b>Rex</b>', breed: 'dragon', coat: 'plaid', eyes: 'laser', collar: 'x' } }));
    const d = [...h.room.dogs.values()][0];
    expect(d.look.breed).toBe('collie');
    expect(d.look.coat).toBe('black-white');
    expect(d.look.eyes).toBe('brown');
    expect(d.look.name).toBe('bRexb');
  });
});

/** A room on a given course field, everyone parked out of the way. */
function onField(course: 'tricky' | 'wild' | 'challenge', idx: number, seed = 7) {
  const h = harness(1, seed);
  h.say(0, { t: 'start', mode: 'trials', fillBots: false, course });
  if (idx > 0) {
    h.room.fieldIdx = idx - 1;
    (h.room as any).phase = 'fieldEnd';
    h.room.timeLeft = 0;
  }
  h.toPlaying();
  for (const d of h.room.dogs.values()) d.bot = null;
  return h;
}

describe('hazards, wind and weather', () => {
  it('sheep cannot cross a stream except at a bridge; dogs wade it, slowly', () => {
    const h = onField('tricky', 0);
    const f = h.room.field;
    expect(f.id).toBe('brook');
    const s = h.room.sheep[0];
    // West bank, running east hard at open water (between the bridges).
    Object.assign(s, { x: -6, z: 1, vx: 30, vz: 0 });
    h.run(0.6);
    expect(s.x).toBeLessThan(-3);
    const d = h.dog(0);
    Object.assign(d, { x: -7, z: 1 });
    h.say(0, { t: 'input', dx: 1, dz: 0, sprint: false, crouch: false });
    h.run(3);
    expect(d.x).toBeGreaterThan(0);
  });

  it('sheep that wander out through a broken fence are lost, and cost points', () => {
    const h = onField('tricky', 1);
    const f = h.room.field;
    expect(f.gaps?.length).toBeGreaterThan(0);
    const gap = f.gaps![0];
    const s = h.room.sheep[0];
    Object.assign(s, { x: gap.at, z: -f.d / 2 + 1, vx: 0, vz: -3, fear: 1, startle: 1 });
    for (let t = 0; t < 3 && !s.lost; t += 0.05) {
      s.vz = Math.min(s.vz, -3);
      h.room.tick(0.05);
    }
    expect(s.lost).toBe(true);
    (h.room as any).timeLeft = 0;
    h.run(0.1);
    const sc = h.room.fieldScores[0][0];
    expect(sc.lost).toBe(1);
    expect(sc.lostPenalty).toBeGreaterThan(0);
  });

  it('wind carries your scent: sheep downwind of you drift away, sheep upwind do not', () => {
    const drift = (upwind: boolean) => {
      const h = onField('tricky', 2);
      h.room.wind = { x: 1, z: 0, s: 0.8 };
      (h.room.field as any).wind = { dir: 0, strength: 0.8 };
      const d = h.dog(0);
      const s = h.room.sheep[0];
      for (const o of h.room.sheep) if (o !== s) Object.assign(o, { x: -20, z: -15 });
      for (const g of h.room.goats) Object.assign(g, { x: 20, z: -15, bleatIn: 99, planT: 99 });
      Object.assign(s, { x: 0, z: 12, vx: 0, vz: 0, fear: 0 });
      Object.assign(d, { x: upwind ? -8 : 8, z: 12 });
      const x0 = s.x;
      for (let t = 0; t < 2; t += 0.05) {
        h.room.wind = { x: 1, z: 0, s: 0.8 };
        h.room.tick(0.05);
      }
      return s.x - x0;
    };
    // (A lone sheep also drifts back toward the others, so compare the two.)
    expect(drift(true)).toBeGreaterThan(drift(false) + 1.5);
  });

  it('lightning panics every sheep and makes dogs cower', () => {
    const h = onField('wild', 2);
    expect(h.room.weather.kind).toBe('storm');
    h.room.weather.nextFlash = 0;
    h.run(0.1);
    expect(h.room.weather.flashes).toBe(1);
    expect(h.room.sheep.every((s) => s.fear > 0.8 || s.lost)).toBe(true);
    expect(h.dog(0).cower).toBeGreaterThan(0);
  });

  it('sorting: black sheep only count in the black pen', () => {
    const h = onField('wild', 0);
    const f = h.room.field;
    expect(f.sort).toBe(true);
    const white = f.pens.find((p) => p.team === 0)!;
    const s = h.room.sheep.find((o) => o.team === 1)!;
    Object.assign(s, { x: white.x, z: white.z });
    expect(isPenned(f, s)).toBe(false);
    const black = f.pens.find((p) => p.team === 1)!;
    Object.assign(s, { x: black.x, z: black.z });
    expect(isPenned(f, s)).toBe(true);
  });

  it('every course field is playable: starts, flocks and goats are on dry open ground', () => {
    for (const c of Object.values(COURSES)) {
      for (const f of c.fields) {
        for (const p of [...f.starts, ...f.flocks, ...f.goats]) expect(inWater(f, p.x, p.z), `${f.id} ${p.x},${p.z}`).toBe(false);
      }
    }
  });
});

describe('challenge: exact numbers per pen', () => {
  const fill = (h: ReturnType<typeof harness>, pen: number, n: number, from = 0) => {
    const p = h.room.field.pens[pen];
    h.room.sheep.slice(from, from + n).forEach((s, i) => Object.assign(s, { x: p.x + ((i % 3) - 1) * 1.1, z: p.z + (Math.floor(i / 3) - 1) * 1.1, vx: 0, vz: 0 }));
  };

  it('a gate shuts when its pen holds exactly its quota, and opens again if it gets too many', () => {
    const h = onField('challenge', 0);
    const [a] = h.room.field.pens;
    expect(a.quota).toBe(5);
    for (const s of h.room.sheep) Object.assign(s, { x: 0, z: 13 });
    fill(h, 0, 5);
    h.run(0.2);
    expect(h.room.closedPens).toContain(a);
    // A sixth one in (by teleport): the gate opens so the extra can be got out.
    fill(h, 0, 6);
    h.run(0.2);
    expect(h.room.closedPens).not.toContain(a);
  });

  it('only up to each quota counts, and the field ends when every pen is exact', () => {
    const h = onField('challenge', 0);
    for (const s of h.room.sheep) Object.assign(s, { x: 0, z: 13 });
    fill(h, 0, 7);
    h.run(0.2);
    expect(tally(h.room, null)).toEqual({ penned: 5, total: 10 });
    fill(h, 0, 5);
    fill(h, 1, 5, 5);
    h.run(3);
    expect(h.room.phase).toBe('fieldEnd');
    expect(h.room.fieldScores[0][0].penned).toBe(10);
  });
});
