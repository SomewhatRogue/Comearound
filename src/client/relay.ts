/**
 * Online play through the Vercel room relay (api/room.ts): every player keeps one WebSocket to it.
 * - RelaySocket: that socket, reconnecting on its own (Vercel closes function connections at
 *   their maximum duration, and phones drop them in the background).
 * - RelayHost: the host's end. This tab's GameRoom (LocalNet) runs the game; friends' messages
 *   arrive through the relay and are fed to it as ordinary client messages; a compact snapshot
 *   (plus each friend's stamina and bark) goes out to everyone about 15 times a second.
 * - RelayNet: a friend's end, with the same interface as Net, so the rest of the client can't tell.
 */
import { publicView } from '../server/view';
import type { ClientMsg, Look, PrivateEvent, PrivateView, PublicView } from '../shared/protocol';
import { decodeView, encodeView, type WireView } from '../shared/wire';
import type { LocalNet } from './local';
import type { NetLike } from './net';

export type RelayMsg =
  | { t: 'role'; role: 'host' | 'guest'; host?: string }
  | { t: 'nohost' }
  | { t: 'hosted' | 'left'; id: string; cn?: string }
  | { t: 'msg'; from: string; d: unknown; cn?: string }
  | { t: 'info'; shared: boolean }
  | { t: 'pong' };

const MAX_GUESTS = 7;
/**
 * Vercel ends a function's connections at its maximum duration (5 minutes unless raised, and then
 * without the phone always hearing about it), so every socket is swapped for a fresh one well
 * before: the new one opens first, the old one closes once the new one is talking.
 * `?rotate=ms` overrides it (tests).
 */
const ROTATE_MS = Number(new URLSearchParams(location.search).get('rotate')) || 4 * 60_000;

export class RelaySocket {
  onMessage: (m: RelayMsg) => void = () => {};
  /** Lost the connection (it reconnects by itself); `tries` counts failures in a row. */
  onDown: (tries: number) => void = () => {};
  private ws: WebSocket | null = null;
  private closed = false;
  private tries = 0;
  private timer = 0;
  private heardAt = 0;
  private beat = 0;
  private rotateTimer = 0;
  private unlisten = () => {};

  constructor(private room: string, private id: string, public want: 'host' | 'take' | 'join') {
    this.open();
    // Heartbeat: a phone back from the background can hold a socket that looks open but is dead.
    // Ping every 4 s; 10 s without hearing anything means reconnect.
    this.beat = window.setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (performance.now() - this.heardAt > 10000) return this.reconnect();
      this.ws.send('{"ping":1}');
    }, 4000);
    // Back on screen (or back online): check at once rather than waiting for the next beat.
    const check = () => {
      if (document.visibilityState !== 'visible' || this.closed) return;
      // Still opening (a page that just loaded): leave it be.
      if (this.ws?.readyState === WebSocket.CONNECTING) return;
      if (this.ws?.readyState !== WebSocket.OPEN) return this.reconnect();
      const asked = performance.now();
      this.ws.send('{"ping":1}');
      window.setTimeout(() => this.heardAt < asked && !this.closed && this.reconnect(), 2500);
    };
    document.addEventListener('visibilitychange', check);
    addEventListener('online', check);
    addEventListener('pageshow', check);
    this.unlisten = () => {
      document.removeEventListener('visibilitychange', check);
      removeEventListener('online', check);
      removeEventListener('pageshow', check);
    };
  }

  private url(): string {
    const base = new URLSearchParams(location.search).get('relay') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room`;
    return `${base}?room=${encodeURIComponent(this.room)}&id=${encodeURIComponent(this.id)}&want=${this.want}`;
  }

  private open(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;
    clearTimeout(this.rotateTimer);
    this.rotateTimer = window.setTimeout(() => this.rotate(), ROTATE_MS);
    ws.onopen = () => {
      this.tries = 0;
      this.heardAt = performance.now();
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) {
        // The old socket during a swap: still deliver (nothing is lost), until the new one talks.
        if (this.ws?.readyState === WebSocket.OPEN && this.newHeard) return void ws.close();
      } else this.newHeard = true;
      this.heardAt = performance.now();
      try {
        const m = JSON.parse(String(e.data)) as RelayMsg;
        if (m.t !== 'pong') this.onMessage(m);
      } catch { /* not ours */ }
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.closed) return;
      this.ws = null;
      this.tries++;
      this.onDown(this.tries);
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.open(), Math.min(8000, 400 * 2 ** Math.min(this.tries, 5)));
    };
  }

  private newHeard = false;

  /** Swap to a fresh connection before Vercel ends this one: open the new one, then drop the old. */
  private rotate(): void {
    const old = this.ws;
    if (this.closed || !old || old.readyState !== WebSocket.OPEN) return;
    this.newHeard = false;
    this.open();
    // If the new one never talks, the old one still goes (the heartbeat recovers from there).
    window.setTimeout(() => old.readyState <= WebSocket.OPEN && old.close(), 10000);
  }

  /** Reconnect now, optionally asking for a different role (taking over a room whose host left). */
  reconnect(want?: RelaySocket['want']): void {
    if (want) this.want = want;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    clearTimeout(this.timer);
    this.open();
  }

  get open_(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(to: string, d: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ to, d }));
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.rotateTimer);
    clearInterval(this.beat);
    this.unlisten();
    this.ws?.close();
    this.ws = null;
  }
}

export class RelayHost {
  readonly guests = new Set<string>();
  /** Each guest's newest connection (from their messages), so a late goodbye from an old one is ignored. */
  private conn = new Map<string, string>();
  private timer: number;

  constructor(private sock: RelaySocket, private local: LocalNet, private onGuests: () => void) {
    local.remote = (conn, raw) => {
      if (this.guests.has(conn) && raw.startsWith('{"t":"event"')) this.sock.send(conn, { ev: (JSON.parse(raw) as { ev: PrivateEvent }).ev });
    };
    this.timer = window.setInterval(() => this.broadcast(), 66);
  }

  /** A message from a friend (or a friend leaving), from the relay. */
  handle(m: RelayMsg): void {
    if (m.t === 'left') {
      const newest = this.conn.get(m.id);
      if (m.cn && newest && m.cn !== newest) return;
      return this.drop(m.id);
    }
    if (m.t !== 'msg') return;
    if (m.cn) this.conn.set(m.from, m.cn);
    const d = m.d as ClientMsg | null;
    if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
    const raw = JSON.stringify(d);
    if (raw.length > 4000) return;
    if (d.t === 'hello') {
      if (!this.guests.has(m.from)) {
        if (this.guests.size >= MAX_GUESTS) return;
        this.guests.add(m.from);
        this.local.room.quietConns.add(m.from);
        this.local.room.connect(m.from);
        this.onGuests();
      }
      // A hello again (after a reconnect) is a rejoin: same token, same seat.
      this.local.room.message(m.from, raw);
    } else if (this.guests.has(m.from) && d.t !== 'start' && d.t !== 'toLobby' && d.t !== 'endField') this.local.room.message(m.from, raw);
  }

  private drop(id: string): void {
    this.conn.delete(id);
    if (!this.guests.delete(id)) return;
    this.local.room.disconnect(id);
    this.local.room.quietConns.delete(id);
    this.onGuests();
  }

  private broadcast(): void {
    if (!this.guests.size) return;
    const room = this.local.room;
    const m: Record<string, [string, number, number]> = {};
    for (const id of this.guests) {
      const d = room.dogOf(id);
      if (d) m[id] = [d.id, Math.round(d.stamina), d.barkCd <= 0 ? 1 : 0];
    }
    this.sock.send('*', { s: encodeView(publicView(room)), m });
  }

  close(): void {
    clearInterval(this.timer);
    for (const id of [...this.guests]) this.drop(id);
    this.local.remote = () => {};
  }
}

export class RelayNet implements NetLike {
  pub: PublicView | null = null;
  me: PrivateView | null = null;
  onEvent: (ev: PrivateEvent) => void = () => {};
  onState: () => void = () => {};
  lastAt = 0;
  /** The host's newest connection (from its messages). */
  hostConn = '';

  constructor(private sock: RelaySocket, public hostId: string, private id: string, private look: () => Look) {}

  hello(): void {
    this.sock.send(this.hostId, { t: 'hello', token: this.id, look: this.look() });
  }

  handle(m: RelayMsg): void {
    if (m.t !== 'msg' || m.from !== this.hostId) return;
    if (m.cn) this.hostConn = m.cn;
    const d = m.d as { s?: WireView; m?: Record<string, [string, number, number]>; ev?: PrivateEvent };
    if (d.ev) return this.onEvent(d.ev);
    if (!d.s) return;
    const mine = d.m?.[this.id];
    if (!mine) return;
    try {
      this.pub = decodeView(d.s);
    } catch {
      return;
    }
    this.me = { you: mine[0], stamina: mine[1], barkReady: !!mine[2] };
    this.lastAt = performance.now();
    this.onState();
  }

  get connected(): boolean {
    return this.sock.open_ && performance.now() - this.lastAt < 3000;
  }

  send(m: ClientMsg): void {
    if (m.t === 'input' || m.t === 'bark' || m.t === 'look' || m.t === 'practise' || m.t === 'pet') this.sock.send(this.hostId, m);
  }
}
