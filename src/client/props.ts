/**
 * Cute farm things: windmills (sails turn with the wind), a farmhouse with a smoking chimney,
 * a scarecrow, a well, beehives, a hay cart, and ducks paddling round the ponds.
 * Built from primitives in the same chunky style as everything else.
 */
import * as THREE from 'three';
import { at, mat, mesh } from './models';

/** A windmill. Its sails are a child named 'sails' that the scene spins with the wind. */
export function windmillMesh(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const tower = mesh(new THREE.CylinderGeometry(1.1, 1.7, 6, 8), '#f1e7d0');
  tower.position.y = 3;
  g.add(tower);
  for (const y of [1.5, 3.2, 4.8]) g.add(at(mesh(new THREE.CylinderGeometry(1.75 - y * 0.1, 1.78 - y * 0.1, 0.12, 8), '#c8a46e'), 0, y, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), '#7a4e2e'), 0, 0.65, 1.62));
  g.add(at(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), '#9fc4d8'), 0, 3.6, 1.32));
  const cap = mesh(new THREE.ConeGeometry(1.45, 1.6, 8), '#b4442f');
  cap.position.y = 6.8;
  g.add(cap);
  const hub = new THREE.Group();
  hub.name = 'sails';
  hub.position.set(0, 6.2, 1.35);
  hub.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8), '#5a4038'));
  hub.children[0].rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    arm.add(at(mesh(new THREE.BoxGeometry(0.12, 3.6, 0.08), '#6b4a30'), 0, 1.9, 0.15));
    const sail = mesh(new THREE.BoxGeometry(0.75, 2.8, 0.04), i % 2 ? '#f7f1e3' : '#efe4cc');
    sail.position.set(0.45, 2.1, 0.2);
    arm.add(sail);
    hub.add(arm);
  }
  g.add(hub);
  g.scale.setScalar(scale);
  return g;
}

/** A farmhouse with a smoking chimney (puffs named 'smoke'). */
export function farmhouseMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.BoxGeometry(5, 2.8, 3.6), '#f4ead2'), 0, 1.4, 0));
  const roof = mesh(new THREE.CylinderGeometry(0.01, 3.4, 1.8, 4, 1), '#5f6f86');
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.08, 1, 0.78);
  g.add(at(roof, 0, 3.7, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), '#9a5b45'), 1.5, 4.1, -0.4));
  g.add(at(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), '#6b4a30'), 0, 0.8, 1.82));
  for (const x of [-1.6, 1.6]) {
    g.add(at(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), '#9fc4d8'), x, 1.7, 1.82));
    g.add(at(mesh(new THREE.BoxGeometry(1, 0.15, 0.25), '#d65a7a'), x, 1.25, 1.9));
  }
  const smoke = new THREE.Group();
  smoke.name = 'smoke';
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7, flatShading: true }));
    puff.userData.ph = i / 4;
    smoke.add(puff);
  }
  smoke.position.set(1.5, 5, -0.4);
  g.add(smoke);
  return g;
}

export function scarecrowMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), '#6b4a30'), 0, 1.2, 0));
  g.add(at(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), '#6b4a30'), 0, 1.7, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.7, 0.9, 0.35), '#5a7fb0'), 0, 1.55, 0));
  g.add(at(mesh(new THREE.BoxGeometry(1.6, 0.25, 0.3), '#5a7fb0'), 0, 1.75, 0));
  g.add(at(mesh(new THREE.SphereGeometry(0.28, 8, 6), '#e8c98a'), 0, 2.35, 0));
  const hat = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10), '#a07a3a');
  g.add(at(hat, 0, 2.55, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 8), '#a07a3a'), 0, 2.7, 0));
  // Straw poking out of the sleeves.
  for (const s of [-1, 1]) g.add(at(mesh(new THREE.ConeGeometry(0.1, 0.3, 4), '#e2c060'), s * 0.95, 1.75, 0));
  return g;
}

export function wellMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.8, 10, 1, true), '#a39d90'), 0, 0.4, 0));
  g.add(at(mesh(new THREE.CircleGeometry(0.75, 10), '#2f4a5a'), 0, 0.6, 0));
  g.children[1].rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) g.add(at(mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), '#6b4a30'), s * 0.75, 1.1, 0));
  const roof = mesh(new THREE.CylinderGeometry(0.01, 1.1, 0.6, 4), '#b4442f');
  roof.rotation.y = Math.PI / 4;
  g.add(at(roof, 0, 2.0, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.25, 8), '#8a6a42'), 0, 1.25, 0));
  return g;
}

export function beehivesMesh(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[0, 0], [1.1, 0.2], [2.2, -0.1]]) {
    const hive = new THREE.Group();
    for (let i = 0; i < 3; i++) hive.add(at(mesh(new THREE.BoxGeometry(0.7, 0.32, 0.7), i % 2 ? '#f2c84b' : '#f5d46a'), 0, 0.2 + i * 0.34, 0));
    hive.add(at(mesh(new THREE.BoxGeometry(0.85, 0.08, 0.85), '#f7f1e3'), 0, 1.25, 0));
    hive.position.set(x, 0, z);
    g.add(hive);
  }
  return g;
}

export function cartMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.BoxGeometry(2.2, 0.5, 1.3), '#a47f50'), 0, 0.8, 0));
  g.add(at(mesh(new THREE.BoxGeometry(2, 0.7, 1.1), '#d9b55a'), 0, 1.3, 0));
  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.7, 0.7]) {
      const w = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10), '#6b4a30');
      w.rotation.x = Math.PI / 2;
      g.add(at(w, x, 0.4, z));
    }
  }
  g.add(at(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), '#6b4a30'), 1.7, 0.7, 0.3));
  g.add(at(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), '#6b4a30'), 1.7, 0.7, -0.3));
  return g;
}

/** A duck. Ducks paddle round ponds (the scene moves them). */
/** Spin sails, puff smoke. */
export function animateProps(root: THREE.Object3D, time: number, dt: number, wind: number): void {
  root.traverse((o) => {
    if (o.name === 'sails') o.rotation.z -= dt * (0.3 + wind * 2.2);
    if (o.name === 'smoke') {
      for (const p of o.children) {
        const t = (time * 0.25 + (p.userData.ph as number)) % 1;
        p.position.set(t * 1.2, t * 3, 0);
        p.scale.setScalar(0.5 + t * 1.6);
        ((p as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - t);
      }
    }
  });
}

export { mat };
