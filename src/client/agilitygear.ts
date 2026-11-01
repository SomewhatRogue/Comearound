/**
 * Agility gear, drawn from the course's pieces (src/shared/agility.ts): striped hurdles on winged
 * stands, a taped tyre hung in a frame, a ribbed blue tunnel, a row of weave poles, and a pause
 * table with a rubber top. Bright, the way club kit is.
 */
import * as THREE from 'three';
import { AG, axes, weavePoles, type AgilityPiece } from '../shared/agility';
import { mat } from './models';

const STRIPES = [['#ffffff', '#d8402f'], ['#ffffff', '#2f6fd8'], ['#ffffff', '#e8b52a']] as const;

function part(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

/** A striped pole along local x, centred at the origin. */
function stripedBar(len: number, r: number, colors: readonly [string, string], n = 6): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, len / n, 8);
  for (let i = 0; i < n; i++) {
    const s = part(geo, colors[i % 2], -len / 2 + (i + 0.5) * (len / n), 0, 0);
    s.rotation.z = Math.PI / 2;
    g.add(s);
  }
  return g;
}

/**
 * One piece, built in its own frame (local x across the run, local z along it), then turned to
 * face its run and set on the ground at `y`.
 */
export function gearMesh(p: AgilityPiece, y: number): THREE.Group {
  const g = new THREE.Group();
  const colors = STRIPES[p.n % STRIPES.length];
  if (p.kind === 'hurdle') {
    const w = AG.hurdleW / 2;
    for (const s of [-1, 1]) {
      g.add(part(new THREE.CylinderGeometry(0.035, 0.04, 0.95, 6), '#f4f1ea', s * w, 0.47, 0));
      // The wing: a slatted panel standing out to the side.
      for (const h of [0.2, 0.45, 0.7]) g.add(part(new THREE.BoxGeometry(0.5, 0.06, 0.04), h === 0.45 ? colors[1] : '#f4f1ea', s * (w + 0.25), h, 0));
      g.add(part(new THREE.CylinderGeometry(0.03, 0.035, 0.8, 6), '#f4f1ea', s * (w + 0.5), 0.4, 0));
      g.add(part(new THREE.BoxGeometry(0.7, 0.04, 0.3), '#8a8f96', s * (w + 0.22), 0.02, 0, false));
    }
    const bar = stripedBar(AG.hurdleW + 0.04, 0.03, colors);
    bar.position.y = 0.45;
    g.add(bar);
  }
  if (p.kind === 'tire') {
    const side = AG.tireW / 2 + 0.33;
    const top = AG.tireY + 0.75;
    for (const s of [-1, 1]) {
      g.add(part(new THREE.BoxGeometry(0.08, top, 0.08), '#f4f1ea', s * side, top / 2, 0));
      g.add(part(new THREE.BoxGeometry(0.1, 0.05, 0.9), '#8a8f96', s * side, 0.025, 0, false));
    }
    g.add(part(new THREE.BoxGeometry(side * 2 + 0.08, 0.08, 0.08), '#f4f1ea', 0, top, 0));
    // The tyre: black, taped in the course colour, hung on four cords.
    const arcs = 8;
    for (let i = 0; i < arcs; i++) {
      const seg = part(new THREE.TorusGeometry(0.52, 0.08, 6, 6, (Math.PI * 2) / arcs), i % 2 ? '#26272b' : colors[1], 0, AG.tireY, 0);
      seg.rotation.z = (i * Math.PI * 2) / arcs;
      g.add(seg);
    }
    const cord = new THREE.CylinderGeometry(0.008, 0.008, 1, 4);
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4]) {
      const [cx, cy] = [Math.cos(a) * 0.6, AG.tireY + Math.sin(a) * 0.6];
      const [tx, ty] = [Math.sign(Math.cos(a)) * side, a > 0 ? top : 0.05];
      const len = Math.hypot(tx - cx, ty - cy);
      const c = part(cord, '#333333', (cx + tx) / 2, (cy + ty) / 2, 0, false);
      c.scale.y = len;
      c.rotation.z = Math.atan2(-(tx - cx), ty - cy);
      g.add(c);
    }
  }
  if (p.kind === 'tunnel') {
    const r = AG.tunnelR + 0.04;
    const len = AG.tunnelLen;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18, 1, true), mat('#2f7fd8', { side: THREE.DoubleSide }));
    body.rotation.x = Math.PI / 2;
    body.position.y = r * 0.8;
    body.castShadow = true;
    g.add(body);
    // Ribs every so often, and sandbags over it to hold it down.
    for (let z = -len / 2; z <= len / 2 + 1e-6; z += len / 8) {
      const rib = part(new THREE.TorusGeometry(r + 0.01, 0.025, 4, 18), '#1f5ea8', 0, r * 0.8, z, false);
      g.add(rib);
    }
    for (const z of [-len / 3, len / 3]) for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.3, 0.14, 0.32), '#b89a62', s * (r + 0.05), 0.07, z));
  }
  if (p.kind === 'weave') {
    const poles = weavePoles();
    const span = poles[poles.length - 1] - poles[0];
    g.add(part(new THREE.BoxGeometry(0.08, 0.03, span + 0.3), '#8a8f96', 0, 0.015, 0, false));
    poles.forEach((z, i) => g.add(part(new THREE.CylinderGeometry(0.024, 0.024, 1.0, 6), i % 2 ? colors[1] : '#f4f1ea', 0, 0.5, z)));
  }
  if (p.kind === 'table') {
    const s = AG.table;
    g.add(part(new THREE.BoxGeometry(s, 0.06, s), '#e9eef2', 0, AG.tableH - 0.05, 0));
    g.add(part(new THREE.BoxGeometry(s - 0.08, 0.02, s - 0.08), colors[1], 0, AG.tableH - 0.01, 0, false));
    for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.06, AG.tableH - 0.08, 0.06), '#c9ced4', x * (s / 2 - 0.06), (AG.tableH - 0.08) / 2, z * (s / 2 - 0.06)));
  }
  // Local z runs along the course: face the piece's run direction.
  const { ux, uz } = axes(p);
  g.rotation.y = Math.atan2(ux, uz);
  g.position.set(p.x, y, p.z);
  return g;
}
