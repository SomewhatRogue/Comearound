/**
 * Vercel Function: the WebSocket every online player connects to (`/api/room`). The relay logic is
 * in _relay.ts; rooms are shared across instances through Redis from the Vercel Marketplace
 * (REDIS_URL, or Upstash's KV_URL). Without Redis it still runs, but only players who happen to
 * land on the same instance can meet, so the game warns that online play isn't set up.
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Relay, memoryBackend, redisBackend } from './_relay.js';

const server = http.createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Come Bye! rooms: connect with a WebSocket.');
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

let relay: Promise<Relay> | null = null;
function getRelay(): Promise<Relay> {
  const url = process.env.REDIS_URL ?? process.env.KV_URL;
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
