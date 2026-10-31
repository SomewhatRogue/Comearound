/**
 * Matchmaking with several sessions in one room, against real servers:
 * - the PeerJS path runs a real PeerServer (the same software as the public 0.peerjs.com) in this
 *   process, and each "session" is a separate broker with its own WebSocket;
 * - the Redis path runs our /api/signal handler (in-memory store) behind a stubbed fetch.
 * WebRTC itself needs a browser: scripts/online-test.cjs covers the full join in real browsers.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleSignal, memoryStore } from '../api/signal';

type Offer = { t: 'offer' | 'answer'; sdp: string };
type BrokersModule = typeof import('../src/client/brokers');

let server: Server;
let brokers: BrokersModule;
const docListeners = new Set<() => void>();
const doc = { visibilityState: 'visible' as 'visible' | 'hidden' };

/** A new device (its own storage) or, with `sameDevice`, a new tab on the current one. */
function device(sameDevice = false): void {
  const mk = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const g = globalThis as unknown as Record<string, unknown>;
  if (!sameDevice) g.localStorage = mk();
  g.sessionStorage = mk();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 6000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await wait(25);
  }
}

beforeAll(async () => {
  // A real PeerServer on a free port.
  const { ExpressPeerServer } = await import('peer');
  const express = (await import('express')).default;
  const app = express();
  server = createServer(app);
  app.use('/', ExpressPeerServer(server, { path: '/' }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  // Just enough browser for brokers.ts.
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = globalThis;
  g.location = { search: `?peer=ws://127.0.0.1:${port}/peerjs` };
  device();
  g.document = {
    get visibilityState() { return doc.visibilityState; },
    addEventListener: (_: string, f: () => void) => docListeners.add(f),
    removeEventListener: (_: string, f: () => void) => docListeners.delete(f),
  };
  Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: () => true }, configurable: true });
  brokers = await import('../src/client/brokers');
});

afterAll(() => server?.close());

describe("matchmaking: PeerJS server path", { timeout: 20000 }, () => {
  it('one host and three friends: every friend reaches the host and gets its own answer back', async () => {
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const host = new brokers.PeerBroker(room, 'host-session');
    expect(await host.claim(true)).toBe('host');
    const got: { from: string; msg: Offer }[] = [];
    host.onMessage = (from, msg) => {
      got.push({ from, msg });
      void host.send(from, { t: 'answer', sdp: `answer-for-${msg.sdp}` });
    };
    const friends = ['ann', 'bob', 'cat'].map((n) => (device(), { n, b: new brokers.PeerBroker(room, `${n}-session`), answer: '' }));
    for (const f of friends) {
      const hostId = await f.b.claim(false);
      expect(hostId).toBe(`cbx-${room}`);
      f.b.onMessage = (from, msg) => from === hostId && msg.t === 'answer' && (f.answer = msg.sdp);
      expect(await f.b.send(hostId!, { t: 'offer', sdp: f.n })).toBe(true);
    }
    await until(() => friends.every((f) => f.answer));
    expect(got.map((g) => g.msg.sdp).sort()).toEqual(['ann', 'bob', 'cat']);
    expect(new Set(got.map((g) => g.from)).size).toBe(3);
    for (const f of friends) expect(f.answer).toBe(`answer-for-${f.n}`);
    [host, ...friends.map((f) => f.b)].forEach((b) => b.close());
  });

  it("a host whose connection died (a phone in the background) gets its room back and hears the next friend", async () => {
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const host = new brokers.PeerBroker(room, 'host-session');
    expect(await host.claim(true)).toBe('host');
    let heard = '';
    host.onMessage = (_from, msg) => (heard = msg.sdp);
    // The phone goes away and its socket dies; then the player comes back to the game.
    doc.visibilityState = 'hidden';
    (host as unknown as { ws: WebSocket }).ws.close();
    await wait(300);
    doc.visibilityState = 'visible';
    docListeners.forEach((f) => f());
    await until(() => (host as unknown as { ws: WebSocket | null }).ws?.readyState === WebSocket.OPEN);
    device();
    const friend = new brokers.PeerBroker(room, 'friend-session');
    const hostId = await friend.claim(false);
    expect(hostId).toBe(`cbx-${room}`);
    await friend.send(hostId!, { t: 'offer', sdp: 'hello' });
    await until(() => heard === 'hello');
    host.close();
    friend.close();
  });

  it('a host that comes back after a friend took the room over is told, so it can join them', async () => {
    device();
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const host = new brokers.PeerBroker(room, 'host-session');
    expect(await host.claim(true)).toBe('host');
    let lost = false;
    host.onLost = () => (lost = true);
    doc.visibilityState = 'hidden';
    (host as unknown as { ws: WebSocket }).ws.close();
    await wait(300);
    // Meanwhile a friend who was already playing in the room takes it over.
    device();
    const friend = new brokers.PeerBroker(room, 'friend-session');
    expect(await friend.claim(true)).toBe('host');
    doc.visibilityState = 'visible';
    docListeners.forEach((f) => f());
    await until(() => lost);
    host.close();
    friend.close();
  });
});

describe('matchmaking: joining never takes the room', { timeout: 20000 }, () => {
  it("a friend opening a code whose host is away doesn't host an empty copy of it", async () => {
    device();
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const friend = new brokers.PeerBroker(room, 'friend-session');
    expect(await friend.claim(false)).toBe(`cbx-${room}`);
    // The room is still free for its real host when they come back.
    device();
    const host = new brokers.PeerBroker(room, 'host-session');
    expect(await host.claim(true)).toBe('host');
    friend.close();
    host.close();
  });

  it('the host opening their own link in a new tab on the same phone takes the room back', async () => {
    device();
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const oldTab = new brokers.PeerBroker(room, 'tab-one');
    expect(await oldTab.claim(true)).toBe('host');
    device(true);
    const newTab = new brokers.PeerBroker(room, 'tab-two');
    expect(await newTab.claim(true)).toBe('host');
    let heard = '';
    newTab.onMessage = (_f, m) => (heard = m.sdp);
    device();
    const friend = new brokers.PeerBroker(room, 'friend-session');
    const hostId = await friend.claim(false);
    await friend.send(hostId!, { t: 'offer', sdp: 'to-the-new-tab' });
    await until(() => heard === 'to-the-new-tab');
    [oldTab, newTab, friend].forEach((b) => b.close());
  });
});

describe('matchmaking: our own /api/signal (Redis) path', () => {
  it("a friend peeking at a room nobody hosts is told so, and doesn't take it", async () => {
    const store = memoryStore();
    (globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
      const { status, json } = await handleSignal(JSON.parse(init.body), store);
      return { ok: status === 200, json: async () => json };
    };
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const friend = new brokers.RedisBroker(room, 'friend-session');
    expect(await friend.claim(false)).toBe('none');
    const host = new brokers.RedisBroker(room, 'host-session');
    expect(await host.claim(true)).toBe('host');
    friend.close();
    host.close();
  });

  it('one host and three friends through the Vercel function', async () => {
    const store = memoryStore();
    (globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
      const { status, json } = await handleSignal(JSON.parse(init.body), store);
      return { ok: status === 200, json: async () => json };
    };
    const room = `R${Math.random().toString(36).slice(2, 7)}`;
    const host = new brokers.RedisBroker(room, 'host-session');
    expect(await host.claim(true)).toBe('host');
    const got: string[] = [];
    host.onMessage = (from, msg) => {
      got.push(msg.sdp);
      void host.send(from, { t: 'answer', sdp: `answer-for-${msg.sdp}` });
    };
    const friends = ['ann', 'bob', 'cat'].map((n) => ({ n, b: new brokers.RedisBroker(room, `${n}-session`), answer: '' }));
    for (const f of friends) {
      const hostId = await f.b.claim(false);
      expect(hostId).toBe('host-session');
      f.b.onMessage = (from, msg) => from === hostId && (f.answer = msg.sdp);
      expect(await f.b.send(hostId!, { t: 'offer', sdp: f.n })).toBe(true);
    }
    await until(() => friends.every((f) => f.answer), 10000);
    expect(got.sort()).toEqual(['ann', 'bob', 'cat']);
    for (const f of friends) expect(f.answer).toBe(`answer-for-${f.n}`);
    [host, ...friends.map((f) => f.b)].forEach((b) => b.close());
  });
});
