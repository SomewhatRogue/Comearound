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

  constructor(look: () => Look) {
    this.room = new GameRoom((_conn, raw) => this.receive(raw), { seed: Math.floor(Math.random() * 1e9) });
    this.room.connect('local');
    this.room.message('local', JSON.stringify({ t: 'hello', token: 'solo', look: look() } satisfies ClientMsg));
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (!this.paused) this.room.tick(Math.min(0.1, (now - last) / 1000));
      last = now;
    }, 1000 / TICK_HZ);
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
