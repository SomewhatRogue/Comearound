/**
 * Keeps the 3D world in step with server snapshots: players, loose and placed items, the goat.
 * Positions ease toward the latest snapshot; the local player is predicted from input.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { itemById } from '../shared/catalog';
import type { PublicView } from '../shared/protocol';
import { goatMesh, itemMesh, playerMesh } from './models';
import { label, type Stage } from './scene';

interface PlayerView { root: THREE.Group; tag: CSS2DObject; sign: CSS2DObject; held: THREE.Object3D | null; heldId: string | null; key: string; facing: number; phase: number }

export class Entities {
  private players = new Map<string, PlayerView>();
  private items = new Map<number, { obj: THREE.Object3D; id: string }>();
  private goat = goatMesh();
  /** Smoothed render positions, readable by the HUD for pops and prompts. */
  readonly pos = new Map<string, THREE.Vector3>();

  constructor(private stage: Stage) {
    stage.scene.add(this.goat);
  }

  sync(pub: PublicView, you: string, predicted: THREE.Vector3 | null, dt: number, time: number): void {
    const k = 1 - Math.exp(-dt * 14);
    const seen = new Set<string>();
    for (const p of pub.players) {
      seen.add(p.id);
      const key = `${p.look.color}|${p.look.hat}|${p.look.name}`;
      let v = this.players.get(p.id);
      if (v && v.key !== key) {
        this.remove(p.id);
        v = undefined;
      }
      if (!v) {
        const root = playerMesh(p.look.color, p.look.hat);
        const tag = label(p.look.name, p.id === you ? 'name-tag you' : 'name-tag');
        tag.position.y = 2.25;
        const sign = label('', 'pen-sign');
        sign.position.y = 2.75;
        root.add(tag, sign);
        root.position.set(p.x, 0, p.z);
        this.stage.scene.add(root);
        v = { root, tag, sign, held: null, heldId: null, key, facing: 0, phase: 0 };
        this.players.set(p.id, v);
      }
      const target = p.id === you && predicted ? predicted : new THREE.Vector3(p.x, 0, p.z);
      const before = v.root.position.clone();
      v.root.position.lerp(target, p.id === you && predicted ? 1 : k);
      const moved = v.root.position.clone().sub(before);
      const speed = moved.length() / Math.max(dt, 1e-3);
      if (speed > 0.3) v.facing = Math.atan2(moved.x, moved.z);
      v.root.rotation.y += angleDiff(v.root.rotation.y, v.facing) * k;
      // Walk bob with a little squash and stretch.
      v.phase += dt * (speed > 0.3 ? 14 : 3);
      const body = v.root.getObjectByName('body')!;
      const bob = speed > 0.3 ? Math.abs(Math.sin(v.phase)) * 0.12 : Math.sin(v.phase) * 0.015;
      body.position.y = bob;
      body.scale.set(1 + bob * 0.4, 1 - bob * 0.4, 1 + bob * 0.4);
      const spin = v.root.getObjectByName('spin');
      if (spin) spin.rotation.y = time * 12;
      v.root.visible = !p.spectator;
      v.tag.element.classList.toggle('away', !p.connected);
      v.sign.element.textContent = p.sign ?? '';
      v.sign.element.style.display = p.sign ? '' : 'none';
      if (v.heldId !== p.carrying) {
        if (v.held) v.root.remove(v.held);
        v.held = p.carrying ? itemMesh(itemById.get(p.carrying)!) : null;
        if (v.held) {
          v.held.position.y = 1.85;
          v.held.scale.setScalar(1.3);
          v.root.add(v.held);
        }
        v.heldId = p.carrying;
      }
      if (v.held) v.held.rotation.y = time * 2;
      this.pos.set(p.id, v.root.position);
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.remove(id);
    this.syncItems(pub, time, k);
    this.syncGoat(pub, k, time);
  }

  private syncItems(pub: PublicView, time: number, k: number): void {
    const seen = new Set<number>();
    const slot = new Map<string, number>();
    for (const it of pub.items) {
      seen.add(it.uid);
      let v = this.items.get(it.uid);
      if (!v) {
        v = { obj: itemMesh(itemById.get(it.id)!), id: it.id };
        v.obj.position.set(it.x, 0, it.z);
        this.stage.scene.add(v.obj);
        this.items.set(it.uid, v);
      }
      let want: THREE.Vector3;
      if (it.station) {
        const n = slot.get(it.station) ?? 0;
        slot.set(it.station, n + 1);
        const top = this.stage.stationTops.get(it.station)!;
        const a = (n / 4) * Math.PI * 2 + 0.6;
        want = new THREE.Vector3(top.x + Math.cos(a) * 0.4, top.y, top.z + Math.sin(a) * 0.4);
      } else {
        // Loose items bob gently so they read as grabbable.
        want = new THREE.Vector3(it.x, 0.06 + Math.sin(time * 2.4 + it.uid) * 0.05, it.z);
        v.obj.rotation.y = time * 0.8 + it.uid;
      }
      v.obj.position.lerp(want, k);
    }
    for (const [uid, v] of this.items) if (!seen.has(uid)) {
      this.stage.scene.remove(v.obj);
      this.items.delete(uid);
    }
  }

  private syncGoat(pub: PublicView, k: number, time: number): void {
    const g = pub.goat;
    const before = this.goat.position.clone();
    this.goat.position.lerp(new THREE.Vector3(g.x, 0, g.z), k);
    const d = this.goat.position.clone().sub(before);
    let face = this.goat.rotation.y;
    if (g.mood === 'stare' && g.target) {
      const t = this.pos.get(g.target);
      if (t) face = Math.atan2(t.x - this.goat.position.x, t.z - this.goat.position.z);
    } else if (d.length() > 0.005) face = Math.atan2(d.x, d.z);
    this.goat.rotation.y += angleDiff(this.goat.rotation.y, face) * k;
    const head = this.goat.getObjectByName('head')!;
    head.rotation.x = g.mood === 'eat' ? 0.6 : g.mood === 'stare' ? -0.15 + Math.sin(time * 0.7) * 0.03 : Math.sin(time * 3) * 0.08;
  }

  private remove(id: string): void {
    const v = this.players.get(id);
    if (!v) return;
    v.tag.element.remove();
    v.sign.element.remove();
    this.stage.scene.remove(v.root);
    this.players.delete(id);
    this.pos.delete(id);
  }
}

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
