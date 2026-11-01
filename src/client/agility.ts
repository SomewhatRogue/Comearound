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
  /** A piece taken in order: step 0 is the first. */
  onStep: (step: number, of: number) => void;
  /** Round done, in `sec` seconds; `best` is the best before this one (null if first). */
  onFinish: (sec: number, best: number | null, at: THREE.Vector3) => void;
}

export class AgilityCourse {
  readonly group = new THREE.Group();
  private flags: { el: HTMLElement; p: AgilityPiece }[] = [];
  private run: AgilityRun;
  private readonly key: string;

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
  }

  /** Where your dog is now. `alwaysShow`: the flags show from anywhere (the lobby); otherwise only nearby. */
  update(x: number, z: number, down: boolean, dt: number, now: number, alwaysShow: boolean): void {
    const of = this.run.pieces.length;
    if (!of) return;
    const r = this.run.step(x, z, down, dt, now);
    if (r.took) this.ev.onStep(r.took - 1, of);
    if (r.finished !== undefined) this.finish(r.finished, x, z);
    const next = this.run.next;
    for (const { el, p } of this.flags) {
      el.style.display = alwaysShow || Math.hypot(p.x - x, p.z - z) < 16 ? '' : 'none';
      el.classList.toggle('next', p.n === next);
      el.classList.toggle('done', next > 1 && p.n < next);
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
