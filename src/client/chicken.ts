/**
 * The chicken. Built to the same rig as the dogs (a front half with the head, a back half with the
 * tail, legs, a hip height), so every posture, the jump and the lobby antics work on it too: a round
 * feathered body, a comb and wattle, a little beak, wings that flap when it runs, jumps or bawks,
 * a fan of tail feathers, two yellow legs with three toes each, and a ribbon in its collar colour.
 */
import * as THREE from 'three';
import { COATS, EYES } from '../shared/looks';
import type { Look } from '../shared/protocol';
import { at, blobShadow, group, mesh, type DogRig } from './models';

export function chickenMesh(look: Look): DogRig {
  const coat = COATS.find((c) => c.id === look.coat) ?? COATS.find((c) => c.id === 'hen-red')!;
  const eye = EYES.find((e) => e.id === look.eyes) ?? EYES[0];
  const [main, wingC, combC] = [coat.main, coat.accent, coat.mask];
  const plump = 1 + 0.15 * Math.max(-2, Math.min(2, look.build ?? 0));
  const legLen = 0.2;
  const hip = legLen + 0.12;

  const root = group('dog');
  const rig = group('rig');
  root.add(rig);

  // Back half: the rear of the body and the tail feathers.
  const back = group('back');
  const rear = mesh(new THREE.SphereGeometry(0.2, 10, 8), main);
  rear.scale.set(plump, 0.95 * plump, 1.1);
  back.add(at(rear, 0, 0.02, -0.06));
  const tail = group('tail');
  tail.position.set(0, 0.12, -0.2);
  tail.rotation.order = 'YXZ';
  for (const [x, tilt] of [[-0.05, 0.25], [0, 0], [0.05, -0.25]] as const) {
    const feather = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.03), wingC);
    feather.position.set(x, 0.08, -0.02);
    feather.rotation.set(-0.5, 0, tilt);
    tail.add(feather);
  }
  back.add(tail);

  // Front half: the breast, the head with its comb, wattle and beak, and the ribbon.
  const front = group('front');
  const breast = mesh(new THREE.SphereGeometry(0.17, 10, 8), main);
  breast.scale.set(plump, plump, 1);
  front.add(at(breast, 0, -0.01, 0.09));
  const head = group('head');
  head.position.set(0, 0.22, 0.16);
  head.add(mesh(new THREE.SphereGeometry(0.085, 10, 8), main));
  for (const [z, y, r] of [[0.03, 0.08, 0.03], [-0.005, 0.095, 0.034], [-0.04, 0.08, 0.028]] as const) head.add(at(mesh(new THREE.SphereGeometry(r, 6, 5), combC), 0, y, z));
  const beak = mesh(new THREE.ConeGeometry(0.028, 0.075, 5), '#f0b23a');
  beak.rotation.x = Math.PI / 2;
  head.add(at(beak, 0, -0.005, 0.1));
  head.add(at(mesh(new THREE.SphereGeometry(0.022, 6, 5), combC), 0, -0.06, 0.06));
  for (const side of [-1, 1]) head.add(at(mesh(new THREE.SphereGeometry(0.016, 6, 5), eye.color), side * 0.07, 0.02, 0.04));
  front.add(head);
  const ribbon = mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.035, 12, 1, true), look.collar);
  (ribbon.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  ribbon.position.set(0, 0.14, 0.15);
  ribbon.rotation.x = 0.35;
  front.add(ribbon);

  // Wings, hinged at the shoulder, folded along the body until they flap.
  const wings = [-1, 1].map((side) => {
    const w = group('wing');
    w.position.set(side * 0.17 * plump, 0.06, 0.02);
    const blade = mesh(new THREE.SphereGeometry(0.15, 8, 6), wingC);
    blade.scale.set(0.22, 0.55, 1);
    blade.position.set(side * 0.02, -0.04, -0.05);
    w.add(blade);
    front.add(w);
    return w;
  });

  // Two yellow legs with three toes each.
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = group('leg');
    leg.position.set(side * 0.07, -0.12, 0.02);
    leg.add(at(mesh(new THREE.CylinderGeometry(0.016, 0.02, legLen, 5), '#e8b13c'), 0, -legLen / 2, 0));
    for (const a of [-0.5, 0, 0.5]) {
      const toe = mesh(new THREE.BoxGeometry(0.018, 0.012, 0.07), '#e8b13c');
      toe.position.set(Math.sin(a) * 0.03, -legLen + 0.006, Math.cos(a) * 0.03);
      toe.rotation.y = a;
      leg.add(toe);
    }
    back.add(leg);
    legs.push(leg);
  }

  rig.add(back, front);
  rig.position.y = hip;
  root.add(blobShadow(0.24 * plump));
  return { root, rig, front, back, head, tail, legs, ears: [], hip, leg: legLen, wings };
}
