/**
 * Placeholder models built from primitives until the KayKit art pass. Chunky, readable from above.
 */
import * as THREE from 'three';
import type { ItemDef } from '../shared/catalog';

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(extra);
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra })));
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: string, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function at(m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  m.position.set(x, y, z);
  return m;
}

export function itemMesh(def: ItemDef): THREE.Object3D {
  const g = new THREE.Group();
  let m: THREE.Mesh;
  switch (def.shape) {
    case 'ball': m = mesh(new THREE.IcosahedronGeometry(0.24, 1), def.color); m.position.y = 0.24; break;
    case 'tall': m = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 8), def.color); m.position.y = 0.25; break;
    case 'cup': m = mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.22, 10, 1, true), def.color); m.position.y = 0.11; (m.material as THREE.Material).side = THREE.DoubleSide; break;
    case 'box': m = mesh(new THREE.BoxGeometry(0.34, 0.3, 0.26), def.color); m.position.y = 0.15; break;
    case 'flat': m = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 12), def.color); m.position.y = 0.04; break;
    default: m = mesh(new THREE.ConeGeometry(0.2, 0.38, 8), def.color); m.position.y = 0.19;
  }
  g.add(m);
  return g;
}

export function hatMesh(hat: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (hat) {
    case 'cowboy':
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), '#8b5a2b'));
      g.add(at(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.24, 10), '#8b5a2b'), 0, 0.13, 0));
      break;
    case 'top':
      g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14), '#222'));
      g.add(at(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 12), '#222'), 0, 0.22, 0));
      break;
    case 'crown':
      g.add(at(mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 8, 1, true), '#f2c14e'), 0, 0.06, 0));
      for (let i = 0; i < 5; i++) {
        const c = mesh(new THREE.ConeGeometry(0.06, 0.14, 4), '#f2c14e');
        const a = (i / 5) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2);
        g.add(c);
      }
      break;
    case 'beanie':
      g.add(mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#c0392b'));
      g.add(at(mesh(new THREE.SphereGeometry(0.08, 8, 6), '#f4f1de'), 0, 0.32, 0));
      break;
    case 'flower':
      g.add(at(mesh(new THREE.ConeGeometry(0.14, 0.12, 6), '#f5d23d'), 0.18, 0.08, 0.05));
      break;
    case 'propeller': {
      g.add(mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#29a19c'));
      const blades = mesh(new THREE.BoxGeometry(0.7, 0.02, 0.08), '#f3a712');
      blades.position.y = 0.36;
      blades.name = 'spin';
      g.add(blades);
      break;
    }
    default:
      return null;
  }
  return g;
}

/** A villager: round body in the player's colour, a head, eyes that show facing, and a hat. */
export function playerMesh(color: string, hat: string): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.36, 0.42, 4, 10), color);
  torso.position.y = 0.6;
  body.add(torso);
  const head = mesh(new THREE.IcosahedronGeometry(0.32, 1), '#f1c9a5');
  head.position.y = 1.32;
  body.add(head);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 6, 4), '#1d1d1d', false);
    eye.position.set(s * 0.12, 1.36, 0.28);
    body.add(eye);
  }
  const h = hatMesh(hat);
  if (h) {
    h.position.y = 1.56;
    body.add(h);
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  root.add(blob);
  return root;
}

export function goatMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.6, 0.5, 1.0), '#f4f1ea');
  body.position.y = 0.7;
  g.add(body);
  const head = mesh(new THREE.BoxGeometry(0.4, 0.42, 0.45), '#f4f1ea');
  head.position.set(0, 1.08, 0.6);
  head.name = 'head';
  g.add(head);
  for (const s of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.06, 0.28, 6), '#9a8a6a');
    horn.position.set(s * 0.12, 1.4, 0.55);
    horn.rotation.x = -0.4;
    g.add(horn);
    const eye = mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), '#2b1d0e', false);
    eye.position.set(s * 0.11, 1.12, 0.83);
    g.add(eye);
    for (const z of [-0.35, 0.35]) {
      const leg = mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), '#e0d8c8');
      leg.position.set(s * 0.2, 0.22, z);
      g.add(leg);
    }
  }
  return g;
}

/** A crow target for the Pen snowball fight: a post with a crow that tips over when hit. */
export function crowMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6), '#8b6a45'), 0, 0.45, 0));
  const bird = new THREE.Group();
  bird.name = 'bird';
  bird.position.y = 0.9;
  bird.add(at(mesh(new THREE.SphereGeometry(0.2, 8, 6), '#222228'), 0, 0.18, 0));
  bird.add(at(mesh(new THREE.SphereGeometry(0.13, 8, 6), '#222228'), 0, 0.42, -0.06));
  const beak = at(mesh(new THREE.ConeGeometry(0.05, 0.16, 5), '#e0a92e'), 0, 0.42, -0.22);
  beak.rotation.x = -Math.PI / 2;
  bird.add(beak);
  for (const s of [-1, 1]) bird.add(at(mesh(new THREE.SphereGeometry(0.03, 5, 4), '#f5f5f5', false), s * 0.06, 0.47, -0.17));
  g.add(bird);
  return g;
}
