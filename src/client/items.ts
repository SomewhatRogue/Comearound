/**
 * One recognisable model per item, built from primitives. Each one should read from the top-down
 * camera by silhouette and colour alone: stem and leaf on the apple, ribs on the pumpkin, a handle
 * on the teacup, a flame on the candle. Swap any of these for real art later without touching rules.
 */
import * as THREE from 'three';
import type { ItemDef } from '../shared/catalog';
import { mat } from './models';

const geo = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  openCyl: new THREE.CylinderGeometry(1, 0.75, 1, 16, 1, true),
  cone: new THREE.ConeGeometry(1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 18),
  half: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  bell: new THREE.LatheGeometry([0, 0.1, 0.32, 0.36, 0.34, 0.25, 0.16, 0.1, 0].map((r, i) => new THREE.Vector2(r, [0, 0, 0.02, 0.08, 0.18, 0.3, 0.4, 0.46, 0.48][i])), 16),
};

function part(g: THREE.BufferGeometry, color: string, s: [number, number, number], p: [number, number, number], r: [number, number, number] = [0, 0, 0], glow = false): THREE.Mesh {
  const m = new THREE.Mesh(g, glow ? mat(color, { emissive: color, emissiveIntensity: 1.6 }) : mat(color));
  m.scale.set(...s);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = !glow;
  return m;
}

type Builder = () => THREE.Mesh[];
const BUILD: Record<string, Builder> = {
  apple: () => [part(geo.sphere, '#d8433a', [0.24, 0.22, 0.24], [0, 0.22, 0]), part(geo.cyl, '#6b4423', [0.025, 0.12, 0.025], [0, 0.48, 0]), part(geo.cone, '#5aa646', [0.07, 0.16, 0.03], [0.08, 0.48, 0], [0, 0, -1.1])],
  pear: () => [part(geo.sphere, '#c4cf52', [0.22, 0.2, 0.22], [0, 0.2, 0]), part(geo.sphere, '#c4cf52', [0.14, 0.16, 0.14], [0, 0.4, 0]), part(geo.cyl, '#6b4423', [0.02, 0.1, 0.02], [0.02, 0.6, 0], [0, 0, -0.3])],
  pumpkin: () => [...[0, 1, 2, 3, 4, 5].map((i) => part(geo.sphere, '#e98a2b', [0.17, 0.22, 0.25], [Math.cos((i * Math.PI) / 3) * 0.1, 0.22, Math.sin((i * Math.PI) / 3) * 0.1], [0, (-i * Math.PI) / 3, 0])), part(geo.cyl, '#4f7a34', [0.04, 0.14, 0.04], [0, 0.48, 0], [0, 0, 0.2])],
  mushroom: () => [part(geo.cyl, '#f1e8d6', [0.08, 0.26, 0.08], [0, 0.13, 0]), part(geo.half, '#c8392f', [0.24, 0.2, 0.24], [0, 0.42, 0], [Math.PI, 0, 0]), ...[[0.1, 0.06], [-0.08, 0.1], [0.02, -0.12]].map(([x, z]) => part(geo.sphere, '#fff6e6', [0.035, 0.02, 0.035], [x, 0.5, z]))],
  fish: () => [part(geo.sphere, '#6fa8c9', [0.34, 0.14, 0.12], [0, 0.14, 0]), part(geo.cone, '#4f86a8', [0.12, 0.16, 0.03], [-0.38, 0.14, 0], [0, 0, Math.PI / 2]), part(geo.sphere, '#1d1d1d', [0.025, 0.025, 0.025], [0.24, 0.18, 0.1])],
  candle: () => [part(geo.cyl, '#f4e3b5', [0.07, 0.42, 0.07], [0, 0.21, 0]), part(geo.cyl, '#b9a57a', [0.12, 0.03, 0.12], [0, 0.015, 0]), part(geo.cone, '#ffcf4a', [0.045, 0.12, 0.045], [0, 0.5, 0], [0, 0, 0], true)],
  lantern: () => [part(geo.box, '#3b3a3f', [0.26, 0.04, 0.26], [0, 0.02, 0]), part(geo.box, '#ffd36b', [0.18, 0.26, 0.18], [0, 0.18, 0], [0, 0, 0], true), part(geo.box, '#3b3a3f', [0.26, 0.04, 0.26], [0, 0.33, 0]), part(geo.torus, '#3b3a3f', [0.08, 0.08, 0.08], [0, 0.42, 0])],
  bell: () => [part(geo.bell, '#d9b44a', [1, 1, 1], [0, 0, 0]), part(geo.sphere, '#8f7426', [0.06, 0.06, 0.06], [0, 0.02, 0]), part(geo.torus, '#8f7426', [0.06, 0.06, 0.06], [0, 0.52, 0], [0, Math.PI / 2, 0])],
  teacup: () => [part(geo.cyl, '#f6f3ee', [0.24, 0.02, 0.24], [0, 0.01, 0]), part(geo.openCyl, '#f6f3ee', [0.15, 0.16, 0.15], [0, 0.11, 0]), part(geo.cyl, '#a0603a', [0.13, 0.01, 0.13], [0, 0.17, 0]), part(geo.torus, '#f6f3ee', [0.06, 0.06, 0.06], [0.17, 0.11, 0])],
  bowl: () => [part(geo.half, '#9a6b47', [0.24, 0.15, 0.24], [0, 0.16, 0]), part(geo.cyl, '#d9b98a', [0.21, 0.01, 0.21], [0, 0.15, 0])],
  pietin: () => [part(geo.cyl, '#c1c7cd', [0.27, 0.06, 0.27], [0, 0.03, 0]), part(geo.torus, '#aeb4ba', [0.27, 0.27, 0.27], [0, 0.06, 0], [Math.PI / 2, 0, 0])],
  bucket: () => [part(geo.openCyl, '#8a97a3', [0.2, 0.32, 0.2], [0, 0.16, 0]), part(geo.cyl, '#6d7a86', [0.15, 0.02, 0.15], [0, 0.01, 0]), part(geo.torus, '#55606a', [0.2, 0.2, 0.12], [0, 0.32, 0], [0, 0, 0])],
  boot: () => [part(geo.box, '#5b3d2b', [0.16, 0.34, 0.18], [-0.06, 0.17, 0]), part(geo.box, '#5b3d2b', [0.32, 0.12, 0.18], [0.06, 0.06, 0]), part(geo.box, '#2e1f16', [0.34, 0.03, 0.2], [0.06, 0.015, 0])],
  hat: () => [part(geo.cyl, '#e2c36b', [0.32, 0.03, 0.32], [0, 0.02, 0]), part(geo.cone, '#e2c36b', [0.17, 0.26, 0.17], [0, 0.16, 0]), part(geo.cyl, '#c0392b', [0.15, 0.04, 0.15], [0, 0.07, 0])],
  ribbon: () => [part(geo.cone, '#e86aa6', [0.12, 0.2, 0.05], [-0.11, 0.1, 0], [0, 0, Math.PI / 2]), part(geo.cone, '#e86aa6', [0.12, 0.2, 0.05], [0.11, 0.1, 0], [0, 0, -Math.PI / 2]), part(geo.sphere, '#d14d8c', [0.06, 0.06, 0.06], [0, 0.1, 0]), part(geo.box, '#e86aa6', [0.05, 0.18, 0.02], [-0.04, 0.02, 0.02], [0, 0, 0.3]), part(geo.box, '#e86aa6', [0.05, 0.18, 0.02], [0.04, 0.02, 0.02], [0, 0, -0.3])],
  flower: () => [part(geo.cyl, '#4f8a3a', [0.02, 0.36, 0.02], [0, 0.18, 0]), ...[0, 1, 2, 3, 4].map((i) => part(geo.sphere, '#fff1f6', [0.08, 0.03, 0.08], [Math.cos((i * 2 * Math.PI) / 5) * 0.09, 0.38, Math.sin((i * 2 * Math.PI) / 5) * 0.09])), part(geo.sphere, '#f5c53d', [0.06, 0.04, 0.06], [0, 0.4, 0])],
  hay: () => [part(geo.box, '#e2c26a', [0.4, 0.26, 0.28], [0, 0.13, 0]), part(geo.box, '#9b7a33', [0.03, 0.27, 0.29], [-0.1, 0.13, 0]), part(geo.box, '#9b7a33', [0.03, 0.27, 0.29], [0.1, 0.13, 0])],
  stick: () => [part(geo.cyl, '#8b5a2b', [0.035, 0.8, 0.035], [0, 0.05, 0], [Math.PI / 2, 0, 0.3]), part(geo.cyl, '#8b5a2b', [0.02, 0.22, 0.02], [0.06, 0.1, 0.12], [0.6, 0, -0.8])],
};

export function itemModel(def: ItemDef): THREE.Object3D {
  const g = new THREE.Group();
  for (const m of (BUILD[def.id] ?? BUILD.stick)()) g.add(m);
  g.scale.setScalar(1.25);
  return g;
}
