/**
 * The lobby pack, drawn: what dogs standing in the row get up to while they wait (looking about,
 * sitting, lying down, a play bow), the hearts and wiggle when someone pats one, and the little
 * poof when a dog changes its outfit. All cosmetic, in each player's own browser.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { label } from './scene';
import { sfx } from './sfx';

/** What a waiting dog is doing, and its moods. */
export interface Idle { act: 'stand' | 'sit' | 'lie' | 'bow'; until: number; glance: number; glanceAt: number; happy: number; poof: number }

export const newIdle = (): Idle => ({ act: 'stand', until: 1 + Math.random() * 3, glance: 0, glanceAt: 0, happy: 0, poof: 0 });

/** Pick the next thing to do now and then: mostly standing about, sometimes sitting or lying down, now and then a play bow. */
export function tickIdle(i: Idle, time: number): void {
  if (time > i.glanceAt) {
    i.glance = Math.random() < 0.35 ? 0 : (Math.random() - 0.5) * 1.3;
    i.glanceAt = time + 1.2 + Math.random() * 2.5;
  }
  if (time < i.until) return;
  const r = Math.random();
  i.act = r < 0.42 ? 'stand' : r < 0.72 ? 'sit' : r < 0.9 ? 'lie' : 'bow';
  i.until = time + (i.act === 'bow' ? 1.4 : 3 + Math.random() * 5);
}

/** Hearts rising off a dog that just got a pat. */
export class Hearts {
  private live: { o: CSS2DObject; t: number; vx: number }[] = [];

  /** Hearts on the dog itself (like its name tag), so they rise from it wherever it is. */
  burst(dog: THREE.Object3D, size: number): void {
    for (let k = 0; k < 3; k++) {
      const o = label('♥', 'heart');
      o.position.set((k - 1) * 0.22, 0.7 + size * 0.45, 0);
      dog.add(o);
      this.live.push({ o, t: -k * 0.12, vx: (k - 1) * 0.15 });
    }
  }

  tick(dt: number): void {
    for (const h of this.live) {
      h.t += dt;
      if (h.t < 0) {
        h.o.element.style.opacity = '0';
        continue;
      }
      h.o.position.y += dt * 1.1;
      h.o.position.x += h.vx * dt;
      h.o.element.style.opacity = String(Math.max(0, 1 - h.t / 1.3));
      h.o.element.style.scale = String(0.7 + Math.min(0.5, h.t * 1.2));
    }
    for (const h of this.live.filter((q) => q.t > 1.3)) {
      h.o.removeFromParent();
      h.o.element.remove();
    }
    this.live = this.live.filter((q) => q.t <= 1.3);
  }
}

/** A pat: a happy yip, pitched to the dog. */
export function patSound(pitch: number, near: boolean): void {
  sfx.woof(pitch * 1.35, near ? 0.3 : 0.15);
  sfx.chime(near ? 7 : 4);
}

/** The dog nearest a tap on screen, if the tap was close enough to count. */
export function pickDog(dogs: Map<string, THREE.Vector3>, camera: THREE.Camera, canvas: HTMLCanvasElement, x: number, y: number): string | null {
  const rect = canvas.getBoundingClientRect();
  let best: string | null = null;
  let bestD = 64;
  const v = new THREE.Vector3();
  for (const [id, p] of dogs) {
    v.set(p.x, 0.55, p.z).project(camera);
    if (v.z > 1) continue;
    const sx = rect.left + ((v.x + 1) / 2) * rect.width;
    const sy = rect.top + ((1 - v.y) / 2) * rect.height;
    const d = Math.hypot(sx - x, sy - y);
    if (d < bestD) [best, bestD] = [id, d];
  }
  return best;
}
