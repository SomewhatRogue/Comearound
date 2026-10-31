/**
 * The judge: does a pile of items at a station make a thing? Parts fill in any order and each
 * item fills at most one part, so this is a tiny matching problem (parts are 3 or 4, brute force).
 */
import { THINGS, type ThingDef, type AreaId } from './catalog';

/** Which parts of `thing` the items fill, as a boolean per part, using the best assignment. */
export function filledParts(thing: ThingDef, items: string[]): boolean[] {
  let best: boolean[] = thing.parts.map(() => false);
  let bestCount = 0;
  const used = new Array(items.length).fill(false);
  const cur = thing.parts.map(() => false);
  const walk = (p: number, count: number) => {
    if (count > bestCount) {
      bestCount = count;
      best = cur.slice();
    }
    if (p === thing.parts.length) return;
    walk(p + 1, count);
    for (let i = 0; i < items.length; i++) {
      if (used[i] || !thing.parts[p].accepts.includes(items[i])) continue;
      used[i] = true;
      cur[p] = true;
      walk(p + 1, count + 1);
      cur[p] = false;
      used[i] = false;
    }
  };
  walk(0, 0);
  return best;
}

export function makes(thing: ThingDef, area: AreaId, items: string[]): boolean {
  return thing.area === area && filledParts(thing, items).every(Boolean);
}

/** Every catalog thing the station's contents complete. */
export function thingsMade(area: AreaId, items: string[]): ThingDef[] {
  return THINGS.filter((t) => makes(t, area, items));
}

/**
 * Does adding `item` fill a new part of ANY catalog thing at this area? This is what in-round
 * points reward: honest, and it tells a :( player nothing about which thing is real.
 */
export function fillsAnyPart(area: AreaId, before: string[], item: string): boolean {
  return THINGS.some((t) => {
    if (t.area !== area) return false;
    const a = filledParts(t, before).filter(Boolean).length;
    const b = filledParts(t, [...before, item]).filter(Boolean).length;
    return b > a;
  });
}

/** How many catalog things accept this item in some part. The ambiguity report uses it. */
export function thingsAccepting(item: string): ThingDef[] {
  return THINGS.filter((t) => t.parts.some((p) => p.accepts.includes(item)));
}
