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
import { P2PHost, P2PNet, signal } from './p2p';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const newCode = () => Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join('');

export class Online {
  mode: 'solo' | 'friends';
  state: 'idle' | 'starting' | 'offline' | 'host' | 'connecting' | 'guest' | 'failed' = 'idle';
  onChange: () => void = () => {};
  private host: P2PHost | null = null;
  private guest: P2PNet | null = null;
  private timers: number[] = [];
  /** A host we just lost: their room claim can outlive their tab for up to 45 s. */
  private lostAt = 0;
  private gen = 0;

  constructor(private room: string, private me: string, private local: LocalNet, private net: SwitchNet, private look: () => Look) {
    this.mode = room ? 'friends' : 'solo';
    addEventListener('pagehide', () => this.release());
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

  private release(): void {
    if (this.state === 'host') navigator.sendBeacon('/api/signal', JSON.stringify({ op: 'release', room: this.room, me: this.me }));
  }

  private async connect(): Promise<void> {
    const gen = ++this.gen;
    this.set('starting');
    for (;;) {
      const r = await signal({ op: 'claim', room: this.room, me: this.me });
      if (gen !== this.gen) return;
      if (!r) return this.set('offline');
      if (r.host === this.me) return this.becomeHost();
      this.set('connecting');
      const p = new P2PNet(this.room, this.me, String(r.host), this.me, this.look);
      const ok = await p.connect(this.lostAt ? 8000 : 15000);
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
      // Just lost a host? Their claim may still be live: keep trying until it lapses.
      if (!this.lostAt || performance.now() - this.lostAt > 60000) return this.set('failed');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  private becomeHost(): void {
    this.lostAt = 0;
    this.host = new P2PHost(this.room, this.me, this.local, () => this.onChange());
    // Keep the room claimed, and read the mailbox for friends' connection offers.
    this.timers.push(window.setInterval(() => void signal({ op: "claim", room: this.room, me: this.me }), 10000));
    const gen = this.gen;
    const poll = async () => {
      if (this.state !== 'host' || gen !== this.gen) return;
      const r = await signal({ op: 'poll', room: this.room, me: this.me });
      for (const m of (r?.msgs as { from: string; msg: { t: string; sdp: string } }[]) ?? []) if (m.msg?.t === 'offer') void this.host?.offer(m.from, m.msg.sdp);
      this.timers.push(window.setTimeout(poll, document.visibilityState === 'visible' ? 1500 : 4000));
    };
    this.set('host');
    void poll();
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
    this.release();
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.host?.close();
    this.host = null;
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
    if (this.state === 'failed') void this.connect();
  }

  share(): void {
    const url = this.link();
    const nav = navigator as Navigator & { share?: (d: { url: string; title: string }) => Promise<void> };
    if (nav.share) void nav.share({ url, title: 'Come Bye! Join my pack' }).catch(() => {});
    else void navigator.clipboard?.writeText(url).then(() => this.net.onEvent({ kind: 'toast', text: 'Invite link copied' })).catch(() => {});
  }

  private link(): string {
    return `${location.origin}${location.pathname}?room=${this.room}`;
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
        body = '<p class="quiet">Connecting to the host...</p>';
        break;
      case 'offline':
        body = '<p>Online play isn\'t switched on for this site yet, so this is a solo game with bot dogs.</p>';
        break;
      case 'host':
        body = `<div class="invite"><code>${esc(this.link().replace(/^https?:\/\//, ''))}</code><button class="chip on" data-act="share">${'share' in navigator ? 'Share link' : 'Copy link'}</button></div>
          <p class="quiet">${this.friends ? `${this.friends === 1 ? 'A friend has' : `${this.friends} friends have`} joined. Pick a course and start when you're ready.` : 'Send this link to friends. When they open it, they pop up in your pack below.'} Bot dogs fill any empty spots. Keep this tab open: it runs the game.</p>${packBox}`;
        break;
      case 'guest':
        body = `<p>You're in <b>${esc(hostName)}</b>'s game. They pick the course and start it.</p>${packBox}`;
        break;
      case 'failed':
        body = '<p>Couldn\'t connect to the host. Some networks block direct connections between players.</p><div class="games"><button class="chip" data-act="retry">Try again</button><button class="chip" data-act="join" data-v="solo">Play solo</button></div>';
        break;
    }
    return `${tabs}<div class="friends">${body}</div>`;
  }
}
