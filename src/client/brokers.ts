/**
 * Matchmaking: who hosts a room, and passing the connection offer and answer between two players.
 * Two ways, tried in order:
 * - RedisBroker: our own Vercel function (/api/signal) with Redis from the Vercel Marketplace.
 * - PeerBroker: the free public PeerJS server (0.peerjs.com), so rooms work with no setup at all.
 *   The room's host takes the id "cbx-<code>"; a friend registers an id of their own and sends
 *   their offer to it. Only the offer and answer go through it: the game itself runs directly
 *   between the players. `?peer=ws://localhost:9000/peerjs` points tests at a local one.
 *
 * Claiming a room either may take it (`take`: you made the room, or you were already playing in it
 * and its host left) or may not (you opened someone's code): a friend never ends up hosting an
 * empty copy of a room just because its host's phone was away for a moment.
 */
import { signal } from './p2p';

/** `n` pairs an answer with the offer it answers, so a late answer to an old attempt is ignored. */
export type Offer = { t: 'offer' | 'answer'; sdp: string; n?: string };

/** 'host': this tab hosts the room. A string: the host's id. 'none': nobody hosts it (and we may not take it). null: unreachable. */
export type Claim = 'host' | 'none' | string | null;

export interface Broker {
  readonly kind: 'redis' | 'peer';
  claim(take: boolean): Promise<Claim>;
  send(to: string, msg: Offer): Promise<boolean>;
  onMessage: (from: string, msg: Offer) => void;
  /** Hosting only: someone else holds the room now (we were away too long). */
  onLost: () => void;
  close(): void;
}

const store = (s: 'local' | 'session') => {
  try {
    return s === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
};
/** A token kept in storage (so a reconnect, or a new tab on the same phone, reuses it). */
function keptToken(kind: 'local' | 'session', key: string): string {
  const st = store(kind);
  let t = '';
  try {
    t = st?.getItem(key) ?? '';
    if (!t) st?.setItem(key, (t = Math.random().toString(36).slice(2)));
  } catch { /* storage blocked */ }
  return t || Math.random().toString(36).slice(2);
}

export class RedisBroker implements Broker {
  readonly kind = 'redis';
  onMessage: (from: string, msg: Offer) => void = () => {};
  onLost: () => void = () => {};
  private timers: number[] = [];
  private hosting = false;
  private closed = false;
  private unlisten = () => {};

  constructor(private room: string, private me: string) {}

  async claim(take: boolean): Promise<Claim> {
    const r = await signal({ op: take ? 'claim' : 'peek', room: this.room, me: this.me });
    if (!r) return null;
    if (!r.host) return 'none';
    this.hosting = r.host === this.me;
    if (this.hosting) {
      const keep = async () => {
        const r2 = await signal({ op: 'claim', room: this.room, me: this.me });
        if (r2 && r2.host !== this.me && !this.closed) this.onLost();
      };
      this.timers.push(window.setInterval(() => void keep(), 10000));
      // Back from the background (a phone that switched apps): re-claim straight away.
      const onShow = () => document.visibilityState === 'visible' && !this.closed && void keep();
      document.addEventListener('visibilitychange', onShow);
      this.unlisten = () => document.removeEventListener('visibilitychange', onShow);
    }
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
    this.unlisten();
    this.timers.forEach((t) => clearTimeout(t));
    if (this.hosting) navigator.sendBeacon('/api/signal', JSON.stringify({ op: 'release', room: this.room, me: this.me }));
  }
}

const PEER_URL = new URLSearchParams(location.search).get('peer') ?? 'wss://0.peerjs.com/peerjs';

export class PeerBroker implements Broker {
  readonly kind = 'peer';
  onMessage: (from: string, msg: Offer) => void = () => {};
  onLost: () => void = () => {};
  private ws: WebSocket | null = null;
  private beat = 0;
  private closed = false;
  private hosting = false;
  private rehosting = false;
  private retry = 0;
  private unlisten = () => {};
  private hostId: string;
  /**
   * The host's token for its room id lives in localStorage: after a phone comes back from the
   * background, or opens the room again in a new tab (tapping its own link), it re-attaches to the
   * same id at once, even while the server still holds the old connection.
   */
  private hostToken: string;
  /** A friend's id and token stay the same across retries, so a retry re-attaches instead of clashing. */
  private guestId: string;
  private guestToken: string;

  constructor(private room: string, me: string) {
    this.hostId = `cbx-${room}`;
    this.hostToken = keptToken('local', `cbx-host-${room}`);
    this.guestId = `${this.hostId}-${me.replace(/[^A-Za-z0-9]/g, '').slice(0, 10)}`;
    this.guestToken = keptToken('session', `cbx-guest-${room}-${me}`);
  }

  /** Open a connection to the server under an id: 'open', 'taken', or 'error'. */
  private open(id: string, token: string): Promise<'open' | 'taken' | 'error'> {
    return new Promise((done) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${PEER_URL}?key=peerjs&id=${encodeURIComponent(id)}&token=${token}&version=1.5.4`);
      } catch {
        return done('error');
      }
      let settled = false;
      const finish = (r: 'open' | 'taken' | 'error') => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        done(r);
      };
      const t = setTimeout(() => (ws.close(), finish('error')), 8000);
      const ready = () => {
        if (settled) return;
        clearInterval(this.beat);
        this.ws = ws;
        this.beat = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"HEARTBEAT"}'), 5000);
        ws.onclose = () => this.ws === ws && this.dropped();
        finish('open');
      };
      // Re-attaching to our own id (same token) gets no OPEN message: no refusal within a moment
      // of connecting means we're back in.
      ws.onopen = () => setTimeout(() => ws.readyState === WebSocket.OPEN && ready(), 2500);
      ws.onmessage = (e) => {
        let m: { type?: string; src?: string; payload?: Offer };
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.type === 'OPEN') {
          ready();
        } else if (m.type === 'ID-TAKEN') {
          ws.close();
          finish('taken');
        } else if (m.type === 'ERROR') {
          ws.close();
          finish('error');
        } else if ((m.type === 'OFFER' || m.type === 'ANSWER') && m.src && m.payload?.sdp) this.onMessage(m.src, m.payload);
      };
      ws.onerror = () => finish('error');
      ws.onclose = () => finish('error');
    });
  }

  /** The host's connection to the server died: get it back (if we're on screen). */
  private dropped(): void {
    this.ws = null;
    if (this.closed || !this.hosting || document.visibilityState !== 'visible') return;
    void this.rehost();
  }

  /** Re-register the host id with our token (re-attaching if the server still holds the old socket). */
  private async rehost(): Promise<void> {
    if (this.closed || this.rehosting) return;
    this.rehosting = true;
    const r = await this.open(this.hostId, this.hostToken);
    this.rehosting = false;
    if (this.closed) return;
    if (r === 'open') return void (this.retry = 0);
    if (r === 'taken') return this.onLost();
    this.retry = Math.min(this.retry + 1, 5);
    setTimeout(() => void this.rehost(), 1000 * 2 ** this.retry);
  }

  async claim(take: boolean): Promise<Claim> {
    if (take) {
      const r = await this.open(this.hostId, this.hostToken);
      if (r === 'error') return null;
      if (r === 'open') {
        this.hosting = true;
        // Back on screen: a phone's socket can look open but be dead after the background, so
        // always re-attach (cheap: same id, same token).
        const onShow = () => {
          if (document.visibilityState !== 'visible' || this.closed) return;
          const old = this.ws;
          this.ws = null;
          old?.close();
          void this.rehost();
        };
        document.addEventListener('visibilitychange', onShow);
        this.unlisten = () => document.removeEventListener('visibilitychange', onShow);
        return 'host';
      }
    }
    // A friend: our own id; the offer goes to the host's id (queued briefly if it's away).
    const g = await this.open(this.guestId, this.guestToken);
    return g === 'open' ? this.hostId : null;
  }

  async send(to: string, msg: Offer): Promise<boolean> {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: msg.t === 'offer' ? 'OFFER' : 'ANSWER', dst: to, payload: msg }));
    return true;
  }

  close(): void {
    this.closed = true;
    this.unlisten();
    clearInterval(this.beat);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

/** Our own matchmaking if the site has it switched on, else the public server. */
let kind: 'redis' | 'peer' | null = new URLSearchParams(location.search).get('broker') === 'peer' ? 'peer' : null;
export async function claimRoom(room: string, me: string, take: boolean): Promise<{ broker: Broker; host: Claim } | null> {
  if (kind !== 'peer') {
    const b = new RedisBroker(room, me);
    const host = await b.claim(take);
    if (host) return (kind = 'redis'), { broker: b, host };
    b.close();
    // Only fall back for good if our function isn't there (no Redis); a blip on a working site retries.
    if (kind === null) kind = 'peer';
    else return null;
  }
  const b = new PeerBroker(room, me);
  const host = await b.claim(take);
  if (host) return { broker: b, host };
  b.close();
  return null;
}
