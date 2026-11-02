/**
 * Panels: the lobby (your dog, the mode), the Esc menu (how to herd), the score card after each
 * field, and the results with the leaderboard. Each renders only when its inputs change; buttons
 * use data-act attributes and one listener.
 */
import { COURSES, fieldById, type CourseId } from '../shared/field';
import { DEFAULT_COAT, type Breed } from '../shared/looks';
import { botsPick, dogSheet, friendsSheet, hubBar, playSheet, type PlayTab, type Sheet } from './hub';
import type { ClientMsg, FieldScore, Look, Mode, PrivateView, PublicView } from '../shared/protocol';
import { TEAM_NAMES } from './scene';
/** Extra lobby lines from whichever online layer is running (friends on the page, or an online room). */
export interface LobbyExtra { html(pub?: PublicView, me?: PrivateView): string; key(): string; forceBots?: boolean; join?(v: string): void; leave?(): void; retry?(): void; share?(): void; joinCode?(code: string): void; newRoom?(): void; hostRoom?(): void; copyDetails?(): void; rejoin?(): void; rejoinOffer?(): string | null; dismissRejoin?(): void }
import { sfx } from './sfx';
import { bark } from './sounds';
/** Whether sound and music are on, for the menu (main.ts fills these in). */
export const audioState = { sound: () => true, music: () => true };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export class Panels {
  menuOpen = false;
  /** The hub sheet that's open (My dog, Friends, Play), or none: run about the meadow. */
  sheet: Sheet | null = null;
  private keys = { lobby: '', modal: '', bar: '' };
  /** The Play sheet: its section, and the course the host has picked. */
  private tab: PlayTab = 'trials';
  private course: CourseId = 'gentle';
  /** Bot dogs fill the empty spots (the host's choice, remembered in this browser). */
  private bots = store.get('tac-bots') !== '0';
  private bests: Record<CourseId, number> = { gentle: Number(store.get('tac-best-trials') ?? 0) || 0, tricky: Number(store.get('tac-best-tricky') ?? 0) || 0, wild: Number(store.get('tac-best-wild') ?? 0) || 0, challenge: Number(store.get('tac-best-challenge') ?? 0) || 0, highland: Number(store.get('tac-best-highland') ?? 0) || 0 };
  private best = 0;
  private newBest = false;
  private savedRun = '';

  constructor(private send: (m: ClientMsg) => void, private look: Look, private saveLook: (l: Look) => void, private room: string, private solo = false, private party: LobbyExtra | null = null) {
    document.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!el) return;
      sfx.click();
      this.act(el.dataset.act!, el.dataset.v ?? '');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).id === 'code-input') this.act('joincode', '');
    });
    document.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'name-input') this.setLook({ ...this.look, name: el.value.slice(0, 14) }, false);
    });
  }

  /** Open a hub sheet, or close it (null). */
  open(sheet: Sheet | null): void {
    if (this.sheet === sheet) return;
    this.sheet = sheet;
    this.keys.lobby = '';
  }

  /** Draw the panels afresh (the friends list changed, or you joined someone's game). */
  refresh(): void {
    this.keys = { lobby: '', modal: '', bar: '' };
  }

  private setLook(l: Look, rerender = true): void {
    this.look = l;
    this.saveLook(l);
    this.send({ t: 'look', look: l });
    if (rerender) this.keys.lobby = '';
  }

  private act(act: string, v: string): void {
    if (act === 'breed') this.setLook({ ...this.look, breed: v as Breed, coat: DEFAULT_COAT[v as Breed] });
    if (act === 'coat') this.setLook({ ...this.look, coat: v });
    if (act === 'eyes') this.setLook({ ...this.look, eyes: v });
    if (act === 'collar') this.setLook({ ...this.look, collar: v });
    if (act === 'build') this.setLook({ ...this.look, build: Number(v) || 0 });
    if (act === 'voice') {
      const { voice: _, ...rest } = this.look;
      this.setLook(v === 'auto' ? rest : { ...rest, voice: Number(v) });
      // A preview, so you can hear the chonky boi squeak.
      bark(this.look, 0.7);
    }
    if (act === 'sheet') this.open(v ? (this.sheet === v ? null : (v as Sheet)) : null);
    if (act === 'tab') [this.tab, this.keys.lobby] = [v as PlayTab, ''];
    if (act === 'course') [this.course, this.keys.lobby] = [v as CourseId, ''];
    if (act === 'bots') {
      this.bots = v ? v === 'on' : !this.bots;
      store.set('tac-bots', this.bots ? '1' : '0');
      this.keys.lobby = '';
    }
    if (act === 'nobots') {
      this.send({ t: 'noBots' });
      this.menuOpen = false;
    }
    if (act === 'start') this.startPick(v === 'versus' ? 'versus' : this.course);
    if (act === 'again') this.startPick(v as CourseId | 'versus');
    if (act === 'copy') void navigator.clipboard?.writeText(location.href).catch(() => {});
    if (act === 'close') this.menuOpen = false;
    if (act === 'toggle') document.dispatchEvent(new CustomEvent('toggle-audio', { detail: v }));
    if (act === 'join') this.party?.join?.(v);
    if (act === 'leave') this.party?.leave?.();
    if (act === 'retry') this.party?.retry?.();
    if (act === 'share') this.party?.share?.();
    if (act === 'newroom') this.party?.newRoom?.();
    if (act === 'hostroom') this.party?.hostRoom?.();
    if (act === 'rejoin') this.party?.rejoin?.();
    if (act === 'norejoin') this.party?.dismissRejoin?.();
    if (act === 'copydetails') this.party?.copyDetails?.();
    if (act === 'joincode') this.party?.joinCode?.((document.getElementById('code-input') as HTMLInputElement | null)?.value ?? '');
    if (act === 'endField') {
      this.send({ t: 'endField' });
      this.menuOpen = false;
    }
    if (act === 'lobby') {
      this.send({ t: 'toLobby' });
      this.menuOpen = false;
    }
    this.keys.modal = '';
  }

  private startPick(pick: CourseId | 'versus'): void {
    const mode: Mode = pick === 'versus' ? 'versus' : 'trials';
    this.send({ t: 'start', mode, fillBots: this.bots || this.solo || !!this.party?.forceBots, course: pick === 'versus' ? 'gentle' : pick });
  }

  render(pub: PublicView, me: PrivateView): void {
    const lobby = document.getElementById('lobby')!;
    const inHub = pub.phase === 'lobby';
    const sheet = inHub ? this.sheet : null;
    const lk = sheet ? JSON.stringify([sheet, this.look, pub.dogs.map((d) => [d.look, d.connected, d.bot]), pub.hostId === me.you, this.tab, this.course, this.bots, this.party?.key()]) : 'off';
    if (lk !== this.keys.lobby) {
      this.keys.lobby = lk;
      const typing = ['name-input', 'code-input'].includes(document.activeElement?.id ?? '');
      if (!typing) lobby.innerHTML = sheet ? this.sheetHtml(sheet, pub, me) : '';
      lobby.style.display = sheet ? '' : 'none';
      lobby.dataset.sheet = sheet ?? '';
      document.body.classList.toggle('panel-open', !!sheet);
    }
    // The hub's buttons, along the top.
    const bar = document.getElementById('hubbar')!;
    const humans = pub.dogs.filter((d) => !d.bot && d.connected).length;
    const offer = inHub ? this.party?.rejoinOffer?.() ?? null : null;
    const bk = inHub ? JSON.stringify([this.look.breed, sheet, humans, offer]) : 'off';
    if (bk !== this.keys.bar) {
      this.keys.bar = bk;
      // Just back after a crash (or opened the site afresh): the way back into the friends' game, front and centre.
      const back = offer ? `<div class="rejoin-offer"><span>${esc(offer)}</span><button class="chip on" data-act="rejoin">Rejoin</button><button class="link" data-act="norejoin" aria-label="No thanks">&times;</button></div>` : '';
      bar.innerHTML = inHub ? `<div class="hub-row">${hubBar(this.look, sheet, humans > 1 ? `${humans} here` : '')}</div>${back}` : '';
      bar.hidden = !inHub;
    }
    this.recordBest(pub);
    const modal = document.getElementById('modal')!;
    const mk = JSON.stringify([pub.phase, this.menuOpen, pub.fieldIdx, pub.fieldScores.length, pub.hostId === me.you, this.newBest, this.bots, pub.dogs.filter((d) => d.bot).length, pub.dogs.filter((d) => !d.bot && d.connected).length]);
    if (mk !== this.keys.modal) {
      this.keys.modal = mk;
      const html = this.menuOpen ? menuHtml(pub, me, this.canBots) : pub.phase === 'fieldEnd' ? fieldCard(pub, me) : pub.phase === 'results' ? this.resultsHtml(pub, me) : '';
      modal.innerHTML = html;
      modal.classList.toggle('hidden', !html);
      modal.classList.toggle('glance', pub.phase === 'fieldEnd' && !this.menuOpen);
    }
  }

  /** Trials: keep this browser's best run, so solo play has a leaderboard of its own. */
  private recordBest(pub: PublicView): void {
    if (pub.phase !== 'results' || pub.mode !== 'trials') return;
    const run = runTotal(pub.fieldScores, null);
    const id = JSON.stringify(pub.fieldScores);
    if (id === this.savedRun) return;
    this.savedRun = id;
    const c = pub.course;
    this.newBest = run > this.bests[c];
    this.best = Math.max(run, this.bests[c]);
    if (this.newBest) {
      this.bests[c] = run;
      store.set(c === 'gentle' ? 'tac-best-trials' : `tac-best-${c}`, String(run));
    }
  }

  /** Bot dogs are the host's to choose (solo always has them: they're who you play with). */
  private get canBots(): boolean {
    return !(this.solo || this.party?.forceBots);
  }

  private sheetHtml(sheet: Sheet, pub: PublicView, me: PrivateView): string {
    if (sheet === 'dog') return dogSheet(this.look);
    if (sheet === 'friends') return friendsSheet(pub, me, this.party ? (this.solo ? this.party.html() : this.party.html(pub, me)) : null, this.room);
    return playSheet(pub, me, { tab: this.tab, course: this.course, bots: this.bots, showBots: this.canBots, bests: this.bests });
  }

  private resultsHtml(pub: PublicView, me: PrivateView): string {
    const host = pub.hostId === me.you;
    const again = host
      ? `${this.canBots ? botsPick(pub, pub.mode, this.bots) : ''}<div class="row"><button class="big" data-act="again" data-v="${pub.mode}">Play again</button><button class="big alt" data-act="lobby">Back to the lobby</button></div>`
      : '<p class="quiet">The host picks what happens next.</p>';
    if (pub.mode === 'versus') {
      const [a, b] = [runTotal(pub.fieldScores, 0), runTotal(pub.fieldScores, 1)];
      const wins = [0, 1].map((t) => pub.fieldScores.filter((f) => f[t].score > f[1 - t].score).length);
      const winner = a === b ? null : a > b ? 0 : 1;
      const mine = pub.dogs.find((d) => d.id === me.you)?.team;
      const rows = pub.fieldScores.map((f, i) => `<tr style="--d:${i * 0.35}s"><td>Field ${i + 1}</td><td class="t0">${f[0].score}</td><td class="t1">${f[1].score}</td></tr>`).join('');
      const banner = winner === null ? '<p class="banner">A draw!</p>' : `<p class="banner team${winner}">${TEAM_NAMES[winner]} wins${mine === winner ? '. Good dogs!' : ''}</p>`;
      return `<div class="sheet results"><h4>Field Day</h4><h2>Final score</h2>${banner}
        <table><thead><tr><th></th><th class="t0">${TEAM_NAMES[0]}</th><th class="t1">${TEAM_NAMES[1]}</th></tr></thead><tbody>${rows}
        <tr class="total"><td>Total</td><td class="t0">${a}</td><td class="t1">${b}</td></tr><tr><td class="quiet">Fields won</td><td class="t0">${wins[0]}</td><td class="t1">${wins[1]}</td></tr></tbody></table>${again}</div>`;
    }
    const run = runTotal(pub.fieldScores, null);
    // The Clean column only on courses with mud in them.
    const muddy = COURSES[pub.course].fields.some((f) => f.mud?.length);
    const rows = pub.fieldScores.map((f, i) => {
      const s = f[0];
      return `<tr style="--d:${i * 0.35}s"><td>${COURSES[pub.course].fields[i]?.name ?? `Field ${i + 1}`}</td><td>${s.penned}/${s.total}${s.lost ? ` <span class="bad">-${s.lost} lost</span>` : ''}</td><td>+${s.timeBonus}</td><td>+${s.calmBonus}</td><td>${s.goatBonus ? '+' + s.goatBonus : ''}</td>${muddy ? `<td>${s.cleanBonus ? '+' + s.cleanBonus : ''}</td>` : ''}<td class="pts">${s.score}</td></tr>`;
    }).join('');
    const rows2 = pub.leaderboard.filter((r) => r.course === pub.course);
    const board = rows2.map((r, i) => `<li class="${r.score === run && i === rows2.findIndex((q) => q.score === run) ? 'this' : ''}"><b>${i + 1}</b><span>${r.names.map(esc).join(', ')}</span><span class="pts">${r.score}</span></li>`).join('');
    return `<div class="sheet results"><h4>Co-op Trials: ${COURSES[pub.course].name}</h4><h2>${run} points</h2>${this.newBest ? '<p class="banner">New best for this browser!</p>' : `<p class="quiet">Your best: ${this.best}</p>`}
      <table><thead><tr><th>Field</th><th>Sheep</th><th>Time</th><th>Calm</th><th>Goat</th>${muddy ? '<th>Clean</th>' : ''}<th>Score</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>Leaderboard (this room)</h3><ol class="board">${board}</ol>${again}</div>`;
  }
}

function runTotal(fs: FieldScore[][], team: 0 | 1 | null): number {
  return fs.reduce((n, f) => n + (f.find((s) => s.team === team)?.score ?? 0), 0);
}

/** After each field: the tally, row by row. */
function fieldCard(pub: PublicView, me: PrivateView): string {
  const f = pub.fieldScores[pub.fieldScores.length - 1];
  if (!f) return '';
  const field = fieldById(pub.fieldId);
  const next = pub.fieldIdx + 1 < pub.fieldCount ? `<p class="quiet">Next field in a moment...</p>` : '<p class="quiet">Final scores in a moment...</p>';
  const col = (s: FieldScore) => {
    const rows = [
      [`Sheep penned`, `${s.penned}/${s.total}`, s.penned * 100],
      ['Time left', s.timeBonus ? '' : 'pen them all to earn it', s.timeBonus],
      ['Calm herding', 'settled flock, soft feet, few barks', s.calmBonus],
      ...(s.goatBonus ? [[s.goatBonus > 250 ? 'Goats!' : 'The goat!', 'penned', s.goatBonus] as const] : []),
      ...(field.mud?.length ? [['Clean dogs', s.cleanBonus > 140 ? 'not a speck of mud' : 'stayed out of the mud', s.cleanBonus] as const] : []),
      ...(s.lost ? [['Lost sheep', `${s.lost} out the broken fence`, -s.lostPenalty] as const] : []),
    ];
    return `<div class="tally ${s.team === null ? '' : `team${s.team}`}">${s.team === null ? '' : `<h3>${TEAM_NAMES[s.team]}</h3>`}
      <ul>${rows.map(([a, b, c], i) => `<li style="--d:${0.2 + i * 0.35}s"><span>${a} <i>${b}</i></span><b class="${Number(c) < 0 ? 'bad' : ''}">${Number(c) < 0 ? '' : '+'}${c}</b></li>`).join('')}</ul>
      <div class="sum" style="--d:${0.2 + rows.length * 0.35}s">${s.score}</div></div>`;
  };
  const mine = pub.dogs.find((d) => d.id === me.you)?.team ?? 0;
  const title = pub.mode === 'versus' ? (f[0].score === f[1].score ? 'Dead even!' : `${TEAM_NAMES[f[0].score > f[1].score ? 0 : 1]} takes the field${(f[0].score > f[1].score ? 0 : 1) === mine ? '!' : ''}`) : f[0].penned === f[0].total ? 'All in. Good dogs!' : `${f[0].penned} of ${f[0].total} in`;
  return `<div class="sheet card-end"><h4>${esc(field.name)} &middot; field ${pub.fieldIdx + 1} of ${pub.fieldCount}</h4><h2>${title}</h2><div class="tallies">${f.map(col).join('')}</div>${next}</div>`;
}

function menuHtml(pub: PublicView, me: PrivateView, canBots: boolean): string {
  const host = pub.hostId === me.you && pub.phase !== 'lobby';
  const botCount = pub.dogs.filter((d) => d.bot).length;
  const sendHome = canBots && botCount ? `<button class="big alt" data-act="nobots">Send the bot dog${botCount > 1 ? 's' : ''} home</button>` : '';
  const hostTools = host
    ? `<div class="host"><h3>Host</h3>${sendHome}${pub.phase === 'playing' ? '<button class="big alt" data-act="endField">End this field now</button>' : ''}<button class="big danger" data-act="lobby">Back to the lobby</button></div>`
    : '';
  const on = (k: 'sound' | 'music') => audioState[k]();
  const chip = (k: 'sound' | 'music', name: string) => `<button class="chip ${on(k) ? 'on' : ''}" data-act="toggle" data-v="${k}">${name}: ${on(k) ? 'on' : 'off'}</button>`;
  return `<div class="sheet menu"><button class="x" data-act="close">Close</button><div class="audio-row">${chip('sound', 'Sound')}${chip('music', 'Music')}</div>${hostTools}<h2>How to herd</h2><ol>
    <li><b>Get the sheep into the pen</b>, through the gate. They count once they're inside. Every sheep in (and held for a moment) ends the field early, and the time left is bonus points.</li>
    <li><b>Sheep move away from dogs.</b> Walking pushes them; sprinting (Shift, or on a phone drag past the ring) scatters them. Circle wide to get <b>behind</b> them (on the far side from the gate) before you push.</li>
    <li><b>Crouch</b> (<b>Space</b>, or <b>DOWN</b> on a phone) to stalk. Face the sheep and you give them <b>the eye</b> (the pale cone): they drift away calmly, without panicking.</li>
    <li><b>Lie down</b>: crouch and hold still. Sheep near you settle (the green ring). Good for holding a flock or a gate.</li>
    <li><b>Bark</b> (<b>E</b>) sends sheep running fast. It has a cooldown, costs calm-herding points, and <b>the goat hates it</b>: bark near it too often and it walks over, stares you down and you freeze. <i>NAUGHTY.</i></li>
    <li><b>Calm herding pays.</b> A settled flock, soft feet (little sprinting, plenty of stalking and the eye) and few barks earn up to 500 points a field, as much as racing the clock.</li>
    <li><b>Low fences:</b> the sheep have to go round, but a dog just hops over. Handy for getting behind a flock.</li>
    <li><b>The goat</b> wanders, bleats and scatters sheep. It only gives way to a dog giving it the eye. Pen it for a bonus.</li>
    <li><b>Versus:</b> blue sheep go in the blue pen, orange in the orange pen. Pen yours, or herd the goat over to their side and let it bleat.</li>
    <li><b>Keys:</b> WASD or arrows move, Shift sprints, Space crouches, E barks, M mutes, Esc for this menu.</li>
  </ol></div>`;
}

