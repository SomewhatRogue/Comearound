/**
 * The air over the field, in the shaders: gusts you can see rolling downwind through the grass
 * and flowers (tips bending and catching the light as a band passes), and soft cloud shadows
 * drifting over the ground. One set of uniforms (clock, wind) shared by every material here.
 * `cloudAt` is the same cloud pattern on the CPU, so the sunlight can dim when one passes over you.
 */
import * as THREE from 'three';

/** Shared by every swaying material: the clock and the wind. */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) } };

const GLSL = `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
float cbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cbNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cbHash(i), cbHash(i + vec2(1.0, 0.0)), f.x), mix(cbHash(i + vec2(0.0, 1.0)), cbHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Gusts: soft ridges travelling downwind, wobbling along their length, stronger in places.
float cbGust(vec2 xz) {
  vec2 d = normalize(uWindDir);
  vec2 n = vec2(-d.y, d.x);
  float along = dot(xz, d);
  float across = dot(xz, n);
  float wob = cbNoise(vec2(across * 0.06, uTime * 0.05)) * 6.0;
  float s = sin((along - uTime * (2.4 + uWind * 3.0)) * 0.3 + wob);
  return pow(max(s, 0.0), 6.0) * (0.45 + 0.55 * cbNoise(vec2(across * 0.09, along * 0.03 - uTime * 0.1)));
}
// Cloud shadows: big soft shapes drifting with the wind.
float cbCloud(vec2 xz) {
  vec2 drift = normalize(uWindDir) * uTime * (1.2 + uWind * 2.5) + vec2(uTime * 0.35, 0.0);
  vec2 p = (xz - drift) * 0.032;
  float c = cbNoise(p) * 0.65 + cbNoise(p * 2.1 + 3.7) * 0.35;
  return smoothstep(0.56, 0.74, c);
}
`;

/**
 * A material whose vertices sway in the wind, more the higher they are above the ground they grow
 * from (instances carry their ground height in `aGround`), with gust bands rolling through and
 * cloud shadows passing over.
 */
export function swaying(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = `${GLSL}\nattribute float aGround;\nvarying vec2 vCbXZ;\nvarying float vGust;\n` + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float h = max(mvPosition.y - aGround, 0.0);
      float breeze = max(uWind, 0.12);
      float wave = sin(uTime * 2.2 - dot(mvPosition.xz, uWindDir) * 0.5 + mvPosition.x * 0.13) * 0.5 + 0.5;
      float flutter = sin(uTime * 7.0 + mvPosition.x * 3.1 + mvPosition.z * 2.3) * 0.12;
      float gust = cbGust(mvPosition.xz);
      mvPosition.xz += uWindDir * (uWind * (0.3 + wave * 1.1) + flutter * (0.25 + uWind) + gust * (0.9 + breeze * 1.6)) * h * 0.75;
      mvPosition.y -= gust * h * h * 0.5;
      vCbXZ = mvPosition.xz;
      vGust = gust * min(h * 5.0, 1.0);
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = `${GLSL}\nvarying vec2 vCbXZ;\nvarying float vGust;\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - 0.2 * cbCloud(vCbXZ);
      diffuseColor.rgb += vec3(0.11, 0.11, 0.06) * vGust;`);
  };
  return m;
}

/** The ground: a faint sheen where a gust passes over the grass, and the cloud shadows. */
export function groundMaterial(extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, ...extra });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = `varying vec2 vCbXZ;\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vCbXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    sh.fragmentShader = `${GLSL}\nvarying vec2 vCbXZ;\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - 0.24 * cbCloud(vCbXZ);
      diffuseColor.rgb += vec3(0.08, 0.09, 0.03) * cbGust(vCbXZ);`);
  };
  return m;
}

/** Give an instanced mesh the ground height under each instance (its own copy of the geometry). */
export function setGround(inst: THREE.InstancedMesh, grounds: number[]): void {
  inst.geometry = inst.geometry.clone();
  inst.geometry.setAttribute('aGround', new THREE.InstancedBufferAttribute(new Float32Array(grounds.length ? grounds : [0]), 1));
}

// The same cloud pattern on the CPU (close enough), so the sun can dim as a cloud passes over.
const fract = (v: number) => v - Math.floor(v);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number): number {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  let [fx, fy] = [x - ix, y - iy];
  [fx, fy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
  return a + (b - a) * fy;
}
export function cloudAt(x: number, z: number): number {
  const t = windUniforms.uTime.value;
  const w = windUniforms.uWind.value;
  const d = windUniforms.uWindDir.value;
  const len = Math.hypot(d.x, d.y) || 1;
  const px = (x - ((d.x / len) * t * (1.2 + w * 2.5) + t * 0.35)) * 0.032;
  const pz = (z - (d.y / len) * t * (1.2 + w * 2.5)) * 0.032;
  const c = noise(px, pz) * 0.65 + noise(px * 2.1 + 3.7, pz * 2.1 + 3.7) * 0.35;
  const s = Math.max(0, Math.min(1, (c - 0.56) / 0.18));
  return s * s * (3 - 2 * s);
}
