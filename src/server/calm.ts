/**
 * Calm herding: a bonus for the slow, quiet way to pen a flock, so it can pay as well as racing
 * the clock. Over a field, per team, the room keeps track of how frightened the flock was on
 * average, how much the dogs sprinted versus stalked (crouched, giving the eye), and how often
 * they barked. Calm flock + soft feet + few barks, scaled by how many sheep went in.
 */
import { SCORE } from '../shared/tuning';
import { activeDogs, type Room } from './state';

export interface CalmStats { fear: number; samples: number; sprint: number; stalk: number; dogTime: number }

export const freshCalm = (): [CalmStats, CalmStats] => [0, 1].map(() => ({ fear: 0, samples: 0, sprint: 0, stalk: 0, dogTime: 0 })) as [CalmStats, CalmStats];

/** Each playing tick: how frightened each team's sheep are, and what each team's dogs are doing. */
export function sampleCalm(room: Room, dt: number): void {
  const versus = room.mode === 'versus';
  for (const t of versus ? [0, 1] as const : [0] as const) {
    const c = room.calm[t];
    const sheep = room.sheep.filter((s) => !s.lost && (!versus || s.team === t));
    if (sheep.length) {
      c.fear += (sheep.reduce((n, s) => n + s.fear, 0) / sheep.length) * dt;
      c.samples += dt;
    }
    for (const d of activeDogs(room)) {
      if (versus && d.team !== t) continue;
      c.dogTime += dt;
      if (d.posture === 'sprint') c.sprint += dt;
      else if (d.posture === 'crouch') c.stalk += dt;
    }
  }
}

/** The three parts, each 0..1, and the bonus. */
export function calmScore(room: Room, team: 0 | 1 | null, barks: number, penned: number, total: number): { flock: number; feet: number; quiet: number; bonus: number } {
  const c = room.calm[team ?? 0];
  const avgFear = c.samples > 0 ? c.fear / c.samples : 0;
  const sprintShare = c.dogTime > 0 ? c.sprint / c.dogTime : 0;
  const stalkShare = c.dogTime > 0 ? c.stalk / c.dogTime : 0;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  // A flock that stayed settled (average fear well under a third).
  const flock = clamp(1 - avgFear / SCORE.calmFearScale);
  // Little sprinting, and time spent stalking and giving the eye counts in your favour.
  const feet = clamp(1 - sprintShare * 3 + stalkShare * 1.5);
  const quiet = clamp(1 - barks / Math.max(1, total * 1.5));
  const parts = SCORE.calmParts;
  const bonus = Math.round((parts.flock * flock + parts.feet * feet + parts.quiet * quiet) * (penned / Math.max(1, total)));
  return { flock, feet, quiet, bonus };
}
