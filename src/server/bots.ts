/**
 * Herding bots. The classic sheepdog plan: get behind a group of sheep (on the far side from where
 * it should go), spread out to cover its flanks, then creep in crouched, giving it the eye, so it
 * drifts toward the gate. The open sheep are split into groups; each group gets the nearest free
 * bots (a lone sheep gets one, a big group up to three). Once half the flock is in, the bot nearest
 * the gate keeps it. Spare bots hang back wide so they don't chase sheep round the field.
 * Bots bark rarely (it costs calm points and annoys the goat).
 * In versus, one bot per team may go raiding: it trots through the other team's flock.
 */
import { gateOf, type FieldDef, type Pen } from '../shared/field';
import { DOG, SHEEP } from '../shared/tuning';
import { bark } from './dogs';
import { isPenned } from './flock';
import { activeDogs, type Dog, type Room, type Sheep } from './state';

/** Sheep closer than this to each other count as one group. */
const LINK = 4.5;

type P = { x: number; z: number };
interface Group { sheep: Sheep[]; c: P; spread: number; dogs: Dog[] }

export function makeBrain(flank: number, raider = false): Dog['bot'] {
  return { flank, barkCd: 4 + flank, raider, lastX: 0, lastZ: 0, stuckT: 0, flipT: 0 };
}

export function tickBot(room: Room, d: Dog, dt: number): void {
  const b = d.bot!;
  const wanted = Math.hypot(d.dx, d.dz) > 0.1 && d.posture !== 'crouch';
  d.dx = d.dz = 0;
  d.wantSprint = d.wantCrouch = false;
  if (room.phase !== 'playing' || d.frozen > 0) return;
  b.barkCd -= dt;
  b.flipT = Math.max(0, b.flipT - dt);
  // Wedged against a fence while trying to walk round? Go round the other way for a bit.
  if (Math.hypot(d.x - b.lastX, d.z - b.lastZ) > 0.6) [b.lastX, b.lastZ, b.stuckT] = [d.x, d.z, 0];
  else if (wanted && (b.stuckT += dt) > 1.5) [b.flipT, b.stuckT] = [3, 0];
  const team = room.mode === 'versus' ? d.team : null;
  if (b.raider && raid(room, d, team, dt)) return;

  const pen = room.field.pens.find((p) => p.team === null || p.team === d.team)!;
  const g = gateOf(pen);
  const mine = room.sheep.filter((s) => team === null || s.team === team);
  const open = mine.filter((s) => !isPenned(room.field, s));
  const mates = activeDogs(room).filter((o) => o.bot && o.team === d.team && !o.bot.raider);

  // The gate keeper: lies down beside the gate, outside, on the side away from the incoming sheep.
  const keeper = open.length && open.length < mine.length / 2 && mates.length > 1 ? nearestTo(mates, g.x + g.ox * 2.4, g.z + g.oz * 2.4) : undefined;
  if (!open.length || keeper === d) {
    const k = open.length ? sideOf(open, g) : b.flank;
    // Tucked against the fence beside the opening, so incoming sheep pass it.
    const off = pen.gateW / 2 + 1;
    if (steerTo(d, g.x + g.ox * 0.9 - g.oz * k * off, g.z + g.oz * 0.9 + g.ox * k * off) < 0.6) {
      d.wantCrouch = true;
      d.rot = Math.atan2(-g.ox, -g.oz);
    }
    return;
  }

  const groups = assign(groupsOf(open), mates.filter((o) => o !== keeper));
  const mineG = groups.find((gr) => gr.dogs.includes(d));
  if (!mineG) {
    // Spare: hang back wide behind the biggest group, crouched.
    const big = groups[0];
    const [hx, hz] = behind(room.field, big.c, unit(pen.x - big.c.x, pen.z - big.c.z), big.spread + 8, b.flank * 5);
    if (steerTo(d, hx, hz) < 0.8) d.wantCrouch = true;
    return;
  }

  const { c, spread } = mineG;
  const i = mineG.dogs.indexOf(d);
  const n = mineG.dogs.length;
  const flank = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
  const target = approach(pen, c);
  const u = unit(target.x - c.x, target.z - c.z);
  const fan = flank * (spread * 0.9 + 1.2);
  const [px, pz] = behind(room.field, c, u, spread + 3, fan);
  const [qx, qz] = behind(room.field, c, u, spread + 1.4, fan * 0.8);
  const far = Math.hypot(px - d.x, pz - d.z);
  const close = Math.hypot(qx - d.x, qz - d.z);

  if (far > 2 && !(d.posture === 'crouch' && close < 3.5)) {
    // The outrun: swing wide so the walk round doesn't push the sheep the wrong way.
    flankTo(d, px, pz, c, spread + SHEEP.flight.walk + 0.3, b.flipT > 0);
    d.wantSprint = far > 12 && d.stamina > 30 && Math.hypot(c.x - d.x, c.z - d.z) > spread + SHEEP.flight.sprint + 1;
  } else {
    // In position: keep a steady distance behind the group, crouched, giving it the eye.
    // As the sheep ease away the spot moves forward, so the dog follows them in.
    steerTo(d, qx, qz);
    d.wantCrouch = true;
    if (close < 0.3) d.rot = Math.atan2(c.x - d.x, c.z - d.z);
  }

  // Bark now and then, only from right behind a group that's still far from the pen, so the
  // scatter goes the right way (and the goat is listening, and barks cost calm points).
  const lined = d.posture === 'crouch' && close < 1.2;
  if (lined && b.barkCd <= 0 && Math.hypot(pen.x - c.x, pen.z - c.z) > 10 && room.rng.next() < 0.08 * dt) {
    bark(room, d);
    b.barkCd = 10;
  }
}

/** Versus raider: trot circles through the other team's flock, with the odd bark. */
function raid(room: Room, d: Dog, team: 0 | 1 | null, dt: number): boolean {
  const theirs = room.sheep.filter((s) => s.team !== team && s.team !== null && !isPenned(room.field, s));
  if (!theirs.length) return false;
  const c = centroid(theirs);
  const a = room.clock * 0.8 + Number(d.id.slice(1));
  steerTo(d, c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2);
  d.wantSprint = d.stamina > 40;
  if (d.bot!.barkCd <= 0 && Math.hypot(c.x - d.x, c.z - d.z) < 4 && room.rng.next() < 0.5 * dt) {
    bark(room, d);
    d.bot!.barkCd = 6;
  }
  return true;
}

/** Split sheep into groups: anyone within LINK of a member joins. Biggest first. */
function groupsOf(sheep: Sheep[]): Group[] {
  const left = new Set(sheep);
  const out: Group[] = [];
  for (const seed of sheep) {
    if (!left.has(seed)) continue;
    left.delete(seed);
    const members = [seed];
    for (let k = 0; k < members.length; k++) {
      for (const o of left) {
        if (Math.hypot(o.x - members[k].x, o.z - members[k].z) < LINK) {
          left.delete(o);
          members.push(o);
        }
      }
    }
    const c = centroid(members);
    out.push({ sheep: members, c, spread: Math.min(6, Math.max(1, ...members.map((s) => Math.hypot(s.x - c.x, s.z - c.z)))), dogs: [] });
  }
  return out.sort((a, b) => b.sheep.length - a.sheep.length);
}

/** Every group gets its nearest free bot (biggest group first), then big groups get more. */
function assign(groups: Group[], bots: Dog[]): Group[] {
  const free = new Set(bots);
  const cap = (gr: Group) => (gr.sheep.length <= 2 ? 1 : gr.sheep.length <= 5 ? 2 : 3);
  for (let round = 0; round < 3 && free.size; round++) {
    for (const gr of groups) {
      if (!free.size || gr.dogs.length >= cap(gr) || gr.dogs.length > round) continue;
      const d = nearestTo([...free], gr.c.x, gr.c.z)!;
      free.delete(d);
      gr.dogs.push(d);
    }
  }
  // Keep each group's dogs in a stable order so flanks don't swap every tick.
  for (const gr of groups) gr.dogs.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return groups;
}

function steerTo(d: Dog, x: number, z: number): number {
  const dx = x - d.x;
  const dz = z - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3) [d.dx, d.dz] = [0, 0];
  else [d.dx, d.dz] = [dx / dist, dz / dist];
  return dist;
}

/**
 * Get to (x, z) the way a sheepdog does: never straight through the group, but round it on a
 * wide arc (come-bye or away, whichever is shorter), outside its flight zone R.
 */
function flankTo(d: Dog, x: number, z: number, c: P, R: number, flip: boolean): void {
  const r = Math.hypot(d.x - c.x, d.z - c.z);
  const ad = Math.atan2(d.z - c.z, d.x - c.x);
  const ap = Math.atan2(z - c.z, x - c.x);
  let diff = ap - ad;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (!flip && (Math.abs(diff) < 0.35 || r > R + 4)) {
    goAround(d, x, z, c, R - 2);
    return;
  }
  // Round the arc: tangent in the shorter direction (or the other way, if that one is blocked),
  // plus a nudge back out to radius R.
  const sgn = Math.sign(diff) * (flip ? -1 : 1) || 1;
  const [rx, rz] = [(d.x - c.x) / (r || 1), (d.z - c.z) / (r || 1)];
  const [tx, tz] = [-rz * sgn, rx * sgn];
  const out = Math.max(-1, Math.min(1.5, (R - r) / 1.5));
  [d.dx, d.dz] = unit(tx + rx * out, tz + rz * out);
}

/** Walk to (x, z) without cutting through the group at c with radius r. */
function goAround(d: Dog, x: number, z: number, c: P, r: number): number {
  const dist = steerTo(d, x, z);
  const tx = c.x - d.x;
  const tz = c.z - d.z;
  const along = tx * d.dx + tz * d.dz;
  const perp = Math.abs(tx * d.dz - tz * d.dx);
  if (along > 0 && along < dist && perp < r + 2) {
    const side = tx * d.dz - tz * d.dx > 0 ? 1 : -1;
    [d.dx, d.dz] = unit(d.dx * 0.4 + d.dz * side, d.dz * 0.4 - d.dx * side);
  }
  return dist;
}

/**
 * The spot behind the group (opposite where it should go), fanned out by flank. When that spot
 * is outside the fence or in the pen (the group is against it), swing round until it fits:
 * pushing sheep along a fence is how you get them out of a corner.
 */
function behind(f: FieldDef, h: P, [ux, uz]: [number, number], back: number, fan: number): [number, number] {
  const m = 1.2;
  for (const a of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75]) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const [vx, vz] = [ux * c - uz * s, ux * s + uz * c];
    const x = h.x - vx * back - vz * fan;
    const z = h.z - vz * back + vx * fan;
    if (Math.abs(x) < f.w / 2 - m && Math.abs(z) < f.d / 2 - m && standable(f, x, z)) return [x, z];
  }
  return [h.x - ux * back, h.z - uz * back];
}

/** Can a dog stand here: not in a pen, a pond or a tree. */
function standable(f: FieldDef, x: number, z: number): boolean {
  const r = DOG.radius + 0.3;
  if (f.pens.some((p) => Math.abs(x - p.x) < p.w / 2 + r && Math.abs(z - p.z) < p.d / 2 + r)) return false;
  return !f.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r);
}

/**
 * Where to drive a group next: round the pen's corner if it is beside or behind the pen, then out
 * in front of the gate, then straight in.
 */
function approach(pen: Pen, c: P): P {
  const g = gateOf(pen);
  const front = { x: g.x + g.ox * 3, z: g.z + g.oz * 3 };
  const out = (c.x - pen.x) * g.ox + (c.z - pen.z) * g.oz;
  const [sx, sz] = [-g.oz, g.ox];
  const side = (c.x - pen.x) * sx + (c.z - pen.z) * sz;
  const halfOut = (g.ox ? pen.w : pen.d) / 2;
  const halfSide = (g.ox ? pen.d : pen.w) / 2;
  if (out < halfOut + 1 && Math.abs(side) < halfSide + 3 && crosses(c, front, pen, 1)) {
    const sgn = side >= 0 ? 1 : -1;
    const along = out < -halfOut + 1 ? 0 : halfOut + 2.5;
    return { x: pen.x + sx * sgn * (halfSide + 3.5) + g.ox * along, z: pen.z + sz * sgn * (halfSide + 3.5) + g.oz * along };
  }
  const lined = Math.abs(side) < pen.gateW * 0.6 && out > 0;
  return lined || Math.hypot(front.x - c.x, front.z - c.z) < 1.5 ? { x: pen.x, z: pen.z } : front;
}

/** Does the straight line a to b pass through the pen (grown by m)? Slab test. */
function crosses(a: P, b: P, pen: Pen, m: number): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const [p, q, lo, hi] of [[a.x, b.x, pen.x - pen.w / 2 - m, pen.x + pen.w / 2 + m], [a.z, b.z, pen.z - pen.d / 2 - m, pen.z + pen.d / 2 + m]]) {
    const dd = q - p;
    if (Math.abs(dd) < 1e-9) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let [ta, tb] = [(lo - p) / dd, (hi - p) / dd];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function centroid(s: P[]): P {
  return { x: s.reduce((a, o) => a + o.x, 0) / s.length, z: s.reduce((a, o) => a + o.z, 0) / s.length };
}

function nearestTo(dogs: Dog[], x: number, z: number): Dog | undefined {
  return dogs.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
}

function unit(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** Which side of the gate the open sheep mostly are on: the keeper waits on the other side. */
function sideOf(open: Sheep[], g: { x: number; z: number; ox: number; oz: number }): number {
  const s = open.reduce((n, o) => n + (o.x - g.x) * -g.oz + (o.z - g.z) * g.ox, 0);
  return s >= 0 ? -1 : 1;
}
