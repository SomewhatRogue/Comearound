/**
 * Dogs: movement by posture (walk, sprint with stamina, crouch to stalk), lying down when crouched
 * and still, and barking. What dogs do TO sheep lives in flock.ts.
 */
import { inMud, inWater, nearLowFence } from '../shared/field';
import { DOG, HAZARD, WEATHER } from '../shared/tuning';
import { collide, separate } from './physics';
import type { Dog, Room } from './state';

/** A crouched dog that holds still this long lies down: the classic herding "down". */
export const DOWN_AFTER = 0.6;

export function moveDog(room: Room, d: Dog, dt: number): void {
  d.frozen = Math.max(0, d.frozen - dt);
  d.cower = Math.max(0, d.cower - dt);
  const len = d.frozen > 0 ? 0 : Math.hypot(d.dx, d.dz);
  const moving = len > 0.1;
  const canSprint = d.wantSprint && moving && d.stamina > 1;
  d.posture = d.wantCrouch || d.cower > 0 ? 'crouch' : canSprint ? 'sprint' : 'walk';
  d.stamina = Math.max(0, Math.min(DOG.staminaMax, d.stamina + (d.posture === 'sprint' ? -DOG.staminaDrain : DOG.staminaRegen) * dt));
  d.barkCd = Math.max(0, d.barkCd - dt);
  d.stillFor = moving ? 0 : d.stillFor + dt;
  const from = { x: d.x, z: d.z };
  if (moving) {
    // Mud slows you; so does wading a stream or pond.
    const ground = inMud(room.field, d.x, d.z) ? HAZARD.mudSlow : inWater(room.field, d.x, d.z) ? HAZARD.wadeSlow : 1;
    // Lightning: you cower, slow and low, for a moment.
    const scared = d.cower > 0 ? WEATHER.cowerSlow : 1;
    const hop = nearLowFence(room.field, d.x, d.z) < DOG.hopWithin ? DOG.hopSlow : 1;
    const speed = (d.posture === 'sprint' ? DOG.sprint : d.posture === 'crouch' ? DOG.crouch : DOG.walk) * ground * scared * hop;
    const k = Math.min(1, len);
    d.x += (d.dx / len) * speed * k * dt;
    d.z += (d.dz / len) * speed * k * dt;
    d.rot = Math.atan2(d.dx, d.dz);
  }
  // Pens are locked to dogs only in versus (so nobody can raid from inside). In the trials you can
  // walk in and fetch an extra sheep back out. Bot dogs still keep out: they never need to go in.
  const gateShut = (room.mode === 'versus' && room.phase !== 'lobby') || !!d.bot || !!d.auto;
  [d.x, d.z] = collide(room.field, d.x, d.z, DOG.radius, { from, gateShut, water: false, hop: true });
}

/** Dogs don't stack on top of each other. */
export function separateDogs(room: Room): void {
  const dogs = [...room.dogs.values()].filter((d) => !d.spectator);
  for (let i = 0; i < dogs.length; i++) for (let j = i + 1; j < dogs.length; j++) separate(dogs[i], dogs[j], DOG.radius * 2);
}

export function isDown(d: Dog): boolean {
  return d.posture === 'crouch' && d.stillFor >= DOWN_AFTER;
}

/** Woof. Scatters sheep nearby (flock.ts reads `barks`), costs calm-herding points. */
export function bark(room: Room, d: Dog): boolean {
  if (d.barkCd > 0 || d.spectator || d.frozen > 0 || (room.phase !== 'playing' && room.phase !== 'lobby')) return false;
  d.barkCd = DOG.barkCooldown;
  d.barks++;
  // Practice barks in the lobby don't count against you.
  if (room.phase === 'playing') d.fieldBarks++;
  room.noises.push({ kind: 'bark', x: d.x, z: d.z, by: d.id });
  return true;
}
