/**
 * Set dressing: turns each area from a coloured circle into a place you'd recognise.
 * Pond (water, bank, lily pads, cattails, thistle, rocks), cottage kitchen (plank floor, walls,
 * stove, counter, rug), garden (tilled rows, cabbages, sunflowers, picket fence), chapel (stone
 * floor, chapel with bell tower, far too many candles, a well), paths, trees and bushes.
 * Purely visual: nothing here changes where you can walk. Repeated pieces are instanced.
 */
import * as THREE from 'three';
import { AREAS, PEN, SQUARE, STATIONS, WORLD } from '../shared/map';
import { mat } from './models';

type V3 = [number, number, number];
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 8),
  sphere: new THREE.IcosahedronGeometry(1, 1),
  disc: new THREE.CircleGeometry(1, 32),
  plane: new THREE.PlaneGeometry(1, 1),
};

function put(scene: THREE.Object3D, g: THREE.BufferGeometry, color: string, s: V3, p: V3, ry = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Mesh {
  const m = new THREE.Mesh(g, mat(color, extra));
  m.scale.set(...s);
  m.position.set(...p);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}

function flat(scene: THREE.Object3D, g: THREE.BufferGeometry, color: string, s: V3, p: V3, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Mesh {
  const m = new THREE.Mesh(g, mat(color, extra));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(...s);
  m.position.set(...p);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

/** Many copies of one shape, one draw call. Each entry: scale, position, y-rotation. */
function many(scene: THREE.Object3D, g: THREE.BufferGeometry, color: string, list: [V3, V3, number?][], extra: Partial<THREE.MeshStandardMaterialParameters> = {}, shadow = true): void {
  const im = new THREE.InstancedMesh(g, mat(color, extra), list.length);
  const o = new THREE.Object3D();
  list.forEach(([s, p, ry = 0], i) => {
    o.scale.set(...s);
    o.position.set(...p);
    o.rotation.set(0, ry, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.castShadow = shadow;
  im.receiveShadow = true;
  scene.add(im);
}

/** Deterministic scatter so the village looks the same for everyone. */
function scatter(seed: number, n: number, fn: (r: () => number, i: number) => [V3, V3, number?] | null): [V3, V3, number?][] {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: [V3, V3, number?][] = [];
  for (let i = 0; i < n; i++) {
    const v = fn(r, i);
    if (v) out.push(v);
  }
  return out;
}

const area = (id: string) => AREAS.find((a) => a.id === id)!;
const nearStation = (x: number, z: number, pad: number) => STATIONS.some((s) => Math.hypot(s.x - x, s.z - z) < pad);

function pond(scene: THREE.Object3D): void {
  const { x, z } = area('pond');
  flat(scene, G.disc, '#7fa35a', [6.2, 6.2, 1], [x, 0.008, z]);
  flat(scene, G.disc, '#d8c79a', [2.7, 2.7, 1], [x, 0.012, z]);
  flat(scene, G.disc, '#3f7f96', [2.2, 2.2, 1], [x, 0.02, z], { roughness: 0.15, metalness: 0.1, flatShading: false });
  flat(scene, G.disc, '#5aa0b5', [1.5, 1.5, 1], [x + 0.2, 0.024, z - 0.2], { roughness: 0.1, transparent: true, opacity: 0.5 });
  many(scene, G.cyl, '#4f9a45', scatter(11, 6, (r) => { const a = r() * 6.28, d = r() * 1.5; return [[0.32, 0.02, 0.32], [x + Math.cos(a) * d, 0.035, z + Math.sin(a) * d], r() * 6]; }), {}, false);
  many(scene, G.sphere, '#f4b6cf', [[[0.09, 0.06, 0.09], [x + 0.6, 0.07, z - 0.4]], [[0.08, 0.05, 0.08], [x - 0.9, 0.07, z + 0.5]]], {}, false);
  // Cattails in the gaps between tables: tall stems, brown heads.
  const tails = scatter(12, 70, (r) => {
    const a = (Math.floor(r() * 3) * 2 + 1) * (Math.PI / 3) + Math.PI / 2 + (r() - 0.5) * 0.7;
    const d = 2.1 + r() * 0.8;
    return [[1, 0.7 + r() * 0.5, 1], [x + Math.cos(a) * d, 0, z + Math.sin(a) * d], r()];
  });
  many(scene, G.cyl, '#5d8a3a', tails.map(([s, p]) => [[0.025, 1.1 * s[1], 0.025], [p[0], 0.55 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.cyl, '#6b4429', tails.map(([s, p]) => [[0.055, 0.28, 0.055], [p[0], 1.05 * s[1], p[2]]] as [V3, V3]));
  // Thistle: spiky purple heads on grey-green stalks, on the far bank.
  const thistle = scatter(13, 22, (r) => { const a = r() * 6.28, d = 4 + r() * 2; const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; return nearStation(px, pz, 1.4) ? null : [[1, 0.6 + r() * 0.4, 1], [px, 0, pz]]; });
  many(scene, G.cyl, '#7d9a7a', thistle.map(([s, p]) => [[0.03, 0.6 * s[1], 0.03], [p[0], 0.3 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.sphere, '#9b5fb5', thistle.map(([s, p]) => [[0.11, 0.13, 0.11], [p[0], 0.62 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.cone, '#6f8a5a', thistle.map(([s, p]) => [[0.12, 0.1, 0.12], [p[0], 0.52 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.sphere, '#8f8a84', scatter(14, 9, (r) => { const a = r() * 6.28, d = 2.2 + r() * 0.6; return [[0.18 + r() * 0.2, 0.12 + r() * 0.1, 0.2 + r() * 0.2], [x + Math.cos(a) * d, 0.06, z + Math.sin(a) * d], r() * 6]; }));
  // A little dock.
  put(scene, G.box, '#9a7552', [1.4, 0.08, 0.7], [x - 1.6, 0.1, z + 0.6], 0.4);
}

function kitchen(scene: THREE.Object3D): void {
  const { x, z } = area('kitchen');
  many(scene, G.box, '#b88a5c', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [[1, 0.04, 10], [x - 4.5 + i, 0.02, z]] as [V3, V3]), {}, false);
  many(scene, G.box, '#a77b4f', [0, 1, 2, 3, 4].map((i) => [[0.04, 0.045, 10], [x - 4 + i * 2, 0.025, z]] as [V3, V3]), {}, false);
  flat(scene, G.disc, '#b5533c', [2.2, 1.5, 1], [x, 0.05, z + 0.4]);
  flat(scene, G.disc, '#d9a441', [1.6, 1.0, 1], [x, 0.055, z + 0.4]);
  // Two walls (back and left) with a window, so it reads as a cottage interior from above.
  put(scene, G.box, '#efe2c8', [10, 1.6, 0.3], [x, 0.8, z - 5]);
  put(scene, G.box, '#efe2c8', [0.3, 1.6, 10], [x - 5, 0.8, z]);
  put(scene, G.box, '#8fc4dd', [1.6, 0.7, 0.32], [x + 2, 1.0, z - 5], 0, { emissive: '#8fc4dd', emissiveIntensity: 0.3 });
  put(scene, G.box, '#7a5233', [10.2, 0.16, 0.4], [x, 1.66, z - 5]);
  put(scene, G.box, '#7a5233', [0.4, 0.16, 10.2], [x - 5, 1.66, z]);
  // Stove with a glowing door and a chimney; a counter along the back wall.
  put(scene, G.box, '#3c3b40', [1.2, 0.9, 0.9], [x - 4, 0.45, z - 4.2]);
  put(scene, G.box, '#ff8a3d', [0.6, 0.3, 0.05], [x - 4, 0.35, z - 3.72], 0, { emissive: '#ff6a1a', emissiveIntensity: 1.2 });
  put(scene, G.cyl, '#3c3b40', [0.2, 1.4, 0.2], [x - 4.2, 1.6, z - 4.4]);
  put(scene, G.box, '#9a7552', [4, 0.8, 0.8], [x + 1.5, 0.4, z - 4.3]);
  put(scene, G.box, '#c9b48e', [4.1, 0.08, 0.9], [x + 1.5, 0.84, z - 4.3]);
  many(scene, G.cyl, '#b0723f', [[[0.18, 0.2, 0.18], [x + 0.6, 0.98, z - 4.3]], [[0.14, 0.3, 0.14], [x + 2.6, 1.03, z - 4.3]]]);
}

function garden(scene: THREE.Object3D): void {
  const { x, z } = area('garden');
  flat(scene, G.disc, '#86ad5c', [6.4, 6.4, 1], [x, 0.008, z]);
  const rows: [number, number][] = [[4.6, -1.5], [5.6, -1.5], [4.6, 2.2], [5.6, 2.2], [-4.6, 2.2], [-5.6, 2.2]];
  many(scene, G.box, '#5a3d27', rows.map(([dx, dz]) => [[0.7, 0.08, 3], [x + dx, 0.04, z + dz]] as [V3, V3]), {}, false);
  const plants = rows.flatMap(([dx, dz]) => [-1, 0, 1].map((k) => [x + dx, z + dz + k] as [number, number]));
  many(scene, G.sphere, '#7fbf4f', plants.filter((_, i) => i % 2 === 0).map(([px, pz]) => [[0.24, 0.18, 0.24], [px, 0.18, pz]] as [V3, V3]));
  many(scene, G.cone, '#5f9a3a', plants.filter((_, i) => i % 2 === 1).map(([px, pz]) => [[0.12, 0.3, 0.12], [px, 0.2, pz]] as [V3, V3]));
  // Sunflowers along the back.
  const sun = [-3, -1.6, 1.6, 3].map((dx) => [x + dx, z - 5.4] as [number, number]);
  many(scene, G.cyl, '#5d8a3a', sun.map(([px, pz]) => [[0.05, 1.6, 0.05], [px, 0.8, pz]] as [V3, V3]));
  many(scene, G.cyl, '#f5c53d', sun.map(([px, pz]) => [[0.32, 0.06, 0.32], [px, 1.65, pz + 0.05]] as [V3, V3]), {}, true);
  many(scene, G.cyl, '#6b4429', sun.map(([px, pz]) => [[0.16, 0.08, 0.16], [px, 1.66, pz + 0.06]] as [V3, V3]));
  // Picket fence on the east and north edges.
  const pickets: [V3, V3, number?][] = [];
  for (let t = -5.5; t <= 5.5; t += 0.5) {
    pickets.push([[0.1, 0.6, 0.06], [x + 6.6, 0.3, z + t]]);
    if (Math.abs(t) > 0.8) pickets.push([[0.06, 0.6, 0.1], [x + t, 0.3, z - 6.4]]);
  }
  many(scene, G.box, '#f2ece0', pickets);
  put(scene, G.box, '#f2ece0', [0.05, 0.08, 11.4], [x + 6.6, 0.42, z]);
}

function chapel(scene: THREE.Object3D): void {
  const { x, z } = area('chapel');
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6.2, 8), mat('#9a96a6'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, 0.01, z);
  floor.receiveShadow = true;
  scene.add(floor);
  flat(scene, G.disc, '#8a8698', [4.2, 4.2, 1], [x, 0.014, z]);
  // The chapel itself, at the back (west edge), with a bell tower.
  const cx = x - 4.6;
  put(scene, G.box, '#d8d2c4', [2.4, 2.2, 3.4], [cx, 1.1, z - 0.2]);
  const roof = put(scene, G.cone, '#7a4a5a', [2.2, 1.4, 2.6], [cx, 2.9, z - 0.2], Math.PI / 4);
  roof.scale.set(2.0, 1.3, 2.4);
  put(scene, G.box, '#d8d2c4', [1, 2.2, 1], [cx, 3.4, z - 1.6]);
  put(scene, G.cone, '#7a4a5a', [0.8, 1, 0.8], [cx, 5, z - 1.6], Math.PI / 4);
  put(scene, G.cone, '#d9b44a', [0.25, 0.35, 0.25], [cx, 3.6, z - 1.6]);
  put(scene, G.box, '#5b3d2b', [0.1, 1.1, 0.8], [cx + 1.21, 0.55, z - 0.2]);
  put(scene, G.box, '#ffd36b', [0.1, 0.6, 0.4], [cx + 1.21, 1.5, z + 1], 0, { emissive: '#ffb84a', emissiveIntensity: 1 });
  // Far too many candles.
  const candles = scatter(21, 90, (r) => { const a = r() * 6.28, d = 1.2 + r() * 4.6; const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; return nearStation(px, pz, 1.1) || px < x - 3.3 ? null : [[1, 0.6 + r() * 0.8, 1], [px, 0, pz]]; });
  many(scene, G.cyl, '#f4e3b5', candles.map(([s, p]) => [[0.05, 0.3 * s[1], 0.05], [p[0], 0.15 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.cone, '#ffcf4a', candles.map(([s, p]) => [[0.035, 0.09, 0.035], [p[0], 0.3 * s[1] + 0.05, p[2]]] as [V3, V3]), { emissive: '#ffb02e', emissiveIntensity: 2 }, false);
  // The well (it is getting married).
  const wx = x + 3.6;
  const wz = z + 4.4;
  put(scene, G.cyl, '#8f8a84', [0.8, 0.7, 0.8], [wx, 0.35, wz]);
  put(scene, G.cyl, '#2d4a5a', [0.62, 0.02, 0.62], [wx, 0.71, wz]);
  for (const s of [-1, 1]) put(scene, G.box, '#6b4429', [0.1, 1.4, 0.1], [wx + s * 0.7, 1.1, wz]);
  put(scene, G.cone, '#7a4a5a', [1.1, 0.6, 0.7], [wx, 2.0, wz], Math.PI / 4);
}

function surroundings(scene: THREE.Object3D): void {
  // Dirt paths from the square to each area.
  for (const a of AREAS) {
    const dx = a.x - SQUARE.x;
    const dz = a.z - SQUARE.z;
    const len = Math.hypot(dx, dz) - 6;
    const path = flat(scene, G.plane, '#b39b72', [1.6, len, 1], [SQUARE.x + dx * 0.45, 0.006, SQUARE.z + dz * 0.45]);
    path.rotation.z = Math.atan2(dx, dz);
  }
  flat(scene, G.disc, '#b8a37c', [SQUARE.r + 2.4, SQUARE.r + 3.2, 1], [0, 0.007, 0]);
  // Trees and bushes around the edge of the village (deterministic).
  const edge = scatter(31, 70, (r) => {
    const side = Math.floor(r() * 4);
    const t = r() * 2 - 1;
    const out = 1.5 + r() * 6;
    const px = side < 2 ? t * (WORLD.w / 2 + 4) : (side === 2 ? -1 : 1) * (WORLD.w / 2 + out);
    const pz = side < 2 ? (side === 0 ? -1 : 1) * (WORLD.d / 2 + out) : t * (WORLD.d / 2 + 4);
    return [[1, 0.8 + r() * 0.6, 1], [px, 0, pz], r() * 6];
  });
  many(scene, G.cyl, '#6b4429', edge.map(([s, p]) => [[0.18, 1.2 * s[1], 0.18], [p[0], 0.6 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.cone, '#3f6b3a', edge.filter((_, i) => i % 2 === 0).map(([s, p]) => [[1.1, 2.4 * s[1], 1.1], [p[0], 2.2 * s[1], p[2]]] as [V3, V3]));
  many(scene, G.sphere, '#5f8a3e', edge.filter((_, i) => i % 2 === 1).map(([s, p]) => [[1.2, 1.1 * s[1], 1.2], [p[0], 1.8 * s[1], p[2]]] as [V3, V3]));
  const bushes = scatter(41, 26, (r) => {
    const px = (r() * 2 - 1) * (WORLD.w / 2 - 1);
    const pz = (r() * 2 - 1) * (WORLD.d / 2 - 1);
    const clear = AREAS.every((a) => Math.hypot(a.x - px, a.z - pz) > 7.2) && Math.hypot(px, pz - 1) > 7 && Math.hypot(px - PEN.x, pz - PEN.z) > 5;
    return clear ? [[0.5 + r() * 0.4, 0.4 + r() * 0.3, 0.5 + r() * 0.4], [px, 0.25, pz], r() * 6] : null;
  });
  many(scene, G.sphere, '#5a8a3c', bushes);
}

export function buildVillage(scene: THREE.Object3D): void {
  pond(scene);
  kitchen(scene);
  garden(scene);
  chapel(scene);
  surroundings(scene);
}
