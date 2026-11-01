/**
 * The hub: between games everyone runs free in the meadow (its flock, its pen, its agility
 * course). A dog that joins appears at the gate and trots in a few steps before it's yours to
 * steer, so friends arriving are easy to spot. The sheep pay no attention to a dog walking in.
 */
import type { Dog, Room } from './state';

/** Where a dog that has just joined appears (by the gate on the west fence), and how far it trots in. */
export const ARRIVE = { x: -26.5, z: 4 };
const TROT_IN = 5;
const PET_GAP = 0.45;

/** Walking in from the gate (not yours to steer yet; the sheep ignore it). */
export function inLineup(room: Room, d: Dog): boolean {
  return room.phase === 'lobby' && !!d.arrive && !d.spectator;
}

/** A dog that has just joined: at the gate, with a spot a few steps in (spread out, so friends don't stack up). */
export function arriveAt(room: Room, d: Dog): void {
  const n = [...room.dogs.values()].filter((q) => !q.bot).length;
  [d.x, d.z] = [ARRIVE.x, ARRIVE.z];
  d.arrive = { x: ARRIVE.x + TROT_IN + (n % 3), z: ARRIVE.z + ((n % 5) - 2) * 1.4 };
}

/** Back from a run: everyone in a loose bunch near the gate, free to run. */
export function gatherInHub(room: Room): void {
  let i = 0;
  for (const d of room.dogs.values()) {
    const a = i++ * 2.4;
    [d.x, d.z, d.dx, d.dz] = [ARRIVE.x + 6 + Math.cos(a) * 2.2, ARRIVE.z + Math.sin(a) * 2.2, 0, 0];
    d.arrive = undefined;
  }
}

/** Walk dogs that are arriving to their spot; then they're free. */
export function tickLobby(room: Room): void {
  if (room.phase !== 'lobby') return;
  for (const d of room.dogs.values()) {
    if (!d.arrive) continue;
    const dx = d.arrive.x - d.x;
    const dz = d.arrive.z - d.z;
    const dist = Math.hypot(dx, dz);
    [d.wantSprint, d.wantCrouch] = [false, false];
    if (dist < 0.25) {
      [d.dx, d.dz] = [0, 0];
      d.arrive = undefined;
    } else {
      const k = Math.min(1, dist / 0.8) / dist;
      [d.dx, d.dz] = [dx * k, dz * k];
    }
  }
}

/** Old clients still send 'practise' (the lobby used to have a row to stand in). Nothing to do now. */
export function setPractising(room: Room, d: Dog, on: boolean): void {
  if (room.phase !== 'lobby') return;
  d.practising = on;
}

/** A pat: hearts for everyone to see, and the dog's owner hears who it was. */
export function pet(room: Room, by: Dog, target: Dog | undefined): void {
  if (!target || room.phase !== 'lobby' || target.spectator) return;
  if (room.realClock - by.petAt < PET_GAP) return;
  by.petAt = room.realClock;
  target.pets++;
  if (target !== by && !target.bot) room.emit(target.id, { kind: 'toast', text: `${by.look.name} gave you a pat` });
}
