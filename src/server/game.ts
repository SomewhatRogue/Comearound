/**
 * GameRoom: one game, transport-agnostic. The Node dev server, the Cloudflare Durable Object and
 * solo mode (in the browser) all wrap this same class.
 *
 * Join and rejoin are one path: a client says hello with its token, gets its seat back if it had
 * one, and the next snapshot (full state, every tick) brings it up to date.
 */
import { TRIALS } from '../shared/field';
import { BREEDS, COATS, COLLARS, DEFAULT_COAT, EYES, type Breed } from '../shared/looks';
import type { ClientMsg, Look, PrivateEvent, ServerMsg } from '../shared/protocol';
import { Rng } from '../shared/rng';
import { DOG } from '../shared/tuning';
import { makeBrain, tickBot } from './bots';
import { bark, moveDog, separateDogs } from './dogs';
import { spawnFlock, tickFlock } from './flock';
import { tickGoats } from './goat';
import { tickWind } from './wind';
import { tickWeather } from './weather';
import { endField, startRun, tickRound } from './round';
import { activeDogs, type Dog, type Room } from './state';
import { privateView, publicView } from './view';

export const TICK_HZ = 20;
const BOT_NAMES = ['Biscuit', 'Juniper', 'Scout', 'Maple', 'Pepper', 'Waffles', 'Ziggy', 'Clover'];
const LOBBY_GRACE_SEC = 30;

export interface GameOptions {
  seed?: number;
  /** Test hook: run the clock faster so a full run fits in seconds. */
  timeScale?: number;
  /** Test hook: human dogs are driven by the bot brain once a run starts (probes). */
  autopilot?: boolean;
}

export class GameRoom implements Room {
  phase: Room['phase'] = 'lobby';
  mode: Room['mode'] = 'trials';
  clock = 0;
  realClock = 0;
  timeLeft = 0;
  holdFor: [number, number] = [0, 0];
  doneAt: [number | null, number | null] = [null, null];
  hostId: string | null = null;
  field = TRIALS[0];
  fieldIdx = 0;
  fieldCount = TRIALS.length;
  dogs = new Map<string, Dog>();
  sheep: Room['sheep'] = [];
  goats: Room['goats'] = [];
  wind: Room['wind'] = { x: 1, z: 0, s: 0 };
  course: Room['course'] = 'gentle';
  closedPens: Room['closedPens'] = [];
  weather: Room['weather'] = { kind: 'clear', flashes: 0, nextFlash: 99, fx: 0, fz: 0 };
  fieldScores: Room['fieldScores'] = [];
  leaderboard: Room['leaderboard'] = [];
  noises: Room['noises'] = [];
  rng: Rng;
  private conns = new Map<string, string>();
  private nextId = 1;
  private timeScale: number;
  private autopilot: boolean;

  constructor(private send: (connId: string, msg: string) => void, opts: GameOptions = {}) {
    this.rng = new Rng(opts.seed ?? Date.now());
    this.timeScale = opts.timeScale ?? 1;
    this.autopilot = !!opts.autopilot;
    // The lobby is The Meadow with its flock out: practise while you wait.
    this.sheep = spawnFlock(this);
  }

  emit(dogId: string, ev: PrivateEvent): void {
    for (const [conn, id] of this.conns) if (id === dogId) this.send(conn, JSON.stringify({ t: 'event', ev } satisfies ServerMsg));
  }

  connect(_connId: string): void {}

  disconnect(connId: string): void {
    const id = this.conns.get(connId);
    this.conns.delete(connId);
    const d = id ? this.dogs.get(id) : undefined;
    if (!d || [...this.conns.values()].includes(d.id)) return;
    d.connected = false;
    d.leftAt = this.realClock;
    d.dx = d.dz = 0;
  }

  message(connId: string, raw: string): void {
    let m: ClientMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'hello') return this.hello(connId, m.token, m.look);
    const d = this.dogs.get(this.conns.get(connId) ?? '');
    if (!d) return;
    switch (m.t) {
      case 'input':
        [d.dx, d.dz, d.wantSprint, d.wantCrouch] = [clamp(m.dx), clamp(m.dz), !!m.sprint, !!m.crouch];
        break;
      case 'bark':
        bark(this, d);
        break;
      case 'look':
        if (this.phase === 'lobby') d.look = cleanLook(m.look);
        break;
      case 'start':
        if (d.id === this.hostId && (this.phase === 'lobby' || this.phase === 'results')) {
          this.course = m.course === 'tricky' || m.course === 'wild' || m.course === 'challenge' ? m.course : 'gentle';
          this.start(m.mode === 'versus' ? 'versus' : 'trials', m.fillBots);
        }
        break;
      case 'toLobby':
        if (d.id === this.hostId && this.phase !== 'lobby') this.toLobby();
        break;
      case 'endField':
        if (d.id === this.hostId && this.phase === 'playing') endField(this);
        break;
    }
  }

  private hello(connId: string, token: string, look: Look): void {
    let d = [...this.dogs.values()].find((q) => q.token === token && !q.bot);
    if (!d) {
      d = blankDog(`p${this.nextId++}`, String(token).slice(0, 64), cleanLook(look));
      d.spectator = this.phase !== 'lobby' && this.phase !== 'results';
      // Lobby: start where field 1 starts, behind the practice flock.
      d.x = this.rng.range(-16, -14);
      d.z = this.rng.range(-4, 4);
      this.dogs.set(d.id, d);
    }
    d.connected = true;
    this.conns.set(connId, d.id);
    if (!this.hostId || !this.dogs.has(this.hostId)) this.hostId = d.id;
    this.sendState(connId, d);
  }

  private start(mode: Room['mode'], fillBots: boolean): void {
    for (const [id, d] of this.dogs) {
      if (d.bot) this.dogs.delete(id);
      else d.spectator = !d.connected;
    }
    const humans = activeDogs(this).length;
    const want = mode === 'versus' ? Math.max(4, humans + (humans % 2)) : Math.max(3, humans);
    if (fillBots) {
      for (let i = humans; i < want; i++) {
        const id = `p${this.nextId++}`;
        const breed = BREEDS[(i + 2) % BREEDS.length];
        const bot = blankDog(id, `bot-${id}`, { name: BOT_NAMES[i % BOT_NAMES.length], breed, coat: DEFAULT_COAT[breed], collar: COLLARS[(i + 3) % COLLARS.length], eyes: 'brown' });
        bot.connected = true;
        this.dogs.set(id, bot);
      }
    }
    startRun(this, mode);
    // Bots: spread across the flanks of their team; in a big versus game, one raider per team.
    for (const team of [0, 1] as const) {
      const bots = activeDogs(this).filter((d) => d.team === team && (d.bot || d.token.startsWith('bot-')));
      bots.forEach((d, i) => (d.bot = makeBrain([-1, 1, 0, -0.5, 0.5][i % 5], mode === 'versus' && i === 2)));
      if (this.autopilot) activeDogs(this).filter((d) => d.team === team && !d.bot).forEach((d, i) => (d.auto = makeBrain([0, 1, -1][i % 3])));
    }
  }

  private toLobby(): void {
    for (const [id, d] of this.dogs) {
      if (d.bot || !d.connected) this.dogs.delete(id);
      else Object.assign(d, { spectator: false, frozen: 0, auto: null });
    }
    this.goats = [];
    this.field = TRIALS[0];
    this.wind = { x: 1, z: 0, s: 0 };
    this.weather = { kind: 'clear', flashes: this.weather.flashes, nextFlash: 99, fx: 0, fz: 0 };
    this.phase = 'lobby';
    this.sheep = spawnFlock(this);
  }

  tick(realDt: number): void {
    const dt = realDt * this.timeScale;
    this.clock += dt;
    this.realClock += realDt;
    this.sweep();
    if (this.phase === 'playing') {
      for (const d of this.dogs.values()) if ((d.bot || d.auto) && !d.spectator) tickBot(this, d, dt);
    }
    for (const d of this.dogs.values()) if (!d.spectator) moveDog(this, d, this.phase === 'playing' || this.phase === 'lobby' ? dt : 0);
    separateDogs(this);
    if (this.phase === 'playing') {
      tickWind(this, dt);
      tickWeather(this, dt);
      tickGoats(this, dt);
    }
    if (this.phase === 'playing' || this.phase === 'lobby') tickFlock(this, dt);
    this.noises = [];
    tickRound(this, dt);
    for (const [conn, id] of this.conns) {
      const d = this.dogs.get(id);
      if (d) this.sendState(conn, d);
    }
  }

  /** Clears lobby seats whose dog has been gone too long, and hands on host if needed. */
  private sweep(): void {
    for (const [id, d] of this.dogs) {
      if (!d.connected && !d.bot && this.realClock - d.leftAt > LOBBY_GRACE_SEC && (this.phase === 'lobby' || this.phase === 'results' || d.spectator)) this.dogs.delete(id);
    }
    if (!this.hostId || !this.dogs.has(this.hostId)) this.hostId = [...this.dogs.values()].find((q) => q.connected && !q.bot)?.id ?? null;
  }

  private sendState(connId: string, d: Dog): void {
    this.send(connId, JSON.stringify({ t: 'state', pub: publicView(this), me: privateView(this, d) } satisfies ServerMsg));
  }

  /** One blocking call for probes: where the run stands, as one line. */
  report(): string {
    const penned = publicView(this).sheep.filter((s) => s.penned).length;
    return `phase=${this.phase} mode=${this.mode} field=${this.fieldIdx + 1}/${this.fieldCount} t=${this.timeLeft.toFixed(1)} dogs=${this.dogs.size} sheep=${penned}/${this.sheep.length} goats=${this.goats.map((q) => q.mood).join(',') || '-'}`;
  }
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
}

function cleanLook(l: Partial<Look> | undefined): Look {
  const breed = (BREEDS as readonly string[]).includes(String(l?.breed)) ? (l!.breed as Breed) : 'collie';
  return {
    name: String(l?.name ?? 'Good dog').replace(/[^\p{L}\p{N} _'-]/gu, '').slice(0, 14) || 'Good dog',
    breed,
    coat: COATS.some((c) => c.id === l?.coat) ? String(l!.coat) : DEFAULT_COAT[breed],
    collar: COLLARS.includes(String(l?.collar)) ? String(l!.collar) : COLLARS[0],
    eyes: EYES.some((e) => e.id === l?.eyes) ? String(l!.eyes) : 'brown',
  };
}

function blankDog(id: string, token: string, look: Look): Dog {
  return {
    id, token, look, team: 0, x: 0, z: 0, dx: 0, dz: 0, rot: 0, wantSprint: false, wantCrouch: false, posture: 'walk', stillFor: 0,
    stamina: DOG.staminaMax, frozen: 0, cower: 0, barkCd: 0, barks: 0, fieldBarks: 0, connected: false, leftAt: 0, spectator: false, bot: null,
  };
}
