/**
 * Solo mode: runs the real GameRoom inside the browser, with bots in the empty seats.
 * Same interface as Net, so nothing else in the client knows the difference. Used for the
 * shareable solo link, and later for the single-player tutorial.
 */
import { GameRoom, TICK_HZ } from '../server/game';
import type { ClientMsg, Look, PrivateEvent, PrivateView, PublicView, ServerMsg } from '../shared/protocol';
import type { NetLike } from './net';

export class LocalNet implements NetLike {
  pub: PublicView | null = null;
  me: PrivateView | null = null;
  onEvent: (ev: PrivateEvent) => void = () => {};
  onState: () => void = () => {};
  readonly room: GameRoom;
  /** Test hook: freeze the room's clock (screenshots on a slow machine). */
  paused = false;
  ticks = 0;
  /** Messages for friends playing in this tab's room (hosting over the artifact's live room). */
  remote: (conn: string, raw: string) => void = () => {};

  constructor(look: () => Look) {
    this.room = new GameRoom((conn, raw) => (conn === 'local' ? this.receive(raw) : this.remote(conn, raw)), { seed: Math.floor(Math.random() * 1e9) });
    this.room.connect('local');
    this.room.message('local', JSON.stringify({ t: 'hello', token: 'solo', look: look() } satisfies ClientMsg));
    this.last = performance.now();
    setInterval(() => this.pump(), 1000 / TICK_HZ);
  }

  private last = 0;
  private acc = 0;

  /**
   * Advance the room by however much real time has passed, in fixed 50 ms steps. Called by a timer
   * and by every animation frame: phone web views (and iframes) can throttle timers to a crawl,
   * and a room that only ticks when the timer fires would then barely move.
   */
  pump(): void {
    const now = performance.now();
    this.acc += Math.min(0.5, Math.max(0, now - this.last) / 1000);
    this.last = now;
    if (this.paused) return void (this.acc = 0);
    const step = 1 / TICK_HZ;
    while (this.acc >= step) {
      this.room.tick(step);
      this.ticks++;
      this.acc -= step;
    }
  }

  get connected(): boolean {
    return true;
  }

  send(m: ClientMsg): void {
    this.room.message('local', JSON.stringify(m));
  }

  private receive(raw: string): void {
    const m = JSON.parse(raw) as ServerMsg;
    if (m.t === 'state') {
      [this.pub, this.me] = [m.pub, m.me];
      this.onState();
    } else this.onEvent(m.ev);
  }
}
