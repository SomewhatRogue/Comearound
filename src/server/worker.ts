/**
 * Cloudflare entry: one Durable Object per room, via PartyServer. Static client assets are served
 * by Workers static assets; only /parties/* reaches this code (wrangler.jsonc run_worker_first).
 *
 * The 20 Hz loop runs only while someone is connected. A running interval keeps the object awake
 * (it cannot hibernate mid-match); an empty room stops the loop and may hibernate, which ends it.
 */
import { routePartykitRequest, Server, type Connection, type WSMessage } from 'partyserver';
import { GameRoom, TICK_HZ } from './game';

interface Env {
  GameServer: DurableObjectNamespace;
}

export class GameServer extends Server<Env> {
  static options = { hibernate: true };
  private game: GameRoom | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private last = 0;

  private room(): GameRoom {
    this.game ??= new GameRoom((id, msg) => this.getConnection(id)?.send(msg));
    return this.game;
  }

  onConnect(conn: Connection): void {
    this.room().connect(conn.id);
    if (!this.loop) {
      this.last = Date.now();
      this.loop = setInterval(() => {
        const now = Date.now();
        this.room().tick(Math.min(0.1, (now - this.last) / 1000));
        this.last = now;
      }, 1000 / TICK_HZ);
    }
  }

  onMessage(conn: Connection, message: WSMessage): void {
    this.room().message(conn.id, typeof message === 'string' ? message : new TextDecoder().decode(message as ArrayBuffer));
  }

  onClose(conn: Connection): void {
    this.room().disconnect(conn.id);
    if ([...this.getConnections()].length === 0 && this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env as unknown as Record<string, unknown>)) ?? new Response('Not found', { status: 404 });
  },
};
