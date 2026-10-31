/**
 * Drawing the hazards, from the same FieldDef the rules use: streams (water, banks, stones,
 * reeds) with wooden bridges, mud wallows, bramble thickets, and the broken bit of fence.
 */
import * as THREE from 'three';
import { bridgeEnds, waterSegments, type FieldDef, type Stream } from '../shared/field';
import { Rng } from '../shared/rng';
import { at, mat, mesh } from './models';
import { label } from './scene';

export function buildHazards(f: FieldDef): THREE.Group {
  const g = new THREE.Group();
  const rng = new Rng(f.w * 31 + f.d);
  for (const s of f.streams ?? []) g.add(stream(s, rng));
  for (const m of f.mud ?? []) g.add(mud(m.x, m.z, m.r, rng));
  for (const o of f.obstacles) if (o.kind === 'bramble') g.add(bramble(o.x, o.z, o.r, rng));
  for (const gap of f.gaps ?? []) {
    const [x, z] = gap.side === 'n' ? [gap.at, -f.d / 2] : gap.side === 's' ? [gap.at, f.d / 2] : gap.side === 'w' ? [-f.w / 2, gap.at] : [f.w / 2, gap.at];
    g.add(brokenFence(x, z, gap.side === 'n' || gap.side === 's', gap.w, rng));
  }
  return g;
}

/** A flat ribbon along a polyline (y up), width w. */
function ribbon(pts: [number, number][], w: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach(([x, z], i) => {
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = nx - px;
    const dz = nz - pz;
    const l = Math.hypot(dx, dz) || 1;
    // Miter-ish: the normal of the averaged direction, widened a little at bends.
    const [ox, oz] = [-dz / l, dx / l];
    pos.push(x + (ox * w) / 2, y, z + (oz * w) / 2, x - (ox * w) / 2, y, z - (oz * w) / 2);
    if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Split a polyline finely so the ribbon bends smoothly at the joints. */
function finer(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function stream(s: Stream, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const pts = finer(s.pts);
  const bank = new THREE.Mesh(ribbon(pts, s.w + 1.1, 0.012), mat('#6f6a45', { roughness: 1, side: THREE.DoubleSide }));
  bank.receiveShadow = true;
  const water = new THREE.Mesh(ribbon(pts, s.w, 0.03), new THREE.MeshStandardMaterial({ color: '#5aa2c8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
  water.receiveShadow = true;
  water.name = 'water';
  g.add(bank, water);
  // Lighter ripples down the middle.
  const mid = new THREE.Mesh(ribbon(pts, s.w * 0.35, 0.035), new THREE.MeshBasicMaterial({ color: '#d4f0fb', transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  mid.name = 'ripple';
  g.add(mid);
  // Stones and reeds along the banks (not on the bridges).
  const segs = waterSegments(s);
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), mat('#a39d90'), 60);
  const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 3), mat('#5d7a3a'), 90);
  const tops = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.04, 0.12, 2, 4), mat('#6b4226'), 90);
  const m = new THREE.Matrix4();
  let ks = 0;
  let kr = 0;
  for (const q of segs) {
    const len = Math.hypot(q.bx - q.ax, q.bz - q.az);
    const [ux, uz] = [(q.bx - q.ax) / len, (q.bz - q.az) / len];
    for (let d = 0.6; d < len - 0.6; d += 1.3) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const off = s.w / 2 + rng.range(0.15, 0.5);
      const x = q.ax + ux * d - uz * off * side;
      const z = q.az + uz * d + ux * off * side;
      if (rng.next() < 0.45 && ks < stones.count) {
        const sc = rng.range(0.6, 1.4);
        m.compose(new THREE.Vector3(x, 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), 0)), new THREE.Vector3(sc, sc * 0.6, sc));
        stones.setMatrixAt(ks++, m);
      } else if (kr < reeds.count) {
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)));
        m.compose(new THREE.Vector3(x, 0.4, z), tilt, new THREE.Vector3(1, 1, 1));
        reeds.setMatrixAt(kr, m);
        m.compose(new THREE.Vector3(x, 0.78, z), tilt, new THREE.Vector3(1, 1, 1));
        tops.setMatrixAt(kr++, m);
      }
    }
  }
  stones.count = ks;
  reeds.count = tops.count = kr;
  stones.castShadow = true;
  g.add(stones, reeds, tops);
  for (const b of s.bridges) g.add(bridge(s, b));
  return g;
}

/** A plank bridge with rails, laid across the stream. */
function bridge(s: Stream, b: { x: number; z: number; w: number }): THREE.Group {
  const e = bridgeEnds(s, b);
  const g = new THREE.Group();
  const len = s.w + 1.8;
  const deck = new THREE.Group();
  for (let i = 0; i < Math.round(len / 0.35); i++) {
    const plank = mesh(new THREE.BoxGeometry(b.w, 0.08, 0.3), i % 2 ? '#b08a5a' : '#a47f50');
    plank.position.set(0, 0.16 + Math.sin((i / (len / 0.35)) * Math.PI) * 0.12, -len / 2 + 0.17 + i * 0.35);
    deck.add(plank);
  }
  for (const side of [-1, 1]) {
    deck.add(at(mesh(new THREE.BoxGeometry(0.08, 0.08, len), '#8a6a42'), (side * b.w) / 2, 0.75, 0));
    for (const z of [-len / 2 + 0.1, 0, len / 2 - 0.1]) deck.add(at(mesh(new THREE.BoxGeometry(0.1, 0.75, 0.1), '#7a5a36'), (side * b.w) / 2, 0.4, z));
  }
  deck.rotation.y = Math.atan2(e.ux, e.uz);
  g.add(deck);
  g.position.set(b.x, 0, b.z);
  return g;
}

function mud(x: number, z: number, r: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CircleGeometry(r, 14), mat('#6e5236', { roughness: 0.45, metalness: 0.05 }));
  base.rotation.x = -Math.PI / 2;
  base.scale.set(1, rng.range(0.75, 1), 1);
  base.position.y = 0.02;
  base.receiveShadow = true;
  g.add(base);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.25, 0.6), 10), mat('#8a6a48', { roughness: 0.2, metalness: 0.1 }));
    p.rotation.x = -Math.PI / 2;
    const a = rng.range(0, 6.28);
    p.position.set(Math.cos(a) * r * 0.5, 0.025, Math.sin(a) * r * 0.5);
    g.add(p);
  }
  g.position.set(x, 0, z);
  return g;
}

function bramble(x: number, z: number, r: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, 6.28);
    const blob = mesh(new THREE.IcosahedronGeometry(r * rng.range(0.55, 0.8), 0), i % 2 ? '#3f5e2c' : '#4a6b32');
    blob.position.set(Math.cos(a) * r * 0.35, r * rng.range(0.45, 0.7), Math.sin(a) * r * 0.35);
    blob.scale.y = 0.8;
    g.add(blob);
  }
  // Thorns and berries, so it reads as "ouch" from above.
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, 6.28);
    const h = rng.range(0.3, 1.0) * r;
    const thorn = mesh(new THREE.ConeGeometry(0.05, 0.25, 3), '#7a8a4a', false);
    thorn.position.set(Math.cos(a) * r * 0.85, h, Math.sin(a) * r * 0.85);
    thorn.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    g.add(thorn);
    const berry = mesh(new THREE.SphereGeometry(0.07, 6, 4), i % 3 ? '#3b1f3a' : '#b8323a', false);
    berry.position.set(Math.cos(a + 0.5) * r * 0.7, h + 0.15, Math.sin(a + 0.5) * r * 0.7);
    g.add(berry);
  }
  g.position.set(x, 0, z);
  return g;
}

/** The gap: snapped posts, a rail on the ground, and a sign. */
function brokenFence(x: number, z: number, alongX: boolean, w: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), '#8a6a42');
    post.position.set(alongX ? (side * w) / 2 : 0, 0.27, alongX ? 0 : (side * w) / 2);
    post.rotation.set(rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3));
    g.add(post);
  }
  const rail = mesh(new THREE.BoxGeometry(alongX ? w * 0.7 : 0.08, 0.08, alongX ? 0.08 : w * 0.7), '#c8a46e');
  rail.position.set(alongX ? -w * 0.1 : 0.4, 0.05, alongX ? 0.5 : -w * 0.1);
  rail.rotation.y = 0.3;
  g.add(rail);
  const sign = label('BROKEN FENCE', 'gap-label');
  sign.position.set(0, 1.4, 0);
  g.add(sign);
  g.position.set(x, 0, z);
  return g;
}
