/**
 * Playing together over the artifact page's live room. Both ends talk only through presence:
 * - HostEnd: this tab runs the real GameRoom (LocalNet). Each friend's presence carries their
 *   token, look, stick and a bark counter; the host feeds those to the room as ordinary client
 *   messages, and keeps one compact snapshot (plus each friend's stamina and events) in its own
 *   presence, about 15 times a second.
 * - RemoteNet: a friend's tab. Same interface as Net, so the rest of the client can't tell.
 * The host's room still decides everything; friends only ever send intent.
 */
import { publicView } from '../server/view';
import type { ClientMsg, Look, PrivateEvent, PrivateView, PublicView } from '../shared/protocol';
import { decodeView, encodeView, type WireView } from '../shared/wire';
import type { LocalNet } from './local';
import type { NamedRoomLike, Peer } from './liveroom';
import type { NetLike } from './net';

const MAX_GUESTS = 7;
const SEND_MS = 66;

/** A guest as last heard: input, bark and pat counters, look, and whether they are practising. */
type Guest = { inKey: string; bk: number; lookKey: string; pr: boolean; pt: number };

export class HostEnd {
  readonly guests = new Map<string, Guest>();
  private events = new Map<string, [number, PrivateEvent, number][]>();
  private seq = 0;
  private timer: number;
  private unsub: () => void;
  private wasSending = false;

  constructor(private named: NamedRoomLike, private local: LocalNet, private onGuests: () => void) {
    local.remote = (conn, raw) => {
      if (!this.guests.has(conn) || !raw.startsWith('{"t":"event"')) return;
      const list = this.events.get(conn) ?? [];
      list.push([++this.seq, (JSON.parse(raw) as { ev: PrivateEvent }).ev, performance.now()]);
      this.events.set(conn, list.slice(-6));
    };
    this.unsub = named.onPeers((c) => {
      for (const p of c.left) this.drop(p.peer);
      for (const p of [...c.joined, ...c.updated]) if (!p.isMe) this.apply(p);
    });
    this.timer = window.setInterval(() => this.broadcast(), SEND_MS);
  }

  private say(peer: string, m: ClientMsg): void {
    this.local.room.message(peer, JSON.stringify(m));
  }

  private drop(peer: string): void {
    if (!this.guests.delete(peer)) return;
    this.local.room.disconnect(peer);
    this.local.room.quietConns.delete(peer);
    this.events.delete(peer);
    this.onGuests();
  }

  /** A friend's presence changed: turn it into the messages a socket would have sent. */
  private apply(p: Peer): void {
    const pr = p.presence;
    if (typeof pr.tok !== 'string') return;
    const look = pr.look as Look;
    let g = this.guests.get(p.peer);
    if (!g) {
      if (this.guests.size >= MAX_GUESTS) return;
      g = { inKey: '', bk: Number(pr.bk) || 0, lookKey: JSON.stringify(look), pr: false, pt: Array.isArray(pr.pt) ? Number((pr.pt as unknown[])[1]) || 0 : 0 };
      this.guests.set(p.peer, g);
      this.local.room.quietConns.add(p.peer);
      this.local.room.connect(p.peer);
      this.say(p.peer, { t: 'hello', token: `guest-${pr.tok.slice(0, 48)}`, look });
      this.onGuests();
    }
    const inp = Array.isArray(pr.in) ? (pr.in as unknown[]).map(Number) : [0, 0, 0, 0];
    const inKey = inp.join(',');
    if (inKey !== g.inKey) {
      g.inKey = inKey;
      this.say(p.peer, { t: 'input', dx: inp[0] || 0, dz: inp[1] || 0, sprint: !!inp[2], crouch: !!inp[3] });
    }
    const bk = Number(pr.bk) || 0;
    if (bk > g.bk) this.say(p.peer, { t: 'bark' });
    g.bk = Math.max(g.bk, bk);
    const practise = Number(pr.pr) === 1;
    if (practise !== g.pr) {
      g.pr = practise;
      this.say(p.peer, { t: 'practise', on: practise });
    }
    const pt = Array.isArray(pr.pt) ? (pr.pt as unknown[]) : null;
    if (pt && Number(pt[1]) > g.pt) {
      g.pt = Number(pt[1]);
      this.say(p.peer, { t: 'pet', id: String(pt[0]) });
    }
    const lookKey = JSON.stringify(look);
    if (lookKey !== g.lookKey) {
      g.lookKey = lookKey;
      this.say(p.peer, { t: 'look', look });
    }
  }

  private broadcast(): void {
    if (!this.guests.size) {
      if (this.wasSending) void this.named.presence({ s: null, m: null, e: null }).catch(() => {});
      this.wasSending = false;
      return;
    }
    this.wasSending = true;
    const room = this.local.room;
    const m: Record<string, [string, number, number]> = {};
    const e: Record<string, [number, PrivateEvent][]> = {};
    const now = performance.now();
    for (const peer of this.guests.keys()) {
      const d = room.dogOf(peer);
      if (d) m[peer] = [d.id, Math.round(d.stamina), d.barkCd <= 0 ? 1 : 0];
      const evs = (this.events.get(peer) ?? []).filter((x) => now - x[2] < 2500);
      this.events.set(peer, evs);
      if (evs.length) e[peer] = evs.map(([s, ev]) => [s, ev]);
    }
    const s = encodeView(publicView(room));
    // The live room holds 4 KB per player: if a big field runs close, the leaderboard waits.
    if (JSON.stringify({ s, m, e }).length > 3900) s.lb = [];
    void this.named.presence({ s, m, e }).catch(() => {});
  }

  close(): void {
    clearInterval(this.timer);
    this.unsub();
    for (const peer of [...this.guests.keys()]) this.drop(peer);
    this.local.remote = () => {};
    void this.named.leave().catch(() => {});
  }
}

export class RemoteNet implements NetLike {
  pub: PublicView | null = null;
  me: PrivateView | null = null;
  onEvent: (ev: PrivateEvent) => void = () => {};
  onState: () => void = () => {};
  /** The host left or went quiet. */
  onGone: () => void = () => {};
  private bk = 0;
  private pt = 0;
  private lastSeq = 0;
  private lastAt = performance.now();
  private seen: unknown = null;
  private unsub: () => void;
  private timer: number;

  constructor(private named: NamedRoomLike, private hostPeer: string, token: string, look: Look) {
    void named.presence({ tok: token, look, in: [0, 0, 0, 0], bk: 0 }).catch(() => {});
    this.unsub = named.onPeers((c) => {
      if (c.left.some((p) => p.peer === hostPeer)) return this.onGone();
      const h = c.peers.find((p) => p.peer === hostPeer);
      if (h && h.presence !== this.seen) this.take(h.presence);
    });
    this.timer = window.setInterval(() => {
      if (performance.now() - this.lastAt > 12000) this.onGone();
    }, 1000);
  }

  private take(p: Readonly<Record<string, unknown>>): void {
    this.seen = p;
    if (!p.s) return;
    const mine = this.named.peers().find((q) => q.sameTab)?.peer ?? '';
    try {
      this.pub = decodeView(p.s as WireView);
    } catch {
      return;
    }
    const m = (p.m as Record<string, [string, number, number]> | undefined)?.[mine];
    this.me = m ? { you: m[0], stamina: m[1], barkReady: !!m[2] } : null;
    for (const [seq, ev] of (p.e as Record<string, [number, PrivateEvent][]> | undefined)?.[mine] ?? []) {
      if (seq <= this.lastSeq) continue;
      this.lastSeq = seq;
      this.onEvent(ev);
    }
    this.lastAt = performance.now();
    this.onState();
  }

  get connected(): boolean {
    return this.named.connected() && performance.now() - this.lastAt < 3000;
  }

  send(m: ClientMsg): void {
    const r = (n: number) => Math.round(n * 100) / 100;
    const patch = m.t === 'input' ? { in: [r(m.dx), r(m.dz), m.sprint ? 1 : 0, m.crouch ? 1 : 0] } : m.t === 'bark' ? { bk: ++this.bk } : m.t === 'look' ? { look: m.look } : m.t === 'practise' ? { pr: m.on ? 1 : 0 } : m.t === 'pet' ? { pt: [m.id, ++this.pt] } : null;
    if (patch) void this.named.presence(patch).catch(() => {});
  }

  close(): void {
    clearInterval(this.timer);
    this.unsub();
    void this.named.leave().catch(() => {});
  }
}
