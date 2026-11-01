/**
 * Sounds for things that show up in the public state: woofs (from Entities.onBark), the goat's
 * bleats, a rising plink for each sheep that goes in, the odd worried baa, the goat heading your
 * way, and the end of a field. It compares each snapshot with the last one.
 */
import type { DogPub, PrivateView, PublicView } from '../shared/protocol';
import { sfx } from './sfx';

export const PITCH: Record<string, number> = { pug: 1.6, corgi: 1.3, keeshond: 1.1, collie: 1, poodle: 0.95, husky: 0.92, golden: 0.88, malinois: 0.85 };

export class SoundDirector {
  private phase = '';
  private penned = -1;
  private step = 0;
  private stepAt = 0;
  private baaCd = 0;
  private goatComing = false;
  private lost = 0;
  /** Seconds until a contented sheep near you next says something. */
  private chatter = 3;

  /** A dog barked at `at`; quieter the further it is from you. */
  woof(d: DogPub, dist: number): void {
    sfx.woof(PITCH[d.look.breed] ?? 1, Math.max(0.15, 1 - dist / 30));
  }

  bleat(dist: number): void {
    sfx.bleat(Math.max(0.15, 1 - dist / 25));
  }

  update(pub: PublicView, me: PrivateView, dt: number, now: number): void {
    const self = pub.dogs.find((d) => d.id === me.you);
    this.baaCd -= dt;
    if (this.phase && pub.phase !== this.phase) {
      if (pub.phase === 'fieldEnd') {
        const last = pub.fieldScores[pub.fieldScores.length - 1];
        if (last?.some((s) => s.penned === s.total)) sfx.fanfare();
        else sfx.sad();
      }
      if (pub.phase === 'results') sfx.fanfare();
    }
    this.phase = pub.phase;

    // Each sheep going in: a plink that climbs if they come in quick succession.
    const n = pub.sheep.filter((s) => s.penned).length;
    if (this.penned >= 0 && n > this.penned && (pub.phase === 'playing' || pub.phase === 'lobby')) {
      this.step = now - this.stepAt < 4000 ? Math.min(this.step + 2, 14) : 0;
      this.stepAt = now;
      sfx.penned(this.step);
    }
    this.penned = n;

    if (!self) return;
    // A worried baa from a frightened sheep near you, now and then.
    if (this.baaCd <= 0) {
      const scared = pub.sheep.find((s) => s.fear > 0.7 && Math.hypot(s.x - self.x, s.z - self.z) < 10);
      if (scared) {
        sfx.baa(0.8, 0.9 + (scared.id % 5) * 0.06);
        this.baaCd = 2.5 + (scared.id % 3);
      }
    }
    // A calm flock chats: now and then a contented baa from a settled sheep near you, at its own
    // pitch (the odd one high and young-sounding), quieter the further away it is.
    this.chatter -= dt;
    if (this.chatter <= 0) {
      this.chatter = 2.5 + Math.random() * 5;
      const calm = pub.sheep.filter((s) => !s.lost && s.fear < 0.2 && Math.hypot(s.x - self.x, s.z - self.z) < 16);
      const s = calm[Math.floor(Math.random() * calm.length)];
      if (s && (pub.phase === 'playing' || pub.phase === 'lobby')) {
        const d = Math.hypot(s.x - self.x, s.z - self.z);
        const lamb = s.id % 7 === 3;
        sfx.baa(Math.max(0.25, 0.75 - d / 24), (lamb ? 1.45 : 0.92 + (s.id % 5) * 0.07) + (Math.random() - 0.5) * 0.06);
      }
    }
    // Uh oh: the goat has picked you.
    const coming = pub.goats.some((g) => g.mood === 'coming' && g.target === me.you);
    if (coming && !this.goatComing) sfx.uhoh();
    this.goatComing = coming;
    // A sheep got out through the broken fence.
    const lost = pub.sheep.filter((s) => s.lost).length;
    if (lost > this.lost && pub.phase === 'playing') sfx.sad();
    this.lost = lost;
  }
}
