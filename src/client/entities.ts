/**
 * Keeps the 3D world in step with server snapshots: players (with what they are doing and what
 * they just caught, for everyone to see), the goat, and the Pen's snowballs and crows.
 * Positions ease toward the latest snapshot; the local player is predicted from input.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { describe, type ActId } from '../shared/activities';
import { PEN_TARGETS, SPOTS } from '../shared/map';
import type { PublicView } from '../shared/protocol';
import { crowMesh, goatMesh, playerMesh } from './models';
import { label, type Stage } from './scene';

const DOING: Record<ActId, string> = { fish: 'fishing...', fruit: 'picking...', bake: 'baking...', candle: 'lighting...', archery: 'aiming...', paint: 'painting...' };
/** Swatch colours for catch labels, so "yellow" reads as yellow at a glance. */
export const SWATCH: Record<string, string> = {
  yellow: '#f5c53d', blue: '#4f86c6', red: '#d8433a', white: '#f4f1ea', purple: '#8e5bb5', gold: '#e0a92e', green: '#5aa646',
  apple: '#d8433a', pear: '#c4cf52', plum: '#7a3b78', golden: '#e8b04a', burnt: '#4a3226',
};

interface PlayerView { root: THREE.Group; tag: CSS2DObject; sign: CSS2DObject; act: CSS2DObject; key: string; facing: number; phase: number; seq: number; shownUntil: number }

export class Entities {
  private players = new Map<string, PlayerView>();
  private goat = goatMesh();
  /** Smoothed render positions, readable by the HUD for pops and prompts. */
  readonly pos = new Map<string, THREE.Vector3>();
  private snowballs = new Map<number, THREE.Mesh>();
  private crows: THREE.Group[] = [];
  private snowGeo = new THREE.SphereGeometry(0.16, 10, 8);
  private snowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });

  constructor(private stage: Stage) {
    stage.scene.add(this.goat);
    for (const t of PEN_TARGETS) {
      const crow = crowMesh();
      crow.position.set(t.x, 0, t.z);
      stage.scene.add(crow);
      this.crows.push(crow);
    }
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
        const act = label('', 'act-tag');
        act.position.y = 2.95;
        root.add(tag, sign, act);
        root.position.set(p.x, 0, p.z);
        this.stage.scene.add(root);
        v = { root, tag, sign, act, key, facing: 0, phase: 0, seq: 0, shownUntil: 0 };
        this.players.set(p.id, v);
      }
      const target = p.id === you && predicted && !p.doing ? predicted : new THREE.Vector3(p.x, 0, p.z);
      const before = v.root.position.clone();
      v.root.position.lerp(target, p.id === you && predicted && !p.doing ? 1 : k);
      const moved = v.root.position.clone().sub(before);
      const speed = moved.length() / Math.max(dt, 1e-3);
      if (p.doing) {
        // Face the thing you are using: the water, the tree, the oven, the target, the easel.
        const s = SPOTS.find((sp) => Math.hypot(sp.x - p.x, sp.z - p.z) < 0.3);
        if (s) v.facing = Math.atan2(s.px - s.x, s.pz - s.z);
      } else if (speed > 0.3) v.facing = Math.atan2(moved.x, moved.z);
      v.root.rotation.y += angleDiff(v.root.rotation.y, v.facing) * k;
      v.phase += dt * (speed > 0.3 ? 14 : p.doing ? 8 : 3);
      const body = v.root.getObjectByName('body')!;
      const bob = speed > 0.3 ? Math.abs(Math.sin(v.phase)) * 0.12 : Math.sin(v.phase) * (p.doing ? 0.04 : 0.015);
      body.position.y = bob;
      body.scale.set(1 + bob * 0.4, 1 - bob * 0.4, 1 + bob * 0.4);
      const spin = v.root.getObjectByName('spin');
      if (spin) spin.rotation.y = time * 12;
      v.root.visible = !p.spectator;
      v.tag.element.classList.toggle('away', !p.connected);
      v.sign.element.textContent = p.sign ?? '';
      this.syncActTag(v, p, time);
      this.pos.set(p.id, v.root.position);
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.remove(id);
    this.syncGoat(pub, k, time);
    this.syncPen(pub, k);
  }

  /** Above each head: what they are doing now, or what they just caught (everyone sees this). */
  private syncActTag(v: PlayerView, p: PublicView['players'][number], time: number): void {
    const el = v.act.element;
    if (p.last && p.last.seq !== v.seq) {
      v.seq = p.last.seq;
      v.shownUntil = time + 2.8;
      if (p.last.attrs) {
        const chips = Object.values(p.last.attrs).filter((x) => SWATCH[x]).map((x) => `<i style="background:${SWATCH[x]}"></i>`).join('');
        el.innerHTML = `${chips}<span>${describe(p.last.act, p.last.attrs)}</span>`;
        el.className = 'act-tag got';
      } else {
        el.innerHTML = '<span>missed!</span>';
        el.className = 'act-tag miss';
      }
    } else if (p.doing && time > v.shownUntil) {
      el.innerHTML = `<span>${DOING[p.doing]}</span>`;
      el.className = 'act-tag doing';
    } else if (!p.doing && time > v.shownUntil) el.className = 'act-tag';
  }

  private syncGoat(pub: PublicView, k: number, time: number): void {
    const g = pub.goat;
    const before = this.goat.position.clone();
    this.goat.position.lerp(new THREE.Vector3(g.x, 0, g.z), k);
    const d = this.goat.position.clone().sub(before);
    let face = this.goat.rotation.y;
    if ((g.mood === 'stare' || g.mood === 'pester') && g.target) {
      const t = this.pos.get(g.target);
      if (t && (g.mood === 'stare' || d.length() < 0.005)) face = Math.atan2(t.x - this.goat.position.x, t.z - this.goat.position.z);
      else if (d.length() > 0.005) face = Math.atan2(d.x, d.z);
    } else if (d.length() > 0.005) face = Math.atan2(d.x, d.z);
    this.goat.rotation.y += angleDiff(this.goat.rotation.y, face) * k;
    const head = this.goat.getObjectByName('head')!;
    head.rotation.x = g.mood === 'stare' ? -0.15 + Math.sin(time * 0.7) * 0.03 : Math.sin(time * 3) * 0.08;
  }

  private syncPen(pub: PublicView, k: number): void {
    const seen = new Set<number>();
    for (const s of pub.snowballs) {
      seen.add(s.id);
      let m = this.snowballs.get(s.id);
      if (!m) {
        m = new THREE.Mesh(this.snowGeo, this.snowMat);
        m.position.set(s.x, 1.1, s.z);
        this.stage.scene.add(m);
        this.snowballs.set(s.id, m);
      }
      m.position.lerp(new THREE.Vector3(s.x, 1.1, s.z), Math.max(k, 0.6));
    }
    for (const [id, m] of this.snowballs) if (!seen.has(id)) {
      this.stage.scene.remove(m);
      this.snowballs.delete(id);
    }
    pub.targets.forEach((up, i) => {
      const bird = this.crows[i]?.getObjectByName('bird');
      if (bird) bird.rotation.x += ((up ? 0 : -Math.PI / 2) - bird.rotation.x) * k;
    });
  }

  private remove(id: string): void {
    const v = this.players.get(id);
    if (!v) return;
    for (const l of [v.tag, v.sign, v.act]) l.element.remove();
    this.stage.scene.remove(v.root);
    this.players.delete(id);
    this.pos.delete(id);
  }
}

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
