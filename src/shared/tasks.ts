/**
 * Tasks: a round is a short sequence of them, one activity each. Everyone sees WHICH activity
 * ("Task 2 of 3: fishing"); only knowers see the exact ask ("Catch a small yellow fish for the frog
 * king"). Your best attempt at each task is scored at the end by how close it came to the ask.
 */
import { ACTS, type ActId, type Attrs, type Catch } from './activities';
import type { Rng } from './rng';

export interface Task {
  act: ActId;
  /** The attributes that were asked for. */
  want: Attrs;
  text: string;
}

/** Which attributes an ask specifies, per activity. Painting asks for all three choices. */
const ASKED: Record<ActId, string[]> = {
  fish: ['size', 'color'],
  fruit: ['size', 'kind'],
  bake: ['done', 'kind'],
  candle: ['size', 'color'],
  archery: ['target'],
  paint: ['subject', 'color', 'medium'],
};

const FOR = ['for the frog king', 'for the moon', "for the goat's birthday", 'for the ghost in the shed', "for the well's wedding", 'for the mayor (a frog)'];

export function askText(act: ActId, w: Attrs, forWho = ''): string {
  const tail = forWho ? ` ${forWho}` : '';
  switch (act) {
    case 'fish': return `Catch a ${w.size} ${w.color} fish${tail}`;
    case 'fruit': return `Pick a ${w.size} ${w.kind}${tail}`;
    case 'bake': return `Bake a ${w.done} ${w.kind}${tail}`;
    case 'candle': return `Light a ${w.size} ${w.color} candle${tail}`;
    case 'archery': return `Hit a bullseye on the ${w.target} target${tail}`;
    case 'paint': return `Paint the ${w.subject} in ${w.color} ${w.medium}${tail}`;
  }
}

export function makeTask(rng: Rng, act: ActId): Task {
  const want: Attrs = {};
  for (const k of ASKED[act]) want[k] = rng.pick(ACTS[act].attrs[k]);
  if (act === 'bake' && rng.next() < 0.75) want.done = 'golden'; // burnt is funny, but rarely asked for
  return { act, want, text: askText(act, want, rng.pick(FOR)) };
}

/** Pick a round's tasks: different activities, in a random order. */
export function makeTasks(rng: Rng, n: number): Task[] {
  return rng.shuffle(Object.keys(ACTS) as ActId[]).slice(0, n).map((a) => makeTask(rng, a));
}

/** How close a catch came to the ask, 0 to 1. Archery's ring and painting's quality scale it. */
export function closeness(task: Task, c: Catch | null): number {
  if (!c || c.act !== task.act) return 0;
  const keys = Object.keys(task.want);
  const hits = keys.filter((k) => c.attrs[k] === task.want[k]).length / keys.length;
  if (task.act === 'archery') return hits * ({ bullseye: 1, inner: 0.6, outer: 0.3 }[c.attrs.ring] ?? 0);
  if (task.act === 'paint') return hits * ({ perfect: 1, good: 0.8, messy: 0.5 }[c.attrs.quality] ?? 0.5);
  return hits;
}

/** Points for a task: 100 for exactly what was asked. */
export const TASK_POINTS = 100;
export const SAD_MULTIPLIER = 2;
