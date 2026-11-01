/**
 * Low fences: knee-high, weathered posts and a single rail, the remains of old field boundaries.
 * The tumbledown ones have leaning posts and a rail fallen at one end. Sheep go round; dogs hop
 * them (`hopOver` lifts a dog as it crosses, from the same field data the rules use).
 */
import * as THREE from 'three';
import { nearLowFence, type FieldDef, type LowFence } from '../shared/field';
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

/** How high a dog is lifted as it crosses a low fence: a little arc over the rail. */
export function hopOver(f: FieldDef, x: number, z: number): number {
  const d = nearLowFence(f, x, z);
  if (d > 0.75) return 0;
  return Math.sin((1 - d / 0.75) * Math.PI * 0.5) * 0.5;
}
