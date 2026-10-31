/**
 * Matchmaking: who hosts a room, and passing the connection offer and answer between two players.
 * Two ways, tried in order:
 * - RedisBroker: our own Vercel function (/api/signal) with Redis from the Vercel Marketplace.
 * - PeerBroker: the free public PeerJS server (0.peerjs.com), so rooms work with no setup at all.
 *   The room's host takes the id "cbx-<code>"; anyone else who opens the code finds it taken and
 *   sends their offer to it. Only the offer and answer go through it: the game itself runs
 *   directly between the players. `?peer=ws://localhost:9000/peerjs` points tests at a local one.
 */
import { signal } from './p2p';

export type Offer = { t: 'offer' | 'answer'; sdp: string };

export interface Broker {
  /** 'host' if this tab now hosts the room, else the host's id; null if matchmaking can't be reached. */
  claim(): Promise<'host' | string | null>;
  send(to: string, msg: Offer): Promise<boolean>;
  onMessage: (from: string, msg: Offer) => void;
  close(): void;
}

export class RedisBroker implements Broker {
  onMessage: (from: string, msg: Offer) => void = () => {};
  private timers: number[] = [];
  private hosting = false;
  private closed = false;

  constructor(private room: string, private me: string) {}

  async claim(): Promise<'host' | string | null> {
    const r = await signal({ op: 'claim', room: this.room, me: this.me });
    if (!r) return null;
    this.hosting = r.host === this.me;
    if (this.hosting) this.timers.push(window.setInterval(() => void signal({ op: 'claim', room: this.room, me: this.me }), 10000));
    void this.poll();
    return this.hosting ? 'host' : String(r.host);
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    const r = await signal({ op: 'poll', room: this.room, me: this.me });
    for (const m of (r?.msgs as { from: string; msg: Offer }[]) ?? []) if (m.msg?.sdp) this.onMessage(m.from, m.msg);
    const wait = !this.hosting ? 600 : document.visibilityState === 'visible' ? 1500 : 4000;
    if (!this.closed) this.timers.push(window.setTimeout(() => void this.poll(), wait));
  }

  async send(to: string, msg: Offer): Promise<boolean> {
    return !!(await signal({ op: 'send', room: this.room, me: this.me, to, msg }));
  }

  close(): void {
    this.closed = true;
    this.timers.forEach((t) => clearTimeout(t));
    if (this.hosting) navigator.sendBeacon('/api/signal', JSON.stringify({ op: 'release', room: this.room, me: this.me }));
  }
}

const PEER_URL = new URLSearchParams(location.search).get('peer') ?? 'wss://0.peerjs.com/peerjs';

export class PeerBroker implements Broker {
  onMessage: (from: string, msg: Offer) => void = () => {};
  private ws: WebSocket | null = null;
  private beat = 0;

  constructor(private room: string, private me: string) {}

  /** Open a connection to the server under an id: 'open', 'taken', or 'error'. */
  private open(id: string): Promise<'open' | 'taken' | 'error'> {
    return new Promise((done) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${PEER_URL}?key=peerjs&id=${encodeURIComponent(id)}&token=${Math.random().toString(36).slice(2)}&version=1.5.4`);
      } catch {
        return done('error');
      }
      const t = setTimeout(() => (ws.close(), done('error')), 8000);
      ws.onmessage = (e) => {
        let m: { type?: string; src?: string; payload?: Offer };
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.type === 'OPEN') {
          clearTimeout(t);
          this.ws = ws;
          this.beat = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"HEARTBEAT"}'), 5000);
          done('open');
        } else if (m.type === 'ID-TAKEN') {
          clearTimeout(t);
          ws.close();
          done('taken');
        } else if (m.type === 'ERROR') {
          clearTimeout(t);
          ws.close();
          done('error');
        } else if ((m.type === 'OFFER' || m.type === 'ANSWER') && m.src && m.payload?.sdp) this.onMessage(m.src, m.payload);
      };
      ws.onerror = () => (clearTimeout(t), done('error'));
    });
  }

  async claim(): Promise<'host' | string | null> {
    const hostId = `cbx-${this.room}`;
    const r = await this.open(hostId);
    if (r === 'open') return 'host';
    if (r === 'error') return null;
    return (await this.open(`${hostId}-${this.me.replace(/[^A-Za-z0-9]/g, '').slice(0, 10)}`)) === 'open' ? hostId : null;
  }

  async send(to: string, msg: Offer): Promise<boolean> {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: msg.t === 'offer' ? 'OFFER' : 'ANSWER', dst: to, payload: msg }));
    return true;
  }

  close(): void {
    clearInterval(this.beat);
    this.ws?.close();
    this.ws = null;
  }
}

/** Our own matchmaking if the site has it switched on, else the public server. */
let kind: 'redis' | 'peer' | null = new URLSearchParams(location.search).get('broker') === 'peer' ? 'peer' : null;
export async function claimRoom(room: string, me: string): Promise<{ broker: Broker; host: 'host' | string } | null> {
  if (kind !== 'peer') {
    const b = new RedisBroker(room, me);
    const host = await b.claim();
    if (host) return (kind = 'redis'), { broker: b, host };
    b.close();
    kind = 'peer';
  }
  const b = new PeerBroker(room, me);
  const host = await b.claim();
  if (host) return { broker: b, host };
  b.close();
  return null;
}
