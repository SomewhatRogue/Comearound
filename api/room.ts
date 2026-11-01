/**
 * Vercel Function: the WebSocket every online player connects to (`/api/room`). The relay logic is
 * in _relay.ts; rooms are shared across instances through Redis from the Vercel Marketplace
 * (REDIS_URL, or Upstash's KV_URL). Without Redis it still runs, but only players who happen to
 * land on the same instance can meet, so the game warns that online play isn't set up.
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Relay, memoryBackend, redisBackend } from './_relay.js';

// Last line of defence: one failed promise must never take the instance (and its players) down.
process.on('unhandledRejection', (e) => console.log(JSON.stringify({ relay: 1, ev: 'unhandled', msg: String((e as Error)?.message ?? e) })));

const server = http.createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Come Bye! rooms: connect with a WebSocket.');
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

let relay: Promise<Relay> | null = null;
/**
 * The Redis connection URL: REDIS_URL or KV_URL as the Marketplace sets them, or any other variable
 * holding a redis:// or rediss:// URL (connecting storage with a custom prefix renames them, e.g.
 * STORAGE_URL).
 */
function redisUrl(): string | undefined {
  const named = process.env.REDIS_URL ?? process.env.KV_URL;
  if (named) return named;
  return Object.entries(process.env).find(([k, v]) => k.endsWith('URL') && /^rediss?:\/\//.test(v ?? ''))?.[1];
}

function getRelay(): Promise<Relay> {
  const url = redisUrl();
  return (relay ??= (url ? redisBackend(url) : Promise.resolve(memoryBackend())).then((b) => new Relay(b)).catch((e) => {
    relay = null;
    throw e;
  }));
}

wss.on('connection', (ws, req) => {
  getRelay()
    .then((r) => r.attach(ws, new URL(req.url ?? '/', 'http://localhost')))
    .catch(() => ws.close(1011));
});

export default server;
