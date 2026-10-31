import { describe, expect, it } from 'vitest';
import { ACTS, LANE, judgePress, laneX, makeLane, type ActId } from '../src/shared/activities';
import { BOARD, SPOTS } from '../src/shared/map';
import { Rng } from '../src/shared/rng';
import { closeness, makeTask, makeTasks } from '../src/shared/tasks';
import { GameRoom } from '../src/server/game';
import { SIGNS } from '../src/server/round';

/** A room with a fake transport that records every message per connection. */
function harness(humans: number, opts: { seed?: number; timeScale?: number } = { seed: 7 }) {
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
  const atSpot = (pid: string) => {
    const s = room.spots.find((sp) => sp.act === room.tasks[room.taskIdx].act && !sp.busyBy)!;
    Object.assign(room.players.get(pid)!, { x: s.x, z: s.z });
    return s;
  };
  return { room, inbox, players, say, atBoard, atSpot, conn };
}

describe('activities and tasks', () => {
  it('every activity has at least five spots', () => {
    for (const act of Object.keys(ACTS)) expect(SPOTS.filter((s) => s.act === act).length, act).toBeGreaterThanOrEqual(5);
  });

  it('pressing as a thing crosses the marker catches it; pressing on an empty lane misses', () => {
    const lane = makeLane(new Rng(4), 'fish');
    const o = lane.objs[2];
    const at = o.enter + 1000 / lane.speed;
    expect(Math.abs(laneX(lane, o, at))).toBeLessThan(1e-9);
    expect(judgePress(lane, at)).toEqual(o.attrs);
    expect(judgePress(lane, 10)).toBe(null);
    expect(judgePress(lane, -5)).toBe(null);
  });

  it('archery scores the ring by how close you were', () => {
    const lane = makeLane(new Rng(9), 'archery');
    const o = lane.objs[1];
    const at = o.enter + 1000 / lane.speed;
    expect(judgePress(lane, at)!.ring).toBe('bullseye');
    expect(judgePress(lane, at + ((LANE.bullseye + 0.01) / lane.speed) * 1000)!.ring).toBe('inner');
  });

  it('closeness: exact is 1, half the attributes is 0.5, wrong activity is 0', () => {
    const t = { act: 'fish' as ActId, want: { size: 'small', color: 'yellow' }, text: '' };
    expect(closeness(t, { act: 'fish', attrs: { size: 'small', color: 'yellow' } })).toBe(1);
    expect(closeness(t, { act: 'fish', attrs: { size: 'small', color: 'blue' } })).toBe(0.5);
    expect(closeness(t, { act: 'fruit', attrs: { size: 'small', kind: 'plum' } })).toBe(0);
    expect(closeness(t, null)).toBe(0);
    const paint = makeTask(new Rng(2), 'paint');
    expect(closeness(paint, { act: 'paint', attrs: { ...paint.want, quality: 'messy' } })).toBe(0.5);
  });

  it('a round deals different activities', () => {
    const ts = makeTasks(new Rng(5), 3);
    expect(new Set(ts.map((t) => t.act)).size).toBe(3);
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

  it('never sends the ask to a :( player before the reveal (with a positive control)', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 30, fillBots: false });
    const asks = h.room.tasks.map((t) => t.text);
    const sad = h.players().find((p) => p.role === 'sad')!;
    const knower = h.players().find((p) => p.role === 'knower')!;
    for (let i = 0; i < 1000 && h.room.phase !== 'results'; i++) h.room.tick(0.05);
    const before = (pid: string) => h.inbox.get(h.conn(pid))!.filter((m) => !m.includes('"phase":"results"'));
    expect(before(sad.id).length).toBeGreaterThan(10);
    for (const m of before(sad.id)) {
      for (const a of asks) expect(m).not.toContain(a);
      expect(m).not.toContain('"want"');
      expect(m).not.toContain('"role":"knower"');
    }
    expect(before(knower.id).some((m) => asks.some((a) => m.includes(a)))).toBe(true);
  });

  it('only the current task activity is open, one player per spot', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const [a, b] = h.players();
    const other = h.room.spots.find((s) => s.act !== h.room.tasks[0].act)!;
    Object.assign(a, { x: other.x, z: other.z });
    h.say(a.id, { t: 'interact' });
    expect(a.attempt).toBe(null);
    const s = h.atSpot(a.id);
    Object.assign(b, { x: s.x, z: s.z });
    h.say(a.id, { t: 'interact' });
    h.say(b.id, { t: 'interact' });
    expect(a.attempt).not.toBe(null);
    expect(b.attempt).toBe(null);
  });

  it('a press catches what the server says it caught; best attempt is scored at the reveal', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const a = h.players().find((p) => p.role === 'knower')!;
    h.atSpot(a.id);
    h.say(a.id, { t: 'interact' });
    const lane = a.attempt!.lane;
    const task = h.room.tasks[0];
    const o = lane.objs.find((x) => Object.entries(task.want).every(([k, v]) => !(k in x.attrs) || x.attrs[k] === v)) ?? lane.objs[0];
    const pick = task.act === 'paint' ? task.want : undefined;
    h.say(a.id, { t: 'press', at: o.enter + 1000 / lane.speed, pick });
    expect(a.basket.length).toBe(1);
    h.say('p1', { t: 'endRound' });
    const row = h.room.reveal!.rows.find((r) => r.id === a.id)!;
    expect(row.perTask[0].pts).toBeGreaterThan(0);
  });

  it('a right accusation jails the :( with a sign and cancels their multiplier', () => {
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
    expect(h.room.phase).toBe('results');
    expect(h.room.reveal!.winner).toBe('knowers');
    expect(h.room.reveal!.rows.find((r) => r.id === sad.id)!.caughtOut).toBe(true);
  });

  it('a wrong accusation jails the accuser; a :( player cannot accuse', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const [a, b] = h.players().filter((p) => p.role === 'knower');
    const sad = h.players().find((p) => p.role === 'sad')!;
    h.atBoard(sad.id);
    h.say(sad.id, { t: 'accuse', targetId: a.id });
    expect(sad.accusationUsed).toBe(false);
    h.atBoard(a.id);
    h.say(a.id, { t: 'accuse', targetId: b.id });
    expect(a.inPen).toBe(true);
    expect(b.inPen).toBe(false);
    expect(SIGNS).toContain(a.sign);
  });

  it('an uncaught :( player gets the hidden multiplier', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const sad = h.players().find((p) => p.role === 'sad')!;
    const task = h.room.tasks[0];
    sad.basket = [{ act: task.act, attrs: { ...task.want, ring: 'bullseye', quality: 'perfect' } }];
    h.say('p1', { t: 'endRound' });
    const row = h.room.reveal!.rows.find((r) => r.id === sad.id)!;
    expect(row.perTask[0].pts).toBe(100);
    expect(row.points).toBe(200);
    expect(h.room.reveal!.winner).toBe('sad');
  });

  it('the host can end a round early or abandon it to the lobby', () => {
    const h = harness(3);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: true });
    h.say('p2', { t: 'endRound' });
    expect(h.room.phase).toBe('playing');
    h.say('p1', { t: 'endRound' });
    expect(h.room.phase).toBe('results');
    h.say('p1', { t: 'toLobby' });
    expect(h.room.phase).toBe('lobby');
  });

  it('Pen snowballs knock down crow targets and score', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const [a, b] = h.players().filter((p) => p.role === 'knower');
    h.atBoard(a.id);
    h.say(a.id, { t: 'accuse', targetId: b.id });
    const t = h.room.targets[1];
    Object.assign(a, { x: t.x, z: t.z - 2, fx: 0, fz: 1 });
    const before = a.score;
    h.say(a.id, { t: 'interact' });
    for (let i = 0; i < 10; i++) h.room.tick(0.05);
    expect(t.up).toBe(false);
    expect(a.score).toBe(before + 10);
  });

  it('the goat spoils an attempt in progress', () => {
    const h = harness(5);
    h.say('p1', { t: 'start', roundSec: 120, fillBots: false });
    const a = h.players()[0];
    const s = h.atSpot(a.id);
    h.say(a.id, { t: 'interact' });
    Object.assign(h.room.goat, { x: s.x + 2, z: s.z, mood: 'pester', target: a.id, timer: 5 });
    for (let i = 0; i < 40 && a.attempt; i++) h.room.tick(0.05);
    expect(a.attempt).toBe(null);
    expect(s.busyBy).toBe(null);
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

  it('a host who drops in the lobby and returns within the grace keeps seat and host', () => {
    const h = harness(2);
    h.room.disconnect('c0');
    h.room.tick(0.05);
    expect(h.room.hostId).toBe('p1');
    h.inbox.set('c7', []);
    h.room.message('c7', JSON.stringify({ t: 'hello', token: 'tok0', look: { name: 'H0' } }));
    expect(h.room.players.size).toBe(2);
    h.room.disconnect('c7');
    for (let i = 0; i < 20 * 31; i++) h.room.tick(0.05);
    expect(h.room.players.has('p1')).toBe(false);
    expect(h.room.hostId).toBe('p2');
  });

  it.each([3, 5, 8])('bots play every task to the reveal and mostly score (seed %i)', (seed) => {
    const h = harness(1, { seed });
    h.say('p1', { t: 'start', roundSec: 90, fillBots: true });
    for (let i = 0; i < 20 * 100 && h.room.phase !== 'results'; i++) h.room.tick(0.05);
    expect(h.room.phase).toBe('results');
    const bots = h.room.reveal!.rows.filter((r) => r.id !== 'p1');
    const scored = bots.filter((r) => r.perTask.some((t) => t.pts > 0)).length;
    expect(scored, h.room.report()).toBeGreaterThanOrEqual(3);
  });
});
