/**
 * Models built from primitives: chunky, readable from above, our own style (no asset packs).
 * Dogs are rigged as a front half and a back half joined at the middle, so the spine can curve:
 * low and stretched when sprinting, crouched with the head down when giving sheep the eye,
 * flat out when lying down. Breeds change proportions, ears, tail and fluff; coats change colours.
 */
import * as THREE from 'three';
import { COATS, EYES, type Breed } from '../shared/looks';
import type { Look } from '../shared/protocol';

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(extra);
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra })));
  return m;
}

export function mesh(geo: THREE.BufferGeometry, color: string | THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function group(name: string, ...kids: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (kids.length) g.add(...kids);
  return g;
}

/** A capsule lying along z (dogs and sheep run along +z). */
function along(r: number, len: number, color: string): THREE.Mesh {
  const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), color);
  m.rotation.x = Math.PI / 2;
  return m;
}

export function blobShadow(r: number): THREE.Mesh {
  const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  return blob;
}

interface BreedShape {
  scale: number;
  leg: number;
  body: number;
  girth: number;
  snout: number;
  ears: 'tip' | 'prick' | 'drop' | 'bat' | 'giant';
  tail: 'plume' | 'curl' | 'pom' | 'stub' | 'straight' | 'feather';
  fluff?: 'ruff' | 'poodle';
  flatFace?: boolean;
  /** Head size relative to the usual (the chihuahua's apple head). */
  head?: number;
  /** Big round eyes (the chihuahua). */
  bigEyes?: boolean;
}

const SHAPES: Record<Breed, BreedShape> = {
  collie: { scale: 1, leg: 0.36, body: 0.5, girth: 0.17, snout: 0.16, ears: 'tip', tail: 'plume' },
  keeshond: { scale: 0.95, leg: 0.3, body: 0.42, girth: 0.2, snout: 0.11, ears: 'prick', tail: 'curl', fluff: 'ruff' },
  malinois: { scale: 1.06, leg: 0.42, body: 0.52, girth: 0.16, snout: 0.19, ears: 'prick', tail: 'straight' },
  poodle: { scale: 1.08, leg: 0.48, body: 0.44, girth: 0.16, snout: 0.18, ears: 'drop', tail: 'pom', fluff: 'poodle' },
  golden: { scale: 1.06, leg: 0.38, body: 0.54, girth: 0.19, snout: 0.17, ears: 'drop', tail: 'feather' },
  corgi: { scale: 0.85, leg: 0.17, body: 0.56, girth: 0.19, snout: 0.15, ears: 'bat', tail: 'stub' },
  husky: { scale: 1.04, leg: 0.4, body: 0.5, girth: 0.18, snout: 0.17, ears: 'prick', tail: 'curl' },
  pug: { scale: 0.72, leg: 0.24, body: 0.36, girth: 0.21, snout: 0.05, ears: 'drop', tail: 'curl', flatFace: true },
  // Tiny, spindly legs, a big apple head, huge ears and big round eyes.
  chihuahua: { scale: 0.58, leg: 0.27, body: 0.32, girth: 0.13, snout: 0.06, ears: 'giant', tail: 'curl', head: 1.3, bigEyes: true },
};

/** How big a breed is (1 = a collie), for framing the dressing-room camera. */
export function breedScale(breed: string): number {
  return (SHAPES as Record<string, BreedShape>)[breed]?.scale ?? 1;
}

export interface DogRig {
  root: THREE.Group;
  /** Moves up and down with posture and gait. */
  rig: THREE.Group;
  front: THREE.Group;
  back: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  legs: THREE.Group[];
  ears: THREE.Object3D[];
  hip: number;
  leg: number;
}

/**
 * A dog. Facing +z. The front half pivots at the middle of the back (rotation.x > 0 drops the
 * head), the head pivots at the neck, each leg at its shoulder or hip.
 */
export function dogMesh(look: Look): DogRig {
  // Build, lean to chonk: a rounder (or slighter) body on a little shorter (or longer) legs.
  const b = Math.max(-2, Math.min(2, look.build ?? 0));
  const base = SHAPES[look.breed] ?? SHAPES.collie;
  const s: BreedShape = { ...base, girth: base.girth * (1 + 0.15 * b), leg: base.leg * (1 - 0.05 * b), body: base.body * (1 + 0.03 * b) };
  const legThick = 1 + 0.2 * b;
  const coat = COATS.find((c) => c.id === look.coat) ?? COATS[0];
  const eye = EYES.find((e) => e.id === look.eyes) ?? EYES[0];
  const [main, accent, maskC] = [coat.main, coat.accent, coat.mask];
  const hip = s.leg + s.girth * 0.7;
  const half = s.body / 2;

  const root = group('dog');
  const rig = group('rig');
  root.add(rig);
  rig.position.y = hip;

  // Back half: rear torso, hind legs, tail.
  const back = group('back');
  back.add(at(along(s.girth, half * 0.9, main), 0, 0, -half * 0.45));
  const tail = group('tail');
  // The tail roots on the rump's surface, and wags about that root: lift first, then swing side to side.
  tail.position.set(0, s.girth * 0.55, -half * 0.9 - s.girth * 0.72);
  tail.rotation.order = 'YXZ';
  addTail(tail, s, main, accent);
  back.add(tail);

  // Front half: chest, front legs, neck and head.
  const front = group('front');
  front.add(at(along(s.girth * 1.05, half * 0.9, main), 0, 0.01, half * 0.45));
  const chest = mesh(new THREE.SphereGeometry(s.girth * 0.85, 10, 8), accent);
  front.add(at(chest, 0, -s.girth * 0.25, half + s.girth * 0.2));
  const head = group('head');
  head.position.set(0, s.girth * 0.9, half + s.girth * 0.75);
  head.scale.setScalar(s.head ?? 1);
  addHead(head, s, main, accent, maskC, eye.color, look.collar);
  front.add(head);
  addCollar(front, s, half, look.collar);
  if (s.fluff === 'ruff') {
    // The keeshond's lion ruff.
    front.add(at(mesh(new THREE.IcosahedronGeometry(s.girth * 1.35, 1), main), 0, s.girth * 0.2, half - 0.06));
    front.add(at(mesh(new THREE.IcosahedronGeometry(s.girth * 0.95, 1), accent), 0, -s.girth * 0.15, half + s.girth * 0.45));
  }
  if (s.fluff === 'poodle') front.add(at(mesh(new THREE.IcosahedronGeometry(s.girth * 1.35, 1), main), 0, s.girth * 0.2, half * 0.6));

  const legs: THREE.Group[] = [];
  for (const [side, z, parent] of [[-1, half * 0.8, front], [1, half * 0.8, front], [-1, -half * 0.8, back], [1, -half * 0.8, back]] as const) {
    const leg = group('leg');
    leg.position.set(side * s.girth * 0.55, -s.girth * 0.3, z);
    const L = s.leg + s.girth * 0.3;
    leg.add(at(mesh(new THREE.CapsuleGeometry((0.055 * s.scale + 0.01) * legThick, L - 0.08, 3, 6), main), 0, -L / 2, 0));
    leg.add(at(mesh(new THREE.SphereGeometry(0.07, 6, 5), accent), 0, -L + 0.02, 0.03));
    if (s.fluff === 'poodle') leg.add(at(mesh(new THREE.IcosahedronGeometry(0.1, 1), main), 0, -L + 0.1, 0));
    parent.add(leg);
    legs.push(leg);
  }

  rig.add(back, front);
  root.add(blobShadow(0.42 * s.scale + 0.1));
  rig.scale.setScalar(s.scale);
  rig.position.y = hip * s.scale;
  const ears = head.children.filter((c) => c.name === 'ear');
  return { root, rig, front, back, head, tail, legs, ears, hip: hip * s.scale, leg: s.leg };
}

/**
 * The collar: a flat strap where the neck meets the chest, square to the line from chest to head,
 * sized to sit just proud of the chest there (so it hugs, never a floating ring), with a brass tag
 * hanging at the throat.
 */
function addCollar(front: THREE.Group, s: BreedShape, half: number, collar: string): void {
  const g = s.girth;
  const chest = new THREE.Vector3(0, -g * 0.25, half + g * 0.2);
  const axis = new THREE.Vector3(0, g * 0.9, half + g * 0.75).sub(chest).normalize();
  const at0 = chest.clone().addScaledVector(axis, g * 0.85 * 0.45);
  // What the strap goes round at that height: the chest, and a keeshond's bib (its ruff is left to
  // swallow the sides, the way a collar sinks into a fluffy dog's fur).
  const balls: [THREE.Vector3, number][] = [[chest, g * 0.85]];
  if (s.fluff === 'ruff') balls.push([new THREE.Vector3(0, -g * 0.15, half + g * 0.45), g * 0.95]);
  let radius = 0.1;
  for (const [c, r] of balls) {
    const d = c.clone().sub(at0);
    const along = d.dot(axis);
    if (Math.abs(along) >= r) continue;
    const side = d.addScaledVector(axis, -along).length();
    radius = Math.max(radius, side + Math.sqrt(r * r - along * along));
  }
  radius += 0.014;
  const c = strap(radius, collar);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  c.position.copy(at0);
  front.add(c);
  const down = new THREE.Vector3(0, -axis.z, axis.y).normalize();
  const tag = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.018, 12), '#e8b93a');
  tag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), down);
  tag.position.copy(at0).addScaledVector(down, radius + 0.02).add(new THREE.Vector3(0, -0.03, 0));
  front.add(tag);
}

/** A flat collar strap: an open band, both faces drawn, so it reads as leather, not a ring. */
function strap(radius: number, color: string, width = 0.07): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20, 1, true), mat(color, { side: THREE.DoubleSide, roughness: 0.6 }));
  m.castShadow = true;
  return m;
}

function addHead(head: THREE.Group, s: BreedShape, main: string, accent: string, maskC: string, eyeColor: string, collar: string): void {
  const r = 0.15;
  head.add(mesh(new THREE.IcosahedronGeometry(r, 1), maskC));
  // Blaze and muzzle in the accent colour (the collie's white stripe and nose).
  const muzzle = mesh(new THREE.CapsuleGeometry(0.075, Math.max(0.01, s.snout), 3, 8), s.flatFace ? maskC : accent);
  muzzle.rotation.x = Math.PI / 2;
  head.add(at(muzzle, 0, -0.04, r * 0.7 + s.snout / 2));
  if (!s.flatFace) head.add(at(mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), accent), 0, 0.06, r * 0.8));
  head.add(at(mesh(new THREE.SphereGeometry(0.035, 6, 5), '#1b1414'), 0, -0.01, r * 0.75 + s.snout + 0.06));
  // Eyes: bright and slightly glowing, so blue eyes read from the camera.
  const eyeMat = mat(eyeColor, { emissive: eyeColor, emissiveIntensity: 0.45, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const er = s.bigEyes ? 0.042 : 0.03;
    head.add(at(mesh(new THREE.SphereGeometry(er, 8, 6), eyeMat, false), side * (s.bigEyes ? 0.072 : 0.068), 0.04, r * 0.85));
    head.add(at(mesh(new THREE.SphereGeometry(er * 0.42, 5, 4), '#0a0a0a', false), side * (s.bigEyes ? 0.078 : 0.072), 0.045, r * 0.85 + er * 0.85));
    const ear = group('ear');
    ear.position.set(side * 0.09, 0.1, -0.02);
    let e: THREE.Mesh;
    switch (s.ears) {
      case 'prick':
        e = mesh(new THREE.ConeGeometry(0.055, 0.15, 4), maskC);
        e.position.y = 0.06;
        break;
      case 'bat':
        e = mesh(new THREE.ConeGeometry(0.075, 0.2, 4), maskC);
        e.position.y = 0.08;
        break;
      case 'giant':
        // Chihuahua satellite dishes: big, wide, splayed out to the sides.
        e = mesh(new THREE.ConeGeometry(0.085, 0.21, 4), maskC);
        e.position.y = 0.09;
        break;
      case 'tip': {
        // Semi-erect with a folded tip: the collie look.
        e = mesh(new THREE.ConeGeometry(0.055, 0.13, 4), maskC);
        e.position.y = 0.05;
        const tip = mesh(new THREE.ConeGeometry(0.04, 0.07, 4), maskC);
        tip.position.set(0, 0.1, 0.03);
        tip.rotation.x = 1.2;
        ear.add(tip);
        break;
      }
      default:
        e = mesh(new THREE.CapsuleGeometry(0.05, 0.12, 3, 6), s.fluff === 'poodle' ? main : maskC);
        e.position.set(side * 0.04, -0.07, 0);
    }
    ear.add(e);
    ear.rotation.z = -side * (s.ears === 'giant' ? 0.7 : 0.25);
    head.add(ear);
  }
  if (s.fluff === 'poodle') head.add(at(mesh(new THREE.IcosahedronGeometry(0.12, 1), main), 0, 0.14, -0.02));
  // Collar.
}

function addTail(tail: THREE.Group, s: BreedShape, main: string, accent: string): void {
  // Every tail starts exactly at the group's origin (the root on the rump), so nothing floats off
  // the dog when the group turns.
  const bend = group('bend');
  tail.add(bend);
  switch (s.tail) {
    case 'stub':
      bend.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), main));
      break;
    case 'curl': {
      // Curled up over the back (keeshond, husky, pug): an arc that begins at the root.
      const R = 0.09;
      bend.rotation.y = Math.PI / 2;
      bend.add(at(mesh(new THREE.TorusGeometry(R, 0.045, 5, 10, Math.PI * 1.4), main), -R, 0, 0));
      bend.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), main));
      break;
    }
    case 'pom': {
      bend.rotation.x = -0.4;
      bend.add(at(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 5), main), 0, 0.11, 0));
      bend.add(at(mesh(new THREE.IcosahedronGeometry(0.08, 1), main), 0, 0.23, 0));
      break;
    }
    default: {
      // Hanging plume (collie, golden) or straight (malinois); tipped in the accent colour.
      const len = s.tail === 'straight' ? 0.34 : 0.4;
      const r = s.tail === 'straight' ? 0.03 : 0.055;
      bend.rotation.x = 0.35;
      bend.add(at(mesh(new THREE.CapsuleGeometry(r, len, 3, 6), main), 0, -len / 2, 0));
      bend.add(at(mesh(new THREE.SphereGeometry(s.tail === 'straight' ? 0.035 : 0.06, 6, 5), s.tail === 'straight' ? main : accent), 0, -len - r * 0.3, 0));
    }
  }
}

export interface SheepRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Mesh[];
  mark: THREE.Mesh;
}

const WOOL = '#f3eee2';
const FACE = '#3b302b';

/** A sheep: a cloud of wool, a dark face with ears out sideways, four stick legs. */
/** A sheep. Black sheep (sorting fields) get dark wool. */
export function sheepMesh(black = false): SheepRig {
  const root = group('sheep');
  const body = group('body');
  body.position.y = 0.42;
  root.add(body);
  const wool = mat(black ? '#3d3634' : WOOL);
  for (const [x, y, z, r] of [[0, 0.08, 0, 0.34], [0.14, 0.1, 0.18, 0.24], [-0.14, 0.1, 0.18, 0.24], [0.14, 0.1, -0.18, 0.24], [-0.14, 0.1, -0.18, 0.24], [0, 0.22, 0, 0.26]] as const) {
    body.add(at(mesh(new THREE.IcosahedronGeometry(r, 1), wool), x, y, z));
  }
  // The raddle mark: a dab of paint on the back, in the team's colour (versus).
  const mark = mesh(new THREE.CircleGeometry(0.14, 10), mat('#3d7dd8', { side: THREE.DoubleSide }), false);
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(0, 0.48, -0.08);
  mark.visible = false;
  body.add(mark);
  const head = group('head');
  head.position.set(0, 0.12, 0.38);
  head.add(mesh(new THREE.CapsuleGeometry(0.1, 0.12, 3, 8), FACE));
  head.children[0].rotation.x = Math.PI / 2 - 0.5;
  head.add(at(mesh(new THREE.IcosahedronGeometry(0.12, 1), wool), 0, 0.1, -0.04));
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.CapsuleGeometry(0.035, 0.1, 3, 5), FACE);
    ear.rotation.z = side * 1.3;
    head.add(at(ear, side * 0.13, 0.03, -0.02));
    head.add(at(mesh(new THREE.SphereGeometry(0.022, 5, 4), '#f6f2e6', false), side * 0.055, 0.04, 0.09));
  }
  body.add(head);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.14, 0.18], [0.14, 0.18], [-0.14, -0.18], [0.14, -0.18]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.4, 5), FACE);
    leg.geometry.translate(0, -0.2, 0);
    leg.position.set(x, 0.4, z);
    root.add(leg);
    legs.push(leg);
  }
  root.add(blobShadow(0.45));
  return { root, body, head, legs, mark };
}

/** The goat: shaggier, horned, bearded, with floppy sideways ears and a judgemental face. */
/** Goat coats: each goat on a field looks a bit different, so you can tell who's doing what. */
const GOAT_COATS = [
  { body: '#e8e1d2', back: '#cfc4ad', face: '#d6ccb7' },
  { body: '#6b4a34', back: '#4a3324', face: '#e8e1d2' },
  { body: '#9b9790', back: '#7a766f', face: '#c9c4ba' },
];

export function goatMesh(variant = 0): { root: THREE.Group; head: THREE.Group; legs: THREE.Mesh[] } {
  const c = GOAT_COATS[variant % GOAT_COATS.length];
  const root = group('goat');
  const body = mesh(new THREE.BoxGeometry(0.56, 0.5, 0.95), c.body);
  body.position.y = 0.72;
  root.add(body);
  root.add(at(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.7), c.back), 0, 1.0, -0.05));
  const head = group('head');
  head.position.set(0, 1.05, 0.55);
  head.add(mesh(new THREE.BoxGeometry(0.34, 0.36, 0.42), c.body));
  head.add(at(mesh(new THREE.BoxGeometry(0.26, 0.2, 0.18), c.face), 0, -0.1, 0.26));
  head.add(at(mesh(new THREE.ConeGeometry(0.06, 0.2, 5), '#b9ad94'), 0, -0.3, 0.26));
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.3, 6), '#9a8a6a');
    horn.position.set(side * 0.1, 0.3, -0.08);
    horn.rotation.x = -0.6;
    head.add(horn);
    const ear = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 3, 6), '#ddd4c2');
    ear.rotation.z = side * 1.4;
    head.add(at(ear, side * 0.25, 0.06, -0.05));
    // Rectangular pupils: the stare.
    head.add(at(mesh(new THREE.SphereGeometry(0.05, 8, 6), '#c8a24a', false), side * 0.12, 0.05, 0.2));
    head.add(at(mesh(new THREE.BoxGeometry(0.06, 0.018, 0.01), '#15110c', false), side * 0.12, 0.05, 0.25));
  }
  root.add(head);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.18, 0.32], [0.18, 0.32], [-0.18, -0.32], [0.18, -0.32]]) {
    const leg = mesh(new THREE.BoxGeometry(0.11, 0.48, 0.11), c.face);
    leg.geometry.translate(0, -0.24, 0);
    leg.position.set(x, 0.48, z);
    root.add(leg);
    legs.push(leg);
  }
  root.add(blobShadow(0.55));
  return { root, head, legs };
}

/** Props for the field. */
export function treeMesh(r: number, seed: number): THREE.Group {
  const g = group('tree');
  g.add(at(mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 6), '#6b4a30'), 0, 0.7, 0));
  const greens = ['#5f8f45', '#6c9c4c', '#557f3e'];
  for (let i = 0; i < 3; i++) {
    const a = seed + i * 2.1;
    g.add(at(mesh(new THREE.IcosahedronGeometry(r * (0.8 - i * 0.12), 0), greens[i]), Math.cos(a) * 0.35, 1.7 + i * 0.45, Math.sin(a) * 0.35));
  }
  return g;
}

export function rockMesh(r: number): THREE.Mesh {
  const m = mesh(new THREE.DodecahedronGeometry(r, 0), '#9a968c');
  m.scale.y = 0.6;
  m.position.y = r * 0.3;
  return m;
}

export function hayMesh(r: number): THREE.Group {
  const g = group('hay');
  const bale = mesh(new THREE.CylinderGeometry(r, r, r * 1.3, 12), '#d9b55a');
  bale.rotation.z = Math.PI / 2;
  bale.position.y = r;
  g.add(bale);
  for (const s of [-1, 1]) {
    const band = mesh(new THREE.TorusGeometry(r * 1.01, 0.03, 4, 14), '#a8843a');
    band.rotation.y = Math.PI / 2;
    band.position.set(s * r * 0.35, r, 0);
    g.add(band);
  }
  return g;
}

/** A pond: water, a muddy rim, cattails and a lily pad or two. */
export function pondMesh(r: number, seed: number): THREE.Group {
  const g = group('pond');
  const rim = mesh(new THREE.CircleGeometry(r + 0.35, 20), '#7a6a4a', false);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.012;
  const water = mesh(new THREE.CircleGeometry(r, 20), mat('#5b9fc2', { roughness: 0.2, metalness: 0.1 }), false);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  g.add(rim, water);
  for (let i = 0; i < 7; i++) {
    const a = seed + i * 0.9;
    const reed = group('reed');
    reed.add(at(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.9, 4), '#5d7a3a'), 0, 0.45, 0));
    reed.add(at(mesh(new THREE.CapsuleGeometry(0.045, 0.14, 2, 5), '#6b4226'), 0, 0.85, 0));
    reed.position.set(Math.cos(a) * (r + 0.1), 0, Math.sin(a) * (r + 0.1));
    reed.rotation.z = Math.sin(a * 3) * 0.15;
    g.add(reed);
  }
  for (let i = 0; i < 3; i++) {
    const pad = mesh(new THREE.CircleGeometry(0.22, 8, 0.4, Math.PI * 1.8), '#6aa04a', false);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(Math.cos(seed + i * 2.3) * r * 0.5, 0.03, Math.sin(seed + i * 2.3) * r * 0.5);
    g.add(pad);
  }
  return g;
}
