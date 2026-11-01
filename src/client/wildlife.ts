/**
 * Pond life and field birds, for the look of the place: ducks paddling on the ponds and streams,
 * and little flocks of birds hopping and pecking in the grass. Rush at them (or bark) and they
 * take off, flap away, circle, and settle again somewhere else a while later: ducks back on the
 * water, birds on another patch of grass. Cosmetic, in each player's own browser.
 */
import * as THREE from 'three';
import { inWater, waterSegments, type FieldDef } from '../shared/field';
import type { PublicView } from '../shared/protocol';
import { Rng } from '../shared/rng';
import { at, mesh } from './models';
import { sfx } from './sfx';
import { heightAt } from './terrain';

type Kind = 'duck' | 'bird';
interface Critter {
  kind: Kind;
  obj: THREE.Group;
  wings: THREE.Object3D[];
  head: THREE.Object3D;
  home: { x: number; z: number; r: number };
  x: number; z: number; y: number; rot: number;
  state: 'idle' | 'fly' | 'land';
  t: number;
  vx: number; vz: number;
  to: { x: number; z: number };
  ph: number;
}

function duck(): { g: THREE.Group; wings: THREE.Object3D[]; head: THREE.Object3D } {
  const g = new THREE.Group();
  const body = at(mesh(new THREE.SphereGeometry(0.22, 8, 6), '#f7f3e6'), 0, 0.1, 0);
  body.scale.set(1, 0.7, 1.4);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.24, 0.2);
  head.add(at(mesh(new THREE.SphereGeometry(0.12, 8, 6), '#3f7a4a'), 0, 0.04, 0));
  const beak = mesh(new THREE.ConeGeometry(0.05, 0.14, 5), '#f2a33a');
  beak.rotation.x = Math.PI / 2;
  head.add(at(beak, 0, 0.02, 0.16));
  g.add(head);
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.16, 0.16, -0.02);
    const blade = at(mesh(new THREE.BoxGeometry(0.36, 0.03, 0.22), '#e8e2d0'), s * 0.18, 0, 0);
    w.add(blade);
    g.add(w);
    return w;
  });
  return { g, wings, head };
}

function bird(rng: Rng): { g: THREE.Group; wings: THREE.Object3D[]; head: THREE.Object3D } {
  const g = new THREE.Group();
  const tone = ['#8a6a4a', '#7a5a3c', '#6d6a64'][Math.floor(rng.next() * 3)];
  const body = at(mesh(new THREE.SphereGeometry(0.07, 6, 5), tone), 0, 0.07, 0);
  body.scale.set(1, 0.9, 1.4);
  g.add(body);
  g.add(at(mesh(new THREE.SphereGeometry(0.05, 6, 5), '#e8d9b8'), 0, 0.055, 0.04));
  const head = new THREE.Group();
  head.position.set(0, 0.11, 0.07);
  head.add(at(mesh(new THREE.SphereGeometry(0.045, 6, 5), tone), 0, 0, 0));
  head.add(at(mesh(new THREE.ConeGeometry(0.014, 0.05, 4), '#d9a441'), 0, -0.005, 0.05).rotateX(Math.PI / 2));
  g.add(head);
  const tail = at(mesh(new THREE.BoxGeometry(0.05, 0.01, 0.09), tone), 0, 0.09, -0.1);
  tail.rotation.x = -0.4;
  g.add(tail);
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.05, 0.1, 0);
    w.add(at(mesh(new THREE.BoxGeometry(0.14, 0.01, 0.08), tone), s * 0.07, 0, 0));
    g.add(w);
    return w;
  });
  return { g, wings, head };
}

export class Wildlife {
  readonly group = new THREE.Group();
  private all: Critter[] = [];
  private last = new Map<string, { x: number; z: number; barks: number }>();
  private rng: Rng;

  constructor(private f: FieldDef, lowfx: boolean) {
    this.rng = new Rng(f.id.length * 131 + Math.round(f.d * 7));
    const rng = this.rng;
    // Ducks: three on every pond, a pair on each long enough stretch of stream.
    const waters: { x: number; z: number; r: number }[] = f.obstacles.filter((o) => o.kind === 'pond').map((o) => ({ x: o.x, z: o.z, r: o.r * 0.7 }));
    for (const s of f.streams ?? []) {
      for (const q of waterSegments(s)) if (Math.hypot(q.bx - q.ax, q.bz - q.az) > 6) waters.push({ x: (q.ax + q.bx) / 2, z: (q.az + q.bz) / 2, r: s.w * 0.3 });
    }
    for (const w of waters.slice(0, lowfx ? 2 : 5)) {
      for (let i = 0; i < (w.r > 1.5 ? 3 : 2); i++) this.add('duck', w);
    }
    // Birds: a couple of little flocks pecking in open grass.
    for (let n = 0; n < (lowfx ? 1 : 2); n++) {
      const spot = this.openSpot();
      for (let i = 0; i < 5; i++) this.add('bird', { x: spot.x, z: spot.z, r: 1.6 });
    }
    void rng;
  }

  private add(kind: Kind, home: { x: number; z: number; r: number }): void {
    const rng = this.rng;
    const { g, wings, head } = kind === 'duck' ? duck() : bird(rng);
    const a = rng.range(0, 6.28);
    const r = Math.sqrt(rng.next()) * home.r;
    const c: Critter = { kind, obj: g, wings, head, home, x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r, y: 0, rot: rng.range(0, 6.28), state: 'idle', t: rng.range(0, 3), vx: 0, vz: 0, to: { x: 0, z: 0 }, ph: rng.range(0, 6.28) };
    this.all.push(c);
    this.group.add(g);
  }

  /** Somewhere open to land: on grass, inside the field, off the pens and the water. */
  private openSpot(near?: { x: number; z: number }): { x: number; z: number } {
    const f = this.f;
    for (let i = 0; i < 40; i++) {
      const x = near ? near.x + this.rng.range(-14, 14) : this.rng.range(-f.w / 2 + 3, f.w / 2 - 3);
      const z = near ? near.z + this.rng.range(-10, 10) : this.rng.range(-f.d / 2 + 3, f.d / 2 - 3);
      if (Math.abs(x) > f.w / 2 - 2 || Math.abs(z) > f.d / 2 - 2) continue;
      if (f.pens.some((p) => Math.abs(x - p.x) < p.w / 2 + 2 && Math.abs(z - p.z) < p.d / 2 + 2)) continue;
      if (inWater(f, x, z, 1.5) || f.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1.5)) continue;
      return { x, z };
    }
    return { x: 0, z: 0 };
  }

  private startle(c: Critter, fromX: number, fromZ: number, near: boolean): void {
    if (c.state !== 'idle') return;
    const dx = c.x - fromX;
    const dz = c.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const speed = c.kind === 'duck' ? 4 : 6;
    const wob = this.rng.range(-0.6, 0.6);
    [c.vx, c.vz] = [(dx / d) * Math.cos(wob) - (dz / d) * Math.sin(wob), (dz / d) * Math.cos(wob) + (dx / d) * Math.sin(wob)].map((v) => v * speed) as [number, number];
    c.state = 'fly';
    c.t = c.kind === 'duck' ? this.rng.range(5, 8) : this.rng.range(3, 5);
    // Where to come down: ducks back on their water, birds on another patch of grass.
    if (c.kind === 'duck') {
      const a = this.rng.range(0, 6.28);
      c.to = { x: c.home.x + Math.cos(a) * c.home.r * 0.6, z: c.home.z + Math.sin(a) * c.home.r * 0.6 };
    } else {
      const spot = this.openSpot(c);
      c.to = { x: spot.x + this.rng.range(-1.2, 1.2), z: spot.z + this.rng.range(-1.2, 1.2) };
    }
    if (near && this.rng.next() < (c.kind === 'duck' ? 0.6 : 0.25)) (c.kind === 'duck' ? sfx.squawk : sfx.whoosh)();
  }

  update(pub: PublicView, you: { x: number; z: number } | null, time: number, dt: number): void {
    // Who's charging about (fast, close), and who barked: those set things flying.
    const scares: { x: number; z: number; fast: boolean; bark: boolean }[] = [];
    for (const d of pub.dogs) {
      if (d.spectator) continue;
      const prev = this.last.get(d.id);
      const speed = prev ? Math.hypot(d.x - prev.x, d.z - prev.z) / Math.max(dt, 1e-3) : 0;
      scares.push({ x: d.x, z: d.z, fast: speed > 2.5 || d.posture === 'sprint', bark: !!prev && d.barks > prev.barks });
      this.last.set(d.id, { x: d.x, z: d.z, barks: d.barks });
    }
    for (const c of this.all) {
      if (c.state === 'idle') {
        for (const s of scares) {
          const d = Math.hypot(c.x - s.x, c.z - s.z);
          const reach = (c.kind === 'duck' ? 3.4 : 3) * (s.fast ? 1 : 0.5);
          if (d < reach || (s.bark && d < 9)) this.startle(c, s.x, s.z, !!you && Math.hypot(c.x - you.x, c.z - you.z) < 14);
        }
      }
      this.move(c, time, dt);
    }
  }

  private move(c: Critter, time: number, dt: number): void {
    const ground = c.kind === 'duck' ? 0.02 : heightAt(this.f, c.x, c.z);
    if (c.state === 'idle') {
      if (c.kind === 'duck') {
        // Paddling slow circles round the water, now and then dipping for weed.
        c.ph += dt * 0.25;
        const tx = c.home.x + Math.cos(c.ph) * c.home.r * 0.7;
        const tz = c.home.z + Math.sin(c.ph * 0.8) * c.home.r * 0.7;
        const [dx, dz] = [tx - c.x, tz - c.z];
        c.x += dx * dt * 0.6;
        c.z += dz * dt * 0.6;
        if (Math.hypot(dx, dz) > 0.05) c.rot = Math.atan2(dx, dz);
        c.y = ground + Math.sin(time * 3 + c.ph) * 0.015;
        c.head.rotation.x = Math.sin(time * 0.7 + c.ph * 3) > 0.92 ? 1.1 : 0;
      } else {
        // Hop, hop, peck.
        c.t -= dt;
        if (c.t <= 0) {
          c.t = this.rng.range(0.6, 2.2);
          const a = this.rng.range(0, 6.28);
          const step = this.rng.range(0.15, 0.4);
          const [nx, nz] = [c.x + Math.cos(a) * step, c.z + Math.sin(a) * step];
          if (Math.hypot(nx - c.home.x, nz - c.home.z) < c.home.r + 1.5) [c.x, c.z, c.rot] = [nx, nz, Math.atan2(Math.cos(a), Math.sin(a))];
        }
        const hop = c.t > 0 && c.t % 1 > 0.85 ? 0.05 : 0;
        c.y = ground + hop;
        c.head.rotation.x = Math.sin(time * 5 + c.ph) > 0.6 ? 0.9 : 0;
      }
      // Wings folded back along the body.
      c.wings.forEach((w, i) => w.rotation.set(0, (i ? 1 : -1) * 1.45, 0));
    } else if (c.state === 'fly') {
      // Up and away, flapping, curving round toward where it means to land.
      c.t -= dt;
      const [tx, tz] = [c.to.x - c.x, c.to.z - c.z];
      const td = Math.hypot(tx, tz) || 1;
      const steer = c.t < 2.5 ? 1.6 : 0.4;
      const sp = c.kind === 'duck' ? 4 : 6;
      c.vx += ((tx / td) * sp - c.vx) * Math.min(1, dt * steer);
      c.vz += ((tz / td) * sp - c.vz) * Math.min(1, dt * steer);
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      c.y += ((c.kind === 'duck' ? 4.5 : 3.5) + Math.sin(time + c.ph) * 0.6 - c.y) * Math.min(1, dt * 1.5);
      c.rot = Math.atan2(c.vx, c.vz);
      const flap = Math.sin(time * (c.kind === 'duck' ? 16 : 26) + c.ph) * 0.9;
      c.wings.forEach((w, i) => w.rotation.set(0, (i ? 1 : -1) * 0.1, (i ? -1 : 1) * flap));
      if (c.t <= 0 || (c.t < 2.5 && td < 2)) c.state = 'land';
    } else {
      // Gliding down to the landing spot, wings out, a last flutter.
      const [tx, tz] = [c.to.x - c.x, c.to.z - c.z];
      const td = Math.hypot(tx, tz);
      c.x += tx * Math.min(1, dt * 1.6);
      c.z += tz * Math.min(1, dt * 1.6);
      c.y += (ground - c.y) * Math.min(1, dt * 2.2);
      if (td > 0.05) c.rot = Math.atan2(tx, tz);
      c.wings.forEach((w, i) => w.rotation.set(0, (i ? 1 : -1) * 0.2, (i ? -1 : 1) * (0.5 + Math.sin(time * 20) * 0.3)));
      if (td < 0.15 && c.y - ground < 0.06) {
        c.state = 'idle';
        if (c.kind === 'bird') c.home = { x: c.to.x, z: c.to.z, r: 1.6 };
        c.t = this.rng.range(0.5, 2);
      }
    }
    c.obj.position.set(c.x, c.y, c.z);
    c.obj.rotation.y = c.rot;
  }
}
