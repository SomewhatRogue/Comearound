/**
 * Your dog. One list, used by the lobby UI and checked by the server.
 * Breeds change the model's shape (ears, tail, legs, snout, fluff); coats change its colours.
 * The first four are the friend group's own dogs (Kyle, 2026-10-30).
 */
export const BREEDS = ['collie', 'keeshond', 'malinois', 'poodle', 'golden', 'corgi', 'husky', 'pug', 'chihuahua'] as const;
export type Breed = (typeof BREEDS)[number];

export const BREED_NAMES: Record<Breed, string> = {
  collie: 'Border Collie', keeshond: 'Keeshond', malinois: 'Malinois', poodle: 'Standard Poodle',
  golden: 'Golden Retriever', corgi: 'Corgi', husky: 'Husky', pug: 'Pug', chihuahua: 'Chihuahua',
};

/** Coat palettes: main colour, accent (chest, muzzle, socks), and mask (face, ears; the Malinois's black mask). */
export const COATS: { id: string; name: string; main: string; accent: string; mask: string }[] = [
  { id: 'black-white', name: 'Black and white', main: '#232328', accent: '#f6f3ec', mask: '#232328' },
  { id: 'wolf-grey', name: 'Wolf grey', main: '#9a958c', accent: '#d9d4c8', mask: '#2b2b30' },
  { id: 'fawn-mask', name: 'Fawn, black mask', main: '#c08a4a', accent: '#d9a866', mask: '#231c18' },
  { id: 'apricot', name: 'Golden apricot', main: '#e2a65e', accent: '#f2c98e', mask: '#d4954f' },
  { id: 'golden', name: 'Golden', main: '#d9a441', accent: '#f0d59a', mask: '#c8902e' },
  { id: 'red-white', name: 'Red and white', main: '#b4532a', accent: '#f6f3ec', mask: '#b4532a' },
  { id: 'cream', name: 'Cream', main: '#efe2c4', accent: '#fff8ea', mask: '#e2d2ae' },
  { id: 'chocolate', name: 'Chocolate', main: '#5b3a26', accent: '#a0714a', mask: '#4a2e1e' },
  { id: 'fawn', name: 'Fawn', main: '#d8a26c', accent: '#f4e3cb', mask: '#cf9660' },
];

export const DEFAULT_COAT: Record<Breed, string> = {
  collie: 'black-white', keeshond: 'wolf-grey', malinois: 'fawn-mask', poodle: 'apricot',
  golden: 'golden', corgi: 'red-white', husky: 'wolf-grey', pug: 'fawn-mask', chihuahua: 'fawn',
};

export const EYES: { id: string; name: string; color: string }[] = [
  { id: 'brown', name: 'Brown', color: '#3a2414' },
  { id: 'blue', name: 'Brilliant blue', color: '#4fb4ff' },
  { id: 'amber', name: 'Amber', color: '#c98a1e' },
];

/** Collar colours double as a quick way to tell dogs apart from above. */
export const COLLARS = ['#e4572e', '#f3a712', '#29a19c', '#4f6d7a', '#8e5572', '#e88eb4', '#6a994e', '#7b2cbf', '#3d405b', '#bc6c25'];
