import { describe, expect, it } from 'vitest';
import { COURSES, TRIALS, VERSUS, inPen, inWater, pondSdf } from '../src/shared/field';
import { GOAT, WEATHER } from '../src/shared/tuning';
import { makeBrain } from '../src/server/bots';
import { isPenned } from '../src/server/flock';
import { GameRoom } from '../src/server/game';
import { tally } from '../src/server/round';
import type { Dog } from '../src/server/state';
import { collide } from '../src/server/physics';

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

  it('in the trials a dog can walk into the pen (to fetch extras out); in versus the gate stays shut to dogs', () => {
    const pen = TRIALS[0].pens[0];
    const walkIn = (mode: 'trials' | 'versus') => {
      const h = harness(1);
      h.say(0, { t: 'start', mode, fillBots: false });
      h.toPlaying();
      const d = h.dog(0);
      const p = h.room.field.pens[0];
      // Stand in front of the gate and walk straight through it.
      const g = { x: p.gate === 'w' ? p.x - p.w / 2 - 2 : p.gate === 'e' ? p.x + p.w / 2 + 2 : p.x, z: p.gate === 'n' ? p.z - p.d / 2 - 2 : p.gate === 's' ? p.z + p.d / 2 + 2 : p.z };
      Object.assign(d, g);
      h.say(0, { t: 'input', dx: Math.sign(p.x - g.x), dz: Math.sign(p.z - g.z), sprint: false, crouch: false });
      h.run(2);
      return inPen(p, d.x, d.z, -0.5);
    };
    expect(pen).toBeTruthy();
    expect(walkIn('trials')).toBe(true);
    expect(walkIn('versus')).toBe(false);
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
    // Nobody barked, sprinted or upset the flock: the whole calm-herding bonus.
    expect(s.calmBonus).toBe(500);
    expect(s.score).toBe(s.penned * 100 + s.timeBonus + s.calmBonus + s.goatBonus);
  });

  it('calm herding pays: a settled flock and soft feet beat sprinting and barking', () => {
    const play = (rough: boolean) => {
      const h = harness(1);
      h.say(0, { t: 'start', mode: 'trials', fillBots: false });
      h.toPlaying();
      const d = h.dog(0);
      d.bot = null;
      const c = { x: h.room.sheep[0].x, z: h.room.sheep[0].z };
      // Rough: sprint circles round the flock, barking. Calm: stalk in a crouch, slowly.
      for (let t = 0; t < 12; t += 0.05) {
        const a = t * 1.2;
        Object.assign(d, { dx: Math.cos(a), dz: Math.sin(a), wantSprint: rough, wantCrouch: !rough });
        if (rough && Math.round(t * 20) % 40 === 0) h.say(0, { t: 'bark' });
        if (!rough) Object.assign(d, { x: c.x - 6 + Math.cos(a) * 0.5, z: c.z + Math.sin(a) * 0.5 });
        h.room.tick(0.05);
      }
      const pen = h.room.field.pens[0];
      h.room.sheep.forEach((s, i) => Object.assign(s, { x: pen.x + ((i % 3) - 1) * 1.2, z: pen.z + (Math.floor(i / 3) - 1) * 1.2, vx: 0, vz: 0 }));
      h.run(3.5);
      return h.room.fieldScores[0][0].calmBonus;
    };
    const calm = play(false);
    const rough = play(true);
    expect(calm).toBeGreaterThan(420);
    expect(rough).toBeLessThan(calm - 150);
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
    // Every sheep within the strike's reach panics (and there are some).
    const { fx, fz } = h.room.weather;
    const near = h.room.sheep.filter((s) => !s.lost && Math.hypot(s.x - fx, s.z - fz) < WEATHER.strikeRadius - 1);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((s) => s.fear > 0.8)).toBe(true);
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

  it('every field is playable: starts, flocks and goats are on dry open ground, inside the fence, clear of pens and obstacles', async () => {
    const { PRACTICE, VERSUS_POOL } = await import('../src/shared/field');
    const fields = [...Object.values(COURSES).flatMap((c) => c.fields), ...VERSUS_POOL, PRACTICE];
    for (const f of fields) {
      for (const p of [...f.starts, ...f.flocks, ...f.goats]) {
        const where = `${f.id} ${p.x},${p.z}`;
        expect(inWater(f, p.x, p.z), where).toBe(false);
        expect(Math.abs(p.x) < f.w / 2 - 0.6 && Math.abs(p.z) < f.d / 2 - 0.6, where).toBe(true);
        // A flock is only where its sheep spread out from (they spawn clear of obstacles); dogs and goats stand right there.
        if (!('n' in p)) for (const o of f.obstacles) expect(Math.hypot(p.x - o.x, p.z - o.z), `${where} vs ${o.kind}`).toBeGreaterThan(o.r + 0.8);
        for (const pen of f.pens) expect(inPen(pen, p.x, p.z), `${where} in a pen`).toBe(false);
      }
      // Every pen fits inside the fence.
      for (const pen of f.pens) expect(Math.abs(pen.x) + pen.w / 2 < f.w / 2 && Math.abs(pen.z) + pen.d / 2 < f.d / 2, `${f.id} pen`).toBe(true);
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

describe('the hub', () => {
  it('a dog that joins trots in from the gate a few steps, then runs free', () => {
    const h = harness(1);
    const d = h.dog(0);
    expect(d.x).toBeLessThan(-25);
    // Steering does nothing while it trots in.
    h.say(0, { t: 'input', dx: 0, dz: 1, sprint: false, crouch: false });
    h.run(0.5);
    expect(Math.abs(d.z - 4)).toBeLessThan(1.5);
    h.run(3);
    expect(d.arrive).toBeUndefined();
    expect(d.x).toBeGreaterThan(-23);
    // Now it's yours: it goes where you steer.
    const z0 = d.z;
    h.say(0, { t: 'input', dx: 0, dz: 1, sprint: false, crouch: false });
    h.run(1.5);
    expect(d.z - z0).toBeGreaterThan(3);
  });

  it('friends arriving get their own spots, not one on top of another', () => {
    const h = harness(3);
    h.run(4);
    const ds = [...h.room.dogs.values()];
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) expect(Math.hypot(ds[i].x - ds[j].x, ds[i].z - ds[j].z)).toBeGreaterThan(1);
  });

  it('the sheep ignore a dog walking in, but not a dog running about', () => {
    const h = harness(1);
    const d = h.dog(0);
    const s = h.room.sheep[0];
    const fearNear = () => {
      for (const o of h.room.sheep) Object.assign(o, { fear: 0, vx: 0, vz: 0 });
      Object.assign(d, { x: s.x - 1.5, z: s.z });
      h.room.tick(0.05);
      return s.fear;
    };
    d.arrive = { x: s.x - 8, z: s.z };
    expect(fearNear()).toBe(0);
    d.arrive = undefined;
    expect(fearNear()).toBeGreaterThan(0);
  });

  it('back from a run, everyone is in the hub together, free to run', () => {
    const h = harness(2);
    h.say(0, { t: 'start', mode: 'trials', fillBots: true });
    h.toPlaying();
    h.say(0, { t: 'toLobby' });
    expect(h.room.phase).toBe('lobby');
    expect(h.room.field.id).toBe('practice');
    for (const d of h.room.dogs.values()) {
      expect(Math.abs(d.x) < h.room.field.w / 2 && Math.abs(d.z) < h.room.field.d / 2).toBe(true);
      expect(d.arrive).toBeUndefined();
    }
  });

  it("a pat counts once per pat (not too fast), and tells the dog's owner who it was", () => {
    const h = harness(2);
    h.run(1);
    const target = h.dog(1).id;
    h.say(0, { t: 'pet', id: target });
    h.say(0, { t: 'pet', id: target });
    expect(h.dog(1).pets).toBe(1);
    h.run(0.6);
    h.say(0, { t: 'pet', id: target });
    expect(h.dog(1).pets).toBe(2);
    expect(h.events(1).filter((e) => e.kind === 'toast' && e.text === 'H0 gave you a pat').length).toBe(2);
    // Mid-run, no pats.
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.toPlaying();
    h.say(0, { t: 'pet', id: target });
    expect(h.dog(1).pets).toBe(2);
  });
});

describe('low fences', () => {
  it('sheep and goats can\'t cross a low fence; dogs hop it', async () => {
    const { collide } = await import('../src/server/physics');
    const f = TRIALS[0];
    const fence = f.lowFences![0];
    const x = fence.a[0];
    const z = (fence.a[1] + fence.b[1]) / 2;
    // Walking east across the fence line, from the west side.
    const from = { x: x - 0.8, z };
    const [sx] = collide(f, x + 0.6, z, 0.5, { from });
    expect(sx).toBeLessThan(x);
    const [dx] = collide(f, x + 0.6, z, 0.45, { from, water: false, hop: true });
    expect(dx).toBeCloseTo(x + 0.6);
  });
});

describe('sheep and walls', () => {
  it('sheep left against the outer fence ease back off it after a few seconds', () => {
    const h = harness(1, 3);
    h.say(0, { t: 'practise', on: true });
    const half = h.room.field.d / 2;
    Object.assign(h.dog(0), { x: h.room.field.w / 2 - 3, z: half - 3 });
    h.room.sheep.forEach((s, i) => Object.assign(s, { x: -6 + i * 0.8, z: -(half - 0.6), vx: 0, vz: 0, fear: 0 }));
    const off = () => h.room.sheep.reduce((n, s) => n + (half + s.z), 0) / h.room.sheep.length;
    const start = off();
    h.run(8);
    expect(off() - start).toBeGreaterThan(1.2);
  });
});

describe('mud and clean dogs', () => {
  it('mud cakes a dog, wading the brook washes it off', () => {
    const h = onField('tricky', 0);
    const d = h.dog(0);
    const m = h.room.field.mud![0];
    Object.assign(d, { x: m.x, z: m.z });
    h.say(0, { t: 'input', dx: 0, dz: 0, sprint: false, crouch: false });
    h.run(2.5);
    expect(d.mud).toBeGreaterThan(0.9);
    // Into the brook (away from the bridges), standing in the water.
    Object.assign(d, { x: -1, z: -12 });
    expect(inWater(h.room.field, d.x, d.z)).toBe(true);
    h.run(2.5);
    expect(d.mud).toBeLessThan(0.05);
  });

  it('the Clean bonus is scored only on fields with mud, and a muddy team loses it', async () => {
    const { scoreField } = await import('../src/server/round');
    const h = onField('tricky', 0);
    const d = h.dog(0);
    d.mud = 0;
    expect(scoreField(h.room, null).cleanBonus).toBe(150);
    d.mud = 1;
    expect(scoreField(h.room, null).cleanBonus).toBe(0);
    const g = harness(1);
    g.say(0, { t: 'start', mode: 'trials', fillBots: false });
    g.toPlaying();
    g.dog(0).mud = 0;
    expect(scoreField(g.room, null).cleanBonus).toBe(0);
  });
});

describe('looks', () => {
  it('voice is kept when given and clamped; chickens are for players only', () => {
    const h = harness(1);
    h.say(0, { t: 'look', look: { name: 'Bok', breed: 'chicken', coat: 'hen-speckled', collar: '#e4572e', eyes: 'brown', build: 2, voice: 7 } });
    const l = h.dog(0).look;
    expect(l.breed).toBe('chicken');
    expect(l.coat).toBe('hen-speckled');
    expect(l.voice).toBe(2);
    // A dog coat on a chicken falls back to the chicken default.
    h.say(0, { t: 'look', look: { name: 'Bok', breed: 'chicken', coat: 'black-white', collar: '#e4572e', eyes: 'brown' } });
    expect(h.dog(0).look.coat).toBe('hen-red');
    expect(h.dog(0).look.voice).toBeUndefined();
    h.say(0, { t: 'start', mode: 'trials', fillBots: true });
    expect([...h.room.dogs.values()].filter((d) => d.bot).every((d) => d.look.breed !== 'chicken')).toBe(true);
  });

  it('a chonky dog barks lower unless you pick its voice yourself', async () => {
    const { barkPitch } = await import('../src/shared/looks');
    const base = { name: 'A', breed: 'corgi' as const, coat: 'x', collar: '#fff', eyes: 'brown' };
    expect(barkPitch({ ...base, build: 2 })).toBeLessThan(barkPitch({ ...base, build: -2 }));
    expect(barkPitch({ ...base, build: 2, voice: 2 })).toBeGreaterThan(barkPitch({ ...base, build: -2 }));
  });
});

describe('agility', () => {
  const pt = (p: { x: number; z: number; dir: number }, along: number, lat: number) => {
    const [ux, uz] = [Math.cos(p.dir), Math.sin(p.dir)];
    return { x: p.x + ux * along - uz * lat, z: p.z + uz * along + ux * lat };
  };

  it('the lobby has a whole course, clear of trees, rocks and the pen, inside the field', async () => {
    const { PRACTICE } = await import('../src/shared/field');
    const pieces = PRACTICE.agility!;
    expect(pieces.map((p) => p.kind)).toEqual(['hurdle', 'tire', 'tunnel', 'weave', 'hurdle', 'hurdle', 'table']);
    for (const p of pieces) {
      expect(Math.abs(p.x)).toBeLessThan(PRACTICE.w / 2 - 3);
      expect(Math.abs(p.z)).toBeLessThan(PRACTICE.d / 2 - 3);
      for (const o of PRACTICE.obstacles) expect(Math.hypot(p.x - o.x, p.z - o.z)).toBeGreaterThan(o.r + 2);
      for (const pen of PRACTICE.pens) expect(Math.abs(p.x - pen.x) > pen.w / 2 + 2 || Math.abs(p.z - pen.z) > pen.d / 2 + 2).toBe(true);
    }
  });

  it('a dog runs the tunnel end to end but cannot get in through its side; sheep stay off the table, dogs hop up', async () => {
    const { collide } = await import('../src/server/physics');
    const { PRACTICE } = await import('../src/shared/field');
    const tunnel = PRACTICE.agility!.find((p) => p.kind === 'tunnel')!;
    // Through it lengthwise, a step at a time.
    let d = pt(tunnel, -2.6, 0);
    for (let i = 0; i <= 52; i++) {
      const to = pt(tunnel, -2.6 + i * 0.1, 0);
      [d.x, d.z] = collide(PRACTICE, to.x, to.z, 0.45, { from: d, water: false, hop: true });
    }
    expect(Math.hypot(d.x - pt(tunnel, 2.6, 0).x, d.z - pt(tunnel, 2.6, 0).z)).toBeLessThan(0.05);
    // From the side: stopped at the wall.
    const side = pt(tunnel, 0, 1.4);
    const [sx, sz] = collide(PRACTICE, tunnel.x, tunnel.z, 0.45, { from: side, water: false, hop: true });
    expect(Math.hypot(sx - tunnel.x, sz - tunnel.z)).toBeGreaterThan(1);
    const table = PRACTICE.agility!.find((p) => p.kind === 'table')!;
    const near = pt(table, -1.4, 0);
    const [hx, hz] = collide(PRACTICE, table.x, table.z, 0.5, { from: near });
    expect(Math.hypot(hx - table.x, hz - table.z)).toBeGreaterThan(0.6);
    const [dx, dz] = collide(PRACTICE, table.x, table.z, 0.45, { from: near, water: false, hop: true });
    expect(Math.hypot(dx - table.x, dz - table.z)).toBeLessThan(0.01);
  });

  it('running the course in order finishes a round with a time; skipping the weave does not', async () => {
    const { PRACTICE } = await import('../src/shared/field');
    const { AgilityRun } = await import('../src/shared/agilityrun');
    const runCourse = (weave: boolean) => {
      const run = new AgilityRun(PRACTICE.agility!);
      let now = 0;
      const took: number[] = [];
      let finished: number | undefined;
      const go = (x: number, z: number, dt = 0.05) => {
        now += dt * 1000;
        const r = run.step(x, z, false, dt, now);
        if (r.took) took.push(r.took);
        if (r.finished !== undefined) finished = r.finished;
      };
      for (const p of PRACTICE.agility!) {
        if (p.kind === 'table') {
          for (let a = -2; a <= 0; a += 0.1) { const q = pt(p, a, 0); go(q.x, q.z); }
          for (let t = 0; t < 30; t++) { const q = pt(p, 0, 0); go(q.x, q.z); }
          continue;
        }
        if (p.kind === 'weave' && !weave) {
          // Straight past, outside the poles.
          for (let a = -3.6; a <= 3.6; a += 0.1) { const q = pt(p, a, 2); go(q.x, q.z); }
          continue;
        }
        for (let a = -3.6; a <= 3.6; a += 0.1) {
          // In and out between the poles: a different side of each.
          const lat = p.kind === 'weave' ? 0.4 * Math.sin(((a + 2.75) / 1.1 + 0.5) * Math.PI) : 0;
          const q = pt(p, a, lat);
          go(q.x, q.z);
        }
      }
      return { took, finished };
    };
    const clean = runCourse(true);
    expect(clean.took).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(clean.finished).toBeGreaterThan(5);
    const skipped = runCourse(false);
    expect(skipped.took).toEqual([1, 2, 3]);
    expect(skipped.finished).toBeUndefined();
  });

  it('a piece out of order says which is next; the tyre counts near its edge (phones), not past it', async () => {
    const { PRACTICE } = await import('../src/shared/field');
    const { AgilityRun } = await import('../src/shared/agilityrun');
    const tire = PRACTICE.agility!.find((p) => p.kind === 'tire')!;
    const through = (lat: number, run = new AgilityRun(PRACTICE.agility!)) => {
      const out: { took?: number; wrong?: number }[] = [];
      for (let a = -2, now = 0; a <= 2; a += 0.1, now += 50) { const q = pt(tire, a, lat); out.push(run.step(q.x, q.z, false, 0.05, now)); }
      return { took: out.find((r) => r.took)?.took, wrong: out.find((r) => r.wrong)?.wrong };
    };
    // The tyre is piece 2: with no round going, taking it says start at 1.
    expect(through(0)).toEqual({ took: undefined, wrong: 1 });
    // Mid-round (piece 1 taken), near the tyre's edge still counts; well past it doesn't.
    const after1 = () => { const r = new AgilityRun(PRACTICE.agility!); const h = PRACTICE.agility![0]; for (let a = -2, now = 0; a <= 2; a += 0.1, now += 50) { const q = pt(h, a, 0); r.step(q.x, q.z, false, 0.05, now); } return r; };
    expect(through(0.85, after1()).took).toBe(2);
    expect(through(1.4, after1()).took).toBeUndefined();
  });

  it('weaving the wrong way (same side of two poles) breaks the weave', async () => {
    const { PRACTICE } = await import('../src/shared/field');
    const { AgilityRun } = await import('../src/shared/agilityrun');
    const weave = PRACTICE.agility!.find((p) => p.kind === 'weave')!;
    const run = new AgilityRun([{ ...weave, n: 1 }]);
    let took = false;
    for (let a = -3.6, now = 0; a <= 3.6; a += 0.1, now += 50) {
      const q = pt(weave, a, 0.4);
      if (run.step(q.x, q.z, false, 0.05, now).took) took = true;
    }
    expect(took).toBe(false);
  });
});

describe('coming back after a crash', () => {
  it('a player back with a new token takes back their own empty seat by name, mid-run; a stranger watches', () => {
    const h = harness(2);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.toPlaying();
    const seat = h.dog(1);
    h.room.disconnect('c1');
    expect(seat.connected).toBe(false);
    // Her browser restarted: a new connection, a new token, the same dog name.
    h.inbox.set('c9', []);
    h.room.connect('c9');
    h.room.message('c9', JSON.stringify({ t: 'hello', token: 'brand-new', look: { name: 'H1', breed: 'pug', eyes: 'blue' } }));
    expect(seat.connected).toBe(true);
    expect(seat.token).toBe('brand-new');
    expect(seat.spectator).toBe(false);
    expect([...h.room.dogs.values()].filter((d) => !d.bot).length).toBe(2);
    // Someone new mid-run still watches until the next run.
    h.inbox.set('c8', []);
    h.room.connect('c8');
    h.room.message('c8', JSON.stringify({ t: 'hello', token: 'stranger', look: { name: 'Zed', breed: 'pug', eyes: 'blue' } }));
    expect([...h.room.dogs.values()].find((d) => d.token === 'stranger')!.spectator).toBe(true);
    // A name match never takes a seat whose player is still there (and talking).
    h.say(0, { t: 'input', dx: 0, dz: 0, sprint: false, crouch: false });
    h.inbox.set('c7', []);
    h.room.connect('c7');
    h.room.message('c7', JSON.stringify({ t: 'hello', token: 'twin', look: { name: 'H0', breed: 'pug', eyes: 'blue' } }));
    expect(h.dog(0).token).toBe('tok0');
  });

  it('a crashed phone whose connection still looks open: its seat goes quiet, and its player takes it back', () => {
    const h = harness(2);
    h.say(0, { t: 'start', mode: 'trials', fillBots: false });
    h.toPlaying();
    const seat = h.dog(1);
    h.say(1, { t: 'input', dx: 0, dz: 0, sprint: false, crouch: false });
    // Just restarted, while the old connection still looks alive: not yet.
    h.inbox.set('c9', []);
    h.room.connect('c9');
    h.room.message('c9', JSON.stringify({ t: 'hello', token: 'restarted', look: { name: 'H1', breed: 'pug', eyes: 'blue' } }));
    expect(seat.token).toBe('tok1');
    expect([...h.room.dogs.values()].find((d) => d.token === 'restarted')!.spectator).toBe(true);
    // The old seat goes quiet (the phone crashed) while she keeps talking: she moves into it, and
    // the old connection lets go of it.
    for (let t = 0; t < 10; t++) {
      h.room.message('c9', JSON.stringify({ t: 'input', dx: 0, dz: 0, sprint: false, crouch: false }));
      h.run(1);
    }
    expect(seat.token).toBe('restarted');
    expect(seat.spectator).toBe(false);
    expect([...h.room.dogs.values()].filter((d) => !d.bot).length).toBe(2);
    expect(h.room.dogOf('c9')).toBe(seat);
    h.room.disconnect('c1');
    expect(seat.connected).toBe(true);
  });
});

describe("carrying on when the host's page restarts", () => {
  it("the host's save picks the run up in a fresh room: same field, clock, flock and scores; players back in their seats", async () => {
    const h = harness(2);
    h.say(0, { t: 'start', mode: 'trials', fillBots: true, course: 'tricky' });
    h.toPlaying();
    h.run(5);
    const save = h.room.save()!;
    expect(save.phase).toBe('playing');
    // The page restarts: a brand-new room, picking up from the save.
    const inbox = new Map<string, string[]>();
    const room = new GameRoom((id, msg) => inbox.get(id)!.push(msg), { seed: 99 });
    room.restore(save, ['tok0']);
    expect(room.phase).toBe('playing');
    expect(room.field.id).toBe(h.room.field.id);
    expect(room.timeLeft).toBeCloseTo(h.room.timeLeft, 1);
    expect(room.sheep.map((s) => [s.x.toFixed(2), s.z.toFixed(2)])).toEqual(h.room.sheep.map((s) => [s.x.toFixed(2), s.z.toFixed(2)]));
    // The host says hello again (token tok0), then the friend (tok1): both back in their own dogs.
    for (const i of [0, 1]) {
      inbox.set(`n${i}`, []);
      room.connect(`n${i}`);
      room.message(`n${i}`, JSON.stringify({ t: 'hello', token: `tok${i}`, look: { name: `H${i}`, breed: 'collie' } }));
    }
    for (const i of [0, 1]) {
      const d = [...room.dogs.values()].find((q) => q.token === `tok${i}`)!;
      expect(d.id).toBe(h.dog(i).id);
      expect(d.spectator).toBe(false);
      expect(d.connected).toBe(true);
    }
    expect([...room.dogs.values()].filter((d) => !d.bot).length).toBe(2);
    // The bots carry on herding.
    expect([...room.dogs.values()].filter((d) => d.bot).length).toBeGreaterThan(0);
    for (let t = 0; t < 40; t++) room.tick(0.05);
    expect(room.phase).toBe('playing');
  });

  it('a friend taking over carries on from the last snapshot it saw; the others get their seats back by name', async () => {
    const { saveFromView } = await import('../src/server/resume');
    const { publicView } = await import('../src/server/view');
    const h = harness(3);
    h.say(0, { t: 'start', mode: 'versus', fillBots: true });
    h.toPlaying();
    h.run(3);
    // Player 1 takes over, from what it saw: its own dog keeps its seat as 'solo'.
    const save = saveFromView(publicView(h.room), h.dog(1).id, 'solo')!;
    const room = new GameRoom(() => {}, { seed: 5 });
    room.restore(save, ['solo']);
    expect(room.mode).toBe('versus');
    expect(room.field.id).toBe(h.room.field.id);
    expect(room.versusFields.length).toBe(3);
    expect(new Set(room.versusFields.map((f) => f.id)).size).toBe(3);
    room.connect('me');
    room.message('me', JSON.stringify({ t: 'hello', token: 'solo', look: { name: 'H1', breed: 'collie' } }));
    expect(room.dogOf('me')!.id).toBe(h.dog(1).id);
    // The old host and the other friend come back with their own tokens: matched by dog name.
    for (const i of [0, 2]) {
      room.connect(`c${i}`);
      room.message(`c${i}`, JSON.stringify({ t: 'hello', token: `tok${i}`, look: { name: `H${i}`, breed: 'collie' } }));
      expect(room.dogOf(`c${i}`)!.id).toBe(h.dog(i).id);
      expect(room.dogOf(`c${i}`)!.spectator).toBe(false);
    }
  });
});

describe('the versus goat', () => {
  it('has a shorter temper in versus: two barks bring it over (trials takes three)', () => {
    const comes = (mode: 'trials' | 'versus') => {
      const h = harness(1);
      h.say(0, { t: 'start', mode, fillBots: false, course: 'tricky' });
      h.toPlaying();
      const d = h.dog(0);
      parkOthers(h, d);
      // Past the goats' grace period at the start of a field.
      h.run(7);
      for (const q of h.room.goats) q.annoy = 0;
      const g = h.room.goats[0];
      for (let i = 0; i < 2; i++) {
        Object.assign(d, { x: g.x + 5, z: g.z, barkCd: 0 });
        h.say(0, { t: 'bark' });
        h.room.tick(0.05);
      }
      h.run(0.5);
      return h.room.goats.some((q) => q.mood === 'coming' || q.mood === 'stare');
    };
    expect(comes('versus')).toBe(true);
    expect(comes('trials')).toBe(false);
  });
});

describe('ponds that overlap make one pond', () => {
  // Two ponds, overlapping: where their shores cross there'd be a spit of grass between them.
  const f = { ...TRIALS[0], obstacles: [{ kind: 'pond' as const, x: -2, z: 0, r: 3 }, { kind: 'pond' as const, x: 2.5, z: 0, r: 3 }] };
  // Just outside both circles, in the notch where they meet.
  const notch = { x: 0.25, z: 2.6 };

  it('the notch where two ponds meet is water, not a spit of grass', () => {
    expect(Math.hypot(notch.x + 2, notch.z) > 3 && Math.hypot(notch.x - 2.5, notch.z) > 3).toBe(true);
    expect(inWater(f, notch.x, notch.z)).toBe(true);
    // Away from where they meet, the shore is each pond's own circle.
    expect(pondSdf(f, -5.5, 0)).toBeCloseTo(0.5, 5);
    expect(inWater(f, -2, -3.2)).toBe(false);
  });

  it('a sheep standing in the notch is pushed out onto the bank, and a dog can wade there', () => {
    const [x, z] = collide(f, notch.x, notch.z, 0.5);
    expect(pondSdf(f, x, z)).toBeGreaterThan(0.49);
    expect(z).toBeGreaterThan(notch.z);
    expect(collide(f, notch.x, notch.z, 0.5, { water: false })).toEqual([notch.x, notch.z]);
  });
});
