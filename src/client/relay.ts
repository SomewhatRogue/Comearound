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
  | { t: 'hosted' | 'left'; id: string }
  | { t: 'msg'; from: string; d: unknown }
  | { t: 'info'; shared: boolean };

const MAX_GUESTS = 7;

export class RelaySocket {
  onMessage: (m: RelayMsg) => void = () => {};
  /** Lost the connection (it reconnects by itself); `tries` counts failures in a row. */
  onDown: (tries: number) => void = () => {};
  private ws: WebSocket | null = null;
  private closed = false;
  private tries = 0;
  private timer = 0;

  constructor(private room: string, private id: string, public want: 'host' | 'take' | 'join') {
    this.open();
  }

  private url(): string {
    const base = new URLSearchParams(location.search).get('relay') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room`;
    return `${base}?room=${encodeURIComponent(this.room)}&id=${encodeURIComponent(this.id)}&want=${this.want}`;
  }

  private open(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => (this.tries = 0);
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as RelayMsg);
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
    this.ws?.close();
    this.ws = null;
  }
}

export class RelayHost {
  readonly guests = new Set<string>();
  private timer: number;

  constructor(private sock: RelaySocket, private local: LocalNet, private onGuests: () => void) {
    local.remote = (conn, raw) => {
      if (this.guests.has(conn) && raw.startsWith('{"t":"event"')) this.sock.send(conn, { ev: (JSON.parse(raw) as { ev: PrivateEvent }).ev });
    };
    this.timer = window.setInterval(() => this.broadcast(), 66);
  }

  /** A message from a friend (or a friend leaving), from the relay. */
  handle(m: RelayMsg): void {
    if (m.t === 'left') return this.drop(m.id);
    if (m.t !== 'msg') return;
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

  constructor(private sock: RelaySocket, public hostId: string, private id: string, private look: () => Look) {}

  hello(): void {
    this.sock.send(this.hostId, { t: 'hello', token: this.id, look: this.look() });
  }

  handle(m: RelayMsg): void {
    if (m.t !== 'msg' || m.from !== this.hostId) return;
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
    if (m.t === 'input' || m.t === 'bark' || m.t === 'look') this.sock.send(this.hostId, m);
  }
}
