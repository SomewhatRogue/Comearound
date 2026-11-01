/**
 * Following one dog round an agility course: which piece it just took, whether that was the next
 * one, and the time when it finishes. Pure (no drawing, no storage), so the client runs it for your
 * own dog and the tests can drive it.
 *
 * Taking a piece: over a hurdle or through the tyre (either way); in one end of the tunnel and out
 * the other; all six weave poles in order from either end, a different side of each; a moment on
 * the table (or lie down on it).
 */
import { AG, local, onTable, weavePoles, type AgilityPiece } from './agility';

interface PieceState { prev: number | null; inside: boolean; entry: number; idx: number; side: number; dir: number; stay: number }

export interface RunStep {
  /** A piece taken in order (its number), if one was. */
  took?: number;
  /** Seconds for the round, when the last piece is taken. */
  finished?: number;
  /** A piece taken out of order: the number of the one to take next (1 if no round is going). */
  wrong?: number;
}

export class AgilityRun {
  /** The number of the piece to take next (1 until the round starts). */
  next = 1;
  private t0 = 0;
  private state = new Map<AgilityPiece, PieceState>();

  constructor(readonly pieces: AgilityPiece[]) {
    for (const p of pieces) this.state.set(p, { prev: null, inside: false, entry: 0, idx: 0, side: 0, dir: 0, stay: 0 });
  }

  /** Where the dog is now (and whether it's lying down), at `now` milliseconds. */
  step(x: number, z: number, down: boolean, dt: number, now: number): RunStep {
    const out: RunStep = {};
    // A round left half done for two minutes starts over.
    if (this.next > 1 && now - this.t0 > 120_000) this.next = 1;
    for (const p of this.pieces) {
      if (!this.took(p, x, z, down, dt)) continue;
      // Taking the first piece always (re)starts the round.
      if (p.n === 1) [this.next, this.t0] = [1, now];
      if (p.n !== this.next) {
        out.wrong = this.next;
        continue;
      }
      out.took = p.n;
      this.next++;
      if (p.n === this.pieces.length) {
        out.finished = (now - this.t0) / 1000;
        this.next = 1;
      }
    }
    return out;
  }

  private took(p: AgilityPiece, x: number, z: number, down: boolean, dt: number): boolean {
    const s = this.state.get(p)!;
    const { along, lat } = local(p, x, z);
    if (p.kind === 'hurdle' || p.kind === 'tire') {
      const half = (p.kind === 'hurdle' ? AG.hurdleW : AG.tireW) / 2;
      const prev = s.prev;
      // Generous at the ends: on a phone it's hard to hit the middle exactly.
      s.prev = Math.abs(lat) < half + 0.9 && Math.abs(along) < 2 ? along : null;
      return prev !== null && s.prev !== null && s.prev !== 0 && Math.abs(lat) < half + 0.35 && Math.sign(prev) !== Math.sign(s.prev);
    }
    if (p.kind === 'tunnel') {
      const inside = Math.abs(along) < AG.tunnelLen / 2 && Math.abs(lat) < AG.tunnelR;
      const was = s.inside;
      s.inside = inside;
      if (inside && !was) s.entry = Math.sign(along);
      return !inside && was && Math.abs(lat) < AG.tunnelR + 0.2 && Math.sign(along) !== s.entry;
    }
    if (p.kind === 'weave') return this.weave(s, along, lat);
    if (!onTable(p, x, z)) {
      s.stay = 0;
      return false;
    }
    if (s.stay < 0) return false;
    s.stay += dt;
    if (s.stay < AG.tableStay && !down) return false;
    s.stay = -1;
    return true;
  }

  /** Weave poles: the poles passed in order (from either end), a different side each time. */
  private weave(s: PieceState, along: number, lat: number): boolean {
    const prev = s.prev;
    s.prev = along;
    if (Math.abs(lat) > 1.6) s.idx = 0;
    if (prev === null || Math.abs(lat) > 1.6) return false;
    const poles = weavePoles();
    const n = poles.length;
    for (let k = 0; k < n; k++) {
      const pk = poles[k];
      if (!((prev < pk && along >= pk) || (prev > pk && along <= pk))) continue;
      const dir = Math.sign(along - prev);
      const side = Math.sign(lat) || 1;
      const expect = s.dir > 0 ? s.idx : n - 1 - s.idx;
      if (s.idx > 0 && dir === s.dir && k === expect && side !== s.side) {
        s.idx++;
        s.side = side;
      } else if ((k === 0 && dir > 0) || (k === n - 1 && dir < 0)) [s.idx, s.dir, s.side] = [1, dir, side];
      else s.idx = 0;
      if (s.idx === n) {
        s.idx = 0;
        return true;
      }
    }
    return false;
  }
}
