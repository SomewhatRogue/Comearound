/**
 * The levels. Gentle trials teach the moves; Tricky trials add hazards: streams you can only cross
 * at a bridge, mud, brambles, a broken fence where sheep get out, wind, and more goats.
 */
import { course } from './agility';
import type { FieldDef } from './field';

/** The Gentle course: learn the moves, meet the goat, then a big windy field. */
export const TRIALS: FieldDef[] = [
  {
    id: 'meadow', name: 'The Meadow', w: 40, d: 30, timeLimit: 100,
    pens: [{ x: 13, z: 0, w: 7, d: 6, gate: 'w', gateW: 3.2, team: null }],
    obstacles: [{ kind: 'tree', x: -6, z: -9, r: 1.2 }, { kind: 'tree', x: 2, z: 10, r: 1.2 }, { kind: 'rock', x: 4, z: -4, r: 0.9 }],
    flocks: [{ x: -8, z: 2, n: 8, team: null }],
    goats: [],
    // An old bit of fence along the bottom: the sheep go round it, a dog just hops it.
    lowFences: [{ a: [5.5, 15], b: [5.5, 9.5], broken: true }, { a: [-2, -10], b: [1.5, -11.5], kind: 'log' }, { a: [10, -9], b: [12.5, -11], kind: 'stones' }],
    starts: [{ x: -16, z: -3, team: 0 }, { x: -16, z: 3, team: 0 }, { x: -15, z: 0, team: 0 }],
  },
  {
    id: 'orchard', name: 'Old Orchard', w: 44, d: 32, timeLimit: 120,
    pens: [{ x: 0, z: -11, w: 8, d: 6, gate: 's', gateW: 2.8, team: null }],
    obstacles: [
      ...[-12, -6, 6, 12].flatMap((x) => [{ kind: 'tree' as const, x, z: -2, r: 1.2 }, { kind: 'tree' as const, x: x + 3, z: 4, r: 1.2 }]),
      { kind: 'pond', x: -14, z: 9, r: 3 }, { kind: 'hay', x: 9, z: -9, r: 1 },
    ],
    flocks: [{ x: -7, z: 7, n: 7, team: null }, { x: 11, z: 8, n: 5, team: null }],
    goats: [{ x: 2, z: 7 }],
    lowFences: [{ a: [16, -6], b: [18.5, -8.5], kind: 'log' }, { a: [-17, -8], b: [-14.5, -10], kind: 'log' }, { a: [-9, 13], b: [-5, 13.6], kind: 'stones' }],
    wind: { dir: 0.6, strength: 0.3 },
    starts: [{ x: 2, z: 14.5, team: 0 }, { x: -1, z: 14.5, team: 0 }, { x: 5, z: 14.5, team: 0 }],
  },
  {
    id: 'hillside', name: 'Windy Hillside', w: 48, d: 34, timeLimit: 150,
    pens: [{ x: -17, z: -11, w: 7, d: 6, gate: 'e', gateW: 2.4, team: null }],
    obstacles: [
      { kind: 'pond', x: 0, z: 0, r: 4 }, { kind: 'rock', x: -8, z: -4, r: 1.2 }, { kind: 'rock', x: 9, z: -8, r: 1.4 },
      { kind: 'tree', x: -12, z: 6, r: 1.3 }, { kind: 'tree', x: 13, z: 7, r: 1.3 }, { kind: 'hay', x: -6, z: -12, r: 1 }, { kind: 'hay', x: 4, z: 11, r: 1 },
    ],
    flocks: [{ x: 12, z: 8, n: 8, team: null }, { x: 14, z: -6, n: 8, team: null }],
    goats: [{ x: 6, z: 2 }],
    // The remains of an old field boundary down the south-west: hop it to get round the flock.
    lowFences: [{ a: [-9, 17], b: [-9, 11] }, { a: [-9, 11], b: [-12, 8], broken: true }, { a: [20, -17], b: [17, -12] }, { a: [2, -12], b: [5, -14.5], kind: 'log' }, { a: [15, 13], b: [19, 12], kind: 'stones' }],
    wind: { dir: Math.PI, strength: 0.6, gusty: true },
    starts: [{ x: 20, z: 0, team: 0 }, { x: 20, z: 4, team: 0 }, { x: 20, z: -4, team: 0 }],
  },
];

/** Versus: one field, two halves, two pens. Sheep wear their team's colour and only count in their own pen. */
export const VERSUS: FieldDef = {
  id: 'fieldday', name: 'Field Day', w: 52, d: 30, timeLimit: 150,
  pens: [
    { x: -21, z: 0, w: 6, d: 7, gate: 'e', gateW: 3, team: 0 },
    { x: 21, z: 0, w: 6, d: 7, gate: 'w', gateW: 3, team: 1 },
  ],
  obstacles: [{ kind: 'tree', x: -8, z: -8, r: 1.2 }, { kind: 'tree', x: 8, z: 8, r: 1.2 }, { kind: 'rock', x: -9, z: 7, r: 1 }, { kind: 'rock', x: 9, z: -7, r: 1 }, { kind: 'hay', x: 0, z: -11, r: 1 }, { kind: 'hay', x: 0, z: 11, r: 1 }],
  // Both flocks graze in the middle, side by side: you have to get yours out past theirs.
  flocks: [{ x: 1, z: -5, n: 7, team: 0 }, { x: -1, z: 5, n: 7, team: 1 }],
  goats: [{ x: 0, z: 0 }],
    lowFences: [{ a: [-12, 11], b: [-9, 12.5], kind: 'log' }, { a: [12, -11], b: [9, -12.5], kind: 'log' }],
  wind: { dir: -Math.PI / 2, strength: 0.25 },
  starts: [{ x: -16, z: -9, team: 0 }, { x: -16, z: 9, team: 0 }, { x: -17, z: 0, team: 0 }, { x: 16, z: 9, team: 1 }, { x: 16, z: -9, team: 1 }, { x: 17, z: 0, team: 1 }],
};

/** A little agility loop in the south-east corner of Big Sky Pasture. */
const BIGSKY_AGILITY = course([
  { kind: 'hurdle', x: 22, z: -19, dir: 0 },
  { kind: 'tunnel', x: 26.5, z: -19.5, dir: 0 },
  { kind: 'weave', x: 31.5, z: -18, dir: -Math.PI / 2 },
  { kind: 'tire', x: 27, z: -15.5, dir: Math.PI },
  { kind: 'hurdle', x: 22.5, z: -15, dir: Math.PI },
]);

/** Tricky course: hazards and more goats. */
export const TRICKY: FieldDef[] = [
  {
    // A brook cuts the field in two. Two bridges; mud at the near end of the big one.
    id: 'brook', name: 'Brook Farm', w: 46, d: 32, timeLimit: 130,
    pens: [{ x: 16, z: -8, w: 7, d: 6, gate: 'w', gateW: 3, team: null }],
    streams: [{ pts: [[-3, -17], [-1, -9], [-4, -2], [1, 5], [-1, 11], [2, 17]], w: 2.2, bridges: [{ x: -2.5, z: -5.5, w: 3.2 }, { x: 0, z: 8, w: 2.4 }] }],
    mud: [{ x: 2.5, z: -5, r: 2.2 }],
    obstacles: [{ kind: 'tree', x: 9, z: 6, r: 1.3 }, { kind: 'tree', x: 13, z: 12, r: 1.2 }, { kind: 'tree', x: -15, z: -10, r: 1.3 }, { kind: 'rock', x: 8, z: -12, r: 1 }, { kind: 'hay', x: -12, z: 12, r: 1 }],
    flocks: [{ x: -13, z: 4, n: 10, team: null }],
    goats: [{ x: -9, z: -9 }],
    lowFences: [{ a: [-18, -6], b: [-15, -8], kind: 'log' }, { a: [17, 4], b: [20, 6], kind: 'stones' }],
    starts: [{ x: -21, z: 2, team: 0 }, { x: -21, z: 6, team: 0 }, { x: -21, z: -2, team: 0 }],
    wind: { dir: 0, strength: 0.45 },
  },
  {
    // A lane between brambles leads to the pen. The north fence is broken, and the wind blows north.
    id: 'lane', name: 'Bramble Lane', w: 50, d: 30, timeLimit: 140,
    pens: [{ x: -20, z: 0, w: 6, d: 7, gate: 'e', gateW: 3, team: null }],
    obstacles: [
      ...[-12, -9.8, -7.6, -5.4, -3.2, 3, 5.2, 7.4, 9.6].map((x) => ({ kind: 'bramble' as const, x, z: -5.5, r: 1.1 })),
      ...[-12, -9.8, -7.6, -5.4, -3.2, -1, 1.2, 8, 10.2, 12.4].map((x) => ({ kind: 'bramble' as const, x, z: 5.5, r: 1.1 })),
      { kind: 'tree', x: 18, z: -11, r: 1.3 }, { kind: 'tree', x: -14, z: 11, r: 1.2 }, { kind: 'rock', x: 20, z: 10, r: 1 },
    ],
    mud: [{ x: -3, z: 0, r: 2.3 }, { x: 13, z: 0, r: 2 }],
    gaps: [{ side: 'n', at: 6, w: 4.5 }],
    flocks: [{ x: 15, z: -8, n: 6, team: null }, { x: 17, z: 9, n: 6, team: null }],
    goats: [{ x: 9, z: -1 }, { x: -6, z: 10 }],
    lowFences: [{ a: [5, 10], b: [8, 12], kind: 'log' }],
    starts: [{ x: 23, z: -3, team: 0 }, { x: 23, z: 3, team: 0 }, { x: 23, z: 0, team: 0 }],
    wind: { dir: -Math.PI / 2, strength: 0.55, gusty: true },
  },
  {
    // Three billy goats, two bridges over the stream, a gap in the east fence, and a gale.
    id: 'billy', name: 'Three Billy Goats', w: 44, d: 34, timeLimit: 150,
    pens: [{ x: 0, z: -11, w: 8, d: 6, gate: 's', gateW: 3, team: null }],
    streams: [{ pts: [[-23, 6], [-12, 4], [-4, 7], [6, 4], [14, 6], [23, 4]], w: 2.4, bridges: [{ x: -8, z: 5.5, w: 3 }, { x: 10, z: 5, w: 3 }] }],
    mud: [{ x: -8, z: 1.8, r: 1.6 }, { x: 10, z: 1.6, r: 1.6 }],
    gaps: [{ side: 'e', at: -6, w: 3.5 }],
    obstacles: [
      { kind: 'bramble', x: -6, z: -3, r: 1.1 }, { kind: 'bramble', x: 6, z: -3, r: 1.1 }, { kind: 'bramble', x: -16, z: -7, r: 1.2 }, { kind: 'bramble', x: -14, z: -9, r: 1.1 },
      { kind: 'tree', x: 15, z: -11, r: 1.3 }, { kind: 'tree', x: -18, z: 13, r: 1.2 }, { kind: 'rock', x: 17, z: 12, r: 1 },
    ],
    flocks: [{ x: -12, z: 12, n: 8, team: null }, { x: 12, z: 12, n: 8, team: null }],
    goats: [{ x: -8, z: 5.5 }, { x: 10, z: 5 }, { x: 0, z: -3 }],
    lowFences: [{ a: [-18, -2], b: [-15, -4], kind: 'log' }, { a: [15, -3], b: [18, -1], kind: 'log' }],
    starts: [{ x: -2, z: 15.5, team: 0 }, { x: 2, z: 15.5, team: 0 }, { x: 0, z: 16, team: 0 }],
    wind: { dir: 0, strength: 0.75, gusty: true },
  },
];

/** Wild course: big fields, sorting, weather. */
export const WILD: FieldDef[] = [
  {
    // Sorting: white sheep and black sheep graze together; each colour has its own pen. In the rain.
    id: 'blackwhite', name: 'Black and White', w: 56, d: 38, timeLimit: 160, sort: true,
    pens: [
      { x: -18, z: -13, w: 7, d: 6, gate: 's', gateW: 3, team: 0 },
      { x: 18, z: -13, w: 7, d: 6, gate: 's', gateW: 3, team: 1 },
    ],
    obstacles: [
      { kind: 'tree', x: 0, z: -12, r: 1.4 }, { kind: 'tree', x: -4, z: -14, r: 1.2 }, { kind: 'tree', x: 4, z: -14, r: 1.2 },
      { kind: 'rock', x: -12, z: 4, r: 1.1 }, { kind: 'rock', x: 12, z: 4, r: 1.1 }, { kind: 'hay', x: -24, z: 12, r: 1 }, { kind: 'hay', x: 24, z: 12, r: 1 },
    ],
    mud: [{ x: 0, z: 2, r: 2.4 }],
    flocks: [{ x: -3, z: 10, n: 10, team: 0 }, { x: 3, z: 10, n: 8, team: 1 }],
    goats: [{ x: 0, z: -4 }],
    lowFences: [{ a: [-24, -4], b: [-21, -6], kind: 'log' }, { a: [21, -4], b: [24, -6], kind: 'log' }, { a: [8, -4], b: [11, -6], kind: 'stones' }],
    starts: [{ x: -4, z: 17.5, team: 0 }, { x: 4, z: 17.5, team: 0 }, { x: 0, z: 18, team: 0 }],
    wind: { dir: -Math.PI / 2, strength: 0.25 },
    weather: 'rain',
  },
  {
    // A huge pasture with a windmill in it: 24 sheep in three flocks, two goats, a long walk home.
    id: 'bigsky', name: 'Big Sky Pasture', w: 72, d: 48, timeLimit: 190,
    pens: [{ x: 0, z: 0, w: 8, d: 7, gate: 'w', gateW: 3.2, team: null }],
    obstacles: [
      { kind: 'windmill', x: 16, z: -10, r: 2.4 }, { kind: 'pond', x: -18, z: -12, r: 4 },
      { kind: 'tree', x: -26, z: 14, r: 1.4 }, { kind: 'tree', x: -8, z: 16, r: 1.3 }, { kind: 'tree', x: 24, z: 15, r: 1.4 }, { kind: 'tree', x: 28, z: -4, r: 1.3 },
      { kind: 'rock', x: -10, z: 6, r: 1.2 }, { kind: 'rock', x: 10, z: 8, r: 1 }, { kind: 'hay', x: 4, z: -16, r: 1 }, { kind: 'hay', x: -30, z: -2, r: 1 },
      { kind: 'bramble', x: -6, z: -6, r: 1.2 }, { kind: 'bramble', x: 6, z: 12, r: 1.2 },
    ],
    flocks: [{ x: -26, z: 6, n: 8, team: null }, { x: 26, z: 4, n: 8, team: null }, { x: 0, z: 18, n: 8, team: null }],
    goats: [{ x: -12, z: 14 }, { x: 18, z: 8 }],
    // Old field walls, low and tumbledown: the flocks walk the long way round, you take the short cut.
    lowFences: [{ a: [16, 24], b: [16, 14] }, { a: [16, 14], b: [19, 9], broken: true }, { a: [-20, 24], b: [-20, 17], broken: true }, { a: [-36, -8], b: [-28, -8] }, { a: [30, -14], b: [33, -12], kind: 'log' }, { a: [-12, -17], b: [-8, -18], kind: 'stones' }, ...BIGSKY_AGILITY.lowFences],
    // Someone's left their agility kit out in the corner: a little loop, just for fun.
    agility: BIGSKY_AGILITY.agility,
    starts: [{ x: -2, z: -21, team: 0 }, { x: 2, z: -21, team: 0 }, { x: 0, z: -22, team: 0 }],
    wind: { dir: Math.PI * 0.75, strength: 0.5, gusty: true },
  },
  {
    // A thunderstorm over a hill farm: lightning panics the flock and makes you cower.
    id: 'thunder', name: 'Thunder Hill', w: 60, d: 40, timeLimit: 180, weather: 'storm',
    pens: [{ x: 22, z: 12, w: 7, d: 6, gate: 'n', gateW: 3, team: null }],
    streams: [{ pts: [[-31, -4], [-18, -2], [-8, -6], [2, -3], [12, -6], [31, -4]], w: 2.4, bridges: [{ x: -13, z: -4, w: 3.2 }, { x: 16, z: -5.5, w: 3.2 }] }],
    gaps: [{ side: 's', at: 2, w: 4 }],
    mud: [{ x: 6, z: 6, r: 2.2 }, { x: -20, z: 8, r: 2 }],
    obstacles: [
      { kind: 'tree', x: -24, z: -14, r: 1.4 }, { kind: 'tree', x: 4, z: -15, r: 1.3 }, { kind: 'tree', x: 26, z: -14, r: 1.3 },
      { kind: 'bramble', x: 12, z: 10, r: 1.2 }, { kind: 'bramble', x: 14, z: 16, r: 1.1 }, { kind: 'rock', x: -6, z: 12, r: 1.2 }, { kind: 'hay', x: -26, z: 14, r: 1 },
    ],
    flocks: [{ x: -16, z: -14, n: 9, team: null }, { x: 10, z: -14, n: 9, team: null }],
    goats: [{ x: -4, z: -12 }, { x: 0, z: 8 }],
    lowFences: [{ a: [-28, 4], b: [-25, 6], kind: 'log' }, { a: [19, -14], b: [22, -12], kind: 'log' }],
    starts: [{ x: -2, z: -18, team: 0 }, { x: 2, z: -18, team: 0 }, { x: 0, z: -18.5, team: 0 }],
    wind: { dir: 0.4, strength: 0.6, gusty: true },
  },
];

/** Challenge course: an exact number of sheep in each pen. A pen's gate shuts when its count is right. */
export const CHALLENGE: FieldDef[] = [
  {
    id: 'split', name: 'Split the Flock', w: 46, d: 32, timeLimit: 140,
    pens: [
      { x: -14, z: -10, w: 6.5, d: 6, gate: 's', gateW: 3, team: null, quota: 5 },
      { x: 14, z: -10, w: 6.5, d: 6, gate: 's', gateW: 3, team: null, quota: 5 },
    ],
    obstacles: [{ kind: 'tree', x: 0, z: -11, r: 1.4 }, { kind: 'rock', x: -6, z: 4, r: 1 }, { kind: 'rock', x: 7, z: 6, r: 1 }, { kind: 'hay', x: -19, z: 10, r: 1 }],
    flocks: [{ x: 0, z: 6, n: 10, team: null }],
    goats: [],
    lowFences: [{ a: [14, 8], b: [17, 10], kind: 'log' }],
    starts: [{ x: -3, z: 14, team: 0 }, { x: 3, z: 14, team: 0 }, { x: 0, z: 14.5, team: 0 }],
    wind: { dir: -Math.PI / 2, strength: 0.15 },
  },
  {
    id: 'threepens', name: 'Three Little Pens', w: 52, d: 36, timeLimit: 160,
    pens: [
      { x: -18, z: -12, w: 5.5, d: 5.5, gate: 's', gateW: 2.8, team: null, quota: 3 },
      { x: 0, z: -13, w: 6, d: 5.5, gate: 's', gateW: 2.8, team: null, quota: 4 },
      { x: 18, z: -12, w: 6.5, d: 6, gate: 's', gateW: 2.8, team: null, quota: 5 },
    ],
    obstacles: [{ kind: 'tree', x: -9, z: -12, r: 1.3 }, { kind: 'tree', x: 9, z: -12, r: 1.3 }, { kind: 'pond', x: 0, z: 4, r: 3 }, { kind: 'bramble', x: -14, z: 4, r: 1.1 }, { kind: 'bramble', x: 14, z: 4, r: 1.1 }],
    flocks: [{ x: -12, z: 11, n: 6, team: null }, { x: 12, z: 11, n: 6, team: null }],
    goats: [{ x: 0, z: 11 }],
    lowFences: [{ a: [-22, 2], b: [-19, 0], kind: 'log' }, { a: [19, 0], b: [22, 2], kind: 'log' }],
    starts: [{ x: -3, z: 16, team: 0 }, { x: 3, z: 16, team: 0 }, { x: 0, z: 16.5, team: 0 }],
    wind: { dir: 0, strength: 0.3 },
  },
  {
    // One sheep in the little pen, nine in the big one, across a stream, in the rain, with goats.
    id: 'oddone', name: 'Odd One Out', w: 54, d: 36, timeLimit: 170, weather: 'rain',
    pens: [
      { x: -20, z: -12, w: 4, d: 4, gate: 'e', gateW: 2.4, team: null, quota: 1 },
      { x: 18, z: -11, w: 8, d: 7, gate: 'w', gateW: 3, team: null, quota: 9 },
    ],
    streams: [{ pts: [[-28, 2], [-14, 4], [-2, 1], [10, 4], [28, 2]], w: 2.2, bridges: [{ x: -8, z: 2.5, w: 3 }, { x: 14, z: 3.3, w: 3 }] }],
    mud: [{ x: 0, z: -8, r: 2 }],
    obstacles: [{ kind: 'tree', x: -2, z: -14, r: 1.3 }, { kind: 'tree', x: 4, z: 13, r: 1.3 }, { kind: 'rock', x: -16, z: 11, r: 1 }, { kind: 'bramble', x: 8, z: -6, r: 1.1 }],
    flocks: [{ x: -6, z: 11, n: 10, team: null }],
    goats: [{ x: 10, z: 10 }, { x: -12, z: -6 }],
    lowFences: [{ a: [-20, -4], b: [-17, -6], kind: 'log' }, { a: [22, 10], b: [25, 12], kind: 'log' }],
    starts: [{ x: -3, z: 16, team: 0 }, { x: 3, z: 16, team: 0 }, { x: 0, z: 16.5, team: 0 }],
    wind: { dir: Math.PI, strength: 0.35, gusty: true },
  },
];

/** Versus Riverside: your sheep start on the far bank. Two bridges, one goat, everybody crossing. */
const RIVERSIDE: FieldDef = {
  id: 'riverside', name: 'Riverside', w: 54, d: 32, timeLimit: 150,
  pens: [
    { x: -23, z: 0, w: 6, d: 7, gate: 'e', gateW: 3, team: 0 },
    { x: 23, z: 0, w: 6, d: 7, gate: 'w', gateW: 3, team: 1 },
  ],
  streams: [{ pts: [[0, -17], [1.5, -8], [-1.5, 0], [1.5, 8], [0, 17]], w: 2.4, bridges: [{ x: 0.9, z: -11.6, w: 3.2 }, { x: 0.9, z: 11.6, w: 3.2 }] }],
  obstacles: [{ kind: 'tree', x: -12, z: -10, r: 1.2 }, { kind: 'tree', x: 12, z: 10, r: 1.2 }, { kind: 'rock', x: -10, z: 9, r: 1 }, { kind: 'rock', x: 10, z: -9, r: 1 }],
  mud: [{ x: -5, z: 0, r: 1.8 }, { x: 5, z: 0, r: 1.8 }],
  flocks: [{ x: 13, z: -5, n: 7, team: 0 }, { x: -13, z: 5, n: 7, team: 1 }],
  goats: [{ x: 4, z: 0 }],
    lowFences: [{ a: [-14, -2], b: [-12, -4], kind: 'log' }, { a: [14, 2], b: [12, 4], kind: 'log' }],
  starts: [{ x: -18, z: -9, team: 0 }, { x: -18, z: 9, team: 0 }, { x: -19, z: 0, team: 0 }, { x: 18, z: 9, team: 1 }, { x: 18, z: -9, team: 1 }, { x: 19, z: 0, team: 1 }],
  wind: { dir: Math.PI / 2, strength: 0.35 },
};

/** A versus match is three fields. */
export const VERSUS_FIELDS: FieldDef[] = [VERSUS, RIVERSIDE, VERSUS];

export type CourseId = 'gentle' | 'tricky' | 'wild' | 'challenge';
export const COURSES: Record<CourseId, { name: string; blurb: string; fields: FieldDef[] }> = {
  gentle: { name: 'Gentle', blurb: 'Meadow, Orchard, Windy Hillside', fields: TRIALS },
  tricky: { name: 'Tricky', blurb: 'Streams, brambles, a broken fence and three goats', fields: TRICKY },
  wild: { name: 'Wild', blurb: 'Big fields, black and white sheep to sort, rain and a thunderstorm', fields: WILD },
  challenge: { name: 'Challenge', blurb: 'Exact numbers: so many sheep in each pen, and not one more', fields: CHALLENGE },
};

/**
 * The lobby: The Meadow with its flock out, and a full agility course along the top (instead of
 * the log and the stone wall), for running about while you wait.
 */
const PRACTICE_AGILITY = course([
  { kind: 'hurdle', x: -14, z: -8.5, dir: 0 },
  { kind: 'hurdle', x: -10.5, z: -10.5, dir: 0 },
  { kind: 'tunnel', x: -3.4, z: -11, dir: 0 },
  { kind: 'weave', x: 2.6, z: -11, dir: 0 },
  { kind: 'tire', x: 8, z: -10.5, dir: 0 },
  { kind: 'hurdle', x: 11.5, z: -9, dir: 0.3 },
  { kind: 'table', x: 15, z: -9.5, dir: 0 },
]);
export const PRACTICE: FieldDef = {
  ...TRIALS[0],
  id: 'practice',
  lowFences: [TRIALS[0].lowFences![0], ...PRACTICE_AGILITY.lowFences],
  agility: PRACTICE_AGILITY.agility,
};

export function fieldById(id: string): FieldDef {
  return [PRACTICE, ...TRIALS, ...TRICKY, ...WILD, ...CHALLENGE, VERSUS, RIVERSIDE].find((f) => f.id === id) ?? TRIALS[0];
}
