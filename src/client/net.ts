/**
 * Connection to the room. partysocket reconnects on its own; options are tuned for a game rather
 * than chat (fast first retry, no queue of stale inputs). Every snapshot is full state, so a
 * reconnect needs no special catch-up path.
 */
import PartySocket from 'partysocket';
import type { ClientMsg, Look, PrivateEvent, PrivateView, PublicView, ServerMsg } from '../shared/protocol';

/** What the client needs from a connection; Net (online) and LocalNet (solo) both provide it. */
export interface NetLike {
  pub: PublicView | null;
  me: PrivateView | null;
  onEvent: (ev: PrivateEvent) => void;
  onState: () => void;
  readonly connected: boolean;
  send(m: ClientMsg): void;
}

export class Net implements NetLike {
  pub: PublicView | null = null;
  me: PrivateView | null = null;
  lastSnapshotAt = 0;
  private ws: PartySocket;
  onEvent: (ev: PrivateEvent) => void = () => {};
  onState: () => void = () => {};

  constructor(room: string, private token: string, private look: () => Look) {
    this.ws = new PartySocket({
      host: location.host,
      party: 'game-server',
      room,
      minReconnectionDelay: 300,
      maxReconnectionDelay: 3000,
      maxEnqueuedMessages: 0,
    });
    this.ws.addEventListener('open', () => this.send({ t: 'hello', token: this.token, look: this.look() }));
    this.ws.addEventListener('message', (e: MessageEvent) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      if (m.t === 'state') {
        this.pub = m.pub;
        this.me = m.me;
        this.lastSnapshotAt = performance.now();
        this.onState();
      } else this.onEvent(m.ev);
    });
    // Sockets can look open but be dead after a laptop sleeps: no snapshot for 6 s means reconnect.
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN && performance.now() - this.lastSnapshotAt > 6000) this.ws.reconnect();
    }, 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ws.readyState !== WebSocket.OPEN) this.ws.reconnect();
    });
  }

  get connected(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(m: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}
