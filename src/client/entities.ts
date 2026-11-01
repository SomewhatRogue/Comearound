/**
 * Keeps the 3D world in step with server snapshots: dogs (posed by posture), sheep, the goat,
 * and the little effects that teach the rules: the eye cone in front of a crouched dog, the calm
 * ring around a dog lying down, the bark and bleat rings.
 * Positions ease toward the latest snapshot; your own dog is predicted from input in main.ts.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { fieldById } from '../shared/field';
import type { DogPub, PublicView } from '../shared/protocol';
import { DOG, GOAT, SHEEP } from '../shared/tuning';
import { GoatView } from './goatview';
import { jumpAt, type Jump } from './lowfence';
import { heightAt } from './terrain';
import { Hearts, newIdle, patSound, tickIdle, type Idle } from './lobbypack';
import { sfx } from './sfx';
import { dogMesh, sheepMesh, type DogRig, type SheepRig } from './models';
import { TEAM_COLORS, label, type Stage } from './scene';

/** How high a dog's leap over a low fence goes (the rail tops out around 0.6 m). */
const JUMP_HEIGHT = 0.72;

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
  // Lightning: belly low, head tucked, tail between the legs.
  cower: { y: 0.45, front: 0.1, back: 0.15, head: 0.5, legFold: 0.5, frontLegs: 0.3, backLegs: -0.4, tail: -1.3 },
  // Frozen by the goat's stare: sitting, guilty.
  frozen: { y: 0.85, front: -0.35, back: -0.75, head: 0.15, legFold: 0.8, frontLegs: 0.2, backLegs: -1.2, tail: -1.1 },
  // Waiting in the lobby: sitting nicely, head up, tail sweeping the grass.
  sit: { y: 0.85, front: -0.35, back: -0.75, head: -0.15, legFold: 0.8, frontLegs: 0.2, backLegs: -1.2, tail: -0.3 },
  // A play bow: elbows down, rear up, tail high. Let's play!
  bow: { y: 0.85, front: 0.4, back: -0.2, head: -0.35, legFold: 0.9, frontLegs: -1.2, backLegs: 0, tail: 0.9 },
  // Jumping a low fence. The gather: down on the haunches, weight back, eyes on the rail.
  gather: { y: 0.7, front: 0.2, back: -0.14, head: -0.14, legFold: 0.7, frontLegs: 0.18, backLegs: -0.35, tail: 0.15 },
  // In the air: stretched out, head up, tail streaming (legs are set through the leap).
  leap: { y: 1, front: -0.06, back: 0.06, head: 0.1, legFold: 0.88, frontLegs: -1.1, backLegs: 0.8, tail: 0.35 },
  // Touching down: front legs taking the weight, a little squash.
  land: { y: 0.76, front: 0.16, back: -0.04, head: -0.1, legFold: 0.76, frontLegs: -0.2, backLegs: 0.25, tail: 0.55 },
};

interface DogView { jump: Jump['phase']; jumpScale: number; rig: DogRig; tag: CSS2DObject; key: string; facing: number; phase: number; pose: Pose; lastX: number; lastZ: number; speed: number; eye: THREE.Mesh; calm: THREE.Mesh; barks: number; pets: number; idle: Idle; size: number; pitch: number }
interface SheepView { rig: SheepRig; facing: number; phase: number; lastX: number; lastZ: number; speed: number; penned: boolean; hop: number; jitter: number }

export class Entities {
  private dogs = new Map<string, DogView>();
  private sheep = new Map<string, SheepView>();
  private goats = new Map<string, GoatView>();
  private rings: { m: THREE.Mesh; t: number; max: number }[] = [];
  // Points along -y in its own plane, which becomes +z (the dog's forward) once laid flat.
  private eyeGeo = new THREE.CircleGeometry(DOG.eyeRange, 24, -Math.PI / 2 - DOG.eyeCone, DOG.eyeCone * 2);
  private calmGeo = new THREE.RingGeometry(DOG.calmRadius - 0.15, DOG.calmRadius, 40);
  private ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  private hearts: Hearts;
  /** Smoothed render positions, for the HUD (pops) and sounds. */
  readonly pos = new Map<string, THREE.Vector3>();
  /** Fired when a dog barks or the goat bleats, with where (for sounds). */
  onBark: (d: DogPub, at: THREE.Vector3) => void = () => {};
  onBleat: (at: THREE.Vector3) => void = () => {};

  constructor(private stage: Stage) {
    this.hearts = new Hearts();
  }
  /** Each dog's size and bark pitch (set by main.ts from the breed), for hearts and yips. */
  sizeOf: (breed: string) => number = () => 1;
  pitchOf: (breed: string) => number = () => 1;

  /** The field being drawn (for the lie of the land and its low fences). */
  private field = fieldById('meadow');

  sync(pub: PublicView, you: string, predicted: { x: number; z: number; rot: number } | null, dt: number, time: number): void {
    this.field = fieldById(pub.fieldId);
    const k = 1 - Math.exp(-dt * 14);
    this.syncDogs(pub, you, predicted, dt, k, time);
    this.syncSheep(pub, dt, k, time);
    this.syncGoat(pub, dt, k, time);
    this.hearts.tick(dt);
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
    m.position.set(x, heightAt(this.field, x, z) + 0.06, z);
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
      // A new outfit (or team): rebuild the dog, with a poof if it was just a change of clothes.
      let poof = false;
      if (v && v.key !== key) {
        poof = pub.phase === 'lobby';
        this.removeDog(d.id);
        v = undefined;
      }
      if (!v) v = this.addDog(d, key, you, pub.mode === 'versus');
      if (poof) {
        v.idle.poof = 0.5;
        sfx.poof();
        this.ring(d.x, d.z, 1.6, d.look.collar);
      }
      const mine = d.id === you && predicted;
      const tx = mine ? predicted.x : d.x;
      const tz = mine ? predicted.z : d.z;
      const root = v.rig.root;
      if (root.position.lengthSq() === 0) root.position.set(tx, 0, tz);
      root.position.x += (tx - root.position.x) * (mine ? 1 : k);
      root.position.z += (tz - root.position.z) * (mine ? 1 : k);
      // Standing on the lie of the land.
      root.position.y = heightAt(this.field, root.position.x, root.position.z);
      const moved = Math.hypot(root.position.x - v.lastX, root.position.z - v.lastZ) / Math.max(dt, 1e-3);
      v.speed += (moved - v.speed) * Math.min(1, dt * 10);
      [v.lastX, v.lastZ] = [root.position.x, root.position.z];
      v.facing = lerpAngle(v.facing, mine ? predicted.rot : d.rot, 1 - Math.exp(-dt * 12));
      root.rotation.y = v.facing;
      this.pos.set(d.id, root.position);
      // Jumping a low fence: gather, leap (a real arc over the rail), land.
      // A sprinting dog's leap goes half as long again (kept for the whole jump once it starts).
      if (v.jump === 'none') v.jumpScale = d.posture === 'sprint' ? 1.5 : 1;
      const jump = d.frozen ? { phase: 'none' as const, t: 0 } : jumpAt(this.field, root.position.x, root.position.z, v.facing, v.jumpScale);
      if (jump.phase === 'leap') root.position.y += JUMP_HEIGHT * (v.jumpScale > 1 ? 1.08 : 1) * Math.sin(jump.t * Math.PI);
      if (jump.phase === 'leap' && v.jump === 'gather' && d.id === you) sfx.whoosh();
      if (jump.phase === 'land' && v.jump === 'leap') {
        this.ring(root.position.x, root.position.z, 1.1, '#cdb88a');
        if (d.id === you) sfx.thud();
      }
      v.jump = jump.phase;

      // Waiting in the lobby's row: get up to something now and then.
      const waiting = d.lineup && v.speed < 0.3;
      const idle = v.idle;
      if (waiting) tickIdle(idle, time);
      else idle.act = 'stand';
      // A pat: hearts, a yip, and a happy wiggle for a moment.
      if (d.pets > v.pets) {
        this.hearts.burst(root, v.size);
        patSound(v.pitch, d.id === you);
        idle.happy = 1.6;
        idle.act = 'stand';
        idle.until = time + 2;
      }
      v.pets = d.pets;
      idle.happy = Math.max(0, idle.happy - dt);
      idle.poof = Math.max(0, idle.poof - dt);
      const lobbyPose = waiting && !idle.happy ? ({ sit: 'sit', lie: 'down', bow: 'bow', stand: null } as const)[idle.act] : null;

      // Pose: ease toward the posture's shape (snappily, mid-jump).
      const jumpPose = jump.phase === 'none' || (jump.phase === 'land' && jump.t > 0.55) ? null : jump.phase;
      const want = POSES[d.frozen ? 'frozen' : jumpPose ?? (d.cower ? 'cower' : d.down ? 'down' : lobbyPose ?? d.posture)];
      const pk = 1 - Math.exp(-dt * (jumpPose ? 18 : 8));
      for (const f of Object.keys(want) as (keyof Pose)[]) v.pose[f] += (want[f] - v.pose[f]) * pk;
      const p = v.pose;
      const r = v.rig;
      const moving = v.speed > 0.4 && !d.frozen && jump.phase !== 'leap';
      v.phase += dt * (moving ? Math.min(v.speed, 9) * (d.posture === 'sprint' ? 2.1 : 2.6) : 0);
      const gallop = d.posture === 'sprint' && moving;
      const amp = moving ? Math.min(0.75, 0.25 + v.speed * 0.08) * (d.posture === 'crouch' ? 0.6 : 1) : 0;
      const bob = moving ? Math.abs(Math.sin(v.phase)) * (gallop ? 0.08 : 0.03) : 0;
      r.rig.position.y = r.hip * p.y + bob;
      r.front.rotation.x = p.front + (gallop ? Math.sin(v.phase) * 0.12 : 0);
      r.back.rotation.x = p.back + (gallop ? -Math.sin(v.phase) * 0.1 : 0);
      r.head.rotation.x = p.head;
      // Waiting: looking about, a head tilt when happy, a little hop, and breathing.
      const happy = idle.happy > 0 ? Math.min(1, idle.happy) : 0;
      r.head.rotation.y += ((waiting ? idle.glance : 0) - r.head.rotation.y) * Math.min(1, dt * 3);
      r.head.rotation.z = happy * Math.sin(time * 3.2) * 0.3;
      const hop = Math.abs(Math.sin(time * 11)) * 0.07 * happy + Math.sin(Math.min(1, idle.poof * 2) * Math.PI) * 0.25;
      r.rig.position.y += hop + (waiting ? Math.sin(time * 2.4 + v.lastX) * 0.008 : 0);
      r.legs.forEach((leg, i) => {
        const isFront = i < 2;
        // Walk: diagonal pairs. Gallop: front pair together, back pair together, out of phase.
        const ph = gallop ? (isFront ? 0 : Math.PI * 0.8) + (i % 2) * 0.35 : (i === 0 || i === 3 ? 0 : Math.PI);
        leg.rotation.x = (isFront ? p.frontLegs : p.backLegs) + Math.sin(v.phase + ph) * amp;
        // In the air: front legs reach forward then down for the landing, back legs push off then trail.
        if (jump.phase === 'leap') leg.rotation.x = isFront ? -1.2 + 0.8 * jump.t : 0.55 + 0.45 * jump.t;
        leg.scale.y = p.legFold;
      });
      // The body's pitch: nose dips in the gather, up on the way up, down on the way over, level on landing.
      const pitch = jump.phase === 'gather' ? -0.1 * jump.t : jump.phase === 'leap' ? 0.42 * Math.cos(jump.t * Math.PI) : jump.phase === 'land' ? -0.16 * Math.max(0, 1 - jump.t * 2) : 0;
      r.rig.rotation.x += (pitch - r.rig.rotation.x) * (1 - Math.exp(-dt * 22));
      r.tail.rotation.x = p.tail;
      r.tail.rotation.y = Math.sin(time * (moving ? 9 : happy ? 15 : lobbyPose === 'bow' ? 11 : 4)) * (d.frozen || d.cower ? 0.05 : happy ? 0.6 : 0.35);
      // Cowering after lightning: a shiver.
      r.rig.position.x = d.cower ? Math.sin(time * 45) * 0.025 : 0;
      for (const e of r.ears) e.rotation.x = d.frozen ? -0.6 : jump.phase === 'leap' || d.posture === 'sprint' ? -0.4 : 0;

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
    // The name tag wears your collar colour too (versus tags wear the team colour instead).
    if (!versus) tag.element.style.borderColor = d.look.collar;
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
    const v: DogView = { jump: 'none', jumpScale: 1, rig, tag, key, facing: d.rot, phase: 0, pose: { ...POSES.walk }, lastX: d.x, lastZ: d.z, speed: 0, eye, calm, barks: d.barks, pets: d.pets, idle: newIdle(), size: this.sizeOf(d.look.breed), pitch: this.pitchOf(d.look.breed) };
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
    const seen = new Set<string>();
    // Sorting fields: team 1 sheep are black sheep. Ids restart every field, so key by field too.
    const sort = !!fieldById(pub.fieldId).sort;
    for (const s of pub.sheep) {
      const key = `${pub.fieldId}:${pub.fieldIdx}:${s.id}`;
      seen.add(key);
      let v = this.sheep.get(key);
      if (!v) {
        const rig = sheepMesh(sort && s.team === 1);
        rig.root.position.set(s.x, 0, s.z);
        this.stage.scene.add(rig.root);
        v = { rig, facing: s.rot, phase: Math.random() * 6, lastX: s.x, lastZ: s.z, speed: 0, penned: s.penned, hop: 0, jitter: Math.random() * 10 };
        this.sheep.set(key, v);
      }
      const root = v.rig.root;
      root.visible = !s.lost;
      root.position.x += (s.x - root.position.x) * k;
      root.position.z += (s.z - root.position.z) * k;
      root.position.y = heightAt(this.field, root.position.x, root.position.z);
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
      // Grazing: head down in the grass, nibbling (a little chewing nod), looking up now and then.
      const lookUp = Math.sin(time * 0.31 + v.jitter * 2) > 0.85;
      const graze = v.speed < 0.3 && s.fear < 0.2 && !lookUp ? 0.62 + Math.sin(time * 0.7 + v.jitter) * 0.12 + Math.max(0, Math.sin(time * 6.5 + v.jitter)) * 0.09 : 0;
      v.rig.head.rotation.x += ((running ? -0.25 : graze) - v.rig.head.rotation.x) * Math.min(1, dt * 4);
      v.rig.mark.visible = s.team !== null && pub.mode === 'versus' && !sort;
      if (s.team !== null) v.rig.mark.material = markMat(s.team);
    }
    for (const [id, v] of this.sheep) {
      if (seen.has(id)) continue;
      this.stage.scene.remove(v.rig.root);
      this.sheep.delete(id);
    }
  }

  private syncGoat(pub: PublicView, dt: number, k: number, time: number): void {
    const seen = new Set<string>();
    for (const g of pub.goats) {
      // Goat ids restart every field, so key them by field too.
      const key = `${pub.fieldId}:${pub.fieldIdx}:${g.id}`;
      seen.add(key);
      let v = this.goats.get(key);
      if (!v) this.goats.set(key, (v = new GoatView(this.stage.scene, g)));
      if (v.sync(g, pub, dt, k, time)) {
        this.ring(v.rig.root.position.x, v.rig.root.position.z, GOAT.bleatRadius, '#ffd9a8');
        this.onBleat(v.rig.root.position);
      }
    }
    for (const [key, v] of this.goats) {
      if (seen.has(key)) continue;
      v.dispose(this.stage.scene);
      this.goats.delete(key);
    }
  }
}

const markMats = new Map<number, THREE.MeshStandardMaterial>();
function markMat(team: 0 | 1): THREE.MeshStandardMaterial {
  let m = markMats.get(team);
  if (!m) markMats.set(team, (m = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], roughness: 0.9, side: THREE.DoubleSide })));
  return m;
}
