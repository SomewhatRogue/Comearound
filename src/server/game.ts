/**
 * GameRoom: one game, transport-agnostic. The Node dev server and the Cloudflare Durable Object
 * both wrap this same class, so game logic never depends on where it runs.
 *
 * Join and rejoin are one path: a client says hello with its token, gets its seat back if it had
 * one, and the next snapshot (full state, every tick) brings it up to date.
 */
import type { ClientMsg, Look, PrivateEvent, ServerMsg } from '../shared/protocol';
import { COLORS, HATS } from '../shared/looks';
import { Rng } from '../shared/rng';
import { tickBot } from './bots';
import { makeGoat, pushOffGoat, tickGoat } from './goat';
import { makeTargets, throwSnowball, tickPen } from './pen';
import { accuse, beginReveal, choose, guess, lastChance, startRound, tickRound } from './round';
import { activePlayers, type Player, type Room } from './state';
import { privateView, publicView } from './view';
import { interact, makeStations, movePlayer, placeInSquare } from './world';

export const TICK_HZ = 20;
const BOT_NAMES = ['Mabel', 'Turnip', 'Old Gus', 'Pip', 'Wendell', 'Bramble', 'Dot', 'Figgy'];
const MIN_SEATS = 5;
const LOBBY_GRACE_SEC = 30;

export interface GameOptions {
  seed?: number;
  /** Test hook: run the round clock faster so a full round fits in seconds. */
  timeScale?: number;
}

export class GameRoom implements Room {
  phase: Room['phase'] = 'lobby';
  clock = 0;
  timeLeft = 0;
  roundSec = 420;
  lastCallAt = 90;
  hostId: string | null = null;
  thingId: string | null = null;
  players = new Map<string, Player>();
  items: Room['items'] = [];
  stations = makeStations();
  goat = makeGoat();
  snowballs: Room['snowballs'] = [];
  targets = makeTargets();
  rng: Rng;
  reveal: Room['reveal'] = null;
  private conns = new Map<string, string>();
  private nextId = 1;
  private timeScale: number;
  private realClock = 0;

  constructor(private send: (connId: string, msg: string) => void, opts: GameOptions = {}) {
    this.rng = new Rng(opts.seed ?? Date.now());
    this.timeScale = opts.timeScale ?? 1;
  }

  emit(playerId: string, ev: PrivateEvent): void {
    for (const [conn, pid] of this.conns) if (pid === playerId) this.send(conn, JSON.stringify({ t: 'event', ev } satisfies ServerMsg));
  }

  connect(_connId: string): void {
    // Nothing until hello: the token decides whether this is a new seat or a returning one.
  }

  disconnect(connId: string): void {
    const pid = this.conns.get(connId);
    this.conns.delete(connId);
    const p = pid ? this.players.get(pid) : undefined;
    if (!p || [...this.conns.values()].includes(p.id)) return;
    p.connected = false;
    p.leftAt = this.realClock;
    p.dx = p.dz = 0;
    // Seats are held: a reload or a flaky connection gets the same seat (and host) back.
    // In the lobby an empty seat is cleared after LOBBY_GRACE_SEC; mid-round it is held to the end.
  }

  /** Clears lobby seats whose player has been gone too long, and hands on host if needed. */
  private sweep(): void {
    for (const [id, p] of this.players) {
      const gone = !p.connected && !p.bot && this.realClock - p.leftAt > LOBBY_GRACE_SEC;
      if (gone && (this.phase === 'lobby' || p.spectator)) this.players.delete(id);
    }
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = [...this.players.values()].find((q) => q.connected && !q.bot)?.id ?? null;
  }

  message(connId: string, raw: string): void {
    let m: ClientMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'hello') return this.hello(connId, m.token, m.look);
    const p = this.players.get(this.conns.get(connId) ?? '');
    if (!p) return;
    switch (m.t) {
      case 'input':
        [p.dx, p.dz] = [clamp(m.dx), clamp(m.dz)];
        break;
      case 'interact':
        if (p.inPen) throwSnowball(this, p);
        else interact(this, p);
        break;
      case 'guess':
        if (this.phase === 'lastchance') lastChance(this, p, m.thingId);
        else guess(this, p, m.thingId);
        break;
      case 'accuse':
        accuse(this, p, m.targetId);
        break;
      case 'choice':
        choose(this, p, m.endNow);
        break;
      case 'look':
        if (this.phase === 'lobby') p.look = cleanLook(m.look);
        break;
      case 'start':
        if (p.id === this.hostId && this.phase === 'lobby') this.start(m.roundSec, m.fillBots);
        break;
      case 'toLobby':
        // The host can abandon a round from any phase (the menu's Back to lobby).
        if (p.id === this.hostId && this.phase !== 'lobby') this.toLobby();
        break;
      case 'endRound':
        if (p.id === this.hostId && (this.phase === 'playing' || this.phase === 'lastcall')) beginReveal(this);
        break;
    }
  }

  private hello(connId: string, token: string, look: Look): void {
    let p = [...this.players.values()].find((q) => q.token === token && !q.bot);
    if (!p) {
      p = blankPlayer(`p${this.nextId++}`, String(token).slice(0, 64), cleanLook(look));
      p.spectator = this.phase !== 'lobby';
      placeInSquare(this, p);
      this.players.set(p.id, p);
    }
    p.connected = true;
    this.conns.set(connId, p.id);
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = p.id;
    this.sendState(connId, p);
  }

  private start(roundSec: number, fillBots: boolean): void {
    for (const [id, p] of this.players) if (p.bot) this.players.delete(id);
    const humans = activePlayers(this).length;
    if (fillBots) {
      for (let i = humans; i < MIN_SEATS; i++) {
        const id = `p${this.nextId++}`;
        const bot = blankPlayer(id, `bot-${id}`, { name: BOT_NAMES[i % BOT_NAMES.length], color: this.rng.pick(COLORS), hat: this.rng.pick(HATS) });
        bot.bot = { goal: null, target: null, wait: 1, belief: {}, wantsBoard: false };
        bot.connected = true;
        this.players.set(id, bot);
      }
    }
    if (activePlayers(this).length < 3) return;
    startRound(this, Math.max(30, Math.min(600, roundSec || 420)));
  }

  private toLobby(): void {
    for (const [id, p] of this.players) {
      if (p.bot || !p.connected) this.players.delete(id);
      else Object.assign(p, { role: null, inPen: false, sign: null, spectator: false, carrying: null, meter: 0 });
    }
    this.items = [];
    this.stations = makeStations();
    this.snowballs = [];
    this.reveal = null;
    this.phase = 'lobby';
  }

  tick(realDt: number): void {
    const dt = realDt * this.timeScale;
    this.clock += dt;
    this.realClock += realDt;
    this.sweep();
    for (const p of this.players.values()) {
      if (p.bot) tickBot(this, p, dt);
      movePlayer(p, dt);
      if (Math.hypot(p.dx, p.dz) > 0.1) [p.fx, p.fz] = [p.dx, p.dz];
      p.throwCd -= dt;
      pushOffGoat(this, p);
      if (p.carrying != null) {
        const it = this.items.find((i) => i.uid === p.carrying);
        if (it) [it.x, it.z] = [p.x, p.z];
      }
    }
    tickGoat(this, dt);
    tickPen(this, dt);
    tickRound(this, dt);
    for (const [conn, pid] of this.conns) {
      const p = this.players.get(pid);
      if (p) this.sendState(conn, p);
    }
  }

  private sendState(connId: string, p: Player): void {
    this.send(connId, JSON.stringify({ t: 'state', pub: publicView(this), me: privateView(this, p) } satisfies ServerMsg));
  }

  /** One blocking call for probes: where the round stands, as one line. */
  report(): string {
    const ps = [...this.players.values()];
    return `phase=${this.phase} t=${this.timeLeft.toFixed(1)} players=${ps.length} bots=${ps.filter((p) => p.bot).length} pen=${ps.filter((p) => p.inPen).length} stations=${this.stations.filter((s) => s.owner).length}`;
  }
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
}

function cleanLook(l: Partial<Look> | undefined): Look {
  return {
    name: String(l?.name ?? 'Villager').replace(/[^\p{L}\p{N} _'-]/gu, '').slice(0, 14) || 'Villager',
    color: COLORS.includes(String(l?.color)) ? String(l!.color) : COLORS[0],
    hat: HATS.includes(String(l?.hat)) ? String(l!.hat) : 'none',
  };
}

function blankPlayer(id: string, token: string, look: Look): Player {
  return {
    id, token, look, x: 0, z: 0, dx: 0, dz: 0, fx: 0, fz: 1, throwCd: 0, carrying: null, inPen: false, sign: null, spectator: false, connected: false,
    role: null, guessesLeft: 0, accusationUsed: false, score: 0, stationPoints: 0, roundStart: 0, meter: 0, meterActive: false,
    awaitingChoice: false, caughtBy: null, lastChance: null, bot: null, leftAt: 0,
  };
}
