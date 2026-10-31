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
};

export const SCORE = {
  perSheep: 100,
  perSecondLeft: 4,
  /** Calm-herding bonus, scaled down by barks per sheep. */
  calmBonus: 200,
  goatPenned: 250,
  /** All sheep penned and held for this long ends the field early. */
  holdToFinish: 2.5,
};
