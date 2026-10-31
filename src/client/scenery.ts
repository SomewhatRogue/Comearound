/**
 * Scenery: everything on a field that's there to be lovely and doesn't touch the rules.
 * Patchy grass, wildflower patches (each field has its own flowers), tall grass along the fences,
 * butterflies, and the countryside beyond the fence: rolling hills, hedgerows, a barn, clouds.
 * Nearly all instanced, so a phone draws it in a handful of calls.
 */
import * as THREE from 'three';
import { gateOf, inMud, inWater, type FieldDef } from '../shared/field';
import { Rng } from '../shared/rng';
import { at, mat, mesh, treeMesh } from './models';
import { beehivesMesh, cartMesh, duckMesh, farmhouseMesh, scarecrowMesh, wellMesh, windmillMesh } from './props';

interface Theme {
  grass: [string, string, string];
  flowers: { petal: string; heart: string; weight: number }[];
  extras?: 'apples' | 'heather' | 'bunting';
}

const THEMES: Record<string, Theme> = {
  meadow: {
    grass: ['#8fb565', '#a6c672', '#78a254'],
    flowers: [{ petal: '#fbf7ea', heart: '#f2c84b', weight: 3 }, { petal: '#f5cf3a', heart: '#e0a12a', weight: 2 }, { petal: '#e9a5c4', heart: '#f7e6b0', weight: 1 }],
  },
  orchard: {
    grass: ['#86ad5c', '#9cbe6a', '#6e9a4c'],
    flowers: [{ petal: '#e9a5c4', heart: '#fff2c8', weight: 2 }, { petal: '#fbf7ea', heart: '#f2c84b', weight: 2 }, { petal: '#d8413a', heart: '#2b1d1a', weight: 1 }],
    extras: 'apples',
  },
  hillside: {
    grass: ['#8aad66', '#a4bf7e', '#729a55'],
    flowers: [{ petal: '#8f6ac8', heart: '#f0e2ff', weight: 3 }, { petal: '#5f86d8', heart: '#e8eeff', weight: 2 }, { petal: '#fbf7ea', heart: '#f2c84b', weight: 1 }],
    extras: 'heather',
  },
  fieldday: {
    grass: ['#90b766', '#a8c874', '#7aa656'],
    flowers: [{ petal: '#d8413a', heart: '#2b1d1a', weight: 2 }, { petal: '#f5cf3a', heart: '#e0a12a', weight: 2 }, { petal: '#fbf7ea', heart: '#f2c84b', weight: 2 }],
    extras: 'bunting',
  },
};

/** Shared by every swaying material: the clock and the wind. */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) } };

/** A material whose vertices sway in the wind, more the higher they are (grass tips, flower heads). */
function swaying(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float h = max(mvPosition.y, 0.0);
      float wave = sin(uTime * 2.2 - dot(mvPosition.xz, uWindDir) * 0.5 + mvPosition.x * 0.13) * 0.5 + 0.5;
      float flutter = sin(uTime * 7.0 + mvPosition.x * 3.1 + mvPosition.z * 2.3) * 0.12;
      mvPosition.xz += uWindDir * (uWind * (0.3 + wave * 1.1) + flutter * (0.25 + uWind)) * h * 0.75;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}

/** Smooth, cheap noise: a few crossed sine waves with random phases. 0..1. */
function noise2(rng: Rng): (x: number, z: number) => number {
  const w = Array.from({ length: 4 }, () => ({ a: rng.range(0, 6.28), fx: rng.range(0.05, 0.16), fz: rng.range(0.05, 0.16), p: rng.range(0, 6.28) }));
  return (x, z) => {
    let v = 0;
    for (const o of w) v += Math.sin(x * o.fx * Math.cos(o.a) + z * o.fz * Math.sin(o.a) + o.p);
    return v / 8 + 0.5;
  };
}

export class Scenery {
  readonly group = new THREE.Group();
  private butterflies: { inst: THREE.InstancedMesh; homes: { x: number; z: number; r: number; ph: number; sp: number }[] } | null = null;
  private clouds: THREE.Object3D[] = [];
  /** Ducks paddling round ponds (animated by animateProps). */
  readonly ducks: { obj: THREE.Object3D; x: number; z: number; r: number; ph: number; sp: number }[] = [];
  private streaks: { inst: THREE.InstancedMesh; mat: THREE.MeshBasicMaterial; pts: { x: number; z: number; y: number; ph: number }[] } | null = null;
  private m = new THREE.Matrix4();

  constructor(private f: FieldDef, private lowfx: boolean) {
    const rng = new Rng(f.id.length * 7919 + Math.round(f.w * 13));
    const theme = THEMES[f.id] ?? THEMES.meadow;
    const n = noise2(rng);
    this.group.add(this.ground(theme, n));
    this.group.add(this.countryside(rng, n));
    const patches = this.patchSpots(rng);
    this.flowers(rng, theme, patches);
    this.tallGrass(rng);
    if (theme.extras === 'apples') this.apples(rng);
    if (theme.extras === 'bunting') this.bunting();
    this.butterflySwarm(rng, patches);
    this.windStreaks(rng);
    // Ducks on every pond.
    for (const o of f.obstacles) {
      if (o.kind !== 'pond') continue;
      for (let i = 0; i < 3; i++) {
        const obj = duckMesh();
        this.group.add(obj);
        this.ducks.push({ obj, x: o.x, z: o.z, r: o.r * rng.range(0.35, 0.75), ph: rng.range(0, 6.28), sp: rng.range(0.12, 0.25) * (i % 2 ? 1 : -1) });
      }
    }
  }

  /** Faint white streaks blowing across the field when the wind is up. */
  private windStreaks(rng: Rng): void {
    if (!this.f.wind || this.f.wind.strength <= 0) return;
    const count = this.lowfx ? 10 : 26;
    const geo = new THREE.PlaneGeometry(1.8, 0.05);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const inst = new THREE.InstancedMesh(geo, m, count);
    const pts = Array.from({ length: count }, () => ({ x: rng.range(-this.f.w / 2, this.f.w / 2), z: rng.range(-this.f.d / 2, this.f.d / 2), y: rng.range(0.6, 2.2), ph: rng.range(0, 6.28) }));
    this.streaks = { inst, mat: m, pts };
    this.group.add(inst);
  }

  /** Is (x, z) somewhere decoration shouldn't go: pens, ponds, trees, rocks, the gate approach. */
  private blocked(x: number, z: number, pad = 0.3): boolean {
    const f = this.f;
    if (Math.abs(x) > f.w / 2 - 0.4 || Math.abs(z) > f.d / 2 - 0.4) return true;
    if (f.pens.some((p) => Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(z - p.z) < p.d / 2 + pad)) return true;
    if (inWater(f, x, z, pad + 0.5) || inMud(f, x, z)) return true;
    return f.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad + (o.kind === 'pond' ? 0.4 : 0));
  }

  private ground(theme: Theme, n: (x: number, z: number) => number): THREE.Mesh {
    const f = this.f;
    const seg = this.lowfx ? 24 : 48;
    const geo = new THREE.PlaneGeometry(f.w, f.d, seg, Math.round((seg * f.d) / f.w));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const [a, b, c] = theme.grass.map((h) => new THREE.Color(h));
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const v = n(x, z);
      tmp.copy(a).lerp(v > 0.5 ? b : c, Math.min(1, Math.abs(v - 0.5) * 3.2));
      // A worn, sandier strip in front of each gate where the flock comes in.
      for (const p of f.pens) {
        const g = gateOf(p);
        const along = (x - g.x) * g.ox + (z - g.z) * g.oz;
        const side = Math.abs((x - g.x) * g.oz - (z - g.z) * g.ox);
        if (along > 0 && along < 7 && side < p.gateW * 0.7) tmp.lerp(new THREE.Color('#b9a573'), 0.55 * (1 - along / 7) * (1 - side / (p.gateW * 0.7)));
      }
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true;
    return ground;
  }

  /** Beyond the fence: rolling hills, hedgerows, a barn, trees, clouds. */
  private countryside(rng: Rng, n: (x: number, z: number) => number): THREE.Group {
    const f = this.f;
    const g = new THREE.Group();
    const [hw, hd] = [f.w / 2, f.d / 2];
    // Rolling land that rises gently away from the fence.
    const size = 200;
    const seg = this.lowfx ? 40 : 80;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const lo = new THREE.Color('#7d9e5a');
    const hi = new THREE.Color('#9dbb73');
    const far = new THREE.Color('#a9c4a0');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const out = Math.max(Math.abs(x) - hw, Math.abs(z) - hd, 0);
      const rise = Math.min(1, Math.max(0, (out - 3) / 25));
      const h = rise * rise * (2 + 6 * n(x * 0.5, z * 0.5));
      pos.setY(i, out > 0 ? h - 0.05 : -0.05);
      tmp.copy(lo).lerp(hi, n(x * 0.7, z * 0.7)).lerp(far, Math.min(1, out / 70));
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    land.receiveShadow = true;
    g.add(land);

    // Hedgerows along two sides, a little way out.
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 0), mat('#557f3e'), this.lowfx ? 40 : 90);
    let k = 0;
    const put = (x: number, z: number, s: number) => {
      if (k >= bush.count) return;
      this.m.compose(new THREE.Vector3(x, 0.5 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), 0)), new THREE.Vector3(s, s * 0.8, s));
      bush.setMatrixAt(k++, this.m);
    };
    for (let x = -hw - 4; x <= hw + 4; x += 1.4) put(x + rng.range(-0.3, 0.3), -hd - 3.2 + rng.range(-0.3, 0.3), rng.range(0.8, 1.3));
    for (let z = -hd - 4; z <= hd + 4; z += 1.4) put(hw + 3.2 + rng.range(-0.3, 0.3), z + rng.range(-0.3, 0.3), rng.range(0.8, 1.3));
    bush.count = k;
    bush.castShadow = true;
    g.add(bush);

    // A red barn and a silo, off one corner.
    const barn = new THREE.Group();
    barn.add(at(mesh(new THREE.BoxGeometry(6, 3.2, 4.4), '#b4442f'), 0, 1.6, 0));
    const roof = mesh(new THREE.CylinderGeometry(0.01, 3.6, 2, 4, 1), '#5a4038');
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.2, 1, 0.9);
    barn.add(at(roof, 0, 4.2, 0));
    barn.add(at(mesh(new THREE.BoxGeometry(2, 2.2, 0.1), '#f4ead2'), 0, 1.1, 2.23));
    barn.add(at(mesh(new THREE.BoxGeometry(1.7, 1.9, 0.12), '#8a2f20'), 0, 1.05, 2.25));
    barn.add(at(mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 10), '#cfc8b8'), 4.4, 3, -0.6));
    barn.add(at(mesh(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#8a8478'), 4.4, 6, -0.6));
    barn.position.set(-hw - 9, 0, -hd - 7);
    barn.rotation.y = 0.5;
    g.add(barn);

    // Farm things on the hills: a windmill or two, the farmhouse, a scarecrow, a well, beehives, a hay cart.
    const height = (x: number, z: number) => {
      const out = Math.max(Math.abs(x) - hw, Math.abs(z) - hd, 0);
      const rise = Math.min(1, Math.max(0, (out - 3) / 25));
      return rise * rise * (2 + 6 * n(x * 0.5, z * 0.5)) - 0.1;
    };
    const place = (o: THREE.Object3D, x: number, z: number, rot = 0) => {
      o.position.set(x, height(x, z), z);
      o.rotation.y = rot;
      g.add(o);
    };
    place(windmillMesh(1.3), hw + 16, -hd - 10, -0.6);
    if (f.w > 45) place(windmillMesh(1.1), -hw - 20, hd + 14, 2.4);
    place(farmhouseMesh(), -hw - 15, -hd - 4, 0.9);
    place(scarecrowMesh(), hw + 6, hd + 5, -0.3);
    place(wellMesh(), -hw - 5, -hd - 9, 0);
    place(beehivesMesh(), hw + 7, -hd - 3, -0.4);
    place(cartMesh(), -hw - 6, hd + 6, 0.5);

    // Trees scattered on the hills.
    for (let i = 0; i < (this.lowfx ? 10 : 22); i++) {
      const a = (i / 22) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const t = treeMesh(rng.range(1.1, 2), i);
      const r = rng.range(5, 18);
      const x = Math.cos(a) * (hw + r);
      const z = Math.sin(a) * (hd + r);
      if (Math.hypot(x - barn.position.x, z - barn.position.z) < 9) continue;
      const out = Math.max(Math.abs(x) - hw, Math.abs(z) - hd, 0);
      const rise = Math.min(1, Math.max(0, (out - 3) / 25));
      t.position.set(x, rise * rise * (2 + 6 * n(x * 0.5, z * 0.5)) - 0.1, z);
      g.add(t);
    }

    // Clouds, drifting slowly (no shadows: they'd blot out the field).
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(2, 3.5), 0), cloudMat);
        puff.position.set(j * 2.4 - 3.6, rng.range(-0.4, 0.6), rng.range(-1, 1));
        puff.scale.y = 0.6;
        c.add(puff);
      }
      c.position.set(rng.range(-90, 90), rng.range(28, 36), rng.range(-90, 20));
      c.userData.speed = rng.range(0.4, 0.9);
      this.clouds.push(c);
      g.add(c);
    }
    return g;
  }

  /** Where the wildflower patches go: open ground, away from pens, ponds and trees. */
  private patchSpots(rng: Rng): { x: number; z: number; r: number }[] {
    const f = this.f;
    const out: { x: number; z: number; r: number }[] = [];
    for (let tries = 0; tries < 200 && out.length < (this.lowfx ? 6 : 10); tries++) {
      const x = rng.range(-f.w / 2 + 2, f.w / 2 - 2);
      const z = rng.range(-f.d / 2 + 2, f.d / 2 - 2);
      if (this.blocked(x, z, 1.5) || out.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
      out.push({ x, z, r: rng.range(2, 3.8) });
    }
    return out;
  }

  /** Flowers: thick in the patches, a light sprinkle everywhere else. A disc of petals and a heart. */
  private flowers(rng: Rng, theme: Theme, patches: { x: number; z: number; r: number }[]): void {
    const total = theme.flowers.reduce((n, q) => n + q.weight, 0);
    const per = this.lowfx ? 240 : 760;
    const petalGeo = new THREE.CircleGeometry(0.14, 6);
    petalGeo.rotateX(-Math.PI / 2);
    const heartGeo = new THREE.IcosahedronGeometry(0.055, 0);
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 3);
    const stems = new THREE.InstancedMesh(stemGeo, swaying('#5d8a3e'), per);
    let s = 0;
    for (const kind of theme.flowers) {
      const count = Math.round((per * kind.weight) / total);
      const petals = new THREE.InstancedMesh(petalGeo, swaying(kind.petal, { side: THREE.DoubleSide }), count);
      const hearts = new THREE.InstancedMesh(heartGeo, swaying(kind.heart), count);
      let k = 0;
      for (let i = 0; i < count * 3 && k < count; i++) {
        // 75% in patches, the rest scattered.
        let x: number;
        let z: number;
        if (patches.length && rng.next() < 0.8) {
          const p = patches[Math.floor(rng.next() * patches.length)];
          const a = rng.range(0, 6.28);
          const r = Math.sqrt(rng.next()) * p.r;
          [x, z] = [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r];
        } else [x, z] = [rng.range(-this.f.w / 2, this.f.w / 2), rng.range(-this.f.d / 2, this.f.d / 2)];
        if (this.blocked(x, z)) continue;
        const sc = rng.range(0.75, 1.25);
        const h = rng.range(0.16, 0.26);
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.25, 0.25), rng.range(0, 6.28), rng.range(-0.25, 0.25)));
        this.m.compose(new THREE.Vector3(x, h, z), tilt, new THREE.Vector3(sc, sc, sc));
        petals.setMatrixAt(k, this.m);
        this.m.compose(new THREE.Vector3(x, h + 0.02, z), tilt, new THREE.Vector3(sc, sc * 0.6, sc));
        hearts.setMatrixAt(k, this.m);
        if (s < per) {
          this.m.compose(new THREE.Vector3(x, h / 2, z), tilt, new THREE.Vector3(1, h / 0.22, 1));
          stems.setMatrixAt(s++, this.m);
        }
        k++;
      }
      petals.count = hearts.count = k;
      this.group.add(petals, hearts);
    }
    stems.count = s;
    this.group.add(stems);
  }

  /** Tall grass: thicker along the fence lines and round the trees and rocks, where mowers can't reach. */
  private tallGrass(rng: Rng): void {
    const f = this.f;
    const count = this.lowfx ? 220 : 700;
    const blade = new THREE.ConeGeometry(0.07, 0.55, 3);
    blade.translate(0, 0.27, 0);
    const greens = [swaying('#6f9a48'), swaying('#7fa652'), swaying('#5f8a3e')];
    const insts = greens.map((g) => new THREE.InstancedMesh(blade, g, Math.ceil(count / 3)));
    const ks = [0, 0, 0];
    for (let i = 0; i < count * 2 && ks.reduce((a, b) => a + b, 0) < count; i++) {
      let x: number;
      let z: number;
      const r = rng.next();
      if (r < 0.45) {
        // Along the fence.
        const side = Math.floor(rng.next() * 4);
        const t = rng.range(-1, 1);
        const inset = rng.range(0.3, 1.4);
        [x, z] = side < 2 ? [t * f.w / 2, (side ? 1 : -1) * (f.d / 2 - inset)] : [(side === 2 ? 1 : -1) * (f.w / 2 - inset), t * f.d / 2];
      } else if (r < 0.7 && f.obstacles.length) {
        const o = f.obstacles[Math.floor(rng.next() * f.obstacles.length)];
        const a = rng.range(0, 6.28);
        const d = o.r + rng.range(0.3, 1.2) + (o.kind === 'pond' ? 0.4 : 0);
        [x, z] = [o.x + Math.cos(a) * d, o.z + Math.sin(a) * d];
      } else [x, z] = [rng.range(-f.w / 2, f.w / 2), rng.range(-f.d / 2, f.d / 2)];
      if (this.blocked(x, z, 0.15) && !(Math.abs(x) > f.w / 2 - 1.5 || Math.abs(z) > f.d / 2 - 1.5)) continue;
      if (Math.abs(x) > f.w / 2 - 0.2 || Math.abs(z) > f.d / 2 - 0.2) continue;
      const which = Math.floor(rng.next() * 3);
      if (ks[which] >= insts[which].count) continue;
      const sc = rng.range(0.6, 1.4);
      this.m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3))), new THREE.Vector3(sc, sc, sc));
      insts[which].setMatrixAt(ks[which]++, this.m);
    }
    insts.forEach((inst, i) => {
      inst.count = ks[i];
      this.group.add(inst);
    });
  }

  /** The orchard: windfall apples in the grass under the trees. */
  private apples(rng: Rng): void {
    const trees = this.f.obstacles.filter((o) => o.kind === 'tree');
    const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 1), mat('#c8382e'), trees.length * 6);
    let k = 0;
    for (const t of trees) {
      for (let i = 0; i < 6; i++) {
        const a = rng.range(0, 6.28);
        const r = t.r + rng.range(0.1, 1.2);
        this.m.makeTranslation(t.x + Math.cos(a) * r, 0.08, t.z + Math.sin(a) * r);
        inst.setMatrixAt(k++, this.m);
      }
    }
    this.group.add(inst);
  }

  /** Field Day: bunting strung along the long fences, in both teams' colours. */
  private bunting(): void {
    const f = this.f;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.32, 0], 3));
    tri.computeVertexNormals();
    const colors = ['#3d7dd8', '#e8762c', '#f5cf3a', '#fbf7ea'];
    const insts = colors.map((c) => new THREE.InstancedMesh(tri, mat(c, { side: THREE.DoubleSide }), 200));
    const ks = [0, 0, 0, 0];
    let i = 0;
    for (const z of [-f.d / 2, f.d / 2]) {
      for (let x = -f.w / 2; x < f.w / 2; x += 0.5) {
        const seg = ((x + f.w / 2) % 2.5) / 2.5;
        const y = 1.15 - Math.sin(seg * Math.PI) * 0.25;
        const c = i++ % colors.length;
        if (ks[c] >= 200) continue;
        this.m.makeTranslation(x, y, z);
        insts[c].setMatrixAt(ks[c]++, this.m);
      }
    }
    insts.forEach((inst, c) => {
      inst.count = ks[c];
      this.group.add(inst);
    });
  }

  /** Butterflies flitting over the flower patches. */
  private butterflySwarm(rng: Rng, patches: { x: number; z: number; r: number }[]): void {
    if (!patches.length) return;
    const count = this.lowfx ? 6 : 16;
    // A wing: a big rounded forewing and a smaller hindwing, hinged at x = 0.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.05, 0.12, 0.17, 0.13, 0.15, 0.03);
    shape.bezierCurveTo(0.16, -0.02, 0.12, -0.1, 0.05, -0.09);
    shape.bezierCurveTo(0.03, -0.06, 0.01, -0.03, 0, 0);
    const wing = new THREE.ShapeGeometry(shape, 4);
    wing.rotateX(-Math.PI / 2);
    wing.scale(1.7, 1.7, 1.7);
    const inst = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count * 2);
    const palette = ['#f7f3e6', '#f5cf3a', '#e8762c', '#8fb7f0', '#e9a5c4'];
    const homes = [];
    for (let i = 0; i < count; i++) {
      const p = patches[i % patches.length];
      homes.push({ x: p.x, z: p.z, r: p.r * rng.range(0.6, 1.2), ph: rng.range(0, 6.28), sp: rng.range(0.4, 0.9) });
      const c = new THREE.Color(palette[i % palette.length]);
      inst.setColorAt(i * 2, c);
      inst.setColorAt(i * 2 + 1, c);
    }
    this.butterflies = { inst, homes };
    this.group.add(inst);
  }

  update(time: number, dt: number, wind: { x: number; z: number; s: number }): void {
    windUniforms.uTime.value = time;
    windUniforms.uWind.value += (wind.s - windUniforms.uWind.value) * Math.min(1, dt * 2);
    windUniforms.uWindDir.value.lerp(new THREE.Vector2(wind.x, wind.z), Math.min(1, dt * 2)).normalize();
    const st = this.streaks;
    if (st) {
      st.mat.opacity = Math.max(0, (windUniforms.uWind.value - 0.15) * 0.55);
      const [hw, hd] = [this.f.w / 2 + 4, this.f.d / 2 + 4];
      // The streak's long side (its x) points along the wind.
      const ang = Math.atan2(-wind.z, wind.x);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0));
      st.pts.forEach((p, i) => {
        const v = 5 + windUniforms.uWind.value * 9;
        p.x += wind.x * v * dt;
        p.z += wind.z * v * dt;
        // Wrap round the field.
        if (p.x > hw) p.x -= hw * 2;
        if (p.x < -hw) p.x += hw * 2;
        if (p.z > hd) p.z -= hd * 2;
        if (p.z < -hd) p.z += hd * 2;
        const len = 0.4 + 0.6 * (Math.sin(time * 1.3 + p.ph) * 0.5 + 0.5);
        this.m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(len, 1, 1));
        st.inst.setMatrixAt(i, this.m);
      });
      st.inst.instanceMatrix.needsUpdate = true;
    }
    for (const c of this.clouds) {
      c.position.x += wind.x * (1 + wind.s * 3) * dt * 0.5;
      c.position.z += wind.z * (1 + wind.s * 3) * dt * 0.5;
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 110) c.position.x = -110;
      if (c.position.x < -110) c.position.x = 110;
      if (c.position.z > 60) c.position.z = -100;
      if (c.position.z < -100) c.position.z = 60;
    }
    const b = this.butterflies;
    if (!b) return;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    b.homes.forEach((h, i) => {
      const t = time * h.sp + h.ph;
      const x = h.x + Math.cos(t) * h.r + Math.sin(t * 2.3) * 0.6;
      const z = h.z + Math.sin(t * 1.3) * h.r;
      const y = 0.7 + Math.sin(t * 3.1) * 0.25;
      const heading = Math.atan2(-Math.sin(t) * h.r, Math.cos(t * 1.3) * h.r * 1.3);
      const flap = Math.sin(time * 14 + h.ph) * 0.7;
      for (const side of [-1, 1]) {
        e.set(0, heading, side * (0.3 + flap));
        q.setFromEuler(e);
        // Each wing is hinged at the body (x = 0); the left one is the mirror image.
        this.m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(side, 1, 1));
        b.inst.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), this.m);
      }
    });
    b.inst.instanceMatrix.needsUpdate = true;
  }
}
