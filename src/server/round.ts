/**
 * Round rules: dealing roles, the board (guesses and accusations), the accuser's choice,
 * last call, last chance, and the reveal tally. Pure state changes; no transport.
 */
import { THINGS, thingById } from '../shared/catalog';
import { makes, thingsMade } from '../shared/judge';
import { BOARD, REACH, dist } from '../shared/map';
import { activePlayers, type Player, type Room } from './state';
import { dropCarried, makeStations, placeInSquare, sendToPen, spawnItems, stationItems } from './world';

/** One pool for everyone sent to the Pen, so the sign never says why they are there. */
export const SIGNS = ['Rabble Rouser', 'Known Goat Associate', 'Ask Me About My Crimes', 'Professional Nuisance', 'Under Review', 'Sus'];

export const POINTS = { catch: 100, sadGuess: 300, sadSurvives: 200, steal: 150, knowersWin: 50, meterPerSec: 2 };
export const LAST_CHANCE_SEC = 15;

export function sadCountFor(n: number): number {
  return n <= 6 ? 1 : n <= 9 ? 2 : 3;
}

export function startRound(room: Room, roundSec: number): void {
  const players = activePlayers(room);
  room.roundSec = roundSec;
  room.timeLeft = roundSec;
  room.lastCallAt = Math.min(90, roundSec * 0.2);
  room.thingId = room.rng.pick(THINGS).id;
  room.stations = makeStations();
  room.items = spawnItems(room, players.length);
  room.reveal = null;
  const sadIds = new Set(room.rng.shuffle(players.map((p) => p.id)).slice(0, sadCountFor(players.length)));
  for (const p of players) {
    p.role = sadIds.has(p.id) ? 'sad' : 'knower';
    p.guessesLeft = p.role === 'sad' ? 1 : 0;
    p.accusationUsed = false;
    p.inPen = false;
    p.sign = null;
    p.carrying = null;
    p.stationPoints = 0;
    p.meter = 0;
    p.meterActive = false;
    p.awaitingChoice = false;
    p.caughtBy = null;
    p.lastChance = null;
    p.roundStart = p.score;
    if (p.bot) p.bot = { goal: p.role === 'knower' ? room.thingId : null, target: null, wait: room.rng.range(0.5, 2), belief: {}, wantsBoard: false };
    placeInSquare(room, p);
  }
  room.phase = 'playing';
}

function atBoard(p: Player): boolean {
  return dist(p.x, p.z, BOARD.x, BOARD.z) <= REACH.board;
}

export function accuse(room: Room, p: Player, targetId: string): void {
  const target = room.players.get(targetId);
  if (room.phase !== 'playing' || p.inPen || p.spectator || p.accusationUsed || !atBoard(p)) return;
  if (!target || target === p || target.inPen || target.spectator) return;
  p.accusationUsed = true;
  if (target.role === 'sad') {
    sendToPen(room, target);
    target.sign = room.rng.pick(SIGNS);
    target.caughtBy = p.id;
    p.score += POINTS.catch;
    p.meterActive = true;
    p.awaitingChoice = true;
    room.emit(p.id, { kind: 'pop', amount: POINTS.catch, label: 'You caught one!' });
    room.emit(p.id, { kind: 'caught' });
  } else {
    sendToPen(room, p);
    p.sign = room.rng.pick(SIGNS);
    room.emit(p.id, { kind: 'wrongAccusation' });
  }
}

export function choose(room: Room, p: Player, endNow: boolean): void {
  if (!p.awaitingChoice) return;
  p.awaitingChoice = false;
  if (endNow) beginReveal(room);
}

export function guess(room: Room, p: Player, thingId: string): void {
  if (room.phase !== 'playing' || p.role !== 'sad' || p.inPen || p.guessesLeft < 1 || !atBoard(p)) return;
  if (!thingById.has(thingId)) return;
  p.guessesLeft = 0;
  if (thingId === room.thingId) {
    p.score += POINTS.sadGuess;
    room.emit(p.id, { kind: 'pop', amount: POINTS.sadGuess, label: 'You guessed it!' });
    finishReveal(room, p);
  } else {
    room.emit(p.id, { kind: 'wrongGuess' });
  }
}

export function lastChance(room: Room, p: Player, thingId: string): void {
  if (room.phase !== 'lastchance' || p.role !== 'sad' || !p.caughtBy || p.lastChance) return;
  if (thingById.has(thingId)) p.lastChance = thingId;
}

export function tickRound(room: Room, dt: number): void {
  if (room.phase === 'playing' || room.phase === 'lastcall') {
    room.timeLeft -= dt;
    for (const p of room.players.values()) if (p.meterActive) p.meter += POINTS.meterPerSec * dt;
    if (room.phase === 'playing' && room.timeLeft <= room.lastCallAt) {
      room.phase = 'lastcall';
      for (const p of room.players.values()) {
        p.awaitingChoice = false;
        room.emit(p.id, { kind: 'toast', text: 'Last call! The board is closed. Finish your creation.' });
      }
    }
    if (room.timeLeft <= 0) beginReveal(room);
  } else if (room.phase === 'lastchance') {
    room.timeLeft -= dt;
    const waiting = activePlayers(room).filter((p) => p.caughtBy && !p.lastChance);
    if (room.timeLeft <= 0 || waiting.length === 0) finishReveal(room);
  }
}

export function beginReveal(room: Room): void {
  for (const p of room.players.values()) {
    p.meterActive = false;
    p.awaitingChoice = false;
    dropCarried(room, p);
  }
  const jailedSad = activePlayers(room).some((p) => p.caughtBy);
  if (!jailedSad) return finishReveal(room);
  room.phase = 'lastchance';
  room.timeLeft = LAST_CHANCE_SEC;
}

export function finishReveal(room: Room, sadGuesser?: Player): void {
  const thing = thingById.get(room.thingId!)!;
  const players = activePlayers(room);
  for (const p of players) {
    p.meterActive = false;
    if (p.lastChance === thing.id && p.caughtBy) {
      const catcher = room.players.get(p.caughtBy);
      if (catcher) [p.meter, catcher.meter] = [p.meter + catcher.meter, 0];
      p.score += POINTS.steal;
    }
  }
  const rows = players.map((p) => {
    const st = room.stations.find((s) => s.owner === p.id);
    const items = st ? stationItems(room, st) : [];
    const passed = !!st && !p.inPen && makes(thing, st.area, items);
    if (passed) p.score += p.stationPoints * 2;
    if (passed && p.role === 'sad') p.score += POINTS.sadSurvives;
    p.score += Math.round(p.meter);
    const made = st ? thingsMade(st.area, items)[0] : undefined;
    return { p, passed, creation: made ? made.name : null };
  });
  const sadWon = !!sadGuesser || rows.some((r) => r.p.role === 'sad' && r.passed);
  if (!sadWon) for (const r of rows) if (r.p.role === 'knower') r.p.score += POINTS.knowersWin;
  room.reveal = {
    thingId: thing.id,
    winner: sadWon ? 'sad' : 'knowers',
    rows: rows.map(({ p, passed, creation }) => ({
      id: p.id, sad: p.role === 'sad', inPen: p.inPen, creation, passed, points: p.score - p.roundStart, total: p.score,
    })),
  };
  room.phase = 'results';
  room.timeLeft = 0;
}
