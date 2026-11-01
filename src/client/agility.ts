/**
 * The agility course on screen: the gear, a numbered flag over each piece (the next one bounces,
 * done ones go quiet), a chime for each piece taken in order, and your time when you finish, with
 * your best on this browser. No points and nothing sent to the room: your own dog, on your own
 * screen, just for fun. The following itself is `AgilityRun` (src/shared/agilityrun.ts).
 */
import * as THREE from 'three';
import type { AgilityPiece } from '../shared/agility';
import { AgilityRun } from '../shared/agilityrun';
import type { FieldDef } from '../shared/field';
import { gearMesh } from './agilitygear';
import { label } from './scene';

export interface AgilityEvents {
  /** A piece taken in order: step 0 is the first; `at` is where the dog is. */
  onStep: (step: number, of: number, at: THREE.Vector3) => void;
  /** A piece taken out of order: `next` is the one to take. */
  onWrong: (next: number, at: THREE.Vector3) => void;
  /** Round done, in `sec` seconds; `best` is the best before this one (null if first). */
  onFinish: (sec: number, best: number | null, at: THREE.Vector3) => void;
}

export class AgilityCourse {
  readonly group = new THREE.Group();
  private flags: { el: HTMLElement; p: AgilityPiece }[] = [];
  private run: AgilityRun;
  private readonly key: string;
  /** A glowing ring on the ground round the piece to take next. */
  private ring: THREE.Mesh;
  private t0 = 0;
  private wrongAt = 0;

  constructor(f: FieldDef, heightAt: (x: number, z: number) => number, private ev: AgilityEvents) {
    this.key = `comebye.agility.${f.id}`;
    this.run = new AgilityRun(f.agility ?? []);
    for (const p of f.agility ?? []) {
      this.group.add(gearMesh(p, heightAt(p.x, p.z)));
      const flag = label(String(p.n), 'ag-num');
      flag.position.set(p.x, heightAt(p.x, p.z) + (p.kind === 'tire' ? 2.15 : 1.45), p.z);
      this.group.add(flag);
      this.flags.push({ el: flag.element, p });
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.75, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.6, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.ring);
    this.height = heightAt;
  }

  private height: (x: number, z: number) => number;

  /** While a round is on: how far through, and the time so far (for the HUD). */
  progress(now: number): { done: number; of: number; sec: number } | null {
    return this.run.next > 1 ? { done: this.run.next - 1, of: this.run.pieces.length, sec: (now - this.t0) / 1000 } : null;
  }

  /** Where your dog is now. `alwaysShow`: the flags show from anywhere (the lobby); otherwise only nearby. */
  update(x: number, z: number, down: boolean, dt: number, now: number, alwaysShow: boolean): void {
    const of = this.run.pieces.length;
    if (!of) return;
    const r = this.run.step(x, z, down, dt, now);
    const at = new THREE.Vector3(x, 0, z);
    if (r.took === 1) this.t0 = now;
    if (r.took) {
      this.ev.onStep(r.took - 1, of, at);
      // The flag it belongs to pops to a tick.
      const f = this.flags.find((q) => q.p.n === r.took);
      if (f) {
        f.el.classList.remove('just');
        void f.el.offsetWidth;
        f.el.classList.add('just');
      }
    }
    if (r.wrong && now - this.wrongAt > 1500) {
      this.wrongAt = now;
      this.ev.onWrong(r.wrong, at);
    }
    if (r.finished !== undefined) this.finish(r.finished, x, z);
    const next = this.run.next;
    for (const { el, p } of this.flags) {
      el.style.display = alwaysShow || Math.hypot(p.x - x, p.z - z) < 18 ? '' : 'none';
      const done = next > 1 && p.n < next;
      el.classList.toggle('next', p.n === next);
      el.classList.toggle('done', done);
      const t = done ? '\u2713' : String(p.n);
      if (el.textContent !== t) el.textContent = t;
    }
    // The ring sits round the next piece and breathes, brighter as you come near.
    const np = this.run.pieces.find((p) => p.n === next);
    this.ring.visible = !!np && (alwaysShow || Math.hypot(np.x - x, np.z - z) < 18);
    if (np) {
      this.ring.position.set(np.x, this.height(np.x, np.z) + 0.06, np.z);
      const near = Math.max(0, 1 - Math.hypot(np.x - x, np.z - z) / 14);
      this.ring.scale.setScalar(1 + 0.06 * Math.sin(now / 260));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * near + 0.1 * Math.sin(now / 260);
    }
  }

  private finish(sec: number, x: number, z: number): void {
    let best: number | null = null;
    try {
      const b = Number(localStorage.getItem(this.key));
      best = b > 0 ? b : null;
      if (best === null || sec < best) localStorage.setItem(this.key, sec.toFixed(2));
    } catch {
      /* no storage: just no best */
    }
    this.ev.onFinish(sec, best, new THREE.Vector3(x, 0, z));
  }
}
