/**
 * One goat on screen: walks, turns to stare its victim down, lowers its horns in a gateway,
 * charges, and says what it's up to in a speech bubble. The patience meter over its head fills as
 * dogs annoy it.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { GoatPub, PublicView } from '../shared/protocol';
import { fieldById } from '../shared/field';
import { goatMesh } from './models';
import { heightAt } from './terrain';
import { label } from './scene';

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

const BUBBLE: Partial<Record<GoatPub['mood'], string>> = { bleat: 'MEHHH', coming: '!', stare: '...', block: 'NOPE', escape: 'bye!', stroll: 'hehe', charge: 'HUP HUP' };

export class GoatView {
  readonly rig: ReturnType<typeof goatMesh>;
  private tag: CSS2DObject;
  private bubble: CSS2DObject;
  private facing: number;
  private phase = 0;
  private last: { x: number; z: number };
  bleats: number;

  constructor(scene: THREE.Scene, g: GoatPub) {
    this.rig = goatMesh(g.id);
    this.rig.root.position.set(g.x, 0, g.z);
    this.facing = g.rot;
    this.last = { x: g.x, z: g.z };
    this.bleats = g.bleats;
    this.tag = label('', 'goat-meter');
    this.tag.position.y = 2.0;
    this.bubble = label('', 'goat-bubble');
    this.bubble.position.y = 2.5;
    this.rig.root.add(this.tag, this.bubble);
    scene.add(this.rig.root);
  }

  /** Returns true when it just bleated. */
  sync(g: GoatPub, pub: PublicView, dt: number, k: number, time: number): boolean {
    const root = this.rig.root;
    root.position.x += (g.x - root.position.x) * k;
    root.position.z += (g.z - root.position.z) * k;
    const speed = Math.hypot(root.position.x - this.last.x, root.position.z - this.last.z) / Math.max(dt, 1e-3);
    [this.last.x, this.last.z] = [root.position.x, root.position.z];
    // Staring: turn to face the victim, whatever it was doing.
    let face = g.rot;
    const victim = g.target ? pub.dogs.find((d) => d.id === g.target) : null;
    if (victim && (g.mood === 'stare' || g.mood === 'coming')) face = Math.atan2(victim.x - g.x, victim.z - g.z);
    this.facing = lerpAngle(this.facing, face, 1 - Math.exp(-dt * 6));
    root.rotation.y = this.facing;
    this.phase += dt * Math.min(speed, 6) * 3;
    const amp = Math.min(0.6, speed * 0.15);
    this.rig.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp));
    // Bleating: head up. Staring: dead still. Blocking or charging: horns down.
    const head = g.mood === 'bleat' ? -0.5 : g.mood === 'stare' ? 0.15 + Math.sin(time * 2) * 0.02 : g.mood === 'block' ? 0.55 + Math.sin(time * 3) * 0.05 : g.mood === 'charge' ? 0.7 : 0.25;
    this.rig.head.rotation.x += (head - this.rig.head.rotation.x) * Math.min(1, dt * 10);
    // A charging goat bounds.
    root.position.y = heightAt(fieldById(pub.fieldId), root.position.x, root.position.z) + (g.mood === 'charge' ? Math.abs(Math.sin(this.phase)) * 0.18 : 0);
    const el = this.tag.element;
    el.style.setProperty('--annoy', String(g.annoy));
    el.classList.toggle('hot', g.annoy > 0.6);
    el.style.opacity = g.annoy > 0.05 || g.mood === 'coming' ? '1' : '0';
    const text = BUBBLE[g.mood] ?? '';
    this.bubble.element.textContent = text;
    this.bubble.element.style.display = text ? '' : 'none';
    const bleated = g.bleats > this.bleats;
    this.bleats = g.bleats;
    return bleated;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
    this.tag.element.remove();
    this.bubble.element.remove();
  }
}
