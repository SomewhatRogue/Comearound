/**
 * Panels: the lobby wardrobe, the board, the accuser's choice, the last-chance guess, the reveal.
 * Each renders only when its inputs change; buttons use data-act attributes and one listener.
 */
import { THINGS, thingById } from '../shared/catalog';
import { AREAS } from '../shared/map';
import type { ClientMsg, Look, PrivateView, PublicView } from '../shared/protocol';
import { sfx } from './sfx';

import { COLORS, HATS } from '../shared/looks';
export { COLORS, HATS };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const name = (pub: PublicView, id: string) => esc(pub.players.find((p) => p.id === id)?.look.name ?? '?');

export class Panels {
  boardOpen = false;
  menuOpen = false;
  private keys = { lobby: '', modal: '' };
  private confirmGuess: string | null = null;
  private roundSec = 420;
  private bots = true;

  constructor(private send: (m: ClientMsg) => void, private look: Look, private saveLook: (l: Look) => void, private room: string, private solo = false) {
    document.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!el) return;
      sfx.click();
      this.act(el.dataset.act!, el.dataset.v ?? '');
    });
    document.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'name-input') this.setLook({ ...this.look, name: el.value.slice(0, 14) });
    });
  }

  private setLook(l: Look): void {
    this.look = l;
    this.saveLook(l);
    this.send({ t: 'look', look: l });
    this.keys.lobby = '';
  }

  private act(act: string, v: string): void {
    if (act === 'color') this.setLook({ ...this.look, color: v });
    if (act === 'hat') this.setLook({ ...this.look, hat: v });
    if (act === 'len') [this.roundSec, this.keys.lobby] = [Number(v), ''];
    if (act === 'bots') [this.bots, this.keys.lobby] = [!this.bots, ''];
    if (act === 'start') this.send({ t: 'start', roundSec: this.roundSec, fillBots: this.bots });
    if (act === 'copy') void navigator.clipboard?.writeText(location.href);
    if (act === 'close') [this.boardOpen, this.menuOpen, this.confirmGuess] = [false, false, null];
    if (act === 'endRound') {
      this.send({ t: 'endRound' });
      this.menuOpen = false;
    }
    if (act === 'guess') {
      if (this.confirmGuess === v) {
        this.send({ t: 'guess', thingId: v });
        [this.boardOpen, this.confirmGuess] = [false, null];
      } else this.confirmGuess = v;
    }
    if (act === 'last') this.send({ t: 'guess', thingId: v });
    if (act === 'accuse') {
      this.send({ t: 'accuse', targetId: v });
      this.boardOpen = false;
    }
    if (act === 'end') this.send({ t: 'choice', endNow: v === '1' });
    if (act === 'lobby') {
      this.send({ t: 'toLobby' });
      this.menuOpen = false;
    }
    this.keys.modal = '';
  }

  render(pub: PublicView, me: PrivateView): void {
    const lobby = document.getElementById('lobby')!;
    const lk = pub.phase === 'lobby' ? JSON.stringify([this.look, pub.players.map((p) => [p.look, p.connected]), pub.hostId === me.you, this.roundSec, this.bots]) : 'off';
    if (lk !== this.keys.lobby) {
      this.keys.lobby = lk;
      const typing = document.activeElement?.id === 'name-input';
      if (!typing) lobby.innerHTML = pub.phase === 'lobby' ? this.lobbyHtml(pub, me) : '';
      lobby.style.display = pub.phase === 'lobby' ? '' : 'none';
    }
    if (pub.phase !== 'playing') this.boardOpen = false;
    const modal = document.getElementById('modal')!;
    const mk = JSON.stringify([pub.phase, this.menuOpen, this.boardOpen, this.confirmGuess, me.awaitingChoice, me.canLastChance, me.guessesLeft, me.accusationUsed, pub.players.map((p) => p.inPen), !!pub.reveal, pub.hostId === me.you]);
    if (mk !== this.keys.modal) {
      this.keys.modal = mk;
      const html = this.menuOpen ? menuHtml(pub, me) : me.awaitingChoice ? choiceHtml() : me.canLastChance ? lastChanceHtml() : pub.reveal ? revealHtml(pub, me) : this.boardOpen ? this.boardHtml(pub, me) : '';
      modal.innerHTML = html;
      modal.classList.toggle('hidden', !html);
    }
  }

  private lobbyHtml(pub: PublicView, me: PrivateView): string {
    const host = pub.hostId === me.you;
    const colors = COLORS.map((c) => `<button class="swatch ${c === this.look.color ? 'on' : ''}" style="background:${c}" data-act="color" data-v="${c}" aria-label="colour ${c}"></button>`).join('');
    const hats = HATS.map((h) => `<button class="chip ${h === this.look.hat ? 'on' : ''}" data-act="hat" data-v="${h}">${h}</button>`).join('');
    const who = pub.players.map((p) => `<li><i style="background:${p.look.color}"></i>${esc(p.look.name)}${p.id === pub.hostId ? ' <em>host</em>' : ''}</li>`).join('');
    const lens = [300, 420, 600].map((s) => `<button class="chip ${s === this.roundSec ? 'on' : ''}" data-act="len" data-v="${s}">${s / 60} min</button>`).join('');
    const controls = host
      ? `<div class="row">${lens}</div>${this.solo ? '' : `<button class="chip ${this.bots ? 'on' : ''}" data-act="bots">Fill empty seats with bots</button>`}<button class="big" data-act="start">Start the round</button>`
      : `<p class="quiet">Waiting for the host to start.</p>`;
    const roomLine = this.solo
      ? '<p class="quiet">Solo practice: bots fill the other seats. Walk around, pick up things, then start a round.</p>'
      : `<p class="quiet">Room <b>${esc(this.room)}</b> <button class="link" data-act="copy">copy invite link</button></p>`;
    return `<h2>Threes a crowd</h2>${roomLine}
      <label>Your name<input id="name-input" maxlength="14" value="${esc(this.look.name)}"></label>
      <div class="label">Colour</div><div class="swatches">${colors}</div>
      <div class="label">Hat</div><div class="row wrap">${hats}</div>
      <div class="label">How to play</div><ul class="how-mini"><li>Everyone gets the same secret thing to make, except the :( player.</li><li>Carry parts (<b>E</b>) to a table in the right area and build it.</li><li>Knowers: catch the :( at the board. The :( player: guess the thing.</li><li>Wrong accusation? Off to the Pen. <b>Esc</b> for the full rules.</li></ul>
      <div class="label">Villagers (${pub.players.length})</div><ul class="who">${who}</ul>${controls}`;
  }

  private boardHtml(pub: PublicView, me: PrivateView): string {
    const canGuess = me.role === 'sad' && me.guessesLeft > 0;
    const groups = AREAS.map((a) => {
      const rows = THINGS.filter((t) => t.area === a.id).map((t) => {
        const btn = canGuess ? `<button class="chip ${this.confirmGuess === t.id ? 'warn' : ''}" data-act="guess" data-v="${t.id}">${this.confirmGuess === t.id ? 'Sure? Click again' : 'Guess this'}</button>` : '';
        return `<li><span>${t.name}</span>${btn}</li>`;
      }).join('');
      return `<div class="group"><h4>${a.name}</h4><ul class="things">${rows}</ul></div>`;
    }).join('');
    const suspects = pub.players.filter((p) => p.id !== me.you && !p.inPen && !p.spectator);
    const accuse = me.role === 'sad'
      ? `<p class="quiet">Only knowers can accuse. You get one guess at the thing${me.guessesLeft ? '' : ', and you have used it'}.</p>`
      : me.accusationUsed
      ? '<p class="quiet">You have used your accusation.</p>'
      : `<ul class="suspects">${suspects.map((p) => `<li><i style="background:${p.look.color}"></i>${esc(p.look.name)}<button class="chip danger" data-act="accuse" data-v="${p.id}">Accuse</button></li>`).join('')}</ul><p class="quiet">One accusation. Wrong, and you go to the Pen.</p>`;
    return `<div class="sheet board"><button class="x" data-act="close">Close</button><h2>The Board</h2>
      <div class="cols"><div><h3>Every thing it could be</h3>${groups}</div><div><h3>${me.role === 'sad' ? 'Your guess' : 'Accuse a :('}</h3>${accuse}</div></div></div>`;
  }
}

function menuHtml(pub: PublicView, me: PrivateView): string {
  const host = pub.hostId === me.you && pub.phase !== 'lobby';
  const hostTools = host
    ? `<div class="host"><h3>Host</h3>${pub.phase === 'playing' || pub.phase === 'lastcall' ? '<button class="big alt" data-act="endRound">End the round now (go to the reveal)</button>' : ''}<button class="big danger" data-act="lobby">Back to the lobby</button></div>`
    : '';
  return `<div class="sheet menu"><button class="x" data-act="close">Close</button><h2>How to play</h2><ol>
    <li><b>Everyone gets the same secret thing to make</b>, shown on the card at the top left. Except one player (more in big games), who gets a <b>:(</b> instead.</li>
    <li><b>Build it.</b> Each thing has 3 parts, and each part can be one of a few items. Pick items up with <b>E</b>, carry them to an empty table in the right area, and put them down with <b>E</b>. Points pop up for every part that fits something.</li>
    <li><b>Act natural.</b> Everyone is watching what you carry. Save your most telling part for last call.</li>
    <li><b>The board</b> (walk up and press <b>Q</b>) lists every thing it could be. Knowers can accuse one player of being the :(. The :( player gets one guess at the thing.</li>
    <li><b>Wrong accusation:</b> you go to the Pen with a sign. <b>Right:</b> they go, and only you know it was a catch. End the round, or keep playing and watch your meter climb.</li>
    <li><b>Last call</b> closes the board. At the reveal, every creation is judged. The :( player wins by guessing the thing, or by surviving with the right creation.</li>
    <li><b>In the Pen:</b> snowball fight. <b>E</b> throws. Knock the crows off the fence. Do not hit the goat.</li>
  </ol>${hostTools}</div>`;
}

function choiceHtml(): string {
  return `<div class="sheet choice"><h2>You caught one!</h2><p>Nobody else knows it was a catch. Bank your win now, or keep playing and watch your meter climb. If they guess the thing at the reveal, they steal it.</p>
    <div class="row"><button class="big" data-act="end" data-v="1">End now</button><button class="big alt" data-act="end" data-v="0">Keep playing</button></div></div>`;
}

function lastChanceHtml(): string {
  const rows = THINGS.map((t) => `<li><span>${t.name}</span><button class="chip" data-act="last" data-v="${t.id}">This one</button></li>`).join('');
  return `<div class="sheet"><h2>Last chance</h2><p>You were caught, but you watched. Name the thing to steal the catcher's meter.</p><ul class="things">${rows}</ul></div>`;
}

function revealHtml(pub: PublicView, me: PrivateView): string {
  const r = pub.reveal!;
  const thing = thingById.get(r.thingId)!;
  const rows = [...r.rows].sort((a, b) => b.points - a.points).map((row, i) => `<tr style="--d:${i * 0.35}s">
      <td>${name(pub, row.id)}${row.id === me.you ? ' (you)' : ''}</td><td>${row.sad ? '<b class="frown-s">:(</b>' : ''}</td>
      <td>${row.creation ? esc(row.creation) : '<span class="quiet">nothing</span>'}</td><td>${row.passed ? 'yes' : row.inPen ? 'in the Pen' : 'no'}</td>
      <td class="pts" data-n="${row.points}">+${row.points}</td><td>${row.total}</td></tr>`).join('');
  const lobby = pub.hostId === me.you ? '<button class="big" data-act="lobby">Back to the lobby</button>' : '<p class="quiet">The host will take everyone back.</p>';
  return `<div class="sheet reveal"><h4>The thing was</h4><h2>${thing.name}</h2><p class="banner ${r.winner}">${r.winner === 'sad' ? 'The :( got away with it' : 'The village wins'}</p>
    <table><thead><tr><th>Villager</th><th></th><th>Made</th><th>Passed</th><th>This round</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>${lobby}</div>`;
}
