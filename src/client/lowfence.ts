/**
 * Low fences: knee-high, weathered posts and a single rail, the remains of old field boundaries.
 * The tumbledown ones have leaning posts and a rail fallen at one end. Sheep go round; dogs jump
 * them (`jumpAt` says where a dog is in its jump, from the same field data the rules use).
 */
import * as THREE from 'three';
import type { FieldDef, LowFence } from '../shared/field';
import { Rng } from '../shared/rng';
import { mat } from './models';

const WOOD = '#9c8461';
const OLD = '#b3a07c';

export function lowFences(f: FieldDef, heightAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  for (const l of f.lowFences ?? []) g.add(one(l, heightAt));
  return g;
}

function one(l: LowFence, heightAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(Math.round(l.a[0] * 97 + l.a[1] * 13 + l.b[0] * 7));
  const [ax, az] = l.a;
  const [bx, bz] = l.b;
  const len = Math.hypot(bx - ax, bz - az);
  const ang = -Math.atan2(bz - az, bx - ax);
  const n = Math.max(1, Math.round(len / 1.1));
  const postGeo = new THREE.BoxGeometry(0.19, 0.66, 0.19);
  const posts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];
    const p = new THREE.Mesh(postGeo, mat(i % 3 ? WOOD : OLD));
    const lean = l.broken ? rng.range(-0.35, 0.35) : rng.range(-0.06, 0.06);
    p.position.set(x, heightAt(x, z) + 0.3, z);
    p.rotation.set(lean, ang + rng.range(-0.2, 0.2), lean * 0.6);
    p.castShadow = true;
    g.add(p);
    posts.push(p.position.clone());
  }
  // Two rails, post to post: in a tumbledown stretch now and then one end has dropped to the grass,
  // or a rail is missing altogether.
  for (let i = 0; i < posts.length - 1; i++) {
    for (const up of [0.1, -0.14]) {
      const a = posts[i].clone().setY(posts[i].y + up);
      const b = posts[i + 1].clone().setY(posts[i + 1].y + up);
      if (l.broken && rng.next() < 0.3) b.y = heightAt(b.x, b.z) + 0.05;
      if (l.broken && rng.next() < 0.18) continue;
      const d = b.clone().sub(a);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(d.length() + 0.12, 0.11, 0.1), mat(up > 0 ? OLD : WOOD));
      rail.position.copy(a).addScaledVector(d, 0.5);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
      rail.castShadow = true;
      g.add(rail);
    }
  }
  return g;
}

/** Where a dog is in a jump over a low fence: gathering, in the air, landing, or not jumping. */
export interface Jump { phase: 'none' | 'gather' | 'leap' | 'land'; t: number }

/** The jump's stretches, in metres either side of the rail (the leap spans the rail itself). */
export const JUMP = { gather: 1.45, leap: 0.85, land: 1.4 };

/**
 * From where a dog is and which way it faces: before the rail it gathers, over it it leaps, after
 * it lands. Driven by position (which the room decides), so every player sees the same jump.
 */
export function jumpAt(f: FieldDef, x: number, z: number, facing: number): Jump {
  let best: Jump = { phase: 'none', t: 0 };
  let bestD = Infinity;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  for (const l of f.lowFences ?? []) {
    const [ax, az] = l.a;
    const ex = l.b[0] - ax;
    const ez = l.b[1] - az;
    const len = Math.hypot(ex, ez) || 1;
    const along = ((x - ax) * ex + (z - az) * ez) / (len * len);
    if (along < -0.05 || along > 1.05) continue;
    // Signed distance across the line, and whether we're heading toward it or away.
    const [nx, nz] = [-ez / len, ex / len];
    const side = (x - ax) * nx + (z - az) * nz;
    const toward = (fx * nx + fz * nz) * side < 0;
    const s = toward ? -Math.abs(side) : Math.abs(side);
    if (Math.abs(side) >= bestD || s < -JUMP.gather || s > JUMP.land) continue;
    bestD = Math.abs(side);
    if (s < -JUMP.leap) best = { phase: 'gather', t: (s + JUMP.gather) / (JUMP.gather - JUMP.leap) };
    else if (s < JUMP.leap) best = { phase: 'leap', t: (s + JUMP.leap) / (2 * JUMP.leap) };
    else best = { phase: 'land', t: (s - JUMP.leap) / (JUMP.land - JUMP.leap) };
  }
  return best;
}
