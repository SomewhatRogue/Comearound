/**
 * Local dev and test server: serves the built client from dist/ and runs rooms in-process over
 * WebSockets on the same /parties/game-server/<room> path the Cloudflare deploy uses.
 *
 * Env: PORT (default 8787), TIMESCALE (test hook, default 1), SEED (fixed seed for repeatable runs).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { GameRoom, TICK_HZ } from './game';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = join(process.cwd(), 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };

const rooms = new Map<string, { game: GameRoom; sockets: Map<string, import('ws').WebSocket> }>();
let connSeq = 0;

function roomFor(name: string) {
  let r = rooms.get(name);
  if (!r) {
    const sockets = new Map<string, import('ws').WebSocket>();
    const game = new GameRoom((id, msg) => sockets.get(id)?.send(msg), {
      timeScale: Number(process.env.TIMESCALE ?? 1),
      seed: process.env.SEED ? Number(process.env.SEED) : undefined,
    });
    r = { game, sockets };
    rooms.set(name, r);
  }
  return r;
}

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/__report') {
    const r = rooms.get(url.searchParams.get('room') ?? '');
    res.end(r ? r.game.report() : 'no such room');
    return;
  }
  let file = normalize(join(DIST, url.pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http });
wss.on('connection', (ws, req) => {
  const m = /^\/parties\/game-server\/([\w-]{1,32})/.exec(req.url ?? '');
  if (!m) return ws.close();
  const r = roomFor(m[1]);
  const id = `c${++connSeq}`;
  r.sockets.set(id, ws);
  r.game.connect(id);
  ws.on('message', (data) => r.game.message(id, data.toString()));
  ws.on('close', () => {
    r.sockets.delete(id);
    r.game.disconnect(id);
  });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const r of rooms.values()) if (r.sockets.size) r.game.tick(dt);
}, 1000 / TICK_HZ);

http.listen(PORT, () => console.log(`Threes a crowd dev server on http://localhost:${PORT}`));
