/**
 * Panels: the lobby wardrobe, the board (accusations), the accuser's choice, the menu, the reveal.
 * Each renders only when its inputs change; buttons use data-act attributes and one listener.
 */
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
    if (act === 'close') [this.boardOpen, this.menuOpen] = [false, false];
    if (act === 'endRound') {
      this.send({ t: 'endRound' });
      this.menuOpen = false;
    }
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
    const mk = JSON.stringify([pub.phase, this.menuOpen, this.boardOpen, me.awaitingChoice, me.accusationUsed, me.role, pub.players.map((p) => p.inPen), !!pub.reveal, pub.hostId === me.you]);
    if (mk !== this.keys.modal) {
      this.keys.modal = mk;
      const html = this.menuOpen ? menuHtml(pub, me) : me.awaitingChoice ? choiceHtml() : pub.reveal ? revealHtml(pub, me) : this.boardOpen ? this.boardHtml(pub, me) : '';
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
      ? '<p class="quiet">Solo practice: bots fill the other seats. Pick a look, then start a round.</p>'
      : `<p class="quiet">Room <b>${esc(this.room)}</b> <button class="link" data-act="copy">copy invite link</button></p>`;
    return `<h2>Threes a crowd</h2>${roomLine}
      <label>Your name<input id="name-input" maxlength="14" value="${esc(this.look.name)}"></label>
      <div class="label">Colour</div><div class="swatches">${colors}</div>
      <div class="label">Hat</div><div class="row wrap">${hats}</div>
      <div class="label">How to play</div><ul class="how-mini"><li>Each round is 3 tasks: fishing, archery, painting and more.</li><li>Everyone gets the exact ask, except the :( player, who has to fake it.</li><li>Get as close to the ask as you can; scores come out at the end.</li><li>Knowers: call out the :( at the board. Wrong? Off to the Pen. <b>Esc</b> for the full rules.</li></ul>
      <div class="label">Villagers (${pub.players.length})</div><ul class="who">${who}</ul>${controls}`;
  }

  private boardHtml(pub: PublicView, me: PrivateView): string {
    const suspects = pub.players.filter((p) => p.id !== me.you && !p.inPen && !p.spectator);
    const accuse = me.role === 'sad'
      ? '<p class="quiet">Only knowers can accuse. Keep faking it: if nobody calls you out, your points are doubled.</p>'
      : me.accusationUsed
      ? '<p class="quiet">You have used your accusation.</p>'
      : `<ul class="suspects">${suspects.map((p) => `<li><i style="background:${p.look.color}"></i>${esc(p.look.name)}<button class="chip danger" data-act="accuse" data-v="${p.id}">Accuse</button></li>`).join('')}</ul><p class="quiet">One accusation per round. Right: they go to the Pen and lose their bonus. Wrong: you go to the Pen.</p>`;
    return `<div class="sheet board"><button class="x" data-act="close">Close</button><h2>The Board</h2><h3>${me.role === 'sad' ? 'Accusations' : 'Who is faking it?'}</h3>${accuse}</div>`;
  }
}

function menuHtml(pub: PublicView, me: PrivateView): string {
  const host = pub.hostId === me.you && pub.phase !== 'lobby';
  const hostTools = host
    ? `<div class="host"><h3>Host</h3>${pub.phase === 'playing' ? '<button class="big alt" data-act="endRound">End the round now (go to the reveal)</button>' : ''}<button class="big danger" data-act="lobby">Back to the lobby</button></div>`
    : '';
  return `<div class="sheet menu"><button class="x" data-act="close">Close</button><h2>How to play</h2><ol>
    <li><b>Each round is 3 tasks</b>, one after another: fishing, fruit picking, baking, candle lighting, archery or painting. Everyone sees which activity it is.</li>
    <li><b>Knowers get the exact ask</b> on the card at the top left ("Catch a small yellow fish"). The <b>:(</b> player gets nothing and has to fake it.</li>
    <li><b>Do the task.</b> Walk to a free spot and press <b>E</b>. Things slide past; press <b>E</b> again when the one you want is under the marker. Painting: choose medium, colour and subject first, then keep your hand steady. Try as often as you like; your best try counts.</li>
    <li><b>Everyone sees what you catch</b>, but not what you were asked for. The :( player copies what looks popular. Knowers watch for whoever keeps missing the mark.</li>
    <li><b>The board</b> (walk up and press <b>Q</b>): knowers can accuse one player. <b>Right:</b> they go to the Pen and lose their bonus, and only you know it was a catch. <b>Wrong:</b> you go to the Pen with a sign.</li>
    <li><b>The reveal</b> shows every ask and scores everyone's best tries by how close they came. An uncaught :( player's points are <b>doubled</b>.</li>
    <li><b>In the Pen:</b> snowball fight. <b>E</b> throws. Knock the crows off the fence. Do not hit the goat.</li>
  </ol>${hostTools}</div>`;
}

function choiceHtml(): string {
  return `<div class="sheet choice"><h2>You caught one!</h2><p>Nobody else knows it was a catch. End the round now, or keep playing: your meter climbs every second until the reveal.</p>
    <div class="row"><button class="big" data-act="end" data-v="1">End now</button><button class="big alt" data-act="end" data-v="0">Keep playing</button></div></div>`;
}

const ACT_NAME: Record<string, string> = { fish: 'Fishing', fruit: 'Fruit picking', bake: 'Baking', candle: 'Candles', archery: 'Archery', paint: 'Painting' };

function revealHtml(pub: PublicView, me: PrivateView): string {
  const r = pub.reveal!;
  const asks = r.tasks.map((t, i) => `<li><b>${ACT_NAME[t.act]}</b>${esc(t.text)}<span class="quiet">task ${i + 1}</span></li>`).join('');
  const head = r.tasks.map((t) => `<th>${ACT_NAME[t.act]}</th>`).join('');
  const rows = [...r.rows].sort((a, b) => b.points - a.points).map((row, i) => `<tr style="--d:${i * 0.35}s">
      <td>${name(pub, row.id)}${row.id === me.you ? ' (you)' : ''}${row.sad ? ` <b class="frown-s">:(</b>${row.caughtOut ? ' <span class="quiet">caught</span>' : ' <span class="x2">x2</span>'}` : ''}</td>
      ${row.perTask.map((t) => `<td><div class="cell-pts">${t.pts}</div><div class="quiet">${t.desc ? esc(t.desc) : 'nothing'}</div></td>`).join('')}
      <td class="pts">+${row.points}</td><td>${row.total}</td></tr>`).join('');
  const lobby = pub.hostId === me.you ? '<button class="big" data-act="lobby">Back to the lobby</button>' : '<p class="quiet">The host will take everyone back.</p>';
  return `<div class="sheet reveal"><h4>The asks were</h4><ul class="asks">${asks}</ul><p class="banner ${r.winner}">${r.winner === 'sad' ? 'The :( got away with it' : 'The village caught them'}</p>
    <div class="table-wrap"><table><thead><tr><th>Villager</th>${head}<th>This round</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>${lobby}</div>`;
}
