/**
 * Playing with friends on the Vercel site. The lobby has a Solo / With friends switch:
 * - Solo: your game, bot dogs, nothing online.
 * - With friends: a room code and link to send. Everyone connects to the room relay (a Vercel
 *   Function, api/room.ts); the room's host runs the game in their tab and the relay carries
 *   friends' input to it and its snapshots back (see relay.ts).
 * A friend who opened someone's code never takes the room: if its host isn't there yet they wait.
 * If the host leaves, a player who was already in the room takes it over and the rest follow.
 */
import type { Look, PrivateView, PublicView } from '../shared/protocol';
import type { LocalNet } from './local';
import type { SwitchNet } from './party';
import { RelayHost, RelayNet, RelaySocket, type RelayMsg } from './relay';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Rooms this device has hosted: opening one of those again may take it back. */
function hosted(room: string, mark = false): boolean {
  try {
    if (mark) localStorage.setItem(`cbx-hosted-${room}`, '1');
    return localStorage.getItem(`cbx-hosted-${room}`) === '1';
  } catch {
    return mark;
  }
}
const newCode = () => Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join('');

export class Online {
  mode: 'solo' | 'friends';
  /** idle: solo. starting: reaching the relay. waiting: no host in the room yet. connecting: hello sent, no snapshot yet. */
  state: 'idle' | 'starting' | 'waiting' | 'connecting' | 'host' | 'guest' | 'offline' = 'idle';
  onChange: () => void = () => {};
  private sock: RelaySocket | null = null;
  private host: RelayHost | null = null;
  private guest: RelayNet | null = null;
  /** Opened someone else's code (and hasn't played in that room yet): may not take the room. */
  private joiner: boolean;
  /** False when the site has no Redis yet: then only players on the same server instance can meet. */
  private shared = true;
  private helloTimer = 0;
  private takeTimer = 0;

  constructor(private room: string, private me: string, private local: LocalNet, private net: SwitchNet, private look: () => Look) {
    this.mode = room ? 'friends' : 'solo';
    this.joiner = !!room && !hosted(room);
  }

  /** Bot dogs always fill in when you play solo. */
  get forceBots(): boolean {
    return this.mode === 'solo' || this.state === 'offline';
  }

  async start(): Promise<void> {
    if (this.mode === 'friends') this.connect();
    else this.onChange();
  }

  private set(s: Online['state']): void {
    this.state = s;
    this.onChange();
  }

  private connect(): void {
    this.leaveRoom();
    this.set('starting');
    const sock = new RelaySocket(this.room, this.me, this.joiner ? 'join' : 'host');
    this.sock = sock;
    sock.onMessage = (m) => sock === this.sock && this.onRelay(m);
    sock.onDown = (tries) => {
      if (sock !== this.sock) return;
      // Can't reach the relay at all (the first connection never opened, several times over).
      if (tries >= 4 && this.state === 'starting') this.set('offline');
    };
  }

  private onRelay(m: RelayMsg): void {
    switch (m.t) {
      case 'info':
        this.shared = m.shared;
        return this.onChange();
      case 'role':
        if (m.role === 'host') return this.becomeHost();
        if (this.host) {
          // We were away long enough that someone else took the room: follow them.
          this.net.onEvent({ kind: 'toast', text: 'Someone took over the room while you were away. Joining them...' });
          this.dropHost();
        }
        return this.follow(m.host!);
      case 'nohost':
        return this.set('waiting');
      case 'hosted':
        if (!this.host) this.follow(m.id);
        return;
      case 'left':
        this.host?.handle(m);
        // A goodbye from the host's old connection (it has already reconnected) isn't the host leaving.
        if (this.guest && m.id === this.guest.hostId && !(m.cn && this.guest.hostConn && m.cn !== this.guest.hostConn)) this.hostGone();
        return;
      case 'msg':
        this.host?.handle(m);
        if (this.guest) {
          const was = this.guest.lastAt;
          this.guest.handle(m);
          if (!was && this.guest?.lastAt) this.joined();
        }
    }
  }

  private becomeHost(): void {
    this.dropGuest();
    this.joiner = false;
    hosted(this.room, true);
    if (!this.host && this.sock) this.host = new RelayHost(this.sock, this.local, () => this.onChange());
    this.set('host');
  }

  /** Say hello to the room's host, and keep saying it until its first snapshot arrives. */
  private follow(hostId: string): void {
    clearTimeout(this.takeTimer);
    if (!this.sock) return;
    if (this.guest?.hostId !== hostId) {
      const playing = !!this.guest?.lastAt;
      this.guest = new RelayNet(this.sock, hostId, this.me, this.look);
      if (playing) this.net.use(this.guest);
    }
    if (!this.guest.lastAt) this.set('connecting');
    const g = this.guest;
    // Always say hello (after a reconnect the host may have let our seat go: same token, same seat),
    // then keep saying it until the first snapshot arrives.
    const again = () => {
      if (this.guest !== g || g.lastAt) return;
      g.hello();
      this.helloTimer = window.setTimeout(again, 2000);
    };
    clearTimeout(this.helloTimer);
    g.hello();
    this.helloTimer = window.setTimeout(again, 2000);
  }

  private joined(): void {
    if (!this.guest) return;
    this.joiner = false;
    this.local.paused = true;
    this.net.use(this.guest);
    this.set('guest');
  }

  /** The host left: wait for a new one; a player who was in the room steps up if nobody does. */
  private hostGone(): void {
    this.dropGuest();
    this.net.onEvent({ kind: 'toast', text: 'The host left. Finding the room a new host...' });
    this.set('waiting');
    if (this.joiner) return;
    clearTimeout(this.takeTimer);
    // Give a host who's only reconnecting (a phone back from the background) time to come back first.
    this.takeTimer = window.setTimeout(() => {
      if (this.state === 'waiting' && this.mode === 'friends') this.sock?.reconnect('take');
    }, 6000 + Math.random() * 3000);
  }

  private dropGuest(): void {
    clearTimeout(this.helloTimer);
    if (!this.guest) return;
    this.guest = null;
    this.local.paused = false;
    this.net.use(this.local);
  }

  private dropHost(): void {
    this.host?.close();
    this.host = null;
  }

  private leaveRoom(): void {
    clearTimeout(this.takeTimer);
    this.dropHost();
    this.dropGuest();
    this.sock?.close();
    this.sock = null;
  }

  private setUrl(): void {
    const url = new URL(location.href);
    if (this.mode === 'friends') url.searchParams.set('room', this.room);
    else url.searchParams.delete('room');
    try {
      history.replaceState(null, '', url);
    } catch { /* sandboxed frame */ }
  }

  /** The lobby switch. */
  setMode(m: 'solo' | 'friends'): void {
    if (m === this.mode) return;
    this.mode = m;
    if (m === 'solo') {
      this.leaveRoom();
      this.set('idle');
    } else {
      if (!this.room) [this.room, this.joiner] = [newCode(), false];
      this.connect();
    }
    this.setUrl();
  }

  join(v: string): void {
    this.setMode(v === 'solo' ? 'solo' : 'friends');
  }

  /** A fresh room with a new code. */
  newRoom(): void {
    [this.room, this.mode, this.joiner] = [newCode(), 'friends', false];
    this.setUrl();
    this.connect();
  }

  /** Join a friend's room by its code (typed in the lobby). */
  joinCode(raw: string): void {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (code.length < 3 || code === this.room) return;
    [this.room, this.mode, this.joiner] = [code, 'friends', !hosted(code)];
    this.setUrl();
    this.connect();
  }

  /** Host the room you're waiting on (its host never came). */
  hostRoom(): void {
    this.joiner = false;
    this.sock?.reconnect('take');
  }

  retry(): void {
    this.connect();
  }

  share(): void {
    const url = this.link();
    const nav = navigator as Navigator & { share?: (d: { url: string; title: string }) => Promise<void> };
    if (nav.share) void nav.share({ url, title: 'Come Bye! Join my pack' }).catch(() => {});
    else void navigator.clipboard?.writeText(url).then(() => this.net.onEvent({ kind: 'toast', text: 'Invite link copied' })).catch(() => {});
  }

  /** The invite: always on the site's public domain (a deployment's own URL asks friends to sign in to Vercel). */
  private link(): string {
    const site = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return site ? `https://${site}/?room=${this.room}` : `${location.origin}${location.pathname}?room=${this.room}`;
  }

  get friends(): number {
    return this.host?.guests.size ?? 0;
  }

  key(): string {
    return JSON.stringify([this.mode, this.state, this.friends, this.room, this.shared]);
  }

  /** The top of the lobby: the switch, the invite link, who's in your pack. */
  html(pub?: PublicView, me?: PrivateView): string {
    const tabs = `<div class="seg"><button class="${this.mode === 'solo' ? 'on' : ''}" data-act="join" data-v="solo">Solo</button><button class="${this.mode === 'friends' ? 'on' : ''}" data-act="join" data-v="friends">With friends</button></div>`;
    if (this.mode === 'solo') return `${tabs}<p class="quiet">Just you and bot dogs. Switch to <b>With friends</b> for a code to send your friends.</p>`;
    const humans = (pub?.dogs ?? []).filter((d) => !d.bot);
    const pack = humans.map((d) => `<li><i style="background:${esc(d.look.collar)}"></i>${esc(d.look.name)}${d.id === me?.you ? ' <span class="quiet">(you)</span>' : ''}${d.id === pub?.hostId ? ' <em>host</em>' : ''}${d.connected ? '' : ' <span class="quiet">(away)</span>'}</li>`).join('');
    const packBox = `<div class="label">Your pack (${humans.length})</div><ul class="who">${pack}</ul>`;
    const hostName = humans.find((d) => d.id === pub?.hostId)?.look.name ?? 'the host';
    let body = '';
    switch (this.state) {
      case 'idle':
      case 'starting':
        body = '<p class="quiet">Opening the room...</p>';
        break;
      case 'waiting':
        body = `<p>Waiting for room <b>${esc(this.room)}</b>'s host... Their game needs to be open (on a phone, on screen). You'll join as soon as it is.</p><div class="games"><button class="chip" data-act="hostroom">Host this room myself</button></div>`;
        break;
      case 'connecting':
        body = '<p class="quiet">Joining the host\'s game...</p>';
        break;
      case 'offline':
        body = '<p>Couldn\'t reach the game\'s room server. Check your connection and try again.</p><div class="games"><button class="chip" data-act="retry">Try again</button><button class="chip" data-act="join" data-v="solo">Play solo</button></div>';
        break;
      case 'host':
        body = `<p class="code-line">Room code <b>${esc(this.room)}</b> <button class="link" data-act="newroom">new code</button></p><div class="invite"><code>${esc(this.link().replace(/^https?:\/\//, ''))}</code><button class="chip on" data-act="share">${'share' in navigator ? 'Share link' : 'Copy link'}</button></div>
          <p class="quiet">${this.friends ? `${this.friends === 1 ? 'A friend has' : `${this.friends} friends have`} joined. Pick a course and start when you're ready.` : 'Send the code or link. When friends join, they pop up in your pack below.'} Bot dogs fill any empty spots. Your game runs the room, so keep it open.</p>${packBox}`;
        break;
      case 'guest':
        body = `<p>You're in <b>${esc(hostName)}</b>'s game. They pick the course and start it.</p>${packBox}<div class="games"><button class="chip" data-act="newroom">Leave and start my own room</button></div>`;
        break;
    }
    const warn = this.shared ? '' : '<p class="quiet">Heads up: online play isn\'t fully set up on this site yet (it needs Redis in the Vercel project), so friends may not always find each other.</p>';
    const join = this.state === 'connecting' || this.state === 'starting' ? '' : `<div class="join-code"><input id="code-input" maxlength="12" placeholder="Friend's code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="chip" data-act="joincode">Join</button></div>`;
    return `${tabs}<div class="friends">${body}${warn}${join}</div>`;
  }
}
