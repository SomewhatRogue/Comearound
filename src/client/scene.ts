/**
 * Renderer, camera, light and the static village. Look follows the art research:
 * standard lit flat colours, one hemisphere + one shadowed directional light,
 * neutral tonemapping, exponential fog, narrow-FOV perspective camera pitched ~50 degrees.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { AREAS, AREA_RADIUS, BOARD, PEN, STATIONS, WORLD } from '../shared/map';
import { mat } from './models';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  stationTops: Map<string, THREE.Vector3>;
  resize(): void;
}

export function label(text: string, cls: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return new CSS2DObject(el);
}

export function makeStage(host: HTMLElement, lowfx = false): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowfx, preserveDrawingBuffer: true });
  renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !lowfx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const dusk = new THREE.Color('#2b3550');
  scene.background = dusk;
  scene.fog = new THREE.FogExp2(dusk, 0.012);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);

  scene.add(new THREE.HemisphereLight('#ffe2b8', '#3f5a3a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-10, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // Ground and the wild beyond the village.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.w + 40, WORLD.d + 40), mat('#7c9a5a'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const village = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.w, WORLD.d), mat('#93ad6b'));
  village.rotation.x = -Math.PI / 2;
  village.position.y = 0.005;
  village.receiveShadow = true;
  scene.add(village);

  for (const a of AREAS) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(AREA_RADIUS, 28), mat(a.color));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(a.x, 0.01, a.z);
    patch.receiveShadow = true;
    scene.add(patch);
    const l = label(a.name, 'area-label');
    l.position.set(a.x, 0.2, a.z - AREA_RADIUS + 0.6);
    scene.add(l);
  }

  // Stations: little tables. Their tops are where placed items sit.
  const stationTops = new Map<string, THREE.Vector3>();
  for (const s of STATIONS) {
    const t = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 14), mat('#a0714a'));
    top.position.y = 0.6;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), mat('#7a5233'));
    leg.position.y = 0.3;
    for (const m of [top, leg]) [m.castShadow, m.receiveShadow] = [true, true];
    t.add(top, leg);
    t.position.set(s.x, 0, s.z);
    scene.add(t);
    stationTops.set(s.id, new THREE.Vector3(s.x, 0.66, s.z));
  }

  // The board in the square.
  const board = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 0.12), mat('#5b3d2b'));
  panel.position.y = 1.6;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.2), mat('#f4ead2'));
  paper.position.set(0, 1.6, 0.07);
  for (const x of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 0.14), mat('#4a2f1f'));
    post.position.set(x, 0.9, 0);
    post.castShadow = true;
    board.add(post);
  }
  panel.castShadow = true;
  board.add(panel, paper);
  board.position.set(BOARD.x, 0, BOARD.z);
  scene.add(board);
  const bl = label('THE BOARD', 'area-label board-label');
  bl.position.set(BOARD.x, 2.7, BOARD.z);
  scene.add(bl);

  // The Pen: a fence the goat can see.
  const fence = new THREE.Group();
  const hw = PEN.w / 2;
  const hd = PEN.d / 2;
  for (let x = -hw; x <= hw + 0.01; x += 1) for (const z of [-hd, hd]) fence.add(post(x, z));
  for (let z = -hd + 1; z < hd; z += 1) for (const x of [-hw, hw]) fence.add(post(x, z));
  for (const [w, d, x, z] of [[PEN.w, 0.08, 0, -hd], [PEN.w, 0.08, 0, hd], [0.08, PEN.d, -hw, 0], [0.08, PEN.d, hw, 0]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), mat('#c8a46e'));
    rail.position.set(x, 0.55, z);
    fence.add(rail);
  }
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(PEN.w, PEN.d), mat('#8a6f4e'));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.012;
  dirt.receiveShadow = true;
  fence.add(dirt);
  fence.position.set(PEN.x, 0, PEN.z);
  scene.add(fence);
  const pl = label('THE PEN', 'area-label pen-label');
  pl.position.set(PEN.x, 0.2, PEN.z + hd + 0.7);
  scene.add(pl);

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
  return { renderer, labels, scene, camera, sun, stationTops, resize };
}

function post(x: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), mat('#a8834f'));
  m.position.set(x, 0.4, z);
  m.castShadow = true;
  return m;
}

/** Follow a point from above and behind; never moves on its own beyond following the player. */
export function followCamera(stage: Stage, x: number, z: number, dt: number): void {
  const want = new THREE.Vector3(x, 20, z + 15);
  stage.camera.position.lerp(want, 1 - Math.exp(-dt * 6));
  stage.camera.lookAt(stage.camera.position.x, 0, stage.camera.position.z - 15);
}
