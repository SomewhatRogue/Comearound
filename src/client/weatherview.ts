/**
 * Rain and storms on screen: the light dims and cools, rain falls around the camera, puddle-dark
 * fog closes in; in a storm each strike is a bolt from the sky, a white flash, and a moment later
 * the thunder (louder the closer it hit).
 */
import * as THREE from 'three';
import type { PublicView } from '../shared/protocol';
import type { Stage } from './scene';
import { sfx } from './sfx';
import { cloudAt } from './windshader';

const CLEAR = { sky: new THREE.Color('#a9cbe0'), hemi: 1.7, sun: 2.3, fogNear: 45, fogFar: 95 };
const RAIN = { sky: new THREE.Color('#8496a6'), hemi: 1.15, sun: 0.9, fogNear: 28, fogFar: 75 };
const STORM = { sky: new THREE.Color('#5d6878'), hemi: 0.85, sun: 0.45, fogNear: 22, fogFar: 65 };

export class WeatherView {
  private rain: THREE.InstancedMesh;
  private drops: { x: number; y: number; z: number; v: number }[] = [];
  private mix = 0;
  private storm = 0;
  private flashes = -1;
  private flashT = 0;
  private bolt: THREE.Mesh | null = null;
  private m = new THREE.Matrix4();
  private rainSound: { stop: () => void; setLevel: (v: number) => void } | null = null;

  constructor(private stage: Stage, lowfx: boolean) {
    const n = lowfx ? 300 : 900;
    const geo = new THREE.BoxGeometry(0.02, 0.45, 0.02);
    this.rain = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#dfe9f3', transparent: true, opacity: 0.5, depthWrite: false }), n);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    for (let i = 0; i < n; i++) this.drops.push({ x: Math.random() * 60 - 30, y: Math.random() * 11, z: Math.random() * 50 - 25, v: 14 + Math.random() * 5 });
    stage.scene.add(this.rain);
  }

  private shade = 0;

  /** How hard it's raining on screen (0 dry, 1 pouring), eased in and out with the sky. */
  get wet(): number {
    return this.mix;
  }

  update(pub: PublicView, focus: { x: number; z: number }, dt: number): void {
    const kind = pub.phase === 'lobby' ? 'clear' : pub.weather.kind;
    const wantRain = kind === 'clear' ? 0 : 1;
    const wantStorm = kind === 'storm' ? 1 : 0;
    this.mix += (wantRain - this.mix) * Math.min(1, dt * 1.5);
    this.storm += (wantStorm - this.storm) * Math.min(1, dt * 1.5);
    const target = { sky: CLEAR.sky.clone().lerp(RAIN.sky, this.mix).lerp(STORM.sky, this.storm), hemi: lerp(lerp(CLEAR.hemi, RAIN.hemi, this.mix), STORM.hemi, this.storm), sun: lerp(lerp(CLEAR.sun, RAIN.sun, this.mix), STORM.sun, this.storm) };

    // Lightning: a flash, a bolt, then thunder after a gap that grows with distance.
    if (this.flashes < 0) this.flashes = pub.weather.flashes;
    if (pub.weather.flashes > this.flashes && pub.phase === 'playing') {
      this.flashT = 0.6;
      this.strike(pub.weather.fx, pub.weather.fz);
      const d = Math.hypot(pub.weather.fx - focus.x, pub.weather.fz - focus.z);
      sfx.thunder(Math.max(0.35, 1 - d / 60), Math.min(1.4, 0.15 + d / 40));
      const el = document.getElementById('flash');
      if (el) {
        el.classList.remove('play');
        void el.offsetWidth;
        el.classList.add('play');
      }
    }
    this.flashes = pub.weather.flashes;
    this.flashT = Math.max(0, this.flashT - dt);
    // Lightning: one bright flash fading out, with a softer flicker after it (not a strobe).
    const ft = 1 - this.flashT / 0.6;
    const flash = this.flashT > 0 ? (ft < 0.25 ? 2.4 * (1 - ft / 0.25) : 0) + (ft > 0.4 && ft < 0.6 ? 0.9 * Math.sin(((ft - 0.4) / 0.2) * Math.PI) : 0) : 0;

    const bg = this.stage.scene.background as THREE.Color;
    bg.copy(target.sky);
    const fog = this.stage.scene.fog as THREE.Fog;
    fog.color.copy(target.sky);
    fog.near = lerp(CLEAR.fogNear, RAIN.fogNear, this.mix) * (1 - 0.2 * this.storm);
    fog.far = lerp(CLEAR.fogFar, RAIN.fogFar, this.mix) * (1 - 0.1 * this.storm);
    // A cloud passing over you dims the sun for a while (its shadow drifts over the ground too).
    this.shade += (cloudAt(focus.x, focus.z) - this.shade) * Math.min(1, dt * 0.35);
    this.stage.hemi.intensity = target.hemi * (1 - 0.08 * this.shade) + flash;
    this.stage.sun.intensity = target.sun * (1 - 0.3 * this.shade) + flash * 0.5;
    if (this.bolt) {
      (this.bolt.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.flashT * 3);
      if (this.flashT <= 0) {
        this.stage.scene.remove(this.bolt);
        this.bolt.geometry.dispose();
        this.bolt = null;
      }
    }

    // Rain falls in a box round where the camera is looking, slanting with the wind.
    this.rain.visible = this.mix > 0.05;
    (this.rain.material as THREE.MeshBasicMaterial).opacity = 0.5 * this.mix;
    if (this.rain.visible) {
      const slant = new THREE.Quaternion().setFromEuler(new THREE.Euler(pub.wind.z * pub.wind.s * 0.5, 0, -pub.wind.x * pub.wind.s * 0.5));
      this.drops.forEach((p, i) => {
        p.y -= p.v * dt;
        p.x += pub.wind.x * pub.wind.s * 6 * dt;
        p.z += pub.wind.z * pub.wind.s * 6 * dt;
        if (p.y < 0) {
          p.y += 11;
          p.x = focus.x + Math.random() * 60 - 30;
          p.z = focus.z + Math.random() * 50 - 30;
        }
        this.m.compose(new THREE.Vector3(p.x, p.y, p.z), slant, new THREE.Vector3(1, 1, 1));
        this.rain.setMatrixAt(i, this.m);
      });
      this.rain.instanceMatrix.needsUpdate = true;
    }
    // The sound of rain on grass.
    if (this.mix > 0.05 && !this.rainSound) this.rainSound = sfx.rainLoop();
    this.rainSound?.setLevel(this.mix * (0.6 + 0.4 * this.storm));
    if (this.mix <= 0.05 && this.rainSound) {
      this.rainSound.stop();
      this.rainSound = null;
    }
  }

  /** A jagged bolt from the clouds to the ground. */
  private strike(x: number, z: number): void {
    const pts: THREE.Vector3[] = [];
    let [px, pz] = [x + (Math.random() - 0.5) * 6, z - 6];
    for (let y = 40; y > 0; y -= 4) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (Math.random() - 0.5) * 2.4 + (x - px) * 0.25;
      pz += (Math.random() - 0.5) * 2.4 + (z - pz) * 0.25;
    }
    pts.push(new THREE.Vector3(x, 0, z));
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.18, 4, false);
    if (this.bolt) {
      this.stage.scene.remove(this.bolt);
      this.bolt.geometry.dispose();
    }
    this.bolt = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#f6f8ff', transparent: true, opacity: 1 }));
    this.stage.scene.add(this.bolt);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
