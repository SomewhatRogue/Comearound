/**
 * The always-on HUD: field name, the clock, sheep penned (per team in versus), your stamina and
 * bark, the intro card, toasts, score pops, and the goat's NAUGHTY close-up. DOM over the canvas.
 */
import * as THREE from 'three';
import { fieldById } from '../shared/field';
import type { PrivateView, PublicView } from '../shared/protocol';
import { DOG } from '../shared/tuning';
import { TEAM_NAMES } from './scene';
import { sfx } from './sfx';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private naughtyTimer: ReturnType<typeof setTimeout> | undefined;
  private introKey = '';
  private countKey = '';

  update(pub: PublicView, me: PrivateView): void {
    const field = fieldById(pub.fieldId);
    const run = pub.phase !== 'lobby';
    $('phase').textContent = pub.phase === 'lobby' ? 'Lobby: practise on the flock' : `${field.name} · ${pub.fieldIdx + 1}/${pub.fieldCount}`;
    const playing = pub.phase === 'playing';
    $('clock').style.display = playing ? '' : 'none';
    const mm = Math.floor(pub.timeLeft / 60);
    $('clock-text').textContent = `${mm}:${String(pub.timeLeft % 60).padStart(2, '0')}`;
    $('clock').classList.toggle('alarm', playing && pub.timeLeft <= 15);

    // Sheep counts: one for co-op, one per team in versus.
    const teams: (0 | 1 | null)[] = pub.mode === 'versus' && run ? [0, 1] : [null];
    const counts = teams.map((t) => {
      const mine = pub.sheep.filter((s) => t === null || s.team === t);
      return { t, n: mine.filter((s) => s.penned).length, of: mine.length };
    });
    const ck = JSON.stringify(counts);
    if (ck !== this.countKey) {
      this.countKey = ck;
      $('pens').innerHTML = counts.map((c) => `<div class="pen-count ${c.t === null ? '' : `team${c.t}`}"><span class="sheep-ico"></span><b>${c.n}</b>/${c.of}${c.t === null ? '' : ` <i>${TEAM_NAMES[c.t]}</i>`}</div>`).join('');
    }

    // Stamina and bark.
    const self = pub.dogs.find((d) => d.id === me.you);
    const show = !!self && !self.spectator && (playing || pub.phase === 'lobby');
    $('dogbar').style.display = show ? '' : 'none';
    $('stamina-fill').style.width = `${(me.stamina / DOG.staminaMax) * 100}%`;
    $('stamina').classList.toggle('low', me.stamina < 25);
    $('bark-key').classList.toggle('cool', !me.barkReady);
    $('posture').textContent = !self ? '' : self.frozen ? 'Frozen by the goat!' : self.down ? 'Lying down: sheep settle' : self.posture === 'crouch' ? 'Crouched: giving the eye' : self.posture === 'sprint' ? 'Sprinting' : '';

    // The intro card: field name, a tip, and the team you're on.
    const ik = pub.phase === 'intro' ? `${pub.fieldId}|${pub.fieldIdx}` : '';
    if (ik !== this.introKey) {
      this.introKey = ik;
      const el = $('intro');
      el.hidden = !ik;
      if (ik) {
        const team = pub.mode === 'versus' && self ? `<p class="team team${self.team}">You're on <b>${TEAM_NAMES[self.team]}</b>. Your sheep wear ${TEAM_NAMES[self.team].toLowerCase()} paint.</p>` : '';
        el.innerHTML = `<h4>Field ${pub.fieldIdx + 1} of ${pub.fieldCount}</h4><h2>${field.name}</h2>${team}<p>${TIPS[field.id] ?? ''}</p>`;
        el.classList.remove('play');
        void el.offsetWidth;
        el.classList.add('play');
        sfx.whistle();
      }
    }
  }

  /** A score pop at a point in the world. */
  pop(amount: number, text: string, at: THREE.Vector3 | undefined, camera: THREE.Camera): void {
    const el = document.createElement('div');
    el.className = 'pop';
    el.innerHTML = `<b>+${amount}</b><span>${text}</span>`;
    const p = (at ?? new THREE.Vector3()).clone().setY(1.6).project(camera);
    el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  /** A word that pops up over a spot in the world and floats away (WOOF!, MEHHH). */
  floatText(text: string, at: THREE.Vector3, camera: THREE.Camera, cls: string): void {
    const p = at.clone().setY(1.4).project(camera);
    if (Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  toast(text: string, kind = ''): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  /** The goat picked you. You get the close-up. */
  naughty(words = 'NAUGHTY'): void {
    const n = $('naughty');
    n.querySelector('.word')!.textContent = words;
    n.classList.toggle('long', words.length > 10);
    n.classList.remove('hidden', 'play');
    void n.offsetWidth;
    n.classList.add('play');
    sfx.naughty();
    clearTimeout(this.naughtyTimer);
    this.naughtyTimer = setTimeout(() => n.classList.add('hidden'), 4200);
  }

  connection(ok: boolean): void {
    $('conn').style.display = ok ? 'none' : '';
  }
}

const TIPS: Record<string, string> = {
  meadow: 'One flock, one pen. Get round behind them and walk them in.',
  orchard: 'Two flocks among the trees, and a goat. Watch your barking.',
  hillside: 'Big field, two flocks, a pond in the way. Split up.',
  fieldday: 'Both flocks start in the middle. Pen yours. Or make trouble.',
};
