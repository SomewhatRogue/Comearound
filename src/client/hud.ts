/**
 * The always-on HUD: top bar with the moon clock, role card, prompt, score pops, toasts,
 * the accuser's meter, and the goat's NAUGHTY close-up. DOM over the canvas.
 */
import * as THREE from 'three';
import { itemById, thingById } from '../shared/catalog';
import { AREAS } from '../shared/map';
import type { PrivateView, PublicView } from '../shared/protocol';
import { sfx } from './sfx';

const $ = (id: string) => document.getElementById(id)!;
const PHASE: Record<string, string> = { lobby: 'Lobby', playing: 'Make the thing', lastcall: 'Last call!', lastchance: 'Last chance', results: 'The reveal' };

export class Hud {
  private roleKey = '';
  private chimeStep = 0;
  private lastPop = 0;
  private shownScore = 0;

  update(pub: PublicView, me: PrivateView, prompt: string): void {
    $('phase').textContent = PHASE[pub.phase];
    $('phase').classList.toggle('alarm', pub.phase === 'lastcall');
    const playing = pub.phase === 'playing' || pub.phase === 'lastcall' || pub.phase === 'lastchance';
    $('clock').style.display = playing ? '' : 'none';
    const mm = Math.floor(pub.timeLeft / 60);
    $('clock-text').textContent = `${mm}:${String(pub.timeLeft % 60).padStart(2, '0')}`;
    // The moon wanes as the round runs out.
    $('moon-shadow').style.transform = `translateX(${-100 * (pub.timeLeft / Math.max(1, Number($('clock').dataset.total) || pub.timeLeft))}%)`;
    if (pub.phase === 'playing' && !$('clock').dataset.total) $('clock').dataset.total = String(pub.timeLeft);
    if (!playing) delete $('clock').dataset.total;

    // Score counts up rather than jumping.
    this.shownScore += Math.ceil((me.score - this.shownScore) * 0.2);
    if (Math.abs(me.score - this.shownScore) < 1) this.shownScore = me.score;
    $('score').textContent = String(this.shownScore);
    $('meter').style.display = me.meter > 0 && pub.phase !== 'results' ? '' : 'none';
    $('meter-n').textContent = String(me.meter);

    const self = pub.players.find((p) => p.id === me.you);
    const key = `${pub.phase}|${me.role}|${me.thingId}|${self?.inPen}|${self?.sign}|${self?.spectator}|${me.guessesLeft}|${pub.sadCount}`;
    if (key !== this.roleKey) {
      this.roleKey = key;
      $('rolecard').innerHTML = roleCard(pub, me, !!self?.inPen, self?.sign ?? null, !!self?.spectator);
    }
    $('prompt').textContent = prompt;
    $('prompt').style.display = prompt ? '' : 'none';
  }

  /** A score pop at the player's feet, with a chime that climbs if pops come in a row. */
  pop(amount: number, text: string, at: THREE.Vector3 | undefined, camera: THREE.Camera): void {
    const now = performance.now();
    this.chimeStep = now - this.lastPop < 3500 ? Math.min(this.chimeStep + 2, 14) : 0;
    this.lastPop = now;
    sfx.chime(this.chimeStep);
    const el = document.createElement('div');
    el.className = 'pop';
    el.innerHTML = `<b>+${amount}</b><span>${text}</span>`;
    const p = (at ?? new THREE.Vector3()).clone().setY(2.4).project(camera);
    el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 1600);
    const score = $('score');
    score.classList.remove('bump');
    void score.offsetWidth;
    score.classList.add('bump');
  }

  toast(text: string, kind = ''): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  /** The goat picked you. Whatever you were doing, you get the close-up. */
  naughty(): void {
    const n = $('naughty');
    n.classList.remove('hidden', 'play');
    void n.offsetWidth;
    n.classList.add('play');
    sfx.naughty();
    setTimeout(() => n.classList.add('hidden'), 3800);
  }

  connection(ok: boolean): void {
    $('conn').style.display = ok ? 'none' : '';
  }
}

function roleCard(pub: PublicView, me: PrivateView, inPen: boolean, sign: string | null, spectator: boolean): string {
  if (pub.phase === 'lobby' || pub.phase === 'results') return '';
  if (spectator) return `<div class="card"><h3>Round in progress</h3><p>You'll join the next one. Watch the chaos.</p></div>`;
  const pen = inPen ? `<p class="pen-note">You're in the Pen${sign ? `, wearing <b>${sign}</b>` : ''}.</p>` : '';
  const sads = pub.sadCount > 1 ? `<p class="quiet">There are ${pub.sadCount} :( players this round.</p>` : '';
  if (me.role === 'knower' && me.thingId) {
    const t = thingById.get(me.thingId)!;
    const area = AREAS.find((a) => a.id === t.area)!.name;
    const parts = t.parts.map((p) => `<li><b>${p.label}</b><span>${p.accepts.map((a) => itemById.get(a)!.name).join(', ')}</span></li>`).join('');
    return `<div class="card knower"><h4>The thing</h4><h3>${t.name}</h3><p class="where">Build it at the <b>${area}</b></p><ul>${parts}</ul>${pen}${sads}</div>`;
  }
  return `<div class="card sad"><div class="frown">:(</div><h3>You don't know the thing</h3><p>Watch what people build. Act natural. ${me.guessesLeft ? 'One guess at the board.' : 'Your guess is spent.'}</p>${pen}${sads}</div>`;
}
