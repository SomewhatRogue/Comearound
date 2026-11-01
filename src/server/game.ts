/**
 * GameRoom: one game, transport-agnostic. The Node dev server, the Cloudflare Durable Object and
 * solo mode (in the browser) all wrap this same class.
 *
 * Join and rejoin are one path: a client says hello with its token, gets its seat back if it had
 * one, and the next snapshot (full state, every tick) brings it up to date.
 */
import { COURSES, PRACTICE, TRIALS, type FieldDef } from '../shared/field';
import { BREEDS, COLLARS, DEFAULT_COAT, DOG_BREEDS, EYES, coatsFor, type Breed } from '../shared/looks';
import type { ClientMsg, Look, PrivateEvent, ServerMsg } from '../shared/protocol';
import { Rng } from '../shared/rng';
import { DOG } from '../shared/tuning';
import { makeBrain, tickBot } from './bots';
import { bark, moveDog, separateDogs } from './dogs';
import { spawnFlock, tickFlock } from './flock';
import { tickGoats } from './goat';
import { tickWind } from './wind';
import { tickWeather } from './weather';
import { arriveAt, gatherInHub, pet, setPractising, tickLobby } from './lobby';
import { freshCalm } from './calm';
import { endField, startRun, tickRound } from './round';
import { activeDogs, type Dog, type Room } from './state';
import { privateView, publicView } from './view';

export const TICK_HZ = 20;
const BOT_NAMES = ['Biscuit', 'Juniper', 'Scout', 'Maple', 'Pepper', 'Waffles', 'Ziggy', 'Clover'];
const LOBBY_GRACE_SEC = 30;
/** A seat quiet this long is empty enough for its own player (same dog name) to take back. Clients say something every 3 s. */
const SEAT_QUIET_SEC = 8;

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
  field = PRACTICE;
  fieldIdx = 0;
  fieldCount = TRIALS.length;
  versusFields: FieldDef[] = [];
  dogs = new Map<string, Dog>();
  sheep: Room['sheep'] = [];
  goats: Room['goats'] = [];
  wind: Room['wind'] = { x: 1, z: 0, s: 0 };
  course: Room['course'] = 'gentle';
  closedPens: Room['closedPens'] = [];
  weather: Room['weather'] = { kind: 'clear', flashes: 0, nextFlash: 99, fx: 0, fz: 0 };
  fieldScores: Room['fieldScores'] = [];
  calm: Room['calm'] = freshCalm();
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
    d.heardAt = this.realClock;
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
      case 'practise':
        setPractising(this, d, !!m.on);
        break;
      case 'pet':
        pet(this, d, this.dogs.get(String(m.id)));
        break;
      case 'start':
        if (d.id === this.hostId && (this.phase === 'lobby' || this.phase === 'results')) {
          this.course = m.course && m.course in COURSES ? m.course : 'gentle';
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
      // Back after a crash or a browser restart (a new tab can come with a new token): an empty seat
      // with your dog's name is yours, mid-run too, rather than watching from the side.
      // A seat counts as empty if its player left, or has gone quiet (a crashed phone's connection
      // can look open for a while; a live player says something every few seconds).
      const name = cleanLook(look).name.trim().toLowerCase();
      const empty = (q: Dog) => !q.connected || this.realClock - q.heardAt > SEAT_QUIET_SEC;
      d = [...this.dogs.values()].find((q) => !q.bot && empty(q) && q.look.name.trim().toLowerCase() === name);
      if (d) {
        // Its old connection no longer speaks for it (nor does its late goodbye count).
        for (const [c, id] of this.conns) if (id === d.id) this.conns.delete(c);
        d.token = String(token).slice(0, 64);
        if (this.phase === 'lobby') d.look = cleanLook(look);
      }
    }
    if (!d) {
      d = blankDog(`p${this.nextId++}`, String(token).slice(0, 64), cleanLook(look));
      d.spectator = this.phase !== 'lobby' && this.phase !== 'results';
      // The hub: appear at the gate and trot in a few steps.
      arriveAt(this, d);
      this.dogs.set(d.id, d);
    }
    d.connected = true;
    d.heardAt = this.realClock;
    this.conns.set(connId, d.id);
    if (!this.hostId || !this.dogs.has(this.hostId)) this.hostId = d.id;
    this.sendState(connId, d);
  }

  private start(mode: Room['mode'], fillBots: boolean): void {
    for (const [id, d] of this.dogs) {
      if (d.bot) this.dogs.delete(id);
      else [d.spectator, d.arrive] = [!d.connected, undefined];
    }
    const humans = activeDogs(this).length;
    const want = mode === 'versus' ? Math.max(4, humans + (humans % 2)) : Math.max(3, humans);
    if (fillBots) {
      for (let i = humans; i < want; i++) {
        const id = `p${this.nextId++}`;
        const breed = DOG_BREEDS[(i + 2) % DOG_BREEDS.length];
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
      else Object.assign(d, { spectator: false, frozen: 0, auto: null, practising: false });
    }
    this.goats = [];
    this.field = PRACTICE;
    gatherInHub(this);
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
    tickLobby(this);
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

  /**
   * A player back after a crash, while their old seat still looked taken, came in as someone new:
   * once that seat goes quiet (same dog name), they move into it. Mid-run they were watching, so
   * they take the seat and the run carries on with them; in the lobby the old, quiet dog just goes.
   */
  private reseat(): void {
    const quiet = (q: Dog) => !q.bot && (!q.connected || this.realClock - q.heardAt > SEAT_QUIET_SEC);
    const name = (q: Dog) => q.look.name.trim().toLowerCase();
    for (const back of [...this.dogs.values()]) {
      if (back.bot || !back.connected || quiet(back)) continue;
      const lobby = this.phase === 'lobby' || this.phase === 'results';
      if (!lobby && !back.spectator) continue;
      const seat = [...this.dogs.values()].find((q) => q !== back && quiet(q) && !q.spectator && name(q) === name(back) && (lobby || !q.bot));
      if (!seat) continue;
      if (lobby) {
        for (const [c, id] of this.conns) if (id === seat.id) this.conns.delete(c);
        this.dogs.delete(seat.id);
        if (this.hostId === seat.id) this.hostId = back.id;
        continue;
      }
      for (const [c, id] of this.conns) {
        if (id === seat.id) this.conns.delete(c);
        if (id === back.id) this.conns.set(c, seat.id);
      }
      Object.assign(seat, { token: back.token, connected: true, heardAt: back.heardAt });
      this.dogs.delete(back.id);
      if (this.hostId === back.id) this.hostId = seat.id;
    }
  }

  /** Clears lobby seats whose dog has been gone too long, and hands on host if needed. */
  private sweep(): void {
    this.reseat();
    for (const [id, d] of this.dogs) {
      if (!d.connected && !d.bot && this.realClock - d.leftAt > LOBBY_GRACE_SEC && (this.phase === 'lobby' || this.phase === 'results' || d.spectator)) this.dogs.delete(id);
    }
    if (!this.hostId || !this.dogs.has(this.hostId)) this.hostId = [...this.dogs.values()].find((q) => q.connected && !q.bot)?.id ?? null;
  }

  /** Connections that get no per-tick state message (guests over the artifact's live room get a compact one instead). */
  quietConns = new Set<string>();

  /** The dog a connection plays. */
  dogOf(connId: string): Dog | undefined {
    return this.dogs.get(this.conns.get(connId) ?? '');
  }

  private sendState(connId: string, d: Dog): void {
    if (this.quietConns.has(connId)) return;
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
    coat: coatsFor(breed).some((c) => c.id === l?.coat) ? String(l!.coat) : DEFAULT_COAT[breed],
    collar: COLLARS.includes(String(l?.collar)) ? String(l!.collar) : COLLARS[0],
    eyes: EYES.some((e) => e.id === l?.eyes) ? String(l!.eyes) : 'brown',
    build: Math.max(-2, Math.min(2, Math.round(Number(l?.build) || 0))),
    ...(l?.voice === undefined || l?.voice === null ? {} : { voice: Math.max(-2, Math.min(2, Math.round(Number(l.voice) || 0))) }),
  };
}

function blankDog(id: string, token: string, look: Look): Dog {
  return {
    id, token, look, team: 0, x: 0, z: 0, dx: 0, dz: 0, rot: 0, wantSprint: false, wantCrouch: false, posture: 'walk', stillFor: 0,
    stamina: DOG.staminaMax, frozen: 0, cower: 0, barkCd: 0, barks: 0, fieldBarks: 0, connected: false, leftAt: 0, heardAt: 0, spectator: false, bot: null,
    practising: false, pets: 0, petAt: -9, mud: 0,
  };
}
