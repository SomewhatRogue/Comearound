/**
 * The intro tour: when a field starts, the camera shows you the pen (or pens), then each group
 * of sheep with a little "8 sheep" tag, then comes down to your dog. It runs during the field's
 * intro countdown, so nobody waits for it.
 */
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { FieldDef } from '../shared/field';
import type { PublicView } from '../shared/protocol';
import { label, type Stage } from './scene';

type P = { x: number; z: number };
const PEN_SEC = 1.7;
const SHEEP_SEC = 2.6;

export class IntroTour {
  private key = '';
  private started = 0;
  private shots: { at: P; until: number }[] = [];
  private tags: CSS2DObject[] = [];

  constructor(private stage: Stage) {}

  /** Where the camera should look right now, or null when the tour is over. */
  focus(pub: PublicView, f: FieldDef, dog: P, now: number): P | null {
    const key = pub.phase === 'intro' ? `${pub.fieldId}:${pub.fieldIdx}` : '';
    if (key !== this.key) {
      this.key = key;
      this.clear();
      if (key) this.plan(pub, f, now);
    }
    if (!key) return null;
    const t = (now - this.started) / 1000;
    if (t > PEN_SEC + SHEEP_SEC + 1) this.clear();
    const shot = this.shots.find((s) => t < s.until);
    return shot ? shot.at : dog;
  }

  private plan(pub: PublicView, f: FieldDef, now: number): void {
    this.started = now;
    const pens = { x: f.pens.reduce((a, p) => a + p.x, 0) / f.pens.length, z: f.pens.reduce((a, p) => a + p.z, 0) / f.pens.length };
    const groups = clusters(pub.sheep.filter((s) => !s.lost)).slice(0, 3);
    this.shots = [{ at: pens, until: PEN_SEC }];
    groups.forEach((g, i) => {
      this.shots.push({ at: g.c, until: PEN_SEC + (SHEEP_SEC * (i + 1)) / groups.length });
      const tag = label(`${g.n} sheep`, 'intro-tag');
      tag.position.set(g.c.x, 2.2, g.c.z);
      this.stage.scene.add(tag);
      this.tags.push(tag);
    });
  }

  private clear(): void {
    for (const t of this.tags) {
      this.stage.scene.remove(t);
      t.element.remove();
    }
    this.tags = [];
  }
}

/** Groups of sheep: anyone within 5 m of a member joins. Biggest first. */
function clusters(sheep: P[]): { c: P; n: number }[] {
  const left = new Set(sheep);
  const out: { c: P; n: number }[] = [];
  for (const seed of sheep) {
    if (!left.has(seed)) continue;
    left.delete(seed);
    const m = [seed];
    for (let k = 0; k < m.length; k++) for (const o of left) if (Math.hypot(o.x - m[k].x, o.z - m[k].z) < 5) (left.delete(o), m.push(o));
    out.push({ c: { x: m.reduce((a, o) => a + o.x, 0) / m.length, z: m.reduce((a, o) => a + o.z, 0) / m.length }, n: m.length });
  }
  return out.sort((a, b) => b.n - a.n);
}
