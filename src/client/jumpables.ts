/**
 * The other things lying about the fields for a dog to jump: fallen logs (bark, pale cut ends, a
 * broken-off branch, a bit of moss) and low dry-stone walls (two courses of rough stones with a
 * row of flatter ones on top). Same rules as the low fences: sheep go round, dogs jump.
 */
import * as THREE from 'three';
import type { LowFence } from '../shared/field';
import { Rng } from '../shared/rng';
import { mat } from './models';

type Height = (x: number, z: number) => number;

export function logMesh(l: LowFence, heightAt: Height): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(Math.round(l.a[0] * 53 + l.a[1] * 29 + l.b[1] * 11));
  const [ax, az] = l.a;
  const [bx, bz] = l.b;
  const len = Math.hypot(bx - ax, bz - az);
  const r = rng.range(0.21, 0.27);
  const [ya, yb] = [heightAt(ax, az), heightAt(bx, bz)];
  const trunk = new THREE.Group();
  // Bark along local x, slightly tapering toward the top end.
  const bark = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, len, 9, 1, true), mat(rng.next() < 0.5 ? '#6e4c2f' : '#7a5636', { side: THREE.DoubleSide }));
  bark.rotation.z = Math.PI / 2;
  bark.castShadow = true;
  trunk.add(bark);
  // The cut ends: pale wood with a darker ring.
  for (const [end, rr] of [[-1, r], [1, r * 0.9]] as const) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(rr * 0.97, 9), mat('#d6b47c', { side: THREE.DoubleSide }));
    cap.rotation.y = Math.PI / 2;
    cap.position.x = (end * len) / 2;
    trunk.add(cap);
    const ring = new THREE.Mesh(new THREE.RingGeometry(rr * 0.45, rr * 0.55, 9), mat('#a8834f', { side: THREE.DoubleSide }));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = (end * len) / 2 + end * 0.005;
    trunk.add(ring);
  }
  // A broken-off branch or two.
  for (let i = 0; i < 1 + Math.floor(rng.next() * 2); i++) {
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, rng.range(0.25, 0.45), 6), mat('#6e4c2f'));
    const along = rng.range(-0.35, 0.35) * len;
    const tilt = rng.range(0.5, 1.1) * (rng.next() < 0.5 ? 1 : -1);
    stub.position.set(along, r * 0.75, 0);
    stub.rotation.set(tilt * 0.4, 0, tilt);
    stub.castShadow = true;
    trunk.add(stub);
  }
  // A patch of moss on top.
  const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.75, 0), mat('#6f9a3e'));
  moss.scale.set(rng.range(1.2, 2), 0.35, 1);
  moss.position.set(rng.range(-0.3, 0.3) * len, r * 0.82, 0);
  trunk.add(moss);
  // Lying along the line, settled into the ground, following the slope.
  trunk.position.set((ax + bx) / 2, (ya + yb) / 2 + r * 0.82, (az + bz) / 2);
  trunk.rotation.order = 'YZX';
  trunk.rotation.y = -Math.atan2(bz - az, bx - ax);
  trunk.rotation.z = Math.atan2(yb - ya, len);
  g.add(trunk);
  return g;
}

export function stoneWallMesh(l: LowFence, heightAt: Height): THREE.Object3D {
  const rng = new Rng(Math.round(l.a[0] * 41 + l.b[0] * 17 + l.a[1] * 7));
  const [ax, az] = l.a;
  const [bx, bz] = l.b;
  const len = Math.hypot(bx - ax, bz - az);
  const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
  const [nx, nz] = [-uz, ux];
  const greys = ['#9a9a90', '#8b8a82', '#a7a59a', '#7e7d76', '#b0ad9f'];
  const step = 0.36;
  const per = Math.ceil(len / step) + 1;
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat('#ffffff'), per * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  let k = 0;
  const put = (t: number, side: number, y: number, s: THREE.Vector3) => {
    const x = ax + ux * t + nx * side;
    const z = az + uz * t + nz * side;
    q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
    m.compose(new THREE.Vector3(x, heightAt(x, z) + y, z), q, s);
    inst.setMatrixAt(k, m);
    inst.setColorAt(k++, c.set(greys[Math.floor(rng.next() * greys.length)]));
  };
  for (let t = 0; t <= len; t += step) {
    // Two courses of rough stones, side by side, then flatter coping stones along the top.
    for (const side of [-0.12, 0.12]) put(t + rng.range(-0.05, 0.05), side, 0.12, new THREE.Vector3(rng.range(0.17, 0.23), rng.range(0.13, 0.17), rng.range(0.15, 0.2)));
    put(t + step / 2, rng.range(-0.05, 0.05), 0.33, new THREE.Vector3(rng.range(0.16, 0.21), rng.range(0.11, 0.14), rng.range(0.15, 0.19)));
    put(t, 0, 0.47, new THREE.Vector3(rng.range(0.19, 0.24), 0.07, rng.range(0.2, 0.26)));
  }
  inst.count = k;
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}
