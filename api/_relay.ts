/**
 * The room relay, as Vercel's docs lay out for realtime on Functions: each player holds a WebSocket
 * to a Vercel Function; any instance may hold any player, so instances share rooms through Redis
 * (one pub/sub channel per room for messages, keys for who hosts). Each instance delivers to its
 * own sockets first and publishes with its origin id, skipping its own echoes.
 *
 * The game itself runs in the host's browser (the GameRoom); the relay only routes messages:
 * friends' input to the host, the host's snapshots and events to friends.
 *
 * Player URL: /api/room?room=CODE&id=PLAYER&want=host|take|join
 *   host: made this room (or hosted it on this device); take: was playing in it and its host left;
 *   join: opened someone's code. Only host/take may claim the room; join waits for a host.
 * To the player: {t:'role', role:'host'} | {t:'role', role:'guest', host} | {t:'nohost'} |
 *   {t:'hosted', id} | {t:'left', id} | {t:'msg', from, d} | {t:'info', shared}
 * From the player: {to: '*' | id, d}
 */

export interface Store {
  get(key: string): Promise<string | null>;
  /** SET key val NX EX ttl; returns the value now held. */
  setNx(key: string, val: string, ttl: number): Promise<string | null>;
  set(key: string, val: string, ttl: number): Promise<void>;
  expire(key: string, ttl: number): Promise<void>;
  del(key: string): Promise<void>;
}
export interface Bus {
  /** Resolves with how many instances heard it (Redis PUBLISH's reply; this one included), or -1 if unknown. */
  publish(channel: string, msg: string): Promise<number>;
  subscribe(channel: string, fn: (msg: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}
export interface Backend { store: Store; bus: Bus; shared: boolean }

/** The bits of a WebSocket the relay uses (the `ws` package's WebSocket fits). */
export interface Sock {
  send(data: string): void;
  close(code?: number): void;
  on(ev: 'message', fn: (data: unknown) => void): void;
  on(ev: 'close' | 'pong', fn: () => void): void;
  readyState: number;
  ping?(): void;
  terminate?(): void;
}

const HOST_TTL = 30;
/** How long a new claim holds before its host has said anything. */
const CLAIM_GRACE_MS = 1500;
/** A host that hasn't sent anything this long (a phone frozen in the background) may be replaced. */
export const STALE_MS = 8000;
const ROOM = /^[A-Z0-9]{3,12}$/;
const ID = /^[\w-]{6,64}$/;
const MAX_MSG = 64_000;
/**
 * While no other instance has players in a room, its messages stay on this instance; one still goes
 * out this often, so a newcomer elsewhere is found (they announce themselves at once anyway).
 */
export const PROBE_MS = 2000;
/** Anyone elsewhere talks at least every 3 s; heard within this long, they're still there. */
const REMOTE_MS = 10_000;

type Conn = { sock: Sock; id: string; room: string; host: boolean; touchedAt: number; nonce: string; alive: boolean };
/** `cn`: the sender's connection, so a player can tell a stale goodbye (an old connection) from a real one. */
type Envelope = { k: 'msg'; from: string; to: string; d: unknown; o: string; cn: string } | { k: 'hosted' | 'left'; id: string; o: string; cn?: string };

const hostKey = (room: string) => `cb:host:${room}`;
const seenKey = (room: string) => `cb:seen:${room}`;
/** The newest connection of a player: a dead old one that closes late mustn't say they left. */
const connKey = (room: string, id: string) => `cb:conn:${room}:${id}`;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ relay: 1, ...o }));
/**
 * Work started from a socket event, with nobody awaiting it. Redis can drop its connection (it
 * reconnects by itself); a command in flight then fails, and an uncaught failure would take down
 * the whole instance and every player on it (seen live: "Socket closed unexpectedly", then exit).
 */
const safe = (p: Promise<unknown>, what: string) => void p.catch((e) => log({ ev: 'err', what, msg: String((e as Error)?.message ?? e) }));
const chan = (room: string) => `cb:room:${room}`;

export class Relay {
  private rooms = new Map<string, Set<Conn>>();
  /**
   * Rooms nobody else is listening to, and when that was found. Redis's free plan is a few hundred
   * thousand commands a month, and publishing every message (the host's 15 snapshots a second, every
   * input) spent that in a few hours of play. Players usually share one instance, so most messages
   * never need Redis at all.
   */
  private alone = new Map<string, number>();
  /** When each room last heard from another instance: while that's recent, everything goes out. */
  private elsewhere = new Map<string, number>();
  readonly origin = Math.random().toString(36).slice(2, 10);

  private staleMs: number;
  /** Redis's meter: messages published and kept local since the last log line. */
  private sent = { pub: 0, kept: 0 };

  constructor(private b: Backend, opts: { staleMs?: number } = {}) {
    this.staleMs = opts.staleMs ?? STALE_MS;
    const meter = setInterval(() => {
      if (this.sent.pub || this.sent.kept) log({ ev: 'meter', inst: this.origin, rooms: this.rooms.size, ...this.sent });
      this.sent = { pub: 0, kept: 0 };
    }, 5 * 60_000);
    (meter as { unref?: () => void }).unref?.();
  }

  /** A player's socket arrived. */
  async attach(sock: Sock, url: URL): Promise<void> {
    const room = (url.searchParams.get('room') ?? '').toUpperCase();
    const id = url.searchParams.get('id') ?? '';
    const want = url.searchParams.get('want') ?? 'join';
    if (!ROOM.test(room) || !ID.test(id)) return sock.close(4000);
    const c: Conn = { sock, id, room, host: false, touchedAt: 0, nonce: Math.random().toString(36).slice(2, 10), alive: true };
    await this.b.store.set(connKey(room, id), c.nonce, 3600);
    log({ ev: 'join', room, id: id.slice(0, 8), want, inst: this.origin });
    let set = this.rooms.get(room);
    if (!set) {
      this.rooms.set(room, (set = new Set()));
      await this.b.bus.subscribe(chan(room), (raw) => this.fromBus(room, raw));
    }
    set.add(c);
    sock.on('message', (data) => safe(this.fromPlayer(c, String(data)), 'message'));
    sock.on('close', () => {
      clearInterval(beat);
      safe(this.gone(c), 'gone');
    });
    // A phone can vanish without closing its socket: ping it, and drop it if it stops answering.
    sock.on('pong', () => (c.alive = true));
    const beat = setInterval(() => {
      if (!c.alive) return void (sock.terminate ? sock.terminate() : sock.close());
      c.alive = false;
      try {
        sock.ping?.();
      } catch { /* closing */ }
    }, 15000);
    this.tell(c, { t: 'info', shared: this.b.shared });
    await this.decide(c, want);
  }

  private tell(c: Conn, m: unknown): void {
    if (c.sock.readyState === 1) c.sock.send(JSON.stringify(m));
  }

  /** Host, guest, or wait for a host. */
  private async decide(c: Conn, want: string): Promise<void> {
    const { room, id } = c;
    let holder = await this.b.store.get(hostKey(room));
    const had = holder === id;
    if (want === 'host' || want === 'take') {
      if (!holder) holder = await this.b.store.setNx(hostKey(room), id, HOST_TTL);
      else if (holder !== id && (await this.stale(room))) {
        await this.b.store.set(hostKey(room), id, HOST_TTL);
        holder = id;
      }
    } else if (holder && holder !== id && (await this.stale(room))) holder = null;
    log({ ev: 'decide', room, id: id.slice(0, 8), want, holder: holder ? holder.slice(0, 8) : null });
    if (holder === id) return this.becomeHost(c, !had);
    if (holder) return this.tell(c, { t: 'role', role: 'guest', host: holder });
    this.tell(c, { t: 'nohost' });
  }

  private async stale(room: string): Promise<boolean> {
    const seen = Number(await this.b.store.get(seenKey(room))) || 0;
    return Date.now() - seen > this.staleMs;
  }

  /**
   * `claimed`: the room is newly theirs, so it starts fresh. A host coming back to a room it already
   * holds doesn't refresh it just by connecting: only what it sends proves it's alive. (Seen in the
   * stress test: a crashed page whose timers still ran reconnected every 10 s, never sent a thing,
   * and kept the room from everyone.)
   */
  private async becomeHost(c: Conn, claimed: boolean): Promise<void> {
    c.host = true;
    // A new claim gets a moment's grace (so two friends asking at once don't swap it back and
    // forth), not the full stale time: a live host speaks at once, and its first message refreshes
    // it. Several crashed pages that kept reconnecting each won it for 8 s this way, in turn.
    if (claimed) {
      const grace = Math.min(CLAIM_GRACE_MS, this.staleMs / 2);
      await Promise.all([this.b.store.expire(hostKey(c.room), HOST_TTL), this.b.store.set(seenKey(c.room), String(Date.now() - this.staleMs + grace), HOST_TTL)]);
    }
    this.tell(c, { t: 'role', role: 'host' });
    await this.send(c.room, { k: 'hosted', id: c.id, o: this.origin, cn: c.nonce });
  }

  /** The host is alive: keep its claim and its last-seen time fresh (at most every 2 s). */
  private async touch(c: Conn, now = false): Promise<void> {
    if (!c.host || (!now && Date.now() - c.touchedAt < Math.min(2000, this.staleMs / 4))) return;
    c.touchedAt = Date.now();
    await Promise.all([this.b.store.expire(hostKey(c.room), HOST_TTL), this.b.store.set(seenKey(c.room), String(Date.now()), HOST_TTL)]);
  }

  private async fromPlayer(c: Conn, raw: string): Promise<void> {
    if (raw.length > MAX_MSG) return;
    let m: { to?: unknown; d?: unknown };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    c.alive = true;
    // Anything from the host, its heartbeat included, says it's still there. A host alone in its
    // room sends nothing but heartbeats, and must not look gone to the first friend who joins.
    safe(this.touch(c), 'touch');
    // The game's own heartbeat: answered here, never relayed.
    if ((m as { ping?: unknown }).ping) return this.tell(c, { t: 'pong' });
    const to = typeof m.to === 'string' ? m.to : '';
    if (!to) return;
    await this.send(c.room, { k: 'msg', from: c.id, to, d: m.d, o: this.origin, cn: c.nonce });
  }

  /** Deliver to this instance's sockets, then tell the other instances. */
  private async send(room: string, env: Envelope): Promise<void> {
    this.deliver(room, env);
    // Joins and leaves always go out; messages only when another instance is listening (or to look).
    const now = Date.now();
    const at = this.alone.get(room);
    const quiet = now - (this.elsewhere.get(room) ?? 0) > REMOTE_MS;
    if (env.k === 'msg' && quiet && at !== undefined && now - at < PROBE_MS) return void this.sent.kept++;
    this.sent.pub++;
    const heard = await this.b.bus.publish(chan(room), JSON.stringify(env));
    // Only this instance heard it: nobody else is here. (0 or unknown can't be right, since this
    // instance is subscribed itself: keep publishing.)
    if (heard === 1) this.alone.set(room, now);
    else this.alone.delete(room);
  }

  private fromBus(room: string, raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    if (env.o === this.origin) return;
    // Someone on another instance: from now on this room's messages go out to them.
    this.alone.delete(room);
    this.elsewhere.set(room, Date.now());
    this.deliver(room, env);
  }

  private deliver(room: string, env: Envelope): void {
    for (const c of this.rooms.get(room) ?? []) {
      if (env.k === 'msg') {
        if (c.id !== env.from && (env.to === '*' || env.to === c.id)) this.tell(c, { t: 'msg', from: env.from, d: env.d, cn: env.cn });
      } else if (c.id !== env.id) {
        this.tell(c, { t: env.k, id: env.id, cn: env.cn });
        // Someone else hosts now: a host here that was replaced (it was away too long) steps down.
        if (env.k === 'hosted' && c.host) {
          c.host = false;
          this.tell(c, { t: 'role', role: 'guest', host: env.id });
        }
      }
    }
  }

  private async gone(c: Conn): Promise<void> {
    const set = this.rooms.get(c.room);
    set?.delete(c);
    // Only the player's newest connection may say they left (and give up the room).
    const newest = (await this.b.store.get(connKey(c.room, c.id))) === c.nonce;
    log({ ev: 'gone', room: c.room, id: c.id.slice(0, 8), host: c.host, newest });
    if (newest) {
      await this.b.store.del(connKey(c.room, c.id));
      // A host saying goodbye: the room is free to take at once (it's stale). The claim itself stays,
      // so the same host reconnecting doesn't count as a fresh claim: only its messages win it back.
      // (A crashed page that kept reconnecting re-won the room this way, from a deleted claim.)
      if (c.host && (await this.b.store.get(hostKey(c.room))) === c.id) await this.b.store.del(seenKey(c.room));
      await this.send(c.room, { k: 'left', id: c.id, o: this.origin, cn: c.nonce });
    }
    if (set && !set.size) {
      this.rooms.delete(c.room);
      this.alone.delete(c.room);
      this.elsewhere.delete(c.room);
      await this.b.bus.unsubscribe(chan(c.room));
    }
  }
}

/** One process, no Redis: rooms only work for players on this same instance (local dev, tests). */
export function memoryBackend(shared?: { kv: Map<string, { v: string; exp: number }>; subs: Map<string, Set<(m: string) => void>> }): Backend {
  const kv = shared?.kv ?? new Map<string, { v: string; exp: number }>();
  const subs = shared?.subs ?? new Map<string, Set<(m: string) => void>>();
  const mine = new Map<string, (m: string) => void>();
  const live = (k: string) => {
    const e = kv.get(k);
    if (e && e.exp < Date.now()) kv.delete(k);
    return kv.get(k)?.v ?? null;
  };
  return {
    shared: !!shared,
    store: {
      get: async (k) => live(k),
      setNx: async (k, v, ttl) => (live(k) ?? (kv.set(k, { v, exp: Date.now() + ttl * 1000 }), v)),
      set: async (k, v, ttl) => void kv.set(k, { v, exp: Date.now() + ttl * 1000 }),
      expire: async (k, ttl) => {
        const e = kv.get(k);
        if (e) e.exp = Date.now() + ttl * 1000;
      },
      del: async (k) => void kv.delete(k),
    },
    bus: {
      publish: async (ch, m) => {
        const fns = [...(subs.get(ch) ?? [])];
        fns.forEach((f) => f(m));
        return fns.length;
      },
      subscribe: async (ch, fn) => {
        mine.set(ch, fn);
        (subs.get(ch) ?? subs.set(ch, new Set()).get(ch)!).add(fn);
      },
      unsubscribe: async (ch) => {
        const fn = mine.get(ch);
        if (fn) subs.get(ch)?.delete(fn);
        mine.delete(ch);
      },
    },
  };
}

/** Redis from the Vercel Marketplace (REDIS_URL): one connection for commands, one for pub/sub. */
export async function redisBackend(url: string): Promise<Backend> {
  const { createClient } = await import('redis');
  const cmd = createClient({ url });
  const sub = cmd.duplicate();
  cmd.on('error', () => {});
  sub.on('error', () => {});
  await Promise.all([cmd.connect(), sub.connect()]);
  return {
    shared: true,
    store: {
      get: (k) => cmd.get(k),
      setNx: async (k, v, ttl) => {
        await cmd.set(k, v, { NX: true, EX: ttl });
        return cmd.get(k);
      },
      set: async (k, v, ttl) => void (await cmd.set(k, v, { EX: ttl })),
      expire: async (k, ttl) => void (await cmd.expire(k, ttl)),
      del: async (k) => void (await cmd.del(k)),
    },
    bus: {
      publish: async (ch, m) => {
        const n = await cmd.publish(ch, m);
        return typeof n === 'number' ? n : -1;
      },
      subscribe: (ch, fn) => sub.subscribe(ch, fn),
      unsubscribe: (ch) => sub.unsubscribe(ch),
    },
  };
}
