/**
 * Playing with friends on the Vercel site. The lobby has a Solo / With friends switch:
 * - Solo: your game, bot dogs, nothing online.
 * - With friends: you get a room link to send. The first tab in a room hosts it (its GameRoom runs
 *   the game; friends connect to it directly over WebRTC, see p2p.ts). Opening someone's link
 *   puts you in With friends and connects you to their game.
 * If the host leaves, everyone drops back to their own game and the first to re-claim the room
 * hosts it; the rest reconnect to them. Without matchmaking (no Redis yet) it says so and plays solo.
 */
import type { Look, PrivateView, PublicView } from '../shared/protocol';
import type { LocalNet } from './local';
import type { SwitchNet } from './party';
import { claimRoom, type Broker } from './brokers';
import { P2PHost, P2PNet } from './p2p';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const newCode = () => Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join('');

export class Online {
  mode: 'solo' | 'friends';
  state: 'idle' | 'starting' | 'offline' | 'host' | 'connecting' | 'guest' | 'failed' = 'idle';
  onChange: () => void = () => {};
  private host: P2PHost | null = null;
  private guest: P2PNet | null = null;
  private broker: Broker | null = null;
  /** Why the last join failed: the host never answered, or no route between the two networks worked. */
  private why: 'answer' | 'link' = 'answer';
  /** A host we just lost: their room claim can outlive their tab for a little while. */
  private lostAt = 0;
  private gen = 0;

  constructor(private room: string, private me: string, private local: LocalNet, private net: SwitchNet, private look: () => Look) {
    this.mode = room ? 'friends' : 'solo';
    addEventListener('pagehide', () => this.stopHosting());
  }

  /** Bot dogs always fill in when you play solo. */
  get forceBots(): boolean {
    return this.mode === 'solo' || this.state === 'offline';
  }

  async start(): Promise<void> {
    if (this.mode === 'friends') await this.connect();
    else this.onChange();
  }

  private set(s: Online['state']): void {
    this.state = s;
    this.onChange();
  }

  private async connect(): Promise<void> {
    const gen = ++this.gen;
    this.set('starting');
    for (;;) {
      this.broker?.close();
      const r = await claimRoom(this.room, this.me);
      if (gen !== this.gen) return r?.broker.close();
      if (!r) return this.set('offline');
      this.broker = r.broker;
      if (r.host === 'host') return this.becomeHost(r.broker);
      const hostId = r.host;
      this.set('connecting');
      const p = new P2PNet((msg) => r.broker.send(hostId, msg), this.me, this.look);
      r.broker.onMessage = (from, msg) => from === hostId && msg.t === 'answer' && p.answered(msg.sdp);
      const result = await p.connect(this.lostAt ? 10000 : 20000);
      const ok = result === 'ok';
      this.why = result === 'no-link' ? 'link' : 'answer';
      // Connected (or not): matchmaking's job is done for a guest.
      r.broker.close();
      this.broker = null;
      if (gen !== this.gen) return p.close();
      if (ok) {
        this.lostAt = 0;
        this.guest = p;
        this.local.paused = true;
        this.net.use(p);
        p.onGone = () => this.hostLost();
        return this.set('guest');
      }
      p.close();
      // Just lost a host? Their claim may still be live for a few seconds: keep trying.
      if (!this.lostAt || performance.now() - this.lostAt > 60000) return this.set('failed');
      await new Promise((res) => setTimeout(res, 2000));
    }
  }

  private becomeHost(broker: Broker): void {
    this.lostAt = 0;
    const host = new P2PHost(this.local, (to, msg) => broker.send(to, msg), () => this.onChange());
    this.host = host;
    broker.onMessage = (from, msg) => {
      if (msg.t !== 'offer') return;
      this.net.onEvent({ kind: 'toast', text: 'A friend is joining...' });
      void host.offer(from, msg.sdp);
    };
    this.set('host');
  }

  private hostLost(): void {
    if (this.state !== 'guest') return;
    this.dropGuest();
    this.lostAt = performance.now();
    this.net.onEvent({ kind: 'toast', text: 'The host left. Finding the room a new host...' });
    setTimeout(() => this.mode === 'friends' && void this.connect(), 500 + Math.random() * 1500);
  }

  private dropGuest(): void {
    this.guest?.close();
    this.guest = null;
    this.local.paused = false;
    this.net.use(this.local);
  }

  private stopHosting(): void {
    this.broker?.close();
    this.broker = null;
    this.host?.close();
    this.host = null;
  }

  /** A fresh room with a new code (if a room got stuck, or to play with different people). */
  newRoom(): void {
    this.stopHosting();
    this.dropGuest();
    this.room = newCode();
    this.mode = 'friends';
    const url = new URL(location.href);
    url.searchParams.set('room', this.room);
    try {
      history.replaceState(null, '', url);
    } catch { /* sandboxed frame */ }
    void this.connect();
  }

  /** Join a friend's room by its code (typed in the lobby). */
  joinCode(raw: string): void {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!code || code === this.room) return;
    this.stopHosting();
    this.dropGuest();
    this.room = code;
    this.mode = 'friends';
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    try {
      history.replaceState(null, '', url);
    } catch { /* sandboxed frame */ }
    void this.connect();
  }

  /** The lobby switch. */
  setMode(m: 'solo' | 'friends'): void {
    if (m === this.mode) return;
    this.mode = m;
    this.gen++;
    const url = new URL(location.href);
    if (m === 'solo') {
      this.stopHosting();
      this.dropGuest();
      url.searchParams.delete('room');
      this.set('idle');
    } else {
      this.room ||= newCode();
      url.searchParams.set('room', this.room);
      void this.connect();
    }
    try {
      history.replaceState(null, '', url);
    } catch { /* sandboxed frame */ }
  }

  join(v: string): void {
    this.setMode(v === 'solo' ? 'solo' : 'friends');
  }

  retry(): void {
    if (this.state === 'failed' || this.state === 'offline') void this.connect();
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
    return this.host?.joined ?? 0;
  }

  key(): string {
    return JSON.stringify([this.mode, this.state, this.friends, this.room]);
  }

  /** The top of the lobby: the switch, the invite link, who's in your pack. */
  html(pub?: PublicView, me?: PrivateView): string {
    const tabs = `<div class="seg"><button class="${this.mode === 'solo' ? 'on' : ''}" data-act="join" data-v="solo">Solo</button><button class="${this.mode === 'friends' ? 'on' : ''}" data-act="join" data-v="friends">With friends</button></div>`;
    if (this.mode === 'solo') return `${tabs}<p class="quiet">Just you and bot dogs. Switch to <b>With friends</b> for a link to send your friends.</p>`;
    const humans = (pub?.dogs ?? []).filter((d) => !d.bot);
    const pack = humans.map((d) => `<li><i style="background:${esc(d.look.collar)}"></i>${esc(d.look.name)}${d.id === me?.you ? ' <span class="quiet">(you)</span>' : ''}${d.id === pub?.hostId ? ' <em>host</em>' : ''}${d.connected ? '' : ' <span class="quiet">(away)</span>'}</li>`).join('');
    const packBox = `<div class="label">Your pack (${humans.length})</div><ul class="who">${pack}</ul>`;
    const hostName = humans.find((d) => d.id === pub?.hostId)?.look.name ?? 'the host';
    let body = '';
    switch (this.state) {
      case 'starting':
      case 'idle':
        body = '<p class="quiet">Opening your room...</p>';
        break;
      case 'connecting':
        body = '<p class="quiet">Connecting to the host... this can take up to 20 seconds.</p>';
        break;
      case 'offline':
        body = '<p>Couldn\'t reach the matchmaking server, so this is a solo game for now.</p><div class="games"><button class="chip" data-act="retry">Try again</button></div>';
        break;
      case 'host':
        body = `<p class="code-line">Room code <b>${esc(this.room)}</b> <button class="link" data-act="newroom">new code</button></p><div class="invite"><code>${esc(this.link().replace(/^https?:\/\//, ''))}</code><button class="chip on" data-act="share">${'share' in navigator ? 'Share link' : 'Copy link'}</button></div>
          <p class="quiet">${this.friends ? `${this.friends === 1 ? 'A friend has' : `${this.friends} friends have`} joined. Pick a course and start when you're ready.` : 'Send this link to friends. When they open it, they pop up in your pack below.'} Bot dogs fill any empty spots. Keep this tab open: it runs the game.</p>${packBox}`;
        break;
      case 'guest':
        body = `<p>You're in <b>${esc(hostName)}</b>'s game. They pick the course and start it.</p>${packBox}<div class="games"><button class="chip" data-act="newroom">Leave and start my own room</button></div>`;
        break;
      case 'failed':
        body = this.why === 'answer'
          ? '<p>The host\'s game didn\'t answer. Check the code, and ask them to keep the game open and on screen: phones pause games in the background, so a host on a phone can\'t switch away to send the link.</p><div class="games"><button class="chip" data-act="retry">Try again</button><button class="chip" data-act="newroom">Start my own room</button><button class="chip" data-act="join" data-v="solo">Play solo</button></div>'
          : '<p>Found the host, but your two networks wouldn\'t let the games link up, even through the relay. Try again, or try from a different network (Wi-Fi instead of mobile data, say).</p><div class="games"><button class="chip" data-act="retry">Try again</button><button class="chip" data-act="newroom">Start my own room</button><button class="chip" data-act="join" data-v="solo">Play solo</button></div>';
        break;
    }
    const join = this.state === 'connecting' || this.state === 'starting' ? '' : `<div class="join-code"><input id="code-input" maxlength="12" placeholder="Friend's code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="chip" data-act="joincode">Join</button></div>`;
    return `${tabs}<div class="friends">${body}${join}</div>`;
  }
}
