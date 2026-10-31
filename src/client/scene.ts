/**
 * Renderer, camera, light, and the field. The field is drawn from the same FieldDef the server
 * collides against (src/shared/field.ts), so a fence on screen is a fence in the rules.
 * Look: late-afternoon light over a meadow, standard lit flat colours, one hemisphere and one
 * shadowed sun, neutral tonemapping, gentle fog, a narrow-FOV camera looking down at ~50 degrees.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { gateOf, penWalls, type FieldDef } from '../shared/field';
import { at, hayMesh, mat, mesh, pondMesh, rockMesh, treeMesh } from './models';
import { buildHazards } from './hazardsview';
import { Scenery } from './scenery';

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
  private scenery: Scenery | null = null;
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
    this.scenery = new Scenery(f, this.lowfx);
    this.group.add(this.scenery.group);
    this.stage.scene.add(this.group);
  }

  /** Clouds and butterflies. */
  update(time: number, dt: number, wind: { x: number; z: number; s: number }): void {
    this.scenery?.update(time, dt, wind);
  }
}

function buildField(f: FieldDef, lowfx: boolean): THREE.Group {
  const g = new THREE.Group();
  // Outer fence: posts and two rails.
  const hw = f.w / 2;
  const hd = f.d / 2;
  const fence = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);
  // Each side is a run of rails between gaps (a broken fence leaves a hole).
  const sides: { side: 'n' | 's' | 'e' | 'w'; alongX: boolean; fixed: number; len: number }[] = [
    { side: 'n', alongX: true, fixed: -hd, len: f.w }, { side: 's', alongX: true, fixed: hd, len: f.w },
    { side: 'w', alongX: false, fixed: -hw, len: f.d }, { side: 'e', alongX: false, fixed: hw, len: f.d },
  ];
  for (const sd of sides) {
    const holes = (f.gaps ?? []).filter((q) => q.side === sd.side).map((q) => [q.at - q.w / 2, q.at + q.w / 2]).sort((a, b) => a[0] - b[0]);
    const runs: [number, number][] = [];
    let start = -sd.len / 2;
    for (const [a, b] of holes) {
      runs.push([start, a]);
      start = b;
    }
    runs.push([start, sd.len / 2]);
    for (const [a, b] of runs) {
      if (b - a < 0.2) continue;
      const n = Math.max(1, Math.round((b - a) / 2.5));
      for (let i = 0; i <= n; i++) {
        const t = a + ((b - a) * i) / n;
        fence.add(sd.alongX ? post(postGeo, t, sd.fixed) : post(postGeo, sd.fixed, t));
      }
      for (const y of [0.45, 0.8]) {
        const rail = mesh(new THREE.BoxGeometry(sd.alongX ? b - a : 0.07, 0.08, sd.alongX ? 0.07 : b - a), '#c8a46e');
        rail.position.set(sd.alongX ? (a + b) / 2 : sd.fixed, y, sd.alongX ? sd.fixed : (a + b) / 2);
        fence.add(rail);
      }
    }
  }
  g.add(fence);
  g.add(buildHazards(f));

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
    if (o.kind === 'bramble') continue;
    const seed = o.x * 1.7 + o.z;
    const obj = o.kind === 'tree' ? treeMesh(o.r, seed) : o.kind === 'rock' ? rockMesh(o.r) : o.kind === 'hay' ? hayMesh(o.r) : pondMesh(o.r, seed);
    obj.position.x += o.x;
    obj.position.z += o.z;
    g.add(obj);
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
