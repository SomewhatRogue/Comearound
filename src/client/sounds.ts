/**
 * Plays sounds for things that show up in the public state (not private events): picking up and
 * putting down, the round starting, last call, the reveal, the goat getting close, snowballs, crows.
 * It compares each snapshot with the last one; private events (pops, catches) play from main.ts.
 */
import type { PrivateView, PublicView } from '../shared/protocol';
import { sfx } from './sfx';

export class SoundDirector {
  private carrying: string | null | undefined = undefined;
  private phase = '';
  private goatMood = '';
  private targets: boolean[] = [];
  private snowballs = new Set<number>();
  private bleatCd = 0;

  update(pub: PublicView, me: PrivateView, dt: number): void {
    const self = pub.players.find((p) => p.id === me.you);
    if (!self) return;
    this.bleatCd -= dt;

    // Pick up / put down / drop, from what you are carrying.
    if (this.carrying !== undefined && self.carrying !== this.carrying) {
      if (self.carrying) sfx.pickup();
      else if (pub.stations.some((s) => s.owner === me.you)) sfx.place();
      else sfx.drop();
    }
    this.carrying = self.carrying;

    if (this.phase && pub.phase !== this.phase) {
      if (pub.phase === 'playing' && this.phase === 'lobby') sfx.roundStart();
      if (pub.phase === 'lastcall') sfx.bell();
      if (pub.phase === 'results' && pub.reveal) {
        sfx.drumroll();
        // One tick per tally row, in step with the rows sliding in (0.35 s apart).
        pub.reveal.rows.forEach((_, i) => sfx.tick(0.8 + i * 0.35));
      }
    }
    this.phase = pub.phase;

    // The goat bleats when it starts bothering someone near you.
    const g = pub.goat;
    const d = Math.hypot(g.x - self.x, g.z - self.z);
    if (g.mood !== this.goatMood && (g.mood === 'pester' || g.mood === 'stare') && d < 10 && this.bleatCd <= 0) {
      sfx.bleat(Math.max(0.25, 1 - d / 10));
      this.bleatCd = 4;
    }
    this.goatMood = g.mood;

    // Snowballs and crows, for whoever is near the Pen.
    const ids = new Set(pub.snowballs.map((s) => s.id));
    for (const s of pub.snowballs) if (!this.snowballs.has(s.id) && Math.hypot(s.x - self.x, s.z - self.z) < 8) sfx.whoosh();
    this.snowballs = ids;
    pub.targets.forEach((up, i) => {
      if (this.targets[i] && !up && self.inPen) sfx.squawk();
    });
    this.targets = pub.targets.slice();
  }
}
