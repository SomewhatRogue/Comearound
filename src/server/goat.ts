/**
 * Goats: agents of chaos among the sheep (some fields have several). Every so often each picks
 * some mischief:
 * - **flock:** stroll into the biggest loose group of sheep and bleat in the middle of it.
 * - **charge:** trot straight through the flock and out the other side, scattering it.
 * - **gate:** go and stand in a pen's gateway so sheep won't go past it (NOPE).
 * - **raid:** walk into a pen with sheep in it and bleat, loud, so some of them bolt back out.
 * - **graze:** amble about.
 * Penned, a goat gets bored and wanders back out unless a dog is lying down near the gate.
 *
 * Dogs can drive a goat, but it's stubborn: the eye (crouched, facing it) moves it best; walking
 * into it shoves it a little; sprinting at it moves it more but gets its goat. Barking annoys it
 * most. Annoy it enough and it marches over to whoever annoyed it last, stares them down, they
 * freeze, and they get the NAUGHTY close-up. Pen goats for a bonus (they must still be in at the end).
 */
import { gateOf, inMud, inPen, type Pen } from '../shared/field';
import { DOG, GOAT } from '../shared/tuning';
import { isDown } from './dogs';
import { isPenned } from './flock';
import { clampLen, collide, separate } from './physics';
import type { Goat, Room, Sheep } from './state';

export function makeGoats(room: Room): Goat[] {
  return room.field.goats.map((g, id) => ({
    id, x: g.x, z: g.z, vx: 0, vz: 0, rot: 0, mood: 'wander', target: null, timer: 0, bleatIn: room.rng.range(...GOAT.bleatEvery), bleats: 0,
    annoy: 0, lastBarker: null, stareCd: 6, wx: g.x, wz: g.z, plan: 'graze', planT: room.rng.range(2, 6), pushedT: 0, cx: 0, cz: 0,
  }));
}

/** Is this goat in a pen (that scores for `team`, or any pen when team is undefined)? */
export function goatPenned(room: Room, g: Goat, team?: 0 | 1 | null): boolean {
  return room.field.pens.some((p) => (team === undefined || team === null || p.team === null || p.team === team) && inPen(p, g.x, g.z));
}

function bleat(room: Room, g: Goat, power = 1): void {
  g.bleatIn = room.rng.range(...GOAT.bleatEvery);
  g.bleats++;
  g.mood = 'bleat';
  g.timer = 1;
  room.noises.push({ kind: 'bleat', x: g.x, z: g.z, by: null, power });
}

/** The biggest loose group of sheep: its middle. */
function flockTarget(room: Room): { x: number; z: number } | null {
  const loose = room.sheep.filter((s) => !s.lost && !isPenned(room.field, s));
  if (!loose.length) return null;
  let best: Sheep[] = [];
  for (const s of loose) {
    const near = loose.filter((o) => Math.hypot(o.x - s.x, o.z - s.z) < 5);
    if (near.length > best.length) best = near;
  }
  return { x: best.reduce((a, o) => a + o.x, 0) / best.length, z: best.reduce((a, o) => a + o.z, 0) / best.length };
}

/** A pen worth raiding: one with a few sheep in it. */
function raidTarget(room: Room): Pen | null {
  return room.field.pens.find((p) => room.sheep.filter((s) => !s.lost && inPen(p, s.x, s.z)).length >= 3) ?? null;
}

export function tickGoats(room: Room, dt: number): void {
  if (room.phase !== 'playing') return;
  for (const g of room.goats) tickGoat(room, g, dt);
  for (let i = 0; i < room.goats.length; i++) for (let j = i + 1; j < room.goats.length; j++) separate(room.goats[i], room.goats[j], GOAT.radius * 2);
}

function tickGoat(room: Room, g: Goat, dt: number): void {
  const from = { x: g.x, z: g.z };
  g.stareCd -= dt;
  g.pushedT = Math.max(0, g.pushedT - dt);
  g.annoy = Math.max(0, g.annoy - GOAT.annoyDecay * dt);
  const annoy = (by: string, amount: number) => {
    g.annoy = Math.min(1, g.annoy + amount);
    g.lastBarker = by;
  };
  for (const nz of room.noises) {
    if (nz.kind === 'bark' && nz.by && Math.hypot(nz.x - g.x, nz.z - g.z) < GOAT.earshot) annoy(nz.by, GOAT.annoyPerBark);
  }

  let ax = 0;
  let az = 0;
  let speed = GOAT.wander;
  const goTo = (x: number, z: number, k: number) => {
    const gx = x - g.x;
    const gz = z - g.z;
    const gd = Math.hypot(gx, gz) || 1;
    ax += (gx / gd) * k;
    az += (gz / gd) * k;
    return gd;
  };
  const wander = (cx: number, cz: number, r: number) => {
    if (Math.hypot(g.wx - g.x, g.wz - g.z) < 0.5 || room.rng.next() < 0.1 * dt) [g.wx, g.wz] = [cx + room.rng.range(-r, r), cz + room.rng.range(-r, r)];
    goTo(g.wx, g.wz, 1.5);
  };
  const setMood = (m: Goat['mood']) => {
    if (g.mood !== 'bleat') g.mood = m;
  };
  const nextPlan = () => [g.plan, g.planT, g.timer] = ['graze', room.rng.range(...GOAT.planEvery), 0] as const;

  if (g.mood === 'stare') {
    g.timer -= dt;
    if (g.timer <= 0) [g.mood, g.target] = ['wander', null];
    g.vx = g.vz = 0;
    return;
  }

  // Annoyed enough: march over and stare the culprit down (one goat per victim).
  const victim = g.lastBarker ? room.dogs.get(g.lastBarker) : undefined;
  if (g.mood !== 'coming' && g.annoy >= 1 && g.stareCd <= 0 && victim && !room.goats.some((o) => o !== g && o.target === victim.id)) {
    [g.mood, g.target] = ['coming', victim.id];
  }
  if (g.mood === 'coming') {
    const t = room.dogs.get(g.target ?? '');
    if (!t || t.spectator) [g.mood, g.target] = ['wander', null];
    else {
      const dx = t.x - g.x;
      const dz = t.z - g.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6) {
        g.mood = 'stare';
        g.timer = GOAT.stareSec;
        g.stareCd = GOAT.stareCooldown;
        g.annoy = 0;
        g.rot = Math.atan2(dx, dz);
        t.frozen = GOAT.stareSec;
        room.emit(t.id, { kind: 'naughty', words: 'NAUGHTY' });
        return;
      }
      goTo(t.x, t.z, 6);
      speed = GOAT.speed;
    }
  } else {
    if (g.mood === 'bleat' && (g.timer -= dt) <= 0) g.mood = 'wander';

    // Dogs push it about (stubbornly), and some ways of pushing get on its nerves.
    let pushed = false;
    for (const d of room.dogs.values()) {
      if (d.spectator || d.frozen > 0) continue;
      const dx = g.x - d.x;
      const dz = g.z - d.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const facing = (Math.sin(d.rot) * -dx + Math.cos(d.rot) * -dz) / dist < -Math.cos(DOG.eyeCone);
      let k = 0;
      if (d.posture === 'crouch' && !isDown(d) && facing && dist < GOAT.eyeRange) k = 5 * (1 - dist / GOAT.eyeRange) + 1.5;
      else if (d.posture === 'sprint' && dist < GOAT.shoveRange + 1) {
        k = 4;
        annoy(d.id, GOAT.annoySprint * dt);
      } else if (d.posture === 'walk' && dist < GOAT.shoveRange) k = 2;
      if (k > 0) {
        ax += (dx / dist) * k;
        az += (dz / dist) * k;
        speed = Math.max(speed, GOAT.speed * 0.75);
        pushed = true;
      }
    }
    if (pushed) {
      g.pushedT = 2.5;
      if (g.plan === 'charge') nextPlan();
    }

    const pen = room.field.pens.find((p) => inPen(p, g.x, g.z, 0));
    if (pushed) setMood('flee');
    else if (pen && g.plan === 'raid') {
      // Inside a pen it came to raid: get to the middle, and MEHHH.
      if (goTo(pen.x, pen.z, 1.8) < 1.2) {
        bleat(room, g, GOAT.raidPower);
        nextPlan();
        g.planT = 2;
      } else setMood('stroll');
    } else if (pen) {
      // Penned, and bored. Unless someone is lying down at the gate, it heads for the way out.
      const gt = gateOf(pen);
      const guarded = [...room.dogs.values()].some((d) => isDown(d) && Math.hypot(d.x - gt.x, d.z - gt.z) < 3.2);
      g.planT -= dt;
      if (!guarded && g.planT <= 0) {
        setMood('escape');
        goTo(gt.x + gt.ox * 2, gt.z + gt.oz * 2, 1.4);
      } else {
        setMood('wander');
        if (!inPen(pen, g.wx, g.wz, 0.8)) [g.wx, g.wz] = [pen.x, pen.z];
        wander(pen.x, pen.z, Math.min(pen.w, pen.d) / 3);
      }
    } else {
      g.planT -= dt;
      if (g.planT <= 0 && g.pushedT <= 0) {
        const r = room.rng.next();
        const m = GOAT.mischief;
        g.plan = r < m.flock ? 'flock' : r < m.flock + m.charge ? 'charge' : r < m.flock + m.charge + m.gate ? 'gate' : r < m.flock + m.charge + m.gate + m.raid ? 'raid' : 'graze';
        if (g.plan === 'raid' && !raidTarget(room)) g.plan = 'flock';
        g.planT = room.rng.range(...GOAT.planEvery);
        g.timer = 0;
        if (g.plan === 'charge') {
          const t = flockTarget(room);
          if (!t) g.plan = 'graze';
          else {
            // Aim through the middle of the flock and out the other side.
            const d = Math.hypot(t.x - g.x, t.z - g.z) || 1;
            [g.cx, g.cz] = [t.x + ((t.x - g.x) / d) * 5, t.z + ((t.z - g.z) / d) * 5];
          }
        }
      }
      if (g.plan === 'flock') {
        const t = flockTarget(room);
        if (!t) g.plan = 'graze';
        else if (Math.hypot(t.x - g.x, t.z - g.z) > 1.5) {
          setMood('stroll');
          goTo(t.x, t.z, 1.8);
          speed = GOAT.speed * 0.7;
        } else {
          bleat(room, g);
          nextPlan();
        }
      } else if (g.plan === 'charge') {
        setMood('charge');
        speed = GOAT.chargeSpeed;
        if (goTo(g.cx, g.cz, 8) < 1 || (g.timer += dt) > 6) {
          bleat(room, g);
          nextPlan();
        }
      } else if (g.plan === 'gate' || g.plan === 'raid') {
        const p = g.plan === 'raid' ? raidTarget(room) : room.field.pens.find((q) => room.sheep.some((s) => !s.lost && !isPenned(room.field, s) && (q.team === null || q.team === s.team))) ?? room.field.pens[0];
        if (!p) nextPlan();
        else {
          const gt = gateOf(p);
          // Raiding: walk in through the gate. Blocking: stand just outside it.
          const [bx, bz] = g.plan === 'raid' ? [gt.x - gt.ox * 1.5, gt.z - gt.oz * 1.5] : [gt.x + gt.ox * 0.9, gt.z + gt.oz * 0.9];
          const [ex, ez] = [gt.x + gt.ox * 2.5, gt.z + gt.oz * 2.5];
          // Line up outside the gate first, so it walks in rather than into the fence.
          const lined = Math.abs((g.x - gt.x) * gt.oz - (g.z - gt.z) * gt.ox) < p.gateW / 2 - 0.3;
          if (g.plan === 'raid' && !lined && Math.hypot(ex - g.x, ez - g.z) > 0.8) {
            setMood('stroll');
            goTo(ex, ez, 1.8);
            speed = GOAT.speed * 0.7;
          } else if (Math.hypot(bx - g.x, bz - g.z) > 0.6) {
            setMood('stroll');
            goTo(bx, bz, 1.8);
            speed = GOAT.speed * 0.7;
          } else if (g.plan === 'gate') {
            setMood('block');
            g.vx *= 0.8;
            g.vz *= 0.8;
            g.rot = Math.atan2(gt.ox, gt.oz);
            if ((g.timer += dt) > GOAT.blockSec) nextPlan();
          }
        }
      } else {
        setMood('wander');
        wander(g.x, g.z, 5);
      }
      // And it bleats now and then whatever it's doing.
      g.bleatIn -= dt;
      if (g.bleatIn <= 0) bleat(room, g);
    }
  }

  if (inMud(room.field, g.x, g.z)) speed *= 0.5;
  g.vx = (g.vx + ax * dt) * Math.exp(-dt * 2);
  g.vz = (g.vz + az * dt) * Math.exp(-dt * 2);
  [g.vx, g.vz] = clampLen(g.vx, g.vz, speed);
  g.x += g.vx * dt;
  g.z += g.vz * dt;
  [g.x, g.z] = collide(room.field, g.x, g.z, GOAT.radius, { from });
  if (Math.hypot(g.vx, g.vz) > 0.1 && g.mood !== 'block') g.rot = Math.atan2(g.vx, g.vz);
  for (const s of room.sheep) if (!s.lost) separate(g, s, GOAT.radius + 0.5, g.mood === 'charge' ? 0.1 : 0.3);
  for (const d of room.dogs.values()) if (!d.spectator) separate(g, d, GOAT.radius + DOG.radius, 0.2);
  [g.x, g.z] = collide(room.field, g.x, g.z, GOAT.radius, { from });
}
