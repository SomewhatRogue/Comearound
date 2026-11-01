/**
 * Mud on a dog: brown socks up the legs and splotches on the body, growing with how muddy the room
 * says it is (0 clean, 1 caked). Wading through water washes it off; it dries off slowly too.
 */
import * as THREE from 'three';
import type { DogRig } from './models';
import { mat } from './models';

const MUD = '#5e4129';
const sockGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const blobGeo = new THREE.IcosahedronGeometry(1, 0);

export interface MudCoat { socks: THREE.Mesh[]; paws: THREE.Mesh[]; blobs: THREE.Mesh[]; shown: number }

export function mudCoat(rig: DogRig, chicken: boolean): MudCoat {
  const m = mat(MUD, { roughness: 1 });
  const socks = rig.legs.map((leg) => {
    const s = new THREE.Mesh(sockGeo, m);
    // Just outside the leg itself, whatever breed (its first mesh is the leg).
    const limb = leg.children.find((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
    const own = (limb?.geometry as THREE.CapsuleGeometry | undefined)?.parameters?.radius;
    const r = (own ?? (chicken ? 0.02 : 0.05)) + (chicken ? 0.01 : 0.014);
    s.scale.set(r, rig.leg * 0.5, r);
    s.userData.leg = rig.leg;
    leg.add(s);
    return s;
  });
  // Muddy paws, over the dog's own (light) paws. Chickens' feet are just toes: socks do.
  const paws = chicken ? [] : rig.legs.map((leg) => {
    const p = new THREE.Mesh(blobGeo, m);
    p.scale.set(0.078, 0.06, 0.085);
    p.position.set(0, -rig.leg + 0.02, 0.03);
    leg.add(p);
    return p;
  });
  // Splashed up the sides and underneath: a few on each half.
  const spots: [THREE.Group, number, number, number, number][] = [
    [rig.front, 0.14, -0.09, 0.08, 0.08],
    [rig.front, -0.13, -0.1, 0.02, 0.07],
    [rig.back, 0.13, -0.1, -0.08, 0.08],
    [rig.back, -0.14, -0.07, -0.16, 0.07],
    [rig.back, 0.02, -0.15, -0.04, 0.09],
  ];
  // A chicken is smaller and rounder: splashes lower down, and smaller.
  const k = chicken ? 0.55 : 1;
  const blobs = spots.map(([parent, x, y, z, r]) => {
    const b = new THREE.Mesh(blobGeo, m);
    b.position.set(x * (chicken ? 1.15 : 1), y * (chicken ? 1.2 : 1), z * k);
    b.userData.r = r * k;
    b.scale.setScalar(r);
    parent.add(b);
    return b;
  });
  return { socks, paws, blobs, shown: -1 };
}

/** Show `mud` (0..1): socks creep up from the paws, splotches grow in one by one. */
export function showMud(c: MudCoat, mud: number): void {
  const m = Math.round(mud * 20) / 20;
  if (m === c.shown) return;
  c.shown = m;
  for (const s of c.socks) {
    s.visible = m > 0.04;
    const leg = s.userData.leg as number;
    const h = leg * (0.15 + 0.55 * m);
    s.scale.y = h;
    s.position.y = -leg + h / 2;
  }
  for (const p of c.paws) p.visible = m > 0.04;
  c.blobs.forEach((b, i) => {
    const on = m > 0.15 + i * 0.15;
    b.visible = on;
    if (on) b.scale.setScalar((b.userData.r as number) * (0.9 + 0.7 * m));
  });
}
