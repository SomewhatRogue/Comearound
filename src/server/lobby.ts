/**
 * The lobby pack: while friends gather, every dog that isn't practising stands in a row at the
 * edge of the meadow, facing the camera (dressing up, waiting, being petted). Dogs walk to their
 * spot, so a friend who joins trots in, and a dog done practising trots back. The sheep pay the
 * row no attention. Practising (the lobby panel folded) sets a dog free to run at the flock.
 */
import type { Dog, Room } from './state';

/** The row: across the lower left of The Meadow, clear of the practice flock and far enough
 * from the bottom fence that the close-up camera behind it stays inside the field. */
const ROW = { x: -16, z: 8.5, gap: 1.35 };
/** Where a dog that has just joined appears, to trot in from. */
export const ARRIVE = { x: -19.3, z: 12 };
const PET_GAP = 0.45;

export function inLineup(room: Room, d: Dog): boolean {
  return room.phase === 'lobby' && !d.practising && !d.spectator;
}

/** Walk each lineup dog to its spot (in join order), then stand facing the camera. */
export function tickLobby(room: Room): void {
  if (room.phase !== 'lobby') return;
  let i = 0;
  for (const d of room.dogs.values()) {
    if (!inLineup(room, d)) continue;
    const sx = ROW.x + i++ * ROW.gap;
    const dx = sx - d.x;
    const dz = ROW.z - d.z;
    const dist = Math.hypot(dx, dz);
    [d.wantSprint, d.wantCrouch] = [false, false];
    if (dist < 0.12) {
      [d.dx, d.dz] = [0, 0];
      d.rot = 0;
    } else {
      // Full walking pace until close, then ease in.
      const k = Math.min(1, dist / 0.8) / dist;
      [d.dx, d.dz] = [dx * k, dz * k];
    }
  }
}

export function setPractising(room: Room, d: Dog, on: boolean): void {
  if (room.phase !== 'lobby' || d.practising === on) return;
  d.practising = on;
  [d.dx, d.dz] = [0, 0];
}

/** A pat: hearts for everyone to see, and the dog's owner hears who it was. */
export function pet(room: Room, by: Dog, target: Dog | undefined): void {
  if (!target || room.phase !== 'lobby' || target.spectator) return;
  if (room.realClock - by.petAt < PET_GAP) return;
  by.petAt = room.realClock;
  target.pets++;
  if (target !== by && !target.bot) room.emit(target.id, { kind: 'toast', text: `${by.look.name} gave you a pat` });
}
