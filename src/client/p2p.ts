/**
 * Online play without a game server: the host's tab runs the GameRoom and each friend connects to
 * it directly over WebRTC. Two data channels per friend: "ctl" (reliable: their messages, your
 * events) and "state" (unreliable, unordered: a compact snapshot 20 times a second, so a lost
 * packet is simply replaced by the next one). /api/signal only passes the offers and answers.
 */
import { publicView } from '../server/view';
import type { ClientMsg, Look, PrivateEvent, PrivateView, PublicView, ServerMsg } from '../shared/protocol';
import { decodeView, encodeView, type WireView } from '../shared/wire';
import type { LocalNet } from './local';
import type { Offer } from './brokers';
import type { NetLike } from './net';

const env = import.meta.env as Record<string, string | undefined>;
export const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ...(env.VITE_TURN_URL ? [{ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS }] : []),
];
const MAX_GUESTS = 7;

export async function signal(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Wait for ICE gathering so one offer and one answer carry every route (no trickle round trips). */
function gathered(pc: RTCPeerConnection, ms = 2500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((done) => {
    const t = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && (clearTimeout(t), done()));
  });
}

type Guest = { pc: RTCPeerConnection; ctl?: RTCDataChannel; state?: RTCDataChannel; joined: boolean };

export class P2PHost {
  readonly guests = new Map<string, Guest>();
  private timer: number;

  constructor(private local: LocalNet, private reply: (to: string, msg: Offer) => Promise<boolean>, private onGuests: () => void) {
    local.remote = (conn, raw) => {
      const g = this.guests.get(conn);
      if (g?.ctl?.readyState === 'open' && raw.startsWith('{"t":"event"')) g.ctl.send(raw);
    };
    this.timer = window.setInterval(() => this.broadcast(), 50);
  }

  /** A friend's offer arrived (from the mailbox): answer it. */
  async offer(from: string, sdp: string): Promise<void> {
    this.drop(from);
    if (this.guests.size >= MAX_GUESTS) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const g: Guest = { pc, joined: false };
    this.guests.set(from, g);
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.label === 'state') g.state = ch;
      if (ch.label !== 'ctl') return;
      g.ctl = ch;
      ch.onopen = () => {
        g.joined = true;
        this.local.room.quietConns.add(from);
        this.local.room.connect(from);
        this.onGuests();
      };
      ch.onmessage = (m) => typeof m.data === 'string' && m.data.length < 4000 && this.local.room.message(from, m.data);
      ch.onclose = () => this.drop(from);
    };
    pc.onconnectionstatechange = () => (pc.connectionState === 'failed' || pc.connectionState === 'closed') && this.drop(from);
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    await this.reply(from, { t: 'answer', sdp: pc.localDescription?.sdp ?? '' });
  }

  private drop(id: string): void {
    const g = this.guests.get(id);
    if (!g) return;
    this.guests.delete(id);
    g.pc.close();
    if (g.joined) {
      this.local.room.disconnect(id);
      this.local.room.quietConns.delete(id);
    }
    this.onGuests();
  }

  get joined(): number {
    return [...this.guests.values()].filter((g) => g.joined).length;
  }

  private broadcast(): void {
    const open = [...this.guests].filter(([, g]) => g.state?.readyState === 'open');
    if (!open.length) return;
    const s = JSON.stringify(encodeView(publicView(this.local.room)));
    for (const [id, g] of open) {
      const d = this.local.room.dogOf(id);
      // A congested link skips a frame rather than queueing stale ones.
      if (!d || g.state!.bufferedAmount > 64_000) continue;
      g.state!.send(`{"m":${JSON.stringify([d.id, Math.round(d.stamina), d.barkCd <= 0 ? 1 : 0])},"s":${s}}`);
    }
  }

  close(): void {
    clearInterval(this.timer);
    for (const id of [...this.guests.keys()]) this.drop(id);
    this.local.remote = () => {};
  }
}

export class P2PNet implements NetLike {
  pub: PublicView | null = null;
  me: PrivateView | null = null;
  onEvent: (ev: PrivateEvent) => void = () => {};
  onState: () => void = () => {};
  /** The connection dropped after it had worked. */
  onGone: () => void = () => {};
  private pc = new RTCPeerConnection({ iceServers: ICE });
  private ctl = this.pc.createDataChannel('ctl', { ordered: true });
  private state = this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
  private lastAt = 0;
  private closed = false;

  private answer: ((sdp: string) => void) | null = null;

  constructor(private offerTo: (msg: Offer) => Promise<boolean>, private token: string, private look: () => Look) {
    this.ctl.onopen = () => this.send({ t: 'hello', token: this.token, look: this.look() });
    this.ctl.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      if (m.t === 'event') this.onEvent(m.ev);
    };
    this.state.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { m: [string, number, number]; s: WireView };
      this.pub = decodeView(m.s);
      this.me = { you: m.m[0], stamina: m.m[1], barkReady: !!m.m[2] };
      this.lastAt = performance.now();
      this.onState();
    };
    let gone = false;
    const lost = () => {
      if (this.closed || gone || this.lastAt === 0) return;
      gone = true;
      this.onGone();
    };
    this.ctl.onclose = lost;
    // A host whose tab closed can take half a minute to read as "failed": 4 s of silence is enough.
    const watch = window.setInterval(() => {
      if (this.closed) clearInterval(watch);
      else if (this.lastAt && performance.now() - this.lastAt > 4000) lost();
    }, 1000);
    this.pc.onconnectionstatechange = () => (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') && lost();
  }

  /** The host's answer arrived (through matchmaking). */
  answered(sdp: string): void {
    this.answer?.(sdp);
  }

  /** Offer, then wait for the host's answer and the first snapshot. Resolves false if it never comes. */
  async connect(timeoutMs = 15000): Promise<boolean> {
    const until = performance.now() + timeoutMs;
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await gathered(this.pc);
    const got = new Promise<string | null>((done) => {
      this.answer = done;
      setTimeout(() => done(null), Math.max(0, until - performance.now()));
    });
    if (!(await this.offerTo({ t: 'offer', sdp: this.pc.localDescription?.sdp ?? '' }))) return false;
    const sdp = await got;
    if (!sdp || this.closed) return false;
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    while (performance.now() < until && !this.closed && !this.me) await new Promise((r) => setTimeout(r, 100));
    return !!this.me;
  }

  get connected(): boolean {
    return this.ctl.readyState === 'open' && performance.now() - this.lastAt < 3000;
  }

  send(m: ClientMsg): void {
    if (this.ctl.readyState === 'open') this.ctl.send(JSON.stringify(m));
  }

  close(): void {
    this.closed = true;
    this.pc.close();
  }
}
