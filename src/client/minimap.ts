/**
 * The minimap: the whole field from above, small, in a corner. Sheep as dots (white, black, or team
 * colours), goats in brown, dogs in their collar colours, you with a ring. Water, mud, pens and
 * the broken fence drawn in. Redrawn a few times a second.
 */
import { gateOf, penWalls, type FieldDef } from '../shared/field';
import type { PublicView } from '../shared/protocol';
import { TEAM_COLORS } from './scene';

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private at = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  draw(pub: PublicView, f: FieldDef, you: string, now: number): void {
    const show = pub.phase === 'playing' || pub.phase === 'intro';
    this.canvas.hidden = !show;
    if (!show || now - this.at < 120) return;
    this.at = now;
    const W = 150;
    const scale = W / f.w;
    const H = Math.round(f.d * scale);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== W * dpr || this.canvas.height !== H * dpr) {
      [this.canvas.width, this.canvas.height] = [W * dpr, H * dpr];
      this.canvas.style.width = `${W}px`;
      this.canvas.style.height = `${H}px`;
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => (x + f.w / 2) * scale;
    const Z = (z: number) => (z + f.d / 2) * scale;
    c.fillStyle = '#8fb565';
    c.fillRect(0, 0, W, H);
    // Water and mud.
    c.lineCap = 'round';
    for (const s of f.streams ?? []) {
      c.strokeStyle = '#5aa2c8';
      c.lineWidth = s.w * scale;
      c.beginPath();
      s.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))));
      c.stroke();
      c.strokeStyle = '#b08a5a';
      c.lineWidth = s.w * scale * 0.9;
      for (const b of s.bridges) {
        c.beginPath();
        c.arc(X(b.x), Z(b.z), (b.w / 2) * scale, 0, Math.PI * 2);
        c.fillStyle = '#b08a5a';
        c.fill();
      }
    }
    for (const o of f.obstacles) {
      c.fillStyle = o.kind === 'pond' ? '#5aa2c8' : o.kind === 'bramble' ? '#3f5e2c' : o.kind === 'tree' ? '#557f3e' : o.kind === 'windmill' ? '#f1e7d0' : '#a39d90';
      c.beginPath();
      c.arc(X(o.x), Z(o.z), Math.max(1.5, o.r * scale), 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#6e5236';
    for (const m of f.mud ?? []) {
      c.beginPath();
      c.arc(X(m.x), Z(m.z), m.r * scale, 0, Math.PI * 2);
      c.fill();
    }
    // Pens: floor, fence, and the gate marked.
    for (const p of f.pens) {
      c.fillStyle = p.team === null ? '#cdb489' : f.sort ? (p.team ? '#3d3634' : '#fffaf0') : TEAM_COLORS[p.team];
      c.globalAlpha = p.team === null || f.sort ? 0.9 : 0.55;
      c.fillRect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w * scale, p.d * scale);
      c.globalAlpha = 1;
      c.strokeStyle = '#5a4030';
      c.lineWidth = 1.5;
      for (const w of penWalls(p)) {
        c.beginPath();
        c.moveTo(X(w.ax), Z(w.az));
        c.lineTo(X(w.bx), Z(w.bz));
        c.stroke();
      }
      const g = gateOf(p);
      c.fillStyle = '#f2c84b';
      c.beginPath();
      c.arc(X(g.x + g.ox * 0.6), Z(g.z + g.oz * 0.6), 2, 0, Math.PI * 2);
      c.fill();
    }
    // The broken fence.
    c.strokeStyle = '#c2463b';
    c.lineWidth = 3;
    for (const gap of f.gaps ?? []) {
      c.beginPath();
      if (gap.side === 'n' || gap.side === 's') {
        const z = gap.side === 'n' ? 1.5 : H - 1.5;
        c.moveTo(X(gap.at - gap.w / 2), z);
        c.lineTo(X(gap.at + gap.w / 2), z);
      } else {
        const x = gap.side === 'w' ? 1.5 : W - 1.5;
        c.moveTo(x, Z(gap.at - gap.w / 2));
        c.lineTo(x, Z(gap.at + gap.w / 2));
      }
      c.stroke();
    }
    // Sheep, goats, dogs.
    for (const s of pub.sheep) {
      if (s.lost) continue;
      c.fillStyle = f.sort ? (s.team ? '#2b2624' : '#ffffff') : s.team !== null && pub.mode === 'versus' ? TEAM_COLORS[s.team] : '#ffffff';
      c.beginPath();
      c.arc(X(s.x), Z(s.z), 2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#8a5a34';
    for (const g of pub.goats) {
      c.beginPath();
      c.arc(X(g.x), Z(g.z), 2.6, 0, Math.PI * 2);
      c.fill();
    }
    for (const d of pub.dogs) {
      if (d.spectator) continue;
      c.fillStyle = d.look.collar;
      c.strokeStyle = d.id === you ? '#f2c84b' : '#2b2a22';
      c.lineWidth = d.id === you ? 2 : 1;
      c.beginPath();
      c.arc(X(d.x), Z(d.z), d.id === you ? 3.6 : 2.8, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.strokeStyle = '#5a4030';
    c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }
}
