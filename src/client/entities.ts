/**
 * Keeps the 3D world in step with server snapshots: dogs (posed by posture), sheep, the goat,
 * and the little effects that teach the rules: the eye cone in front of a crouched dog, the calm
 * ring around a dog lying down, the bark and bleat rings.
 * Positions ease toward the latest snapshot; your own dog is predicted from input in main.ts.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { DogPub, PublicView } from '../shared/protocol';
import { DOG, GOAT, SHEEP } from '../shared/tuning';
import { dogMesh, goatMesh, sheepMesh, type DogRig, type SheepRig } from './models';
import { TEAM_COLORS, label, type Stage } from './scene';

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

interface Pose { y: number; front: number; back: number; head: number; legFold: number; frontLegs: number; backLegs: number; tail: number }
const POSES: Record<string, Pose> = {
  walk: { y: 1, front: 0, back: 0, head: 0, legFold: 1, frontLegs: 0, backLegs: 0, tail: 0.6 },
  // Running at sheep: spine curved, head low and level with the back.
  sprint: { y: 0.9, front: 0.14, back: -0.06, head: -0.04, legFold: 0.95, frontLegs: 0, backLegs: 0, tail: -0.1 },
  // Stalking, giving the eye: low, head down and forward, tail low.
  crouch: { y: 0.6, front: 0.2, back: 0.04, head: -0.08, legFold: 0.6, frontLegs: 0, backLegs: 0, tail: -0.5 },
  // Lying down in the grass, paws out front, head up and watching.
  down: { y: 0.3, front: -0.12, back: 0, head: -0.25, legFold: 0.55, frontLegs: -1.45, backLegs: -1.1, tail: -0.9 },
  // Frozen by the goat's stare: sitting, guilty.
  frozen: { y: 0.85, front: -0.35, back: -0.75, head: 0.15, legFold: 0.8, frontLegs: 0.2, backLegs: -1.2, tail: -1.1 },
};

interface DogView { rig: DogRig; tag: CSS2DObject; key: string; facing: number; phase: number; pose: Pose; lastX: number; lastZ: number; speed: number; eye: THREE.Mesh; calm: THREE.Mesh; barks: number }
interface SheepView { rig: SheepRig; facing: number; phase: number; lastX: number; lastZ: number; speed: number; penned: boolean; hop: number; jitter: number }

export class Entities {
  private dogs = new Map<string, DogView>();
  private sheep = new Map<number, SheepView>();
  private goat = goatMesh();
  private goatTag: CSS2DObject;
  private goatBubble: CSS2DObject;
  private goatFacing = 0;
  private goatPhase = 0;
  private goatLast = { x: 0, z: 0, bleats: 0 };
  private rings: { m: THREE.Mesh; t: number; max: number }[] = [];
  // Points along -y in its own plane, which becomes +z (the dog's forward) once laid flat.
  private eyeGeo = new THREE.CircleGeometry(DOG.eyeRange, 24, -Math.PI / 2 - DOG.eyeCone, DOG.eyeCone * 2);
  private calmGeo = new THREE.RingGeometry(DOG.calmRadius - 0.15, DOG.calmRadius, 40);
  private ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  /** Smoothed render positions, for the HUD (pops) and sounds. */
  readonly pos = new Map<string, THREE.Vector3>();
  /** Fired when a dog barks or the goat bleats, with where (for sounds). */
  onBark: (d: DogPub, at: THREE.Vector3) => void = () => {};
  onBleat: (at: THREE.Vector3) => void = () => {};

  constructor(private stage: Stage) {
    stage.scene.add(this.goat.root);
    this.goat.root.visible = false;
    this.goatTag = label('', 'goat-meter');
    this.goatTag.position.y = 2.0;
    this.goat.root.add(this.goatTag);
    this.goatBubble = label('', 'goat-bubble');
    this.goatBubble.position.y = 2.5;
    this.goat.root.add(this.goatBubble);
  }

  sync(pub: PublicView, you: string, predicted: { x: number; z: number; rot: number } | null, dt: number, time: number): void {
    const k = 1 - Math.exp(-dt * 14);
    this.syncDogs(pub, you, predicted, dt, k, time);
    this.syncSheep(pub, dt, k, time);
    this.syncGoat(pub, dt, k, time);
    // Expanding rings for barks and bleats.
    for (const r of this.rings) {
      r.t += dt;
      const p = Math.min(1, r.t / 0.6);
      r.m.scale.setScalar(0.5 + p * r.max);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - p);
    }
    for (const r of this.rings.filter((q) => q.t >= 0.6)) {
      this.stage.scene.remove(r.m);
      (r.m.material as THREE.Material).dispose();
    }
    this.rings = this.rings.filter((q) => q.t < 0.6);
  }

  private ring(x: number, z: number, max: number, color: string): void {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    this.stage.scene.add(m);
    this.rings.push({ m, t: 0, max });
  }

  private syncDogs(pub: PublicView, you: string, predicted: { x: number; z: number; rot: number } | null, dt: number, k: number, time: number): void {
    const seen = new Set<string>();
    for (const d of pub.dogs) {
      if (d.spectator) continue;
      seen.add(d.id);
      const key = JSON.stringify(d.look) + d.team + pub.mode;
      let v = this.dogs.get(d.id);
      if (v && v.key !== key) {
        this.removeDog(d.id);
        v = undefined;
      }
      if (!v) v = this.addDog(d, key, you, pub.mode === 'versus');
      const mine = d.id === you && predicted;
      const tx = mine ? predicted.x : d.x;
      const tz = mine ? predicted.z : d.z;
      const root = v.rig.root;
      if (root.position.lengthSq() === 0) root.position.set(tx, 0, tz);
      root.position.x += (tx - root.position.x) * (mine ? 1 : k);
      root.position.z += (tz - root.position.z) * (mine ? 1 : k);
      const moved = Math.hypot(root.position.x - v.lastX, root.position.z - v.lastZ) / Math.max(dt, 1e-3);
      v.speed += (moved - v.speed) * Math.min(1, dt * 10);
      [v.lastX, v.lastZ] = [root.position.x, root.position.z];
      v.facing = lerpAngle(v.facing, mine ? predicted.rot : d.rot, 1 - Math.exp(-dt * 12));
      root.rotation.y = v.facing;
      this.pos.set(d.id, root.position);

      // Pose: ease toward the posture's shape.
      const want = POSES[d.frozen ? 'frozen' : d.down ? 'down' : d.posture];
      const pk = 1 - Math.exp(-dt * 8);
      for (const f of Object.keys(want) as (keyof Pose)[]) v.pose[f] += (want[f] - v.pose[f]) * pk;
      const p = v.pose;
      const r = v.rig;
      const moving = v.speed > 0.4 && !d.frozen;
      v.phase += dt * (moving ? Math.min(v.speed, 9) * (d.posture === 'sprint' ? 2.1 : 2.6) : 0);
      const gallop = d.posture === 'sprint' && moving;
      const amp = moving ? Math.min(0.75, 0.25 + v.speed * 0.08) * (d.posture === 'crouch' ? 0.6 : 1) : 0;
      const bob = moving ? Math.abs(Math.sin(v.phase)) * (gallop ? 0.08 : 0.03) : 0;
      r.rig.position.y = r.hip * p.y + bob;
      r.front.rotation.x = p.front + (gallop ? Math.sin(v.phase) * 0.12 : 0);
      r.back.rotation.x = p.back + (gallop ? -Math.sin(v.phase) * 0.1 : 0);
      r.head.rotation.x = p.head;
      r.legs.forEach((leg, i) => {
        const isFront = i < 2;
        // Walk: diagonal pairs. Gallop: front pair together, back pair together, out of phase.
        const ph = gallop ? (isFront ? 0 : Math.PI * 0.8) + (i % 2) * 0.35 : (i === 0 || i === 3 ? 0 : Math.PI);
        leg.rotation.x = (isFront ? p.frontLegs : p.backLegs) + Math.sin(v.phase + ph) * amp;
        leg.scale.y = p.legFold;
      });
      r.tail.rotation.x = p.tail;
      r.tail.rotation.y = Math.sin(time * (moving ? 9 : 4)) * (d.frozen ? 0.05 : 0.35);
      for (const e of r.ears) e.rotation.x = d.frozen ? -0.6 : d.posture === 'sprint' ? -0.35 : 0;

      // Teaching aids: the eye cone (crouched) and the calm ring (lying down).
      const isYou = d.id === you;
      v.eye.visible = d.posture === 'crouch' && !d.down && !d.frozen;
      (v.eye.material as THREE.MeshBasicMaterial).opacity = isYou ? 0.16 : 0.07;
      v.calm.visible = d.down && !d.frozen;
      (v.calm.material as THREE.MeshBasicMaterial).opacity = (isYou ? 0.35 : 0.15) * (0.75 + 0.25 * Math.sin(time * 3));

      v.tag.element.classList.toggle('away', !d.connected);
      v.tag.element.classList.toggle('frozen', d.frozen);
      if (d.barks > v.barks) {
        this.ring(root.position.x, root.position.z, SHEEP.barkRadius, '#fff6c8');
        this.onBark(d, root.position);
      }
      v.barks = d.barks;
    }
    for (const id of [...this.dogs.keys()]) if (!seen.has(id)) this.removeDog(id);
  }

  private addDog(d: DogPub, key: string, you: string, versus: boolean): DogView {
    const rig = dogMesh(d.look);
    const tag = label(d.look.name, `name-tag${d.id === you ? ' you' : ''}${versus ? ` team${d.team}` : ''}`);
    tag.position.y = 1.35;
    rig.root.add(tag);
    const eye = new THREE.Mesh(this.eyeGeo, new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.12, depthWrite: false }));
    // The cone points along the dog's facing (+z in its own space).
    eye.rotation.x = -Math.PI / 2;
    eye.position.y = 0.04;
    rig.root.add(eye);
    const calm = new THREE.Mesh(this.calmGeo, new THREE.MeshBasicMaterial({ color: '#c9f7c1', transparent: true, opacity: 0.3, depthWrite: false }));
    calm.rotation.x = -Math.PI / 2;
    calm.position.y = 0.05;
    rig.root.add(calm);
    this.stage.scene.add(rig.root);
    const v: DogView = { rig, tag, key, facing: d.rot, phase: 0, pose: { ...POSES.walk }, lastX: d.x, lastZ: d.z, speed: 0, eye, calm, barks: d.barks };
    this.dogs.set(d.id, v);
    return v;
  }

  private removeDog(id: string): void {
    const v = this.dogs.get(id);
    if (!v) return;
    this.stage.scene.remove(v.rig.root);
    v.tag.element.remove();
    this.dogs.delete(id);
    this.pos.delete(id);
  }

  private syncSheep(pub: PublicView, dt: number, k: number, time: number): void {
    const seen = new Set<number>();
    for (const s of pub.sheep) {
      seen.add(s.id);
      let v = this.sheep.get(s.id);
      if (!v) {
        const rig = sheepMesh();
        rig.root.position.set(s.x, 0, s.z);
        this.stage.scene.add(rig.root);
        v = { rig, facing: s.rot, phase: Math.random() * 6, lastX: s.x, lastZ: s.z, speed: 0, penned: s.penned, hop: 0, jitter: Math.random() * 10 };
        this.sheep.set(s.id, v);
      }
      const root = v.rig.root;
      root.position.x += (s.x - root.position.x) * k;
      root.position.z += (s.z - root.position.z) * k;
      const moved = Math.hypot(root.position.x - v.lastX, root.position.z - v.lastZ) / Math.max(dt, 1e-3);
      v.speed += (moved - v.speed) * Math.min(1, dt * 8);
      [v.lastX, v.lastZ] = [root.position.x, root.position.z];
      v.facing = lerpAngle(v.facing, s.rot, 1 - Math.exp(-dt * 8));
      root.rotation.y = v.facing;
      const running = v.speed > 1.2;
      v.phase += dt * Math.min(v.speed, 6) * 3.2;
      const amp = Math.min(0.6, v.speed * 0.15);
      v.rig.legs.forEach((l, i) => (l.rotation.x = Math.sin(v.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp));
      // Fear: a shiver. Penned: a happy hop when they arrive. Calm and slow: head down, grazing.
      if (s.penned && !v.penned) v.hop = 1;
      v.penned = s.penned;
      v.hop = Math.max(0, v.hop - dt * 2.2);
      const shiver = s.fear > 0.5 ? Math.sin(time * 40 + v.jitter) * 0.02 * s.fear : 0;
      v.rig.body.position.y = 0.42 + (running ? Math.abs(Math.sin(v.phase)) * 0.07 : 0) + Math.sin(v.hop * Math.PI) * 0.35;
      v.rig.body.position.x = shiver;
      const graze = v.speed < 0.3 && s.fear < 0.2 ? 0.6 + Math.sin(time * 0.7 + v.jitter) * 0.15 : 0;
      v.rig.head.rotation.x += ((running ? -0.25 : graze) - v.rig.head.rotation.x) * Math.min(1, dt * 4);
      v.rig.mark.visible = s.team !== null && pub.mode === 'versus';
      if (s.team !== null) v.rig.mark.material = markMat(s.team);
    }
    for (const [id, v] of this.sheep) {
      if (seen.has(id)) continue;
      this.stage.scene.remove(v.rig.root);
      this.sheep.delete(id);
    }
  }

  private syncGoat(pub: PublicView, dt: number, k: number, time: number): void {
    const g = pub.goat;
    const root = this.goat.root;
    root.visible = !!g;
    this.goatTag.element.style.display = g ? '' : 'none';
    this.goatBubble.element.style.display = g ? '' : 'none';
    if (!g) return;
    if (!this.goatLast.x && !this.goatLast.z) root.position.set(g.x, 0, g.z);
    root.position.x += (g.x - root.position.x) * k;
    root.position.z += (g.z - root.position.z) * k;
    const speed = Math.hypot(root.position.x - this.goatLast.x, root.position.z - this.goatLast.z) / Math.max(dt, 1e-3);
    [this.goatLast.x, this.goatLast.z] = [root.position.x, root.position.z];
    // Staring: turn to face the victim, whatever it was doing.
    let face = g.rot;
    const victim = g.target ? pub.dogs.find((d) => d.id === g.target) : null;
    if (victim && (g.mood === 'stare' || g.mood === 'coming')) face = Math.atan2(victim.x - g.x, victim.z - g.z);
    this.goatFacing = lerpAngle(this.goatFacing, face, 1 - Math.exp(-dt * 6));
    root.rotation.y = this.goatFacing;
    this.goatPhase += dt * Math.min(speed, 5) * 3;
    const amp = Math.min(0.5, speed * 0.15);
    this.goat.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.goatPhase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp));
    this.goat.head.rotation.x = g.mood === 'bleat' ? -0.5 : g.mood === 'stare' ? 0.15 + Math.sin(time * 2) * 0.02 : 0.25;
    // The patience meter: fills as barking annoys it.
    const el = this.goatTag.element;
    el.style.setProperty('--annoy', String(g.annoy));
    el.classList.toggle('hot', g.annoy > 0.6);
    el.style.opacity = g.annoy > 0.05 || g.mood === 'coming' ? '1' : '0';
    const bubble = g.mood === 'bleat' ? 'MEHHH' : g.mood === 'coming' ? '!' : g.mood === 'stare' ? '...' : '';
    this.goatBubble.element.textContent = bubble;
    this.goatBubble.element.style.display = bubble ? '' : 'none';
    if (g.bleats > this.goatLast.bleats) {
      this.ring(root.position.x, root.position.z, GOAT.bleatRadius, '#ffd9a8');
      this.onBleat(root.position);
    }
    this.goatLast.bleats = g.bleats;
  }
}

const markMats = new Map<number, THREE.MeshStandardMaterial>();
function markMat(team: 0 | 1): THREE.MeshStandardMaterial {
  let m = markMats.get(team);
  if (!m) markMats.set(team, (m = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], roughness: 0.9, side: THREE.DoubleSide })));
  return m;
}
