/**
 * Renderer, camera, light, and the field. The field is drawn from the same FieldDef the server
 * collides against (src/shared/field.ts), so a fence on screen is a fence in the rules.
 * Look: late-afternoon light over a meadow, standard lit flat colours, one hemisphere and one
 * shadowed sun, neutral tonemapping, gentle fog, a narrow-FOV camera looking down at ~50 degrees.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { gateOf, penWalls, type FieldDef } from '../shared/field';
import { Rng } from '../shared/rng';
import { at, hayMesh, mat, mesh, pondMesh, rockMesh, treeMesh } from './models';

export const TEAM_COLORS = ['#3d7dd8', '#e8762c'] as const;
export const TEAM_NAMES = ['Blue', 'Orange'] as const;

/** Times the WebGL context was lost and restored (shown in the phone diagnostics). */
export let glLost = 0;
export let glRestored = 0;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  resize(): void;
}

export function label(text: string, cls: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return new CSS2DObject(el);
}

export function makeStage(host: HTMLElement, lowfx = false, phone = false): Stage {
  // Phones get a lighter renderer: big shadow maps and full-res buffers can make a phone drop the
  // WebGL context, which freezes the picture while everything else keeps running.
  const renderer = new THREE.WebGLRenderer({ antialias: !lowfx && !phone, preserveDrawingBuffer: !phone, powerPreference: 'default' });
  renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
  renderer.shadowMap.enabled = !lowfx;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    glLost++;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => (glRestored++));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color('#a9cbe0');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 45, 95);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);

  scene.add(new THREE.HemisphereLight('#fff1d2', '#557a3c', 1.7));
  const sun = new THREE.DirectionalLight('#ffe6bf', 2.3);
  sun.position.set(-14, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const outside = mesh(new THREE.PlaneGeometry(220, 220), '#78985a', false);
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.01;
  scene.add(outside);

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  return { renderer, labels, scene, camera, sun, resize };
}

/** The current field's ground, fences, pens and props. Rebuilt when the field changes. */
export class FieldView {
  private group: THREE.Group | null = null;
  id = '';

  constructor(private stage: Stage, private lowfx: boolean) {}

  show(f: FieldDef, mode: 'trials' | 'versus'): void {
    const id = `${f.id}|${mode}`;
    if (id === this.id) return;
    this.id = id;
    if (this.group) {
      this.stage.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        if (o instanceof CSS2DObject) o.element.remove();
      });
    }
    this.group = buildField(f, this.lowfx);
    this.stage.scene.add(this.group);
  }
}

function buildField(f: FieldDef, lowfx: boolean): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(f.id.length * 977 + f.w);
  const grass = mesh(new THREE.PlaneGeometry(f.w, f.d), '#8db164', false);
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  g.add(grass);

  // Tufts and flowers, so "down in the grass" means something. Instanced: cheap.
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.35, 4), mat('#6f9a48'), lowfx ? 120 : 420);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), mat('#fff6d8'), lowfx ? 30 : 110);
  const yellow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), mat('#f2c84b'), lowfx ? 20 : 80);
  const m = new THREE.Matrix4();
  for (const inst of [tufts, flowers, yellow]) {
    for (let i = 0; i < inst.count; i++) {
      const x = rng.range(-f.w / 2 + 0.5, f.w / 2 - 0.5);
      const z = rng.range(-f.d / 2 + 0.5, f.d / 2 - 0.5);
      // Not on pen floors or in ponds.
      if (f.pens.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.2 && Math.abs(z - p.z) < p.d / 2 + 0.2) || f.obstacles.some((o) => o.kind === 'pond' && Math.hypot(x - o.x, z - o.z) < o.r + 0.4)) {
        inst.setMatrixAt(i, m.makeScale(0, 0, 0));
        continue;
      }
      const s = rng.range(0.7, 1.3);
      m.compose(new THREE.Vector3(x, inst === tufts ? 0.15 * s : 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6), 0)), new THREE.Vector3(s, s, s));
      inst.setMatrixAt(i, m);
    }
    g.add(inst);
  }

  // Outer fence: posts and two rails.
  const hw = f.w / 2;
  const hd = f.d / 2;
  const fence = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);
  for (let x = -hw; x <= hw + 0.01; x += 2.5) for (const z of [-hd, hd]) fence.add(post(postGeo, x, z));
  for (let z = -hd + 2.5; z < hd; z += 2.5) for (const x of [-hw, hw]) fence.add(post(postGeo, x, z));
  for (const y of [0.45, 0.8]) {
    for (const [w, d, x, z] of [[f.w, 0.07, 0, -hd], [f.w, 0.07, 0, hd], [0.07, f.d, -hw, 0], [0.07, f.d, hw, 0]]) {
      fence.add(at(mesh(new THREE.BoxGeometry(w, 0.08, d), '#c8a46e'), x, y, z));
    }
  }
  g.add(fence);

  // Pens: dirt floor, fences with the gate gap, a swung-open gate, and a team flag in versus.
  for (const p of f.pens) {
    const floor = mesh(new THREE.PlaneGeometry(p.w, p.d), '#b49a6a', false);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(p.x, 0.01, p.z);
    floor.receiveShadow = true;
    g.add(floor);
    for (const w of penWalls(p)) {
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const n = Math.max(1, Math.round(len / 1.2));
      for (let i = 0; i <= n; i++) g.add(post(postGeo, w.ax + ((w.bx - w.ax) * i) / n, w.az + ((w.bz - w.az) * i) / n, '#8a6a42'));
      for (const y of [0.4, 0.75]) {
        const rail = mesh(new THREE.BoxGeometry(len, 0.09, 0.08), '#e2c38c');
        rail.position.set((w.ax + w.bx) / 2, y, (w.az + w.bz) / 2);
        rail.rotation.y = -Math.atan2(w.bz - w.az, w.bx - w.ax);
        g.add(rail);
      }
    }
    const gt = gateOf(p);
    // The gate leaf, swung open outward against the fence.
    const [sx, sz] = [-gt.oz, gt.ox];
    const hinge = { x: gt.x + sx * (p.gateW / 2), z: gt.z + sz * (p.gateW / 2) };
    const leaf = new THREE.Group();
    for (const y of [0.35, 0.7]) leaf.add(at(mesh(new THREE.BoxGeometry(p.gateW * 0.9, 0.08, 0.06), '#f0dcae'), (p.gateW * 0.9) / 2, y, 0));
    leaf.add(at(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.06), '#f0dcae'), p.gateW * 0.88, 0.52, 0));
    leaf.position.set(hinge.x, 0, hinge.z);
    // Open outward: the leaf points out of the pen, angled slightly toward the side.
    leaf.rotation.y = -Math.atan2(gt.oz + sz * 0.5, gt.ox + sx * 0.5);
    g.add(leaf);
    const sign = label(p.team === null ? 'PEN' : `${TEAM_NAMES[p.team]} pen`, `pen-label${p.team === null ? '' : ` team${p.team}`}`);
    sign.position.set(gt.x + gt.ox * 1.2, 0.3, gt.z + gt.oz * 1.2);
    g.add(sign);
    if (p.team !== null) {
      const flag = new THREE.Group();
      flag.add(at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), '#6b4a30'), 0, 1.2, 0));
      flag.add(at(mesh(new THREE.BoxGeometry(0.03, 0.5, 0.8), TEAM_COLORS[p.team]), 0, 2.1, 0.4));
      flag.position.set(p.x - sx * (p.w / 2), 0, p.z - sz * (p.d / 2));
      g.add(flag);
    }
  }

  for (const o of f.obstacles) {
    const seed = o.x * 1.7 + o.z;
    const obj = o.kind === 'tree' ? treeMesh(o.r, seed) : o.kind === 'rock' ? rockMesh(o.r) : o.kind === 'hay' ? hayMesh(o.r) : pondMesh(o.r, seed);
    obj.position.x += o.x;
    obj.position.z += o.z;
    g.add(obj);
  }

  // A few trees outside the fence for a sense of place.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const t = treeMesh(rng.range(1.1, 1.8), i);
    t.position.set(Math.cos(a) * (hw + rng.range(4, 12)), 0, Math.sin(a) * (hd + rng.range(4, 10)));
    g.add(t);
  }
  return g;
}

function post(geo: THREE.BufferGeometry, x: number, z: number, color = '#a8834f'): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, 0.5, z);
  m.castShadow = true;
  return m;
}

/**
 * The camera follows your dog from above and behind. In the lobby it sits closer, so you can
 * see your dog (breed, coat, those blue eyes). It eases, never snaps.
 */
export function followCamera(stage: Stage, x: number, z: number, dt: number, close: boolean): void {
  const portrait = stage.camera.aspect < 1;
  const h = close ? 7 : portrait ? 28 : 19;
  const back = close ? 7.5 : portrait ? 17 : 14;
  const want = new THREE.Vector3(x, h, z + back);
  const k = 1 - Math.exp(-dt * (close ? 3 : 5));
  stage.camera.position.lerp(want, k);
  stage.camera.lookAt(stage.camera.position.x, 0, stage.camera.position.z - back);
}
