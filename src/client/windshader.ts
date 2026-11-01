/**
 * The air over the field, in the shaders: gusts you can see rolling downwind through the grass
 * and flowers (tips bending and catching the light as a band passes), and soft cloud shadows
 * drifting over the ground. One set of uniforms (clock, wind) shared by every material here.
 * `cloudAt` is the same cloud pattern on the CPU, so the sunlight can dim when one passes over you.
 */
import * as THREE from 'three';

/**
 * Shared by every swaying material: the clock, the wind, and how far the gusts and the clouds have
 * travelled. The travel is added up a frame at a time (`advanceAir`), never worked out as clock times
 * speed, so when a gusty wind changes strength or direction the pattern only changes speed: it
 * never jumps (that jump was the strobing).
 */
export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uGust: { value: 0 },
  uCloud: { value: new THREE.Vector2(0, 0) },
};

/** Move the gusts and the clouds on by this frame's worth of (gently smoothed) wind. */
export function advanceAir(dt: number, wind: { x: number; z: number; s: number }): void {
  const u = windUniforms;
  // The look of the wind follows the real wind slowly, so gusts swell and fade rather than flicker.
  u.uWind.value += (wind.s - u.uWind.value) * Math.min(1, dt * 0.6);
  const len = Math.hypot(wind.x, wind.z) || 1;
  u.uWindDir.value.lerp(new THREE.Vector2(wind.x / len, wind.z / len), Math.min(1, dt * 0.4)).normalize();
  u.uGust.value += dt * (1.6 + u.uWind.value * 1.6);
  const cloudSpeed = 0.9 + u.uWind.value * 1.4;
  u.uCloud.value.x += (u.uWindDir.value.x * cloudSpeed + 0.25) * dt;
  u.uCloud.value.y += u.uWindDir.value.y * cloudSpeed * dt;
}

const GLSL = `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform float uGust;
uniform vec2 uCloud;
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
  float wob = cbNoise(vec2(across * 0.05, uTime * 0.02)) * 5.0;
  float s = sin((along - uGust) * 0.26 + wob);
  return pow(max(s, 0.0), 4.0) * (0.4 + 0.6 * cbNoise(vec2(across * 0.08, (along - uGust) * 0.03)));
}
// Cloud shadows: big soft shapes drifting with the wind.
float cbCloud(vec2 xz) {
  vec2 p = (xz - uCloud) * 0.032;
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
      float wave = sin(uTime * 1.4 - dot(mvPosition.xz, uWindDir) * 0.35 + mvPosition.x * 0.11) * 0.5 + 0.5;
      float flutter = sin(uTime * 5.0 + mvPosition.x * 3.1 + mvPosition.z * 2.3) * 0.08;
      float gust = cbGust(mvPosition.xz);
      mvPosition.xz += uWindDir * (uWind * (0.35 + wave * 0.7) + flutter * (0.25 + uWind * 0.6) + gust * (0.7 + breeze * 1.0)) * h * 0.75;
      mvPosition.y -= gust * h * h * 0.5;
      vCbXZ = mvPosition.xz;
      vGust = gust * min(h * 5.0, 1.0);
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = `${GLSL}\nvarying vec2 vCbXZ;\nvarying float vGust;\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - 0.2 * cbCloud(vCbXZ);
      diffuseColor.rgb += vec3(0.07, 0.07, 0.04) * vGust;`);
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
      diffuseColor.rgb += vec3(0.045, 0.05, 0.02) * cbGust(vCbXZ);`);
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
  const o = windUniforms.uCloud.value;
  const px = (x - o.x) * 0.032;
  const pz = (z - o.y) * 0.032;
  const c = noise(px, pz) * 0.65 + noise(px * 2.1 + 3.7, pz * 2.1 + 3.7) * 0.35;
  const s = Math.max(0, Math.min(1, (c - 0.56) / 0.18));
  return s * s * (3 - 2 * s);
}
