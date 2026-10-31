/**
 * The flock. Each sheep grazes toward its own patch, sticks with its neighbours, and moves away
 * from dogs. How far away a dog can be and still move it depends on the dog:
 * - walking or sprinting dogs push hard and make sheep nervous
 * - a crouched dog can get close; facing sheep while crouched (the eye) eases them away, calmly
 * - a dog lying down calms everything around it
 * - a bark kicks every sheep in earshot away fast and makes them panic
 * Penned sheep are calmer, so a held pen stays held.
 */
import { gateOf, inMud, inPen, outOfField, type FieldDef } from '../shared/field';
import { DOG, GOAT, HAZARD, SHEEP, WEATHER } from '../shared/tuning';
import { hazardForces } from './hazards';
import { isDown } from './dogs';
import { clampLen, collide, separate } from './physics';
import type { Room, Sheep } from './state';

export function spawnFlock(room: Room): Sheep[] {
  const out: Sheep[] = [];
  let id = 1;
  for (const f of room.field.flocks) {
    for (let i = 0; i < f.n; i++) {
      const a = room.rng.next() * Math.PI * 2;
      const r = Math.sqrt(room.rng.next()) * 2.5;
      const x = f.x + Math.cos(a) * r;
      const z = f.z + Math.sin(a) * r;
      out.push({ id: id++, x, z, vx: 0, vz: 0, rot: room.rng.range(-3, 3), fear: 0, startle: 0, team: f.team, wx: x, wz: z, wanderT: room.rng.range(0, 4), lost: false });
    }
  }
  return out;
}

/** Does this sheep count as penned: inside a pen that scores for its team. */
export function isPenned(field: FieldDef, s: { x: number; z: number; team: 0 | 1 | null }): boolean {
  return field.pens.some((p) => (p.team === null || p.team === s.team) && inPen(p, s.x, s.z));
}

export function tickFlock(room: Room, dt: number): void {
  const dogs = [...room.dogs.values()].filter((d) => !d.spectator);
  const flock = room.sheep;
  const before = flock.map((s) => ({ x: s.x, z: s.z }));
  const pennedNow = flock.map((s) => isPenned(room.field, s));
  for (const s of flock) {
    if (s.lost) continue;
    const penned = pennedNow[flock.indexOf(s)];
    const calm = penned ? SHEEP.pennedCalm : 1;
    let ax = 0;
    let az = 0;
    let push = 0;

    // Neighbours: stay together, don't crowd, move the same way.
    let cx = 0, cz = 0, n = 0, vx = 0, vz = 0;
    let near: { x: number; z: number } | null = null;
    let nearD = Infinity;
    for (const o of flock) {
      // Sheep on the other side of a pen fence aren't company.
      if (o === s || o.lost || pennedNow[flock.indexOf(o)] !== penned) continue;
      const dx = o.x - s.x;
      const dz = o.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < nearD) [near, nearD] = [o, d];
      if (d < SHEEP.cohesion) {
        cx += o.x; cz += o.z; vx += o.vx; vz += o.vz; n++;
      }
      if (d < SHEEP.separation && d > 1e-4) {
        ax -= (dx / d) * (SHEEP.separation - d) * 6;
        az -= (dz / d) * (SHEEP.separation - d) * 6;
      }
    }
    if (n) {
      // Frightened sheep bunch up tighter.
      const pull = 0.6 + 1.4 * s.fear;
      ax += (cx / n - s.x) * pull + (vx / n - s.vx) * 0.5;
      az += (cz / n - s.z) * pull + (vz / n - s.vz) * 0.5;
    } else if (!penned) {
      // A sheep on its own wants to be back with the others. If the others are all penned, it
      // heads for the way in (it still runs from dogs, so it can be steered).
      if (!near) {
        const home = room.field.pens.find((p) => p.team === null || p.team === s.team);
        if (home) {
          const g = gateOf(home);
          near = { x: g.x + g.ox * 2, z: g.z + g.oz * 2 };
          nearD = Math.hypot(near.x - s.x, near.z - s.z) || 1;
        }
      }
      if (near && nearD > 1) {
        ax += ((near.x - s.x) / nearD) * SHEEP.lonely;
        az += ((near.z - s.z) / nearD) * SHEEP.lonely;
      }
    }

    // Follow the leaders: near an open gate with sheep already inside, the rest want in too.
    if (!penned) {
      for (const p of room.field.pens) {
        if (p.team !== null && p.team !== s.team) continue;
        const g = gateOf(p);
        const gd = Math.hypot(s.x - g.x, s.z - g.z);
        if (gd < SHEEP.followRange && flock.some((o, k) => pennedNow[k] && o.team === s.team && inPen(p, o.x, o.z))) {
          // Off to the side of the opening: line up on the gate first, then go in.
          const lat = Math.abs((s.x - g.x) * g.oz - (s.z - g.z) * g.ox);
          const aim = lat > p.gateW / 2 - 0.4 ? { x: g.x + g.ox * 1.2, z: g.z + g.oz * 1.2 } : p;
          const [tx, tz] = [aim.x - s.x, aim.z - s.z];
          const tl = Math.hypot(tx, tz) || 1;
          ax += (tx / tl) * SHEEP.follow;
          az += (tz / tl) * SHEEP.follow;
        }
      }
    }

    // Dogs.
    for (const d of dogs) {
      const dx = s.x - d.x;
      const dz = s.z - d.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const down = isDown(d);
      if (down && dist < DOG.calmRadius) s.fear = Math.max(0, s.fear - 0.6 * dt);
      const flight = (down ? SHEEP.flight.down : SHEEP.flight[d.posture]) * calm;
      if (dist < flight) {
        const k = 1 - dist / flight;
        const strength = d.posture === 'sprint' ? 9 : d.posture === 'crouch' ? 4 : 6.5;
        ax += (dx / dist) * k * strength;
        az += (dz / dist) * k * strength;
        push = Math.max(push, k);
        if (d.posture !== 'crouch') s.fear = Math.min(1, s.fear + k * (d.posture === 'sprint' ? 1.6 : 0.7) * dt);
      }
      // The eye: crouched and facing them, a dog moves sheep without scaring them.
      if (d.posture === 'crouch' && dist < DOG.eyeRange) {
        const fx = Math.sin(d.rot);
        const fz = Math.cos(d.rot);
        const cos = (fx * -dx + fz * -dz) / dist;
        if (cos < -Math.cos(DOG.eyeCone)) {
          const k = 1 - dist / DOG.eyeRange;
          ax += (dx / dist) * DOG.eyePush * (0.5 + k);
          az += (dz / dist) * DOG.eyePush * (0.5 + k);
          push = Math.max(push, 0.35);
        }
      }
    }

    // Goats, brambles, the wind, frights (hazards.ts).
    const hf = hazardForces(room, s, dogs, penned, dt);
    ax += hf.ax;
    az += hf.az;
    push = Math.max(push, hf.push);

    // Barks and bleats: a kick away and a fright.
    for (const nz of room.noises) {
      const dx = s.x - nz.x;
      const dz = s.z - nz.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      if (nz.kind === 'thunder') {
        // Lightning: everyone panics and runs from where it struck, pen or no pen.
        if (d < WEATHER.strikeRadius) {
          const k = WEATHER.strikeKick * (1 - d / WEATHER.strikeRadius) * (penned ? 0.5 : 1) + 1.5;
          s.vx += (dx / d) * k;
          s.vz += (dz / d) * k;
          s.startle = 1;
          s.fear = 1;
        }
        continue;
      }
      const r = nz.kind === 'bark' ? SHEEP.barkRadius : GOAT.bleatRadius;
      if (d > r) continue;
      const kick = (nz.kind === 'bark' ? SHEEP.barkKick : GOAT.bleatKick) * (1 - d / r) * Math.min(1, calm * (nz.power ?? 1));
      s.vx += (dx / d) * kick;
      s.vz += (dz / d) * kick;
      s.startle = Math.max(s.startle, 1 - d / r);
      s.fear = Math.min(1, s.fear + (nz.kind === 'bark' ? 0.8 : 1) * (1 - d / r) * Math.min(1, calm * (nz.power ?? 1)));
    }

    // Graze: drift toward a patch of grass near where the flock is, or around the pen when penned.
    s.wanderT -= dt;
    if (s.wanderT <= 0) {
      s.wanderT = room.rng.range(3, 7);
      const pen = penned ? room.field.pens.find((p) => inPen(p, s.x, s.z)) : null;
      [s.wx, s.wz] = pen ? [pen.x + room.rng.range(-pen.w / 3, pen.w / 3), pen.z + room.rng.range(-pen.d / 3, pen.d / 3)] : [s.x + room.rng.range(-2.5, 2.5), s.z + room.rng.range(-2.5, 2.5)];
    }
    // A fright keeps them running for a moment after the noise.
    s.startle = Math.max(0, s.startle - dt * 0.8);
    push = Math.max(push, s.startle * 0.8);
    if (push < 0.05) {
      const gx = s.wx - s.x;
      const gz = s.wz - s.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 0.3) {
        ax += (gx / gd) * 1.2;
        az += (gz / gd) * 1.2;
      }
    }

    // Integrate: scared sheep run, calm sheep amble.
    s.vx = (s.vx + ax * dt) * Math.exp(-dt * (push > 0 ? 1.2 : 2.4));
    s.vz = (s.vz + az * dt) * Math.exp(-dt * (push > 0 ? 1.2 : 2.4));
    const max = (push > 0 || s.fear > 0.3 ? SHEEP.flee * (0.6 + 0.4 * Math.max(s.fear, push)) : SHEEP.graze * 2) * (inMud(room.field, s.x, s.z) ? HAZARD.mudSlow : 1);
    [s.vx, s.vz] = clampLen(s.vx, s.vz, max);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const [hx, hz] = [s.x, s.z];
    [s.x, s.z] = collide(room.field, s.x, s.z, SHEEP.radius, { from: before[flock.indexOf(s)], leak: true, closed: room.closedPens });
    // Hitting a fence stops you going into it (no pressing on through it forever).
    const [cx2, cz2] = [s.x - hx, s.z - hz];
    const cl = Math.hypot(cx2, cz2);
    if (cl > 1e-5) {
      const into = (s.vx * cx2 + s.vz * cz2) / cl;
      if (into < 0) [s.vx, s.vz] = [s.vx - (into * cx2) / cl, s.vz - (into * cz2) / cl];
    }
    if (Math.hypot(s.vx, s.vz) > 0.15) s.rot = Math.atan2(s.vx, s.vz);
    s.fear = Math.max(0, s.fear - 0.12 * dt);
  }
  const live = flock.filter((s) => !s.lost);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) separate(live[i], live[j], SHEEP.radius * 2);
  // Sheep give way to dogs entirely (a dog can stand in a gap and block it).
  for (const s of live) for (const d of dogs) separate(s, d, SHEEP.radius + DOG.radius, 1);
  // Being shoved never puts a sheep through a fence.
  flock.forEach((s, i) => {
    if (s.lost) return;
    [s.x, s.z] = collide(room.field, s.x, s.z, SHEEP.radius, { from: before[i], leak: true, closed: room.closedPens });
    // Out through a gap in the fence: gone.
    if (outOfField(room.field, s.x, s.z, 1.2)) {
      s.lost = true;
      if (room.phase === 'playing') for (const d of dogs) room.emit(d.id, { kind: 'toast', text: 'A sheep got out through the broken fence!' });
    }
  });
}
