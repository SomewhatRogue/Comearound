/**
 * The always-on HUD: top bar with the moon clock, role card, prompt, score pops, toasts,
 * the accuser's meter, and the goat's NAUGHTY close-up. DOM over the canvas.
 */
import * as THREE from 'three';
import { describe } from '../shared/activities';
import type { PrivateView, PublicView } from '../shared/protocol';
import { sfx } from './sfx';

const $ = (id: string) => document.getElementById(id)!;
const PHASE: Record<string, string> = { lobby: 'Lobby', playing: 'Task', results: 'The reveal' };

export class Hud {
  private roleKey = '';
  private chimeStep = 0;
  private lastPop = 0;
  private shownScore = 0;
  private naughtyTimer: ReturnType<typeof setTimeout> | undefined;

  update(pub: PublicView, me: PrivateView, prompt: string): void {
    $('phase').textContent = pub.phase === 'playing' ? `Task ${pub.taskIdx + 1} of ${pub.taskCount}` : PHASE[pub.phase];
    $('phase').classList.toggle('alarm', pub.phase === 'playing' && pub.timeLeft <= 10);
    const playing = pub.phase === 'playing';
    $('clock').style.display = playing ? '' : 'none';
    const mm = Math.floor(pub.timeLeft / 60);
    $('clock-text').textContent = `${mm}:${String(pub.timeLeft % 60).padStart(2, '0')}`;
    // The moon wanes as the round runs out.
    $('moon-shadow').style.transform = `translateX(${-100 * (pub.timeLeft / Math.max(1, Number($('clock').dataset.total) || pub.timeLeft))}%)`;
    if (pub.phase === 'playing' && (!$('clock').dataset.total || $('clock').dataset.task !== String(pub.taskIdx))) [$('clock').dataset.total, $('clock').dataset.task] = [String(pub.timeLeft), String(pub.taskIdx)];
    if (!playing) delete $('clock').dataset.total;

    // Score counts up rather than jumping.
    this.shownScore += Math.ceil((me.score - this.shownScore) * 0.2);
    if (Math.abs(me.score - this.shownScore) < 1) this.shownScore = me.score;
    $('score').textContent = String(this.shownScore);
    $('meter').style.display = me.meter > 0 && pub.phase !== 'results' ? '' : 'none';
    $('meter-n').textContent = String(me.meter);

    const self = pub.players.find((p) => p.id === me.you);
    const key = `${pub.phase}|${pub.taskIdx}|${me.role}|${me.task?.text}|${self?.inPen}|${self?.sign}|${self?.spectator}|${me.basket.length}|${pub.sadCount}`;
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
  naughty(words = 'NAUGHTY'): void {
    const n = $('naughty');
    n.querySelector('.word')!.textContent = words;
    n.classList.toggle('long', words.length > 10);
    n.classList.remove('hidden', 'play');
    void n.offsetWidth;
    n.classList.add('play');
    sfx.naughty();
    clearTimeout(this.naughtyTimer);
    this.naughtyTimer = setTimeout(() => n.classList.add('hidden'), 6000);
  }

  /** Hit by a snowball: a quick white splat. */
  bonked(): void {
    const b = $('bonk');
    b.classList.remove('play');
    void b.offsetWidth;
    b.classList.add('play');
    sfx.poof();
  }

  connection(ok: boolean): void {
    $('conn').style.display = ok ? 'none' : '';
  }
}

const WHERE: Record<string, string> = { fish: 'the pond', fruit: 'the orchard', bake: 'the cottage kitchen', candle: 'the chapel', archery: 'the archery range', paint: 'the easels around the square' };
const NAME: Record<string, string> = { fish: 'Fishing', fruit: 'Fruit picking', bake: 'Baking', candle: 'Candle lighting', archery: 'Archery', paint: 'Painting' };

function roleCard(pub: PublicView, me: PrivateView, inPen: boolean, sign: string | null, spectator: boolean): string {
  if (pub.phase !== 'playing') return '';
  if (spectator) return `<div class="card"><h3>Round in progress</h3><p>You'll join the next one. Watch the chaos.</p></div>`;
  const act = pub.taskAct!;
  const head = `<h4>Task ${pub.taskIdx + 1} of ${pub.taskCount}</h4><h3>${NAME[act]}</h3><p class="where">at ${WHERE[act]}</p>`;
  const pen = inPen ? `<p class="pen-note">You're in the Pen${sign ? `, wearing <b>${sign}</b>` : ''}. You sit out the tasks. Snowball fight! <b>E</b> throws the way you're facing. Knock the crows off the fence.</p>` : '';
  const sads = pub.sadCount > 1 ? `<p class="quiet">There are ${pub.sadCount} :( players this round.</p>` : '';
  const tries = me.basket.length ? `<ul>${me.basket.map((c) => `<li><span>${describe(c.act, c.attrs)}</span></li>`).join('')}</ul><p class="quiet">Your best one counts. Scores come out at the reveal.</p>` : '';
  if (me.role === 'knower' && me.task) {
    const how = inPen ? '' : `<p class="how">Go to ${WHERE[act]} and press <b>E</b> at a free spot. Get as close to the ask as you can; your best try counts. Spot someone faking it? Accuse them at the board (<b>Q</b>).</p>`;
    return `<div class="card knower">${head}<p class="ask-text">${me.task.text}</p>${tries}${how}${pen}${sads}</div>`;
  }
  const how = inPen ? '' : `<p class="how">Everyone else knows exactly what to make. Watch what they catch, then do the same at ${WHERE[act]}. If nobody calls you out, your points are <b>doubled</b>.</p>`;
  return `<div class="card sad">${head}<div class="frown">:(</div><h3>You don't know the ask</h3>${tries}${how}${pen}${sads}</div>`;
}
