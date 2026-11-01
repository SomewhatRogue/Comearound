/**
 * Every number that sets how herding feels, in one place. Shared so the client can predict your
 * dog with the same speeds the server uses. Tune here.
 */
export const DOG = {
  walk: 5.2,
  sprint: 8.6,
  crouch: 2.6,
  radius: 0.45,
  /** Stamina: sprinting drains it, everything else refills it. */
  staminaMax: 100,
  staminaDrain: 38,
  staminaRegen: 22,
  barkCooldown: 1.6,
  /** The eye: a crouched dog facing sheep inside this cone and range moves them gently. */
  eyeRange: 7,
  eyeCone: 0.6,
  eyePush: 1.7,
  /** A dog lying down calms sheep around it. */
  calmRadius: 6,
  /** Going over a low fence (within this many metres of it) a dog moves at this share of its speed,
   * long enough for the gather, leap and landing to read as a jump. */
  hopWithin: 1.1,
  hopSlow: 0.62,
  /** ...but a sprinting dog keeps most of its speed (and its leap goes longer, client side). */
  hopSlowSprint: 0.9,
};

export const SHEEP = {
  radius: 0.5,
  graze: 0.5,
  flee: 4.6,
  /** How close a dog can get before sheep move away, by the dog's posture. */
  flight: { walk: 5.2, sprint: 7.5, crouch: 2.4, down: 1.2 },
  barkRadius: 7.5,
  barkKick: 8,
  cohesion: 4.5,
  separation: 1.0,
  /** A sheep with no neighbours heads for the nearest other sheep this hard. */
  lonely: 1.1,
  /** Near the gate with others already in, sheep follow them in this hard (and this close). */
  follow: 1.1,
  followRange: 3.2,
  /** Each loose sheep bolts at nothing about this often (seconds), with this much of a kick. */
  spookEvery: 40,
  spookKick: 4,
  /** Penned sheep are calmer: flight distance scales down by this. */
  pennedCalm: 0.45,
  /** Left against a wall this long (seconds), a sheep eases back into the field this hard. */
  wallSettle: 2,
  wallEase: 1.1,
};

export const GOAT = {
  radius: 0.6,
  speed: 3.4,
  wander: 0.9,
  /** A crouched dog facing it within this range eases it away; a walking dog this close shoves it. */
  eyeRange: 4.5,
  shoveRange: 2.2,
  bleatEvery: [7, 12] as [number, number],
  bleatRadius: 8,
  bleatKick: 6.5,
  /** Charging through the flock. */
  chargeSpeed: 4.6,
  /** A bleat in the middle of a pen it's raiding is this many times louder. */
  raidPower: 2.2,
  /** Every so often it picks some mischief: how often, and how likely each kind is. */
  planEvery: [6, 10] as [number, number],
  mischief: { flock: 0.3, charge: 0.2, gate: 0.2, raid: 0.15 },
  /** How long it stands in a gateway. */
  blockSec: 7,
  /** Sheep keep this far from the goat (so a goat in the gate blocks it). */
  sheepAvoid: 2.4,
  /** Barking within earshot annoys the goat; at 1 it comes over and stares you down. */
  earshot: 14,
  annoyPerBark: 0.4,
  /** Sprinting at it is rude too (per second, while close). */
  annoySprint: 0.35,
  annoyDecay: 0.04,
  /** The stare freezes the dog it picked. */
  stareSec: 4,
  stareCooldown: 12,
  /** Versus: shorter tempers, so a team can't just bark its way round the field. */
  versus: { earshot: 20, annoyPerBark: 0.55, annoyDecay: 0.03, stareCooldown: 7 },
};

/** Wind carries your scent: sheep downwind of a dog, within range, get nervous and drift away. */
export const SCENT = {
  range: 12,
  /** How well lined up with the wind the sheep has to be (cosine). */
  cone: 0.72,
  /** A crouched dog smells less (lower, slower). Lying down: nothing. */
  crouch: 0.4,
  push: 2.6,
  fear: 0.5,
};

/** Hazards. */
export const HAZARD = {
  mudSlow: 0.5,
  wadeSlow: 0.55,
  /** Sheep shy away from brambles within this distance, and bolt if they touch one. */
  brambleShy: 1.1,
  brambleKick: 4.5,
  /** Sheep out through a gap in the fence: points lost each. */
  lostPenalty: 75,
  /** Mud on a dog: how fast a wallow cakes it (per second), how fast wading washes it off, how
   * fast it dries and drops off otherwise. */
  mudCake: 0.5,
  wadeWash: 0.45,
  mudDry: 0.012,
  /** Fields with mud: up to this many points for clean dogs at the end (scaled by how clean). */
  cleanBonus: 150,
};

/** Weather. */
export const WEATHER = {
  /** In the rain sheep take fright at nothing this many times as often. */
  rainSpook: 2,
  /** Seconds between lightning strikes in a storm. */
  strikeEvery: [13, 24] as [number, number],
  /** A strike: how far the shock reaches, how hard sheep are kicked away, how long dogs cower. */
  strikeRadius: 34,
  strikeKick: 9,
  cowerSec: 1.6,
  cowerSlow: 0.3,
};

export const SCORE = {
  perSheep: 100,
  perSecondLeft: 4,
  /** Calm herding (calm.ts): up to this much for a settled flock, soft feet (little sprinting,
   * plenty of stalking and the eye) and few barks; scaled by the share of sheep penned. */
  calmParts: { flock: 220, feet: 160, quiet: 120 },
  /** Average flock fear at which the calm-flock part reaches zero. */
  calmFearScale: 0.3,
  goatPenned: 250,
  /** All sheep penned and held for this long ends the field early. */
  holdToFinish: 2.5,
};
