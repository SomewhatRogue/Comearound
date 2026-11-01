/**
 * Your dog. One list, used by the lobby UI and checked by the server.
 * Breeds change the model's shape (ears, tail, legs, snout, fluff); coats change its colours.
 * The first four are the friend group's own dogs (Kyle, 2026-10-30).
 */
export const BREEDS = ['collie', 'keeshond', 'malinois', 'shepherd', 'poodle', 'golden', 'corgi', 'husky', 'pug', 'chihuahua', 'chicken'] as const;
export type Breed = (typeof BREEDS)[number];
/** Yes, you can herd as a chicken (Kyle, 2026-10-31). The bots stay dogs. */
export const DOG_BREEDS = BREEDS.filter((b) => b !== 'chicken');

export const BREED_NAMES: Record<Breed, string> = {
  collie: 'Border Collie', keeshond: 'Keeshond', malinois: 'Malinois', shepherd: 'German Shepherd', poodle: 'Standard Poodle',
  golden: 'Golden Retriever', corgi: 'Corgi', husky: 'Husky', pug: 'Pug', chihuahua: 'Chihuahua', chicken: 'Chicken',
};

/**
 * Coat palettes: main colour, accent (chest, muzzle, socks), and mask (face, ears; the Malinois's
 * black mask); `saddle`, a blanket of colour over the back (the German Shepherd's black saddle).
 */
export const COATS: { id: string; name: string; main: string; accent: string; mask: string; saddle?: string }[] = [
  { id: 'black-tan', name: 'Black and tan', main: '#b8773a', accent: '#d8a866', mask: '#1e1a17', saddle: '#1e1a17' },
  { id: 'sable', name: 'Sable', main: '#8f6a3e', accent: '#c79a62', mask: '#2a2219', saddle: '#4a3a28' },
  { id: 'black-white', name: 'Black and white', main: '#232328', accent: '#f6f3ec', mask: '#232328' },
  { id: 'wolf-grey', name: 'Wolf grey', main: '#9a958c', accent: '#d9d4c8', mask: '#2b2b30' },
  { id: 'fawn-mask', name: 'Fawn, black mask', main: '#c08a4a', accent: '#d9a866', mask: '#231c18' },
  { id: 'apricot', name: 'Golden apricot', main: '#e2a65e', accent: '#f2c98e', mask: '#d4954f' },
  { id: 'golden', name: 'Golden', main: '#d9a441', accent: '#f0d59a', mask: '#c8902e' },
  { id: 'red-white', name: 'Red and white', main: '#b4532a', accent: '#f6f3ec', mask: '#b4532a' },
  { id: 'cream', name: 'Cream', main: '#efe2c4', accent: '#fff8ea', mask: '#e2d2ae' },
  { id: 'chocolate', name: 'Chocolate', main: '#5b3a26', accent: '#a0714a', mask: '#4a2e1e' },
  { id: 'fawn', name: 'Fawn', main: '#d8a26c', accent: '#f4e3cb', mask: '#cf9660' },
  // Hens: main feathers, wing and tail, and the comb.
  { id: 'hen-red', name: 'Red hen', main: '#a5502a', accent: '#7a3418', mask: '#d8302a' },
  { id: 'hen-white', name: 'White hen', main: '#f4efe4', accent: '#ddd5c5', mask: '#d8302a' },
  { id: 'hen-black', name: 'Black hen', main: '#25282e', accent: '#2f4038', mask: '#d8302a' },
  { id: 'hen-buff', name: 'Buff hen', main: '#e0b876', accent: '#c99a55', mask: '#d8302a' },
  { id: 'hen-speckled', name: 'Speckled hen', main: '#cfc6b6', accent: '#3d3833', mask: '#d8302a' },
];

/** The coats a breed can wear: dogs wear the dog coats, the chicken wears hen feathers. */
export function coatsFor(breed: Breed): typeof COATS {
  return COATS.filter((c) => (breed === 'chicken') === c.id.startsWith('hen-'));
}

export const DEFAULT_COAT: Record<Breed, string> = {
  collie: 'black-white', keeshond: 'wolf-grey', malinois: 'fawn-mask', shepherd: 'black-tan', poodle: 'apricot',
  golden: 'golden', corgi: 'red-white', husky: 'wolf-grey', pug: 'fawn-mask', chihuahua: 'fawn', chicken: 'hen-red',
};

/** Each breed's natural bark pitch (1 = a collie). The chicken's is its bawk. */
export const BARK_PITCH: Record<Breed, number> = { pug: 1.6, corgi: 1.3, keeshond: 1.1, collie: 1, poodle: 0.95, husky: 0.92, golden: 0.88, malinois: 0.85, shepherd: 0.8, chihuahua: 1.9, chicken: 1 };

/** The bark setting: missing means it follows the dog (breed, and a chonk barks deeper). */
export const VOICES = [
  { v: -2, name: 'Deep' },
  { v: -1, name: 'Low' },
  { v: 0, name: 'Normal' },
  { v: 1, name: 'High' },
  { v: 2, name: 'Squeaky' },
] as const;

/** How high this dog barks: its breed, then its own bark setting (or, left alone, its build). */
export function barkPitch(look: { breed: Breed; build?: number; voice?: number }): number {
  const base = BARK_PITCH[look.breed] ?? 1;
  if (look.voice === undefined || look.voice === null) return base * (1 - 0.07 * (look.build ?? 0));
  return base * 2 ** (look.voice * 0.4);
}

export const EYES: { id: string; name: string; color: string }[] = [
  { id: 'brown', name: 'Brown', color: '#3a2414' },
  { id: 'blue', name: 'Brilliant blue', color: '#4fb4ff' },
  { id: 'amber', name: 'Amber', color: '#c98a1e' },
];

/** Collar colours double as a quick way to tell dogs apart from above. */
/** Body build, lean to chonky: the Look's `build`, from -2 to 2. */
export const BUILDS = [
  { v: -2, name: 'Lean' },
  { v: -1, name: 'Trim' },
  { v: 0, name: 'Regular' },
  { v: 1, name: 'Chunky' },
  { v: 2, name: 'Chonk' },
] as const;

export const COLLARS = ['#e4572e', '#f3a712', '#29a19c', '#4f6d7a', '#8e5572', '#e88eb4', '#6a994e', '#7b2cbf', '#3d405b', '#bc6c25'];
