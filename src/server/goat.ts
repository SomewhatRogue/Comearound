/**
 * The goat: an agent of chaos among the sheep. Every so often it picks some mischief:
 * - **flock:** stroll into the biggest loose group of sheep and bleat in the middle of it.
 * - **gate:** go and stand in a pen's gateway, so sheep won't go past it (NOPE).
 * - **graze:** amble about.
 * Penned, it gets bored and tries to wander back out unless a dog is lying down near the gate.
 *
 * Dogs can drive it, but it's stubborn: the eye (crouched, facing it) moves it best; walking
 * into it shoves it a little; sprinting at it moves it more but gets its goat. Barking annoys it
 * most. Annoy it enough and it marches over to whoever annoyed it last, stares them down, they
 * freeze, and they get the NAUGHTY close-up. Pen it for a bonus (it has to still be in at the end).
 * In versus, drive it onto the other side and let it work.
 */
import { gateOf, inPen } from '../shared/field';
import { DOG, GOAT } from '../shared/tuning';
import { isDown } from './dogs';
import { isPenned } from './flock';
import { clampLen, collide, separate } from './physics';
import type { Goat, Room, Sheep } from './state';

export function makeGoat(room: Room): Goat | null {
  const g = room.field.goat;
  if (!g) return null;
  return {
    x: g.x, z: g.z, vx: 0, vz: 0, rot: 0, mood: 'wander', target: null, timer: 0, bleatIn: room.rng.range(...GOAT.bleatEvery), bleats: 0,
    annoy: 0, lastBarker: null, stareCd: 6, wx: g.x, wz: g.z, plan: 'graze', planT: room.rng.range(3, 6), pushedT: 0,
  };
}

export function goatPenned(room: Room): boolean {
  const g = room.goat;
  return !!g && room.field.pens.some((p) => isPenned(room.field, { x: g.x, z: g.z, team: p.team }));
}

function bleat(room: Room, g: Goat): void {
  g.bleatIn = room.rng.range(...GOAT.bleatEvery);
  g.bleats++;
  g.mood = 'bleat';
  g.timer = 1;
  room.noises.push({ kind: 'bleat', x: g.x, z: g.z, by: null });
}

/** The biggest loose group of sheep: its middle. */
function flockTarget(room: Room): { x: number; z: number } | null {
  const loose = room.sheep.filter((s) => !isPenned(room.field, s));
  if (!loose.length) return null;
  let best: Sheep[] = [];
  for (const s of loose) {
    const near = loose.filter((o) => Math.hypot(o.x - s.x, o.z - s.z) < 5);
    if (near.length > best.length) best = near;
  }
  return { x: best.reduce((a, o) => a + o.x, 0) / best.length, z: best.reduce((a, o) => a + o.z, 0) / best.length };
}

export function tickGoat(room: Room, dt: number): void {
  const g = room.goat;
  if (!g || room.phase !== 'playing') return;
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

  if (g.mood === 'stare') {
    g.timer -= dt;
    if (g.timer <= 0) [g.mood, g.target] = ['wander', null];
    g.vx = g.vz = 0;
    return;
  }

  // Annoyed enough: march over and stare the culprit down.
  if (g.mood !== 'coming' && g.annoy >= 1 && g.stareCd <= 0 && g.lastBarker && room.dogs.has(g.lastBarker)) {
    [g.mood, g.target] = ['coming', g.lastBarker];
  }
  if (g.mood === 'coming') {
    const t = room.dogs.get(g.target ?? '');
    if (!t || t.spectator) g.mood = 'wander';
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
      ax += (dx / d) * 6;
      az += (dz / d) * 6;
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
    if (pushed) g.pushedT = 2.5;

    const pen = room.field.pens.find((p) => inPen(p, g.x, g.z, 0));
    if (pushed) {
      if (g.mood !== 'bleat') g.mood = 'flee';
    } else if (pen) {
      // Penned, and bored. Unless someone is lying down at the gate, it heads for the way out.
      const gt = gateOf(pen);
      const guarded = [...room.dogs.values()].some((d) => isDown(d) && Math.hypot(d.x - gt.x, d.z - gt.z) < 3.2);
      g.planT -= dt;
      if (!guarded && g.planT <= 0) {
        if (g.mood !== 'bleat') g.mood = 'escape';
        goTo(gt.x + gt.ox * 2, gt.z + gt.oz * 2, 1.4);
      } else {
        if (g.mood !== 'bleat') g.mood = 'wander';
        if (!inPen(pen, g.wx, g.wz, 0.8)) [g.wx, g.wz] = [pen.x, pen.z];
        wander(pen.x, pen.z, Math.min(pen.w, pen.d) / 3);
      }
    } else {
      g.planT -= dt;
      if (g.planT <= 0 && g.pushedT <= 0) {
        const r = room.rng.next();
        g.plan = r < GOAT.mischief.flock ? 'flock' : r < GOAT.mischief.flock + GOAT.mischief.gate ? 'gate' : 'graze';
        g.planT = room.rng.range(...GOAT.planEvery);
        g.timer = 0;
      }
      if (g.plan === 'flock') {
        const t = flockTarget(room);
        if (!t) g.plan = 'graze';
        else if (Math.hypot(t.x - g.x, t.z - g.z) > 1.5) {
          if (g.mood !== 'bleat') g.mood = 'stroll';
          goTo(t.x, t.z, 1.8);
          speed = GOAT.speed * 0.7;
        } else {
          // In the middle of them: MEHHH.
          bleat(room, g);
          g.plan = 'graze';
          g.planT = room.rng.range(...GOAT.planEvery);
        }
      } else if (g.plan === 'gate') {
        const p = room.field.pens.find((q) => room.sheep.some((s) => !isPenned(room.field, s) && (q.team === null || q.team === s.team))) ?? room.field.pens[0];
        const gt = gateOf(p);
        const [bx, bz] = [gt.x + gt.ox * 0.9, gt.z + gt.oz * 0.9];
        if (Math.hypot(bx - g.x, bz - g.z) > 0.6) {
          if (g.mood !== 'bleat') g.mood = 'stroll';
          goTo(bx, bz, 1.8);
          speed = GOAT.speed * 0.7;
        } else {
          if (g.mood !== 'bleat') g.mood = 'block';
          g.vx *= 0.8;
          g.vz *= 0.8;
          g.rot = Math.atan2(gt.ox, gt.oz);
          if ((g.timer += dt) > GOAT.blockSec) [g.plan, g.planT] = ['graze', room.rng.range(...GOAT.planEvery)];
        }
      } else {
        if (g.mood !== 'bleat') g.mood = 'wander';
        wander(g.x, g.z, 5);
      }
      // And it bleats now and then whatever it's doing.
      g.bleatIn -= dt;
      if (g.bleatIn <= 0) bleat(room, g);
    }
  }

  function goTo(x: number, z: number, k: number): void {
    const gx = x - g!.x;
    const gz = z - g!.z;
    const gd = Math.hypot(gx, gz) || 1;
    ax += (gx / gd) * k;
    az += (gz / gd) * k;
  }
  function wander(cx: number, cz: number, r: number): void {
    if (Math.hypot(g!.wx - g!.x, g!.wz - g!.z) < 0.5 || room.rng.next() < 0.1 * dt) [g!.wx, g!.wz] = [cx + room.rng.range(-r, r), cz + room.rng.range(-r, r)];
    goTo(g!.wx, g!.wz, 1.5);
  }

  g.vx = (g.vx + ax * dt) * Math.exp(-dt * 2);
  g.vz = (g.vz + az * dt) * Math.exp(-dt * 2);
  [g.vx, g.vz] = clampLen(g.vx, g.vz, speed);
  g.x += g.vx * dt;
  g.z += g.vz * dt;
  [g.x, g.z] = collide(room.field, g.x, g.z, GOAT.radius, { from });
  if (Math.hypot(g.vx, g.vz) > 0.1 && g.mood !== 'block') g.rot = Math.atan2(g.vx, g.vz);
  for (const s of room.sheep) separate(g, s, GOAT.radius + 0.5, 0.3);
  for (const d of room.dogs.values()) if (!d.spectator) separate(g, d, GOAT.radius + DOG.radius, 0.2);
  [g.x, g.z] = collide(room.field, g.x, g.z, GOAT.radius, { from });
}
