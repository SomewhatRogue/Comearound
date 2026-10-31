/**
 * The catalog: every item and every thing a round can deal.
 * Content is data. A new thing is a new entry here, not new code.
 *
 * Design rule (docs/DESIGN.md): things are built from parts, parts are shared.
 * Every thing in the catalog must be makeable on the map, or the unmakeable ones
 * become free eliminations for the :( player. `tests/catalog.test.ts` enforces it.
 */

export type AreaId = 'kitchen' | 'garden' | 'pond' | 'chapel';

export interface ItemDef {
  id: string;
  name: string;
  /** Primitive used until real art lands. */
  shape: 'ball' | 'tall' | 'cup' | 'box' | 'flat' | 'cone';
  color: string;
  /** Area the item usually spawns in. */
  home: AreaId;
}

export interface PartDef {
  /** What the board and the tutorial call this part, e.g. "something round". */
  label: string;
  /** Any one of these items fills the part. */
  accepts: string[];
}

export interface ThingDef {
  id: string;
  name: string;
  area: AreaId;
  parts: PartDef[];
}

export const ITEMS: ItemDef[] = [
  { id: 'apple', name: 'Apple', shape: 'ball', color: '#d8433a', home: 'garden' },
  { id: 'pear', name: 'Pear', shape: 'ball', color: '#b8c94a', home: 'garden' },
  { id: 'pumpkin', name: 'Pumpkin', shape: 'ball', color: '#e98a2b', home: 'garden' },
  { id: 'mushroom', name: 'Mushroom', shape: 'cone', color: '#c05a8a', home: 'pond' },
  { id: 'fish', name: 'Fish', shape: 'flat', color: '#6fa8c9', home: 'pond' },
  { id: 'candle', name: 'Candle', shape: 'tall', color: '#f4e3b5', home: 'chapel' },
  { id: 'lantern', name: 'Lantern', shape: 'box', color: '#f2c14e', home: 'chapel' },
  { id: 'bell', name: 'Bell', shape: 'cone', color: '#d9b44a', home: 'chapel' },
  { id: 'teacup', name: 'Teacup', shape: 'cup', color: '#f2f2f2', home: 'kitchen' },
  { id: 'bowl', name: 'Bowl', shape: 'cup', color: '#8a6a4f', home: 'kitchen' },
  { id: 'pietin', name: 'Pie tin', shape: 'flat', color: '#b9bec4', home: 'kitchen' },
  { id: 'bucket', name: 'Bucket', shape: 'cup', color: '#7d8a96', home: 'pond' },
  { id: 'boot', name: 'Boot', shape: 'box', color: '#5b3d2b', home: 'garden' },
  { id: 'hat', name: 'Hat', shape: 'cone', color: '#3d4a7a', home: 'kitchen' },
  { id: 'ribbon', name: 'Ribbon', shape: 'flat', color: '#e86aa6', home: 'chapel' },
  { id: 'flower', name: 'Flower', shape: 'cone', color: '#f5d23d', home: 'garden' },
  { id: 'hay', name: 'Hay', shape: 'box', color: '#e2c26a', home: 'garden' },
  { id: 'stick', name: 'Stick', shape: 'tall', color: '#8b5a2b', home: 'pond' },
];

const round = ['apple', 'pear', 'pumpkin'];
const light = ['candle', 'lantern'];
const fancy = ['ribbon', 'flower'];

export const THINGS: ThingDef[] = [
  { id: 'moonpie', name: 'Bake a pie for the moon', area: 'kitchen', parts: [
    { label: 'something round', accepts: round },
    { label: 'something to bake in', accepts: ['pietin', 'bowl'] },
    { label: 'a light', accepts: light },
  ] },
  { id: 'teaparty', name: 'Host a tea party for the scarecrow', area: 'kitchen', parts: [
    { label: 'a teacup', accepts: ['teacup'] },
    { label: 'something to wear', accepts: ['hat', 'ribbon'] },
    { label: 'a snack', accepts: ['apple', 'pear', 'mushroom'] },
  ] },
  { id: 'goatparty', name: 'Throw the goat a birthday party', area: 'garden', parts: [
    { label: 'a treat', accepts: [...round, 'mushroom'] },
    { label: 'a light', accepts: ['candle'] },
    { label: 'something fancy', accepts: fancy },
  ] },
  { id: 'scarecrow', name: 'Build a scarecrow the crow respects', area: 'garden', parts: [
    { label: 'something tall', accepts: ['stick'] },
    { label: 'something to wear', accepts: ['hat', 'ribbon'] },
    { label: 'a head', accepts: ['pumpkin', 'bucket', 'apple'] },
  ] },
  { id: 'bootgarden', name: 'Plant a garden in a boot', area: 'garden', parts: [
    { label: 'a boot', accepts: ['boot'] },
    { label: 'something growing', accepts: ['flower', 'mushroom'] },
    { label: 'something to water with', accepts: ['bucket', 'teacup'] },
  ] },
  { id: 'fishfuneral', name: 'Hold a funeral for a fish', area: 'pond', parts: [
    { label: 'the fish', accepts: ['fish'] },
    { label: 'a light', accepts: light },
    { label: 'something fancy', accepts: fancy },
  ] },
  { id: 'snailbed', name: 'Make a bed for the giant snail', area: 'pond', parts: [
    { label: 'something soft', accepts: ['hay'] },
    { label: 'something to sleep in', accepts: ['boot', 'bucket', 'bowl'] },
    { label: 'something cozy', accepts: ['ribbon', 'hat'] },
  ] },
  { id: 'frogthrone', name: 'Build a throne for the biggest frog', area: 'pond', parts: [
    { label: 'a seat', accepts: ['boot', 'bucket'] },
    { label: 'something regal', accepts: ['hat', 'ribbon'] },
    { label: 'a garnish', accepts: ['flower', 'mushroom'] },
  ] },
  { id: 'ghostsoup', name: 'Make soup for the ghost', area: 'chapel', parts: [
    { label: 'something to hold soup', accepts: ['bowl', 'bucket', 'teacup'] },
    { label: 'something to stew', accepts: ['mushroom', 'fish', 'pumpkin'] },
    { label: 'a light', accepts: light },
  ] },
  { id: 'wellwedding', name: 'Dress up the well for its wedding', area: 'chapel', parts: [
    { label: 'something fancy', accepts: fancy },
    { label: 'something that rings', accepts: ['bell'] },
    { label: 'a light', accepts: light },
  ] },
];

export const itemById = new Map(ITEMS.map((i) => [i.id, i]));
export const thingById = new Map(THINGS.map((t) => [t.id, t]));
