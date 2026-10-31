/**
 * The Vercel room relay with several players, run as two separate "function instances" (players
 * spread across them) that share rooms through a backend: once in memory, once through a real
 * Redis server (started here if `redis-server` is installed). Each player is a real WebSocket.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { Relay, memoryBackend, redisBackend, type Backend } from '../api/_relay';

type Msg = { t: string; role?: string; host?: string; id?: string; from?: string; d?: unknown };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function instance(backend: Backend, staleMs = 600): Promise<{ port: number; close: () => void }> {
  const relay = new Relay(backend, { staleMs });
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => void relay.attach(ws, new URL(req.url ?? '/', 'http://x')));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { port: (server.address() as AddressInfo).port, close: () => (wss.clients.forEach((c) => c.terminate()), server.close()) };
}

function player(port: number, room: string, id: string, want: 'host' | 'take' | 'join') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/room?room=${room}&id=${id}&want=${want}`);
  const msgs: Msg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
  const until = async (pred: (m: Msg) => boolean, ms = 4000): Promise<Msg> => {
    const end = Date.now() + ms;
    for (;;) {
      const m = msgs.find(pred);
      if (m) return m;
      if (Date.now() > end) throw new Error(`${id} never got it; had ${JSON.stringify(msgs)}`);
      await wait(15);
    }
  };
  return { ws, msgs, until, send: (to: string, d: unknown) => ws.send(JSON.stringify({ to, d })), close: () => ws.close() };
}

const code = () => `R${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const backends: { name: string; make: () => Promise<Backend>; skip?: boolean }[] = [];

// Two instances, one shared in-memory backend.
const shared = { kv: new Map(), subs: new Map() };
backends.push({ name: 'memory', make: async () => memoryBackend(shared) });
// Two instances, real Redis.
const haveRedis = spawnSync('which', ['redis-server']).status === 0;
let redisProc: ChildProcess | null = null;
const REDIS_PORT = 6400 + Math.floor(Math.random() * 400);
backends.push({ name: 'redis', make: () => redisBackend(`redis://127.0.0.1:${REDIS_PORT}`), skip: !haveRedis });

beforeAll(async () => {
  if (!haveRedis) return;
  redisProc = spawn('redis-server', ['--port', String(REDIS_PORT), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  await wait(400);
});
afterAll(() => redisProc?.kill());

for (const be of backends) {
  describe.skipIf(!!be.skip)(`room relay across two instances (${be.name})`, { timeout: 15000 }, () => {
    let A: { port: number; close: () => void };
    let B: { port: number; close: () => void };
    beforeAll(async () => {
      [A, B] = await Promise.all([instance(await be.make()), instance(await be.make())]);
    });
    afterAll(() => (A?.close(), B?.close()));

    it('a host and two friends on different instances: roles, messages to the host, broadcasts and direct messages', async () => {
      const room = code();
      const host = player(A.port, room, 'kyle-0001', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      const sam = player(B.port, room, 'sam-00001', 'join');
      const ava = player(A.port, room, 'ava-00001', 'join');
      for (const f of [sam, ava]) expect(await f.until((m) => m.t === 'role')).toMatchObject({ role: 'guest', host: 'kyle-0001' });
      sam.send('kyle-0001', { t: 'hello', from: 'sam' });
      ava.send('kyle-0001', { t: 'hello', from: 'ava' });
      await host.until((m) => m.t === 'msg' && m.from === 'sam-00001');
      await host.until((m) => m.t === 'msg' && m.from === 'ava-00001');
      host.send('*', { s: 'snapshot-1' });
      for (const f of [sam, ava]) await f.until((m) => m.t === 'msg' && (m.d as { s?: string }).s === 'snapshot-1');
      host.send('sam-00001', { ev: 'just-for-sam' });
      await sam.until((m) => m.t === 'msg' && (m.d as { ev?: string }).ev === 'just-for-sam');
      await wait(200);
      expect(ava.msgs.some((m) => (m.d as { ev?: string } | undefined)?.ev === 'just-for-sam')).toBe(false);
      expect(host.msgs.some((m) => m.t === 'msg' && m.from === 'kyle-0001')).toBe(false);
      [host, sam, ava].forEach((p) => p.close());
    });

    it("a friend who opens the code before the host is told there's no host yet, then hears when one arrives", async () => {
      const room = code();
      const sam = player(B.port, room, 'sam-00002', 'join');
      await sam.until((m) => m.t === 'nohost');
      const host = player(A.port, room, 'kyle-0002', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      await sam.until((m) => m.t === 'hosted' && m.id === 'kyle-0002');
      [host, sam].forEach((p) => p.close());
    });

    it('when the host leaves, friends hear it, and a player who was in the room can take it over', async () => {
      const room = code();
      const host = player(A.port, room, 'kyle-0003', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      const sam = player(B.port, room, 'sam-00003', 'join');
      const ava = player(A.port, room, 'ava-00003', 'join');
      await sam.until((m) => m.t === 'role');
      await ava.until((m) => m.t === 'role');
      host.close();
      await sam.until((m) => m.t === 'left' && m.id === 'kyle-0003');
      await ava.until((m) => m.t === 'left' && m.id === 'kyle-0003');
      sam.close();
      const sam2 = player(B.port, room, 'sam-00003', 'take');
      await sam2.until((m) => m.t === 'role' && m.role === 'host');
      await ava.until((m) => m.t === 'hosted' && m.id === 'sam-00003');
      [sam2, ava].forEach((p) => p.close());
    });

    it('a host that goes quiet (a phone in the background) can be replaced, and steps down when it comes back', async () => {
      const room = code();
      const host = player(A.port, room, 'kyle-0004', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      await wait(900); // longer than this test's stale time
      const ava = player(B.port, room, 'ava-00004', 'take');
      await ava.until((m) => m.t === 'role' && m.role === 'host');
      await host.until((m) => m.t === 'role' && m.role === 'guest' && m.host === 'ava-00004');
      [host, ava].forEach((p) => p.close());
    });

    it('a host alone in its room, sending only heartbeats, still gets the friend who joins later', async () => {
      const room = code();
      const host = player(A.port, room, 'kyle-0008', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      // Waiting for the friend to type the code: far longer than this test's stale time.
      for (let i = 0; i < 10; i++) (host.ws.send('{"ping":1}'), await wait(150));
      const sam = player(B.port, room, 'sam-00008', 'join');
      expect(await sam.until((m) => m.t === 'role' || m.t === 'nohost')).toMatchObject({ t: 'role', role: 'guest', host: 'kyle-0008' });
      [host, sam].forEach((p) => p.close());
    });

    it("a player's old connection closing late (after they reconnected) doesn't say they left", async () => {
      const room = code();
      const host = player(A.port, room, 'kyle-0006', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      const sam = player(B.port, room, 'sam-00006', 'join');
      await sam.until((m) => m.t === 'role');
      // The host's phone comes back: a new connection first, the dead old one closes afterwards.
      const host2 = player(B.port, room, 'kyle-0006', 'host');
      await host2.until((m) => m.t === 'role' && m.role === 'host');
      host.close();
      await wait(500);
      expect(sam.msgs.some((m) => m.t === 'left')).toBe(false);
      // And the room is still the host's: a joiner is sent to them.
      const ava = player(A.port, room, 'ava-00006', 'join');
      expect(await ava.until((m) => m.t === 'role')).toMatchObject({ role: 'guest', host: 'kyle-0006' });
      [host2, sam, ava].forEach((p) => p.close());
    });

    it('answers the heartbeat without relaying it', async () => {
      const room = code();
      const host = player(A.port, room, 'kyle-0007', 'host');
      await host.until((m) => m.t === 'role');
      const sam = player(A.port, room, 'sam-00007', 'join');
      await sam.until((m) => m.t === 'role');
      sam.ws.send('{"ping":1}');
      await sam.until((m) => m.t === 'pong');
      await wait(200);
      expect(host.msgs.some((m) => m.t === 'msg')).toBe(false);
      [host, sam].forEach((p) => p.close());
    });

    it("a friend who opened the code never takes the room, even when its host is away", async () => {
      const room = code();
      const sam = player(A.port, room, 'sam-00005', 'join');
      await sam.until((m) => m.t === 'nohost');
      const host = player(B.port, room, 'kyle-0005', 'host');
      await host.until((m) => m.t === 'role' && m.role === 'host');
      [host, sam].forEach((p) => p.close());
    });
  });
}
