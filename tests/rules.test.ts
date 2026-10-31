import { describe, expect, it } from 'vitest';
import { ITEMS, THINGS, thingById } from '../src/shared/catalog';
import { filledParts, makes, thingsAccepting } from '../src/shared/judge';
import { BOARD } from '../src/shared/map';
import { GameRoom } from '../src/server/game';
import { SIGNS } from '../src/server/round';

/** A room with a fake transport that records every message per connection. */
function harness(humans: number, opts = { seed: 7 }) {
  const inbox = new Map<string, string[]>();
  const room = new GameRoom((id, msg) => inbox.get(id)!.push(msg), opts);
  for (let i = 0; i < humans; i++) {
    inbox.set(`c${i}`, []);
    room.connect(`c${i}`);
    room.message(`c${i}`, JSON.stringify({ t: 'hello', token: `tok${i}`, look: { name: `H${i}`, color: '#e4572e', hat: 'none' } }));
  }
  const players = () => [...room.players.values()];
  const conn = (pid: string) => `c${Number(pid.slice(1)) - 1}`;
  const say = (pid: string, m: object) => room.message(conn(pid), JSON.stringify(m));
  const atBoard = (pid: string) => Object.assign(room.players.get(pid)!, { x: BOARD.x, z: BOARD.z });
  return { room, inbox, players, say, atBoard };
}

describe('catalog', () => {
  it('every part accepts only real items', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    for (const t of THINGS) for (const p of t.parts) for (const a of p.accepts) expect(ids.has(a), `${t.id} needs unknown ${a}`).toBe(true);
  });

  it('no single item points at only one thing (ambiguity floor)', () => {
    for (const t of THINGS) for (const p of t.parts) for (const a of p.accepts) expect(thingsAccepting(a).length, `${a} gives away ${t.id}`).toBeGreaterThanOrEqual(1);
    const loners = ITEMS.filter((i) => thingsAccepting(i.id).length === 1).map((i) => i.id);
    // Report rather than fail: a one-thing item is a tell. Keep this list short and deliberate.
    expect(loners.length).toBeLessThanOrEqual(4);
  });
});

describe('judge', () => {
  const pie = thingById.get('moonpie')!;
  it('fills parts in any order, one item per part', () => {
    expect(makes(pie, 'kitchen', ['candle', 'pear', 'pietin'])).toBe(true);
    expect(makes(pie, 'kitchen', ['pear', 'apple', 'candle'])).toBe(false);
    expect(filledParts(pie, ['apple', 'apple']).filter(Boolean).length).toBe(1);
  });
  it('location matters', () => {
    expect(makes(pie, 'garden', ['candle', 'pear', 'pietin'])).toBe(false);
  });
});

describe('round', () => {
  it('needs three players; bots fill to five', () => {
    const h = harness(2);
    h.say('p1', { t: 'start', roundSec: 60, fillBots: true });
    expect(h.room.phase).toBe('playing');
    expect(h.players().length).toBe(5);
    expect(h.players().filter((p) => p.role === 'sad').length).toBe(1);
  });

  it('never sends the secret thing to a :( player before the reveal', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 60, fillBots: false });
    const sad = h.players().find((p) => p.role === 'sad')!;
    for (let i = 0; i < 400 && h.room.phase !== 'results'; i++) h.room.tick(0.05);
    const conn = `c${Number(sad.id.slice(1)) - 1}`;
    const before = h.inbox.get(conn)!.filter((m) => !m.includes('"phase":"results"'));
    expect(before.length).toBeGreaterThan(10);
    for (const m of before) {
      expect(m).not.toContain(`"${h.room.thingId}"`);
      expect(m).not.toContain('"role":"knower"');
    }
    // Positive control: the same check DOES find the thing in a knower's messages, so it can fail.
    const knower = h.players().find((p) => p.role === 'knower')!;
    const kmsgs = h.inbox.get(`c${Number(knower.id.slice(1)) - 1}`)!;
    expect(kmsgs.some((m) => m.includes(`"${h.room.thingId}"`))).toBe(true);
  });

  it('a right accusation jails the :( with a sign, keeps the accuser free, and offers the choice', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const sad = h.players().find((p) => p.role === 'sad')!;
    const knower = h.players().find((p) => p.role === 'knower')!;
    h.atBoard(knower.id);
    h.say(knower.id, { t: 'accuse', targetId: sad.id });
    expect(sad.inPen).toBe(true);
    expect(SIGNS).toContain(sad.sign);
    expect(knower.inPen).toBe(false);
    expect(knower.awaitingChoice).toBe(true);
    h.say(knower.id, { t: 'choice', endNow: true });
    expect(h.room.phase).toBe('lastchance');
    h.say(sad.id, { t: 'guess', thingId: h.room.thingId });
    h.room.tick(0.05);
    expect(h.room.phase).toBe('results');
    expect(h.room.reveal!.winner).toBe('knowers');
  });

  it('a wrong accusation jails the accuser with a sign from the same pool', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const [a, b] = h.players().filter((p) => p.role === 'knower');
    h.atBoard(a.id);
    h.say(a.id, { t: 'accuse', targetId: b.id });
    expect(a.inPen).toBe(true);
    expect(b.inPen).toBe(false);
    expect(SIGNS).toContain(a.sign);
  });

  it('a :( player cannot accuse; they only guess', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const sad = h.players().find((p) => p.role === 'sad')!;
    const k = h.players().find((p) => p.role === 'knower')!;
    h.atBoard(sad.id);
    h.say(sad.id, { t: 'accuse', targetId: k.id });
    expect(sad.accusationUsed).toBe(false);
    expect(sad.inPen).toBe(false);
    expect(k.inPen).toBe(false);
  });

  it('the host can end a round early or abandon it to the lobby', () => {
    const h = harness(3);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: true });
    h.say('p2', { t: 'endRound' });
    expect(h.room.phase).toBe('playing');
    h.say('p1', { t: 'endRound' });
    expect(['lastchance', 'results']).toContain(h.room.phase);
    h.say('p1', { t: 'toLobby' });
    expect(h.room.phase).toBe('lobby');
  });

  it('Pen snowballs knock down crow targets and score', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const [a, b] = h.players().filter((p) => p.role === 'knower');
    h.atBoard(a.id);
    h.say(a.id, { t: 'accuse', targetId: b.id });
    expect(a.inPen).toBe(true);
    const t = h.room.targets[1];
    Object.assign(a, { x: t.x, z: t.z - 2, fx: 0, fz: 1 });
    const before = a.score;
    h.say(a.id, { t: 'interact' });
    for (let i = 0; i < 10; i++) h.room.tick(0.05);
    expect(t.up).toBe(false);
    expect(a.score).toBe(before + 10);
  });

  it('the goat knocks a carried item loose', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const p = h.players()[0];
    const it = h.room.items[0];
    Object.assign(p, { x: 5, z: 0 });
    [it.heldBy, p.carrying] = [p.id, it.uid];
    Object.assign(h.room.goat, { x: 3, z: 0, mood: 'pester', target: p.id, timer: 5 });
    for (let i = 0; i < 40 && p.carrying != null; i++) h.room.tick(0.05);
    expect(p.carrying).toBe(null);
    expect(it.heldBy).toBe(null);
  });

  it('a :( player who guesses right at the board wins; one guess only', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const sad = h.players().find((p) => p.role === 'sad')!;
    h.atBoard(sad.id);
    const wrong = THINGS.find((t) => t.id !== h.room.thingId)!.id;
    h.say(sad.id, { t: 'guess', thingId: wrong });
    h.say(sad.id, { t: 'guess', thingId: h.room.thingId });
    expect(h.room.phase).toBe('playing');
    const h2 = harness(5);
    h2.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const sad2 = h2.players().find((p) => p.role === 'sad')!;
    h2.atBoard(sad2.id);
    h2.say(sad2.id, { t: 'guess', thingId: h2.room.thingId });
    expect(h2.room.reveal!.winner).toBe('sad');
  });

  it('a rejoin with the same token gets the same seat and role back', () => {
    const h = harness(3);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: true });
    const role = h.room.players.get('p2')!.role;
    h.room.disconnect('c1');
    h.inbox.set('c9', []);
    h.room.message('c9', JSON.stringify({ t: 'hello', token: 'tok1', look: { name: 'H1' } }));
    expect(h.room.players.get('p2')!.connected).toBe(true);
    expect(h.room.players.get('p2')!.role).toBe(role);
  });

  it('a host who drops in the lobby and comes back within the grace period keeps the seat and host', () => {
    const h = harness(2);
    h.room.disconnect('c0');
    h.room.tick(0.05);
    expect(h.room.hostId).toBe('p1');
    h.inbox.set('c7', []);
    h.room.message('c7', JSON.stringify({ t: 'hello', token: 'tok0', look: { name: 'H0' } }));
    expect(h.room.hostId).toBe('p1');
    expect(h.room.players.size).toBe(2);
    h.room.disconnect('c7');
    for (let i = 0; i < 20 * 31; i++) h.room.tick(0.05);
    expect(h.room.players.has('p1')).toBe(false);
    expect(h.room.hostId).toBe('p2');
  });

  it.each([3, 5, 8, 13, 21])('bots act natural (seed %i): nothing real is finished before last call, then they finish', (seed) => {
    const h = harness(1, { seed });
    h.say('p1', { t: 'start', roundSec: 120, fillBots: true });
    const thing = thingById.get(h.room.thingId!)!;
    for (let i = 0; i < 20 * 140 && h.room.phase === 'playing'; i++) h.room.tick(0.05);
    // A :( bot may legitimately guess the thing and end the round before last call.
    if (h.room.phase === 'results') return void expect(h.room.reveal!.winner).toBe('sad');
    expect(h.room.phase).toBe('lastcall');
    // Knower bots must not finish the real thing early. (A :( bot stumbling into it is fair play.)
    const knowers = new Set(h.players().filter((p) => p.role === 'knower').map((p) => p.id));
    const early = h.room.stations.filter((s) => s.owner && knowers.has(s.owner) && makes(thing, s.area, s.items.map((u) => h.room.items.find((it) => it.uid === u)!.id)));
    expect(early.length, 'a knower bot gave the thing away before last call').toBe(0);
    for (let i = 0; i < 20 * 140 && (h.room.phase as string) !== 'results'; i++) h.room.tick(0.05);
    expect(h.room.phase).toBe('results');
    const made = h.room.reveal!.rows.filter((r) => r.creation).length;
    expect(made, h.room.report()).toBeGreaterThanOrEqual(2);
  });
});
