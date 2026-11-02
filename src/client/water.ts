/**
 * Water that answers back: rings spreading where a dog wades and where the rain falls, drawn by the
 * water's own shader so they never spill onto the grass. Ponds are one surface per field, shaped by
 * the shared shoreline (`pondSdf`): overlapping ponds join smoothly, with a muddy bank round the edge.
 * Cosmetic, each player's own: nothing here is decided by the room.
 */
import * as THREE from 'three';
import { POND_BLEND, inWater, pondSdf, waterSegments, type FieldDef, type Obstacle } from '../shared/field';
import { at, mesh } from './models';

const MAX = 48;
/** A colour for the shader, in the linear space it lights in (hex as you'd pick it). */
const lin = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};
const BANK = 0.4;

/** One ring: where, how far through its life (0..1), how big it grows; `two` adds a second ring behind. */
type Ripple = { x: number; z: number; t: number; life: number; size: number; two: boolean };

/** Every water material in the field reads these. */
const uniforms = { uRip: { value: Array.from({ length: MAX }, () => new THREE.Vector4(0, 0, 1, 0)) } };

const RIPPLE_GLSL = /* glsl */ `
#define CB_RIP ${MAX}
uniform vec4 uRip[CB_RIP];
varying vec3 vCbWorld;
float cbRipples(vec2 p) {
  float s = 0.0;
  for (int i = 0; i < CB_RIP; i++) {
    vec4 r = uRip[i];
    if (r.z >= 1.0) continue;
    float size = abs(r.w);
    float d = length(p - r.xy);
    if (d > size * 1.2 + 0.2) continue;
    float fade = (1.0 - r.z) * (1.0 - r.z);
    float rad = size * (0.12 + 0.88 * sqrt(r.z));
    float w = 0.035 + 0.03 * size;
    s += fade * exp(-pow((d - rad) / w, 2.0));
    // A wading dog's ripple has a fainter second ring inside the first.
    if (r.w > 0.0) {
      float rad2 = rad * 0.6;
      s += 0.5 * fade * exp(-pow((d - rad2) / w, 2.0));
    }
  }
  return min(s, 1.2);
}
`;

const RIPPLE_TINT = 'vec3(0.42, 0.46, 0.48) * cbRipples(vCbWorld.xz)';

/**
 * Ripples on any water material. Streams use it as it is (`own` false: ripples added on top);
 * ponds (`own` true) put the ripples into their own color line, on the water but not the bank.
 */
function patch(m: THREE.MeshStandardMaterial, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void, own = false): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRip = uniforms.uRip;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCbWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RIPPLE_GLSL}`)
      .replace('#include <color_fragment>', own ? '#include <color_fragment>' : `#include <color_fragment>\ndiffuseColor.rgb += ${RIPPLE_TINT};`);
    extra?.(shader);
  };
  // Three caches programs by this function's source, which ponds and streams share: keep them apart.
  m.customProgramCacheKey = () => (own ? 'cb-pond-water' : 'cb-stream-water');
  return m;
}

/** A stream's water, with ripples. */
export function streamWaterMaterial(): THREE.MeshStandardMaterial {
  return patch(new THREE.MeshStandardMaterial({ color: '#5aa2c8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
}

/** The field's ponds: one surface per group of touching ponds, water inside the shore, a bank round it. */
export function pondSurfaces(f: FieldDef, lowfx: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ponds';
  const ponds = f.obstacles.filter((o) => o.kind === 'pond');
  if (!ponds.length) return g;
  const list = ponds.map((o) => new THREE.Vector3(o.x, o.z, o.r));
  while (list.length < 12) list.push(new THREE.Vector3(9999, 9999, 0));
  const m = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.08 }), (shader) => {
    shader.uniforms.uPonds = { value: list.slice(0, 12) };
    shader.uniforms.uPondN = { value: Math.min(12, ponds.length) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uPonds[12];
uniform int uPondN;
float cbPond(vec2 p) {
  float d = 1e9;
  for (int i = 0; i < 12; i++) {
    if (i >= uPondN) break;
    float e = length(p - uPonds[i].xy) - uPonds[i].z;
    if (i == 0) d = e;
    else {
      float h = max(${POND_BLEND.toFixed(3)} - abs(d - e), 0.0) / ${POND_BLEND.toFixed(3)};
      d = min(d, e) - h * h * ${POND_BLEND.toFixed(3)} / 4.0;
    }
  }
  return d;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float cbD = cbPond(vCbWorld.xz);
if (cbD > ${BANK.toFixed(2)}) discard;
float cbBank = smoothstep(-0.03, 0.03, cbD);
vec3 cbDeep = ${lin('#4b93bb')};
vec3 cbShallow = ${lin('#6eb2c9')};
vec3 cbWater = mix(cbDeep, cbShallow, smoothstep(-1.4, 0.0, cbD));
// A wet, darker edge to the bank where it meets the water.
vec3 cbMud = mix(${lin('#5e4f35')}, ${lin('#8a7852')}, smoothstep(0.0, ${BANK.toFixed(2)}, cbD));
diffuseColor.rgb = mix(cbWater + ${RIPPLE_TINT}, cbMud, cbBank);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, cbBank);');
  }, true);
  for (const c of clusters(ponds)) {
    const [x0, x1] = [Math.min(...c.map((o) => o.x - o.r)) - BANK - 1, Math.max(...c.map((o) => o.x + o.r)) + BANK + 1];
    const [z0, z1] = [Math.min(...c.map((o) => o.z - o.r)) - BANK - 1, Math.max(...c.map((o) => o.z + o.r)) + BANK + 1];
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(-Math.PI / 2);
    const surface = new THREE.Mesh(geo, m);
    surface.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    surface.receiveShadow = true;
    surface.name = 'water';
    g.add(surface);
  }
  // Reeds along the real shore (not where one pond's circle runs through another's water), and lily pads.
  let seed = 0;
  for (const o of ponds) {
    seed += 1.7;
    const n = Math.round(o.r * 1.8) + (lowfx ? 0 : 2);
    for (let i = 0; i < n; i++) {
      const a = seed + (i / n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.25;
      const rr = o.r + 0.05 + Math.sin(i * 3.1) * 0.12;
      const [x, z] = [o.x + Math.cos(a) * rr, o.z + Math.sin(a) * rr];
      if (Math.abs(pondSdf(f, x, z)) > 0.3) continue;
      const reed = new THREE.Group();
      const h = 0.75 + Math.abs(Math.sin(i * 5.7)) * 0.4;
      reed.add(at(mesh(new THREE.CylinderGeometry(0.02, 0.025, h, 4), '#5d7a3a'), 0, h / 2, 0));
      reed.add(at(mesh(new THREE.CapsuleGeometry(0.045, 0.14, 2, 5), '#6b4226'), 0, h - 0.05, 0));
      reed.position.set(x, 0, z);
      reed.rotation.z = Math.sin(a * 3) * 0.15;
      reed.name = 'reed';
      g.add(reed);
    }
    for (let i = 0; i < Math.round(o.r); i++) {
      const a = seed * 2 + i * 2.3;
      const [x, z] = [o.x + Math.cos(a) * o.r * 0.55, o.z + Math.sin(a) * o.r * 0.55];
      if (pondSdf(f, x, z) > -0.5) continue;
      const pad = mesh(new THREE.CircleGeometry(0.22, 8, 0.4, Math.PI * 1.8), '#6aa04a', false);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.035, z);
      g.add(pad);
    }
  }
  return g;
}

/** Ponds that touch, grouped (each group is drawn as one surface). */
function clusters(ponds: Obstacle[]): Obstacle[][] {
  const out: Obstacle[][] = [];
  for (const o of ponds) {
    const near = out.filter((c) => c.some((q) => Math.hypot(q.x - o.x, q.z - o.z) < q.r + o.r + POND_BLEND + BANK * 2));
    const merged = [o, ...near.flat()];
    for (const c of near) out.splice(out.indexOf(c), 1);
    out.push(merged);
  }
  return out;
}

/** Where rain can land on this field's water: ponds by area, streams by length. */
function rainSpots(f: FieldDef): (rnd: () => number, near: { x: number; z: number }) => { x: number; z: number } | null {
  const ponds = f.obstacles.filter((o) => o.kind === 'pond');
  const segs = (f.streams ?? []).flatMap((s) => waterSegments(s).map((q) => ({ ...q, w: s.w })));
  const areas = [...ponds.map((o) => Math.PI * o.r * o.r), ...segs.map((q) => Math.hypot(q.bx - q.ax, q.bz - q.az) * q.w)];
  const total = areas.reduce((a, b) => a + b, 0);
  if (!total) return () => null;
  return (rnd, near) => {
    let pick = rnd() * total;
    let i = 0;
    while (i < areas.length - 1 && (pick -= areas[i]) > 0) i++;
    let x: number;
    let z: number;
    if (i < ponds.length) {
      const o = ponds[i];
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * o.r;
      [x, z] = [o.x + Math.cos(a) * r, o.z + Math.sin(a) * r];
      if (pondSdf(f, x, z) > -0.15) return null;
    } else {
      const q = segs[i - ponds.length];
      const t = rnd();
      const l = Math.hypot(q.bx - q.ax, q.bz - q.az) || 1;
      const off = (rnd() - 0.5) * (q.w - 0.3);
      [x, z] = [q.ax + (q.bx - q.ax) * t - ((q.bz - q.az) / l) * off, q.az + (q.bz - q.az) * t + ((q.bx - q.ax) / l) * off];
    }
    // Only where someone's looking.
    return Math.hypot(x - near.x, z - near.z) < 30 ? { x, z } : null;
  };
}

/** The ripples on one field: spawned by wading dogs and by rain, aged here, handed to the shaders. */
export class WaterFx {
  private ripples: Ripple[] = [];
  private wading = new Map<string, { x: number; z: number; moved: number; still: number; wet: boolean }>();
  private rainAcc = 0;
  private spot: ReturnType<typeof rainSpots>;
  private seed = 12345;

  constructor(private f: FieldDef, private lowfx: boolean) {
    this.spot = rainSpots(f);
    for (const v of uniforms.uRip.value) v.set(0, 0, 1, 0);
  }

  private rnd = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);

  private add(x: number, z: number, size: number, life: number, two: boolean): void {
    if (this.ripples.length >= MAX) this.ripples.shift();
    this.ripples.push({ x, z, t: 0, life, size, two });
  }

  /** `dogs`: where each dog is drawn; `wet`: how hard it's raining (0..1); `focus`: where the camera looks. */
  update(dt: number, dogs: Iterable<[string, { x: number; z: number }]>, wet: number, focus: { x: number; z: number }): void {
    const seen = new Set<string>();
    for (const [id, p] of dogs) {
      seen.add(id);
      const w = this.wading.get(id) ?? { x: p.x, z: p.z, moved: 0, still: 0, wet: false };
      const inside = inWater(this.f, p.x, p.z);
      const step = Math.hypot(p.x - w.x, p.z - w.z);
      if (inside) {
        // In with a splash, then rings every stride or so (closer together the faster you go).
        if (!w.wet) this.add(p.x, p.z, 1.5, 1.3, true);
        w.moved += step;
        const speed = step / Math.max(dt, 1e-3);
        if (w.moved > 0.55) {
          w.moved = 0;
          this.add(p.x, p.z, 0.9 + Math.min(speed, 8) * 0.07, 1.1, true);
        }
        // Standing in the water: a slow ring now and then.
        w.still = step < 0.01 ? w.still + dt : 0;
        if (w.still > 1.4) {
          w.still = 0;
          this.add(p.x, p.z, 0.7, 1.6, true);
        }
      } else w.moved = 0;
      Object.assign(w, { x: p.x, z: p.z, wet: inside });
      this.wading.set(id, w);
    }
    for (const id of [...this.wading.keys()]) if (!seen.has(id)) this.wading.delete(id);

    // Rain: little single rings all over the water near the camera.
    if (wet > 0.05) {
      this.rainAcc += dt * wet * (this.lowfx ? 14 : 30);
      while (this.rainAcc >= 1) {
        this.rainAcc -= 1;
        const s = this.spot(this.rnd, focus);
        if (s) this.add(s.x, s.z, -(0.22 + this.rnd() * 0.22), 0.7 + this.rnd() * 0.3, false);
      }
    }

    // Age them, and hand them to the shaders (rain rings have a negative size: one ring, not two).
    this.ripples = this.ripples.filter((r) => (r.t += dt / r.life) < 1);
    const v = uniforms.uRip.value;
    for (let i = 0; i < MAX; i++) {
      const r = this.ripples[i];
      if (r) v[i].set(r.x, r.z, r.t, r.two ? Math.abs(r.size) : -Math.abs(r.size));
      else v[i].set(0, 0, 1, 0);
    }
  }
}
