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
  publish(channel: string, msg: string): Promise<void>;
  subscribe(channel: string, fn: (msg: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}
export interface Backend { store: Store; bus: Bus; shared: boolean }

/** The bits of a WebSocket the relay uses (the `ws` package's WebSocket fits). */
export interface Sock {
  send(data: string): void;
  close(code?: number): void;
  on(ev: 'message', fn: (data: unknown) => void): void;
  on(ev: 'close', fn: () => void): void;
  readyState: number;
}

const HOST_TTL = 30;
/** A host that hasn't sent anything this long (a phone frozen in the background) may be replaced. */
export const STALE_MS = 8000;
const ROOM = /^[A-Z0-9]{3,12}$/;
const ID = /^[\w-]{6,64}$/;
const MAX_MSG = 64_000;

type Conn = { sock: Sock; id: string; room: string; host: boolean; touchedAt: number };
type Envelope = { k: 'msg'; from: string; to: string; d: unknown; o: string } | { k: 'hosted' | 'left'; id: string; o: string };

const hostKey = (room: string) => `cb:host:${room}`;
const seenKey = (room: string) => `cb:seen:${room}`;
const chan = (room: string) => `cb:room:${room}`;

export class Relay {
  private rooms = new Map<string, Set<Conn>>();
  readonly origin = Math.random().toString(36).slice(2, 10);

  private staleMs: number;

  constructor(private b: Backend, opts: { staleMs?: number } = {}) {
    this.staleMs = opts.staleMs ?? STALE_MS;
  }

  /** A player's socket arrived. */
  async attach(sock: Sock, url: URL): Promise<void> {
    const room = (url.searchParams.get('room') ?? '').toUpperCase();
    const id = url.searchParams.get('id') ?? '';
    const want = url.searchParams.get('want') ?? 'join';
    if (!ROOM.test(room) || !ID.test(id)) return sock.close(4000);
    const c: Conn = { sock, id, room, host: false, touchedAt: 0 };
    let set = this.rooms.get(room);
    if (!set) {
      this.rooms.set(room, (set = new Set()));
      await this.b.bus.subscribe(chan(room), (raw) => this.fromBus(room, raw));
    }
    set.add(c);
    sock.on('message', (data) => void this.fromPlayer(c, String(data)));
    sock.on('close', () => void this.gone(c));
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
    if (want === 'host' || want === 'take') {
      if (!holder) holder = await this.b.store.setNx(hostKey(room), id, HOST_TTL);
      else if (holder !== id && (await this.stale(room))) {
        await this.b.store.set(hostKey(room), id, HOST_TTL);
        holder = id;
      }
    } else if (holder && holder !== id && (await this.stale(room))) holder = null;
    if (holder === id) return this.becomeHost(c);
    if (holder) return this.tell(c, { t: 'role', role: 'guest', host: holder });
    this.tell(c, { t: 'nohost' });
  }

  private async stale(room: string): Promise<boolean> {
    const seen = Number(await this.b.store.get(seenKey(room))) || 0;
    return Date.now() - seen > this.staleMs;
  }

  private async becomeHost(c: Conn): Promise<void> {
    c.host = true;
    await this.touch(c, true);
    this.tell(c, { t: 'role', role: 'host' });
    await this.send(c.room, { k: 'hosted', id: c.id, o: this.origin });
  }

  /** The host is alive: keep its claim and its last-seen time fresh (at most every 2 s). */
  private async touch(c: Conn, now = false): Promise<void> {
    if (!c.host || (!now && Date.now() - c.touchedAt < 2000)) return;
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
    const to = typeof m.to === 'string' ? m.to : '';
    if (!to) return;
    void this.touch(c);
    await this.send(c.room, { k: 'msg', from: c.id, to, d: m.d, o: this.origin });
  }

  /** Deliver to this instance's sockets, then tell the other instances. */
  private async send(room: string, env: Envelope): Promise<void> {
    this.deliver(room, env);
    await this.b.bus.publish(chan(room), JSON.stringify(env));
  }

  private fromBus(room: string, raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    if (env.o !== this.origin) this.deliver(room, env);
  }

  private deliver(room: string, env: Envelope): void {
    for (const c of this.rooms.get(room) ?? []) {
      if (env.k === 'msg') {
        if (c.id !== env.from && (env.to === '*' || env.to === c.id)) this.tell(c, { t: 'msg', from: env.from, d: env.d });
      } else if (c.id !== env.id) {
        this.tell(c, { t: env.k, id: env.id });
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
    if (c.host && (await this.b.store.get(hostKey(c.room))) === c.id) await this.b.store.del(hostKey(c.room));
    await this.send(c.room, { k: 'left', id: c.id, o: this.origin });
    if (set && !set.size) {
      this.rooms.delete(c.room);
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
      publish: async (ch, m) => subs.get(ch)?.forEach((f) => f(m)),
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
      publish: async (ch, m) => void (await cmd.publish(ch, m)),
      subscribe: (ch, fn) => sub.subscribe(ch, fn),
      unsubscribe: (ch) => sub.unsubscribe(ch),
    },
  };
}
