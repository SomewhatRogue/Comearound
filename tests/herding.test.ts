import { describe, expect, it } from 'vitest';
import { COURSES, TRIALS, VERSUS, inPen, inWater } from '../src/shared/field';
import { GOAT, WEATHER } from '../src/shared/tuning';
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

describe('the lobby pack', () => {
  const row = (h: ReturnType<typeof harness>) => [...h.room.dogs.values()].map((d) => [+d.x.toFixed(1), +d.z.toFixed(1)]);

  it('dogs walk to their own spot in the row and stand facing the camera', () => {
    const h = harness(3);
    h.run(8);
    const spots = row(h);
    const xs = spots.map(([x]) => x).sort((p, q) => p - q);
    expect(xs[1] - xs[0]).toBeGreaterThan(1.1);
    expect(xs[2] - xs[1]).toBeGreaterThan(1.1);
    expect(spots.every(([, z]) => Math.abs(z - 8.5) < 0.15)).toBe(true);
    for (const d of h.room.dogs.values()) expect(d.rot).toBe(0);
    // Steering does nothing while you stand in the row.
    h.say(0, { t: 'input', dx: 1, dz: 0, sprint: false, crouch: false });
    h.run(1);
    expect(row(h)).toEqual(spots);
  });

  it('practising sets your dog free; stopping walks it back to its spot', () => {
    const h = harness(2);
    h.run(8);
    const home = { x: h.dog(0).x, z: h.dog(0).z };
    h.say(0, { t: 'practise', on: true });
    h.say(0, { t: 'input', dx: 0, dz: -1, sprint: false, crouch: false });
    h.run(1.5);
    expect(home.z - h.dog(0).z).toBeGreaterThan(5);
    h.say(0, { t: 'practise', on: false });
    h.run(6);
    expect(Math.hypot(h.dog(0).x - home.x, h.dog(0).z - home.z)).toBeLessThan(0.2);
  });

  it('the sheep ignore dogs in the row, but not a practising dog', () => {
    const h = harness(1);
    h.run(8);
    const d = h.dog(0);
    const s = h.room.sheep[0];
    // Put the dog right next to a sheep: standing in the row, nothing happens.
    const fearNear = () => {
      for (const o of h.room.sheep) Object.assign(o, { fear: 0, vx: 0, vz: 0 });
      Object.assign(d, { x: s.x - 1.5, z: s.z });
      h.room.tick(0.05);
      return s.fear;
    };
    expect(fearNear()).toBe(0);
    h.say(0, { t: 'practise', on: true });
    expect(fearNear()).toBeGreaterThan(0);
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
    Object.assign(h.dog(0), { x: 15, z: 12 });
    h.room.sheep.forEach((s, i) => Object.assign(s, { x: -6 + i * 0.8, z: -14.4, vx: 0, vz: 0, fear: 0 }));
    const off = () => h.room.sheep.reduce((n, s) => n + (15 + s.z), 0) / h.room.sheep.length;
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
    expect(pieces.map((p) => p.kind)).toEqual(['hurdle', 'hurdle', 'tunnel', 'weave', 'tire', 'hurdle', 'table']);
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
          for (let a = -3; a <= 3; a += 0.1) { const q = pt(p, a, 1.6); go(q.x, q.z); }
          continue;
        }
        for (let a = -3; a <= 3; a += 0.1) {
          // In and out between the poles: a different side of each.
          const lat = p.kind === 'weave' ? 0.35 * Math.sin(((a + 0.4) / 0.8) * Math.PI) : 0;
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

  it('weaving the wrong way (same side of two poles) breaks the weave', async () => {
    const { PRACTICE } = await import('../src/shared/field');
    const { AgilityRun } = await import('../src/shared/agilityrun');
    const weave = PRACTICE.agility!.find((p) => p.kind === 'weave')!;
    const run = new AgilityRun([{ ...weave, n: 1 }]);
    let took = false;
    for (let a = -3, now = 0; a <= 3; a += 0.1, now += 50) {
      const q = pt(weave, a, 0.35);
      if (run.step(q.x, q.z, false, 0.05, now).took) took = true;
    }
    expect(took).toBe(false);
  });
});
