/**
 * Friends on the shareable page. Everyone who opens it runs their own game (solo, with bot dogs)
 * and says so in the live room's lobby; anyone can tap Join to play in someone else's game
 * instead, and Leave to go back to their own. While friends are in yours, your tab is the host.
 * Without the live room (a saved copy, a public link) the page is plain solo, as before.
 */
import type { Look, PrivateEvent } from '../shared/protocol';
import type { LocalNet } from './local';
import { getLiveRoom, type LiveRoom, type NamedRoomLike, type Peer } from './liveroom';
import type { NetLike } from './net';
import { HostEnd, RemoteNet } from './remote';

export interface GameAd { peer: string; name: string; dogs: number; phase: string; code: string }

/** One connection that can be switched between your own game and a friend's. */
export class SwitchNet implements NetLike {
  onEvent: (ev: PrivateEvent) => void = () => {};
  onState: () => void = () => {};
  onSwap: () => void = () => {};
  constructor(public inner: NetLike) {
    this.wire(inner);
  }
  use(n: NetLike): void {
    this.inner = n;
    this.wire(n);
    this.onSwap();
  }
  private wire(n: NetLike): void {
    n.onEvent = (ev) => n === this.inner && this.onEvent(ev);
    n.onState = () => n === this.inner && this.onState();
  }
  get pub() { return this.inner.pub; }
  get me() { return this.inner.me; }
  get connected() { return this.inner.connected; }
  send(m: Parameters<NetLike['send']>[0]): void {
    this.inner.send(m);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Party {
  /** off: no live room here. */
  state: 'off' | 'solo' | 'guest' = 'off';
  games: GameAd[] = [];
  guestOf: GameAd | null = null;
  onChange: () => void = () => {};
  private room: LiveRoom | null = null;
  private code = Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
  private host: HostEnd | null = null;
  private remote: RemoteNet | null = null;
  private adKey = '';
  private busy = false;

  constructor(private local: LocalNet, private net: SwitchNet, private look: () => Look, private token: string) {}

  async start(): Promise<void> {
    this.room = await getLiveRoom();
    if (!this.room) return;
    this.state = 'solo';
    this.room.onPeers((c) => this.scan(c.peers), () => this.goOff());
    await this.hostUp();
    this.advertise();
    setInterval(() => this.advertise(), 1500);
    this.onChange();
  }

  private goOff(): void {
    this.state = 'off';
    this.onChange();
  }

  private async hostUp(): Promise<void> {
    if (!this.room) return;
    try {
      const named: NamedRoomLike = await this.room.join(`come-bye-${this.code}`);
      this.host = new HostEnd(named, this.local, () => this.onChange());
    } catch {
      this.host = null;
    }
  }

  /** Tell the lobby your game exists (while you're playing your own). */
  private advertise(): void {
    if (!this.room) return;
    const pub = this.local.pub;
    const ad = this.state === 'solo' && this.host ? { n: this.look().name.slice(0, 14), k: this.code, c: pub ? pub.dogs.filter((d) => !d.bot).length : 1, ph: pub?.phase ?? 'lobby' } : null;
    const key = JSON.stringify(ad);
    if (key === this.adKey) return;
    this.adKey = key;
    void this.room.presence({ cb: ad }).catch(() => {});
  }

  private scan(peers: readonly Peer[]): void {
    this.games = peers
      .filter((p) => !p.isMe)
      .map((p) => ({ p, ad: p.presence.cb as { n?: unknown; k?: unknown; c?: unknown; ph?: unknown } | null | undefined }))
      .filter(({ ad }) => ad && typeof ad.k === 'string' && /^[a-z0-9]{4,16}$/.test(ad.k))
      .map(({ p, ad }) => ({ peer: p.peer, name: String(ad!.n ?? 'A friend').slice(0, 14), dogs: Number(ad!.c) || 1, phase: String(ad!.ph ?? ''), code: ad!.k as string }));
    if (this.guestOf && !this.games.some((g) => g.peer === this.guestOf!.peer) && !this.remote?.pub) void this.leaveGame('That game has closed.');
    this.onChange();
  }

  get guestCount(): number {
    return this.host?.guests.size ?? 0;
  }

  join(peer: string): void {
    void this.joinGame(peer);
  }

  leave(): void {
    void this.leaveGame();
  }

  private async joinGame(peer: string): Promise<void> {
    const game = this.games.find((g) => g.peer === peer);
    if (!game || !this.room || this.busy || this.state !== 'solo' || this.guestCount) return;
    this.busy = true;
    try {
      const named = await this.room.join(`come-bye-${game.code}`);
      this.host?.close();
      this.host = null;
      this.state = 'guest';
      this.guestOf = game;
      this.advertise();
      this.local.paused = true;
      this.remote = new RemoteNet(named, peer, this.token, this.look());
      this.remote.onGone = () => void this.leaveGame(`${game.name}'s game has ended.`);
      this.net.use(this.remote);
    } catch {
      this.net.onEvent({ kind: 'toast', text: "Couldn't join that game." });
    }
    this.busy = false;
    this.onChange();
  }

  private async leaveGame(why?: string): Promise<void> {
    if (this.state !== 'guest' || this.busy) return;
    this.busy = true;
    this.remote?.close();
    this.remote = null;
    this.guestOf = null;
    this.local.paused = false;
    this.net.use(this.local);
    this.state = 'solo';
    await this.hostUp();
    this.advertise();
    if (why) this.net.onEvent({ kind: 'toast', text: why });
    this.busy = false;
    this.onChange();
  }

  key(): string {
    return JSON.stringify([this.state, this.games, this.guestOf?.peer, this.guestCount]);
  }

  /** The lobby's "play with friends" block. */
  html(): string {
    if (this.state === 'off') return '<p class="quiet">Solo: bot dogs work alongside you. Practise on the flock while you choose your dog.</p>';
    if (this.state === 'guest') {
      return `<div class="friends"><p>You're in <b>${esc(this.guestOf?.name ?? 'a friend')}</b>'s game. They pick the course and start it.</p><button class="chip" data-act="leave">Leave and play on my own</button></div>`;
    }
    const mine = this.guestCount ? `<p>${this.guestCount === 1 ? 'A friend has' : `${this.guestCount} friends have`} joined your game. You're the host: pick a course and start when ready.</p>` : '';
    const list = this.games.length
      ? `<div class="label">Friends with this page open</div><div class="games">${this.games.map((g) => `<button class="chip" data-act="join" data-v="${esc(g.peer)}" ${this.guestCount ? 'disabled' : ''}>Join ${esc(g.name)}'s game <span class="quiet">${g.dogs} ${g.dogs === 1 ? 'dog' : 'dogs'}${g.phase !== 'lobby' ? ', mid-run' : ''}</span></button>`).join('')}</div>`
      : '<p class="quiet">Play with friends: share this page with them. When they open it, their game shows up here to join, or they can join yours. Bot dogs fill any empty spots.</p>';
    return `<div class="friends">${mine}${list}</div>`;
  }
}
