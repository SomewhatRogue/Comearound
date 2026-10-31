/**
 * The five activities, one per area, all built on one minigame: a lane of things slides past a
 * marker and you press at the right moment. What you get has attributes (a SMALL YELLOW fish),
 * and a recipe may care about only some of them, so a watcher sees the catch but not which part of
 * it counted. Archery also scores precision: how close to the marker decides the ring.
 *
 * The server generates the lane from the room's RNG and judges the press time the client reports
 * (milliseconds from when the lane started on that client), so lag never decides a hit.
 */
import type { Rng } from './rng';

export type ActId = 'fish' | 'fruit' | 'bake' | 'candle' | 'archery' | 'paint';
export type Attrs = Record<string, string>;
/** One result of one attempt, kept in your private basket. */
export interface Catch { act: ActId; attrs: Attrs }

export interface ActDef {
  id: ActId;
  /** Verb shown in prompts and recipes: "Catch a fish". */
  verb: string;
  noun: string;
  plural: string;
  /** The attributes a catch can have, and their values. */
  attrs: Record<string, string[]>;
}

export const ACTS: Record<ActId, ActDef> = {
  fish: { id: 'fish', verb: 'Fish', noun: 'fish', plural: 'fish', attrs: { color: ['yellow', 'blue', 'red'], size: ['small', 'big'] } },
  fruit: { id: 'fruit', verb: 'Pick fruit', noun: 'fruit', plural: 'fruit', attrs: { kind: ['apple', 'pear', 'plum'], size: ['small', 'big'] } },
  bake: { id: 'bake', verb: 'Bake', noun: 'bake', plural: 'bakes', attrs: { kind: ['pie', 'cake', 'bread'], done: ['golden', 'burnt'] } },
  candle: { id: 'candle', verb: 'Light a candle', noun: 'candle', plural: 'candles', attrs: { color: ['white', 'purple', 'gold'], size: ['small', 'big'] } },
  archery: { id: 'archery', verb: 'Shoot', noun: 'arrow', plural: 'arrows', attrs: { target: ['red', 'blue'], ring: ['bullseye', 'inner', 'outer'] } },
  // Painting: you choose medium, colour and subject at the easel (everyone can see them), then a
  // steady-hand press decides how clean it comes out.
  paint: { id: 'paint', verb: 'Paint', noun: 'painting', plural: 'paintings', attrs: { medium: ['oil', 'watercolor', 'crayon'], color: ['yellow', 'blue', 'red', 'green'], subject: ['moon', 'goat', 'frog', 'cottage'], quality: ['perfect', 'good', 'messy'] } },
};

/** Attributes you choose rather than catch (painting). Everything else comes from the lane. */
export const CHOSEN: Partial<Record<ActId, string[]>> = { paint: ['medium', 'color', 'subject'] };

/** One thing sliding past in the lane. `enter` is ms after the lane starts. */
export interface LaneObj { attrs: Attrs; enter: number }
export interface Lane { act: ActId; objs: LaneObj[]; speed: number; dur: number }

/** Lane geometry in normalized units: things travel from x = -1 to x = 1; the marker is at 0. */
export const LANE = { width: 2, hitTol: 0.09, bullseye: 0.025, inner: 0.055 };

export function makeLane(rng: Rng, act: ActId): Lane {
  const def = ACTS[act];
  if (act === 'paint') {
    // One brush stroke crossing the marker: press when it is centred for a clean painting.
    return { act, objs: [{ attrs: {}, enter: 900 + rng.range(0, 700) }], speed: 0.75, dur: 4800 };
  }
  const keys = Object.keys(def.attrs).filter((k) => !(act === 'archery' && k === 'ring'));
  // Every combination twice, shuffled, then take 9: you will usually see what you need, not always.
  const combos: Attrs[] = [{}];
  for (const k of keys) {
    const next: Attrs[] = [];
    for (const c of combos) for (const v of def.attrs[k]) next.push({ ...c, [k]: v });
    combos.splice(0, combos.length, ...next);
  }
  const pool = rng.shuffle([...combos, ...combos]).slice(0, 9);
  const speed = act === 'archery' ? 0.62 : 0.5;
  const gap = act === 'archery' ? 650 : 560;
  const objs = pool.map((attrs, i) => ({ attrs, enter: 400 + i * gap + rng.range(-80, 80) }));
  const last = objs[objs.length - 1].enter;
  return { act, objs, speed, dur: last + (LANE.width / speed) * 1000 * 0.55 };
}

/** Where a lane object is at time t (ms), in lane units. */
export function laneX(lane: Lane, o: LaneObj, t: number): number {
  return -1 + ((t - o.enter) / 1000) * lane.speed;
}

/** The result of pressing at time `at`: what you got (with its ring, for archery), or null. */
export function judgePress(lane: Lane, at: number): Attrs | null {
  if (!(at >= 0 && at <= lane.dur)) return null;
  let best: LaneObj | null = null;
  let bd = LANE.hitTol;
  for (const o of lane.objs) {
    const d = Math.abs(laneX(lane, o, at));
    if (d < bd) [best, bd] = [o, d];
  }
  if (lane.act === 'paint') {
    // A wobbly hand still paints something: a miss is just messy.
    if (!best) return { quality: 'messy' };
    return { quality: bd <= LANE.bullseye * 1.4 ? 'perfect' : bd <= LANE.inner ? 'good' : 'messy' };
  }
  if (!best) return null;
  if (lane.act !== 'archery') return { ...best.attrs };
  return { ...best.attrs, ring: bd <= LANE.bullseye ? 'bullseye' : bd <= LANE.inner ? 'inner' : 'outer' };
}

/** "small yellow fish", "golden pie", "bullseye on red". */
export function describe(act: ActId, a: Attrs): string {
  if (act === 'archery') return `${a.ring} on ${a.target}`;
  if (act === 'fish') return `${a.size} ${a.color} fish`;
  if (act === 'fruit') return `${a.size} ${a.kind}`;
  if (act === 'bake') return `${a.done} ${a.kind}`;
  if (act === 'paint') return `${a.quality ?? ''} ${a.color} ${a.medium} ${a.subject}`.trim();
  return `${a.size} ${a.color} candle`;
}
