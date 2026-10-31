/**
 * Client entry: joins the room in the URL (or makes one), predicts your own movement,
 * draws the world, and exposes text state for tests (window.__GAME_STATE__, render_game_to_text).
 */
import * as THREE from 'three';
import { itemById } from '../shared/catalog';
import { BOARD, PLAYER_SPEED, REACH, STATIONS, dist } from '../shared/map';
import type { Look } from '../shared/protocol';
import { Entities } from './entities';
import { Hud } from './hud';
import { Input } from './input';
import { LocalNet } from './local';
import { Net, type NetLike } from './net';
import { COLORS, HATS, Panels } from './panels';
import { followCamera, makeStage } from './scene';
import { sfx } from './sfx';
import { SoundDirector } from './sounds';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const params = new URLSearchParams(location.search);
// Solo: the whole room runs in this tab with bots. The shareable solo build sets VITE_SOLO.
const solo = import.meta.env.VITE_SOLO === '1' || params.has('solo');
let room = solo ? 'solo' : (params.get('room') ?? '').replace(/[^\w-]/g, '').slice(0, 32);
if (!room) {
  room = Array.from({ length: 4 }, () => 'BCDFGHJKLMNPQRSTVWXZ'[Math.floor(Math.random() * 20)]).join('');
  params.set('room', room);
  try { history.replaceState(null, '', `?${params}`); } catch { /* sandboxed frame */ }
}
// A token per tab-session lets a reload rejoin your seat; ?as= gives tests distinct players.
const tokenKey = `tac-token-${room}-${params.get('as') ?? ''}`;
const token = (() => {
  try {
    const t = sessionStorage.getItem(tokenKey) ?? crypto.randomUUID();
    sessionStorage.setItem(tokenKey, t);
    return t;
  } catch {
    return crypto.randomUUID();
  }
})();

let look: Look = (() => {
  try { return JSON.parse(store.get('tac-look') ?? ''); } catch { return null; }
})() ?? { name: params.get('name') ?? `Villager ${Math.floor(Math.random() * 90 + 10)}`, color: COLORS[Math.floor(Math.random() * COLORS.length)], hat: HATS[1 + Math.floor(Math.random() * (HATS.length - 1))] };
if (params.get('name')) look = { ...look, name: params.get('name')! };

const stage = makeStage(document.getElementById('game')!, params.has('lowfx'));
const entities = new Entities(stage);
const hud = new Hud();
const input = new Input();
const net: NetLike = solo ? new LocalNet(() => look) : new Net(room, token, () => look);
const panels = new Panels((m) => net.send(m), look, (l) => { look = l; store.set('tac-look', JSON.stringify(l)); }, room, solo);

const sounds = new SoundDirector();
const muteBtn = document.getElementById('mute')!;
const showMute = () => (muteBtn.textContent = sfx.muted ? 'Sound off' : 'Sound on');
showMute();
input.onMute = () => {
  sfx.toggleMute();
  showMute();
};
muteBtn.addEventListener('click', () => input.onMute());
// Browsers only allow sound after the player interacts.
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sfx.unlock(), { capture: true });

const predicted = new THREE.Vector3();
let havePrediction = false;

input.onInteract = () => net.send({ t: 'interact' });
input.onEscape = () => {
  if (panels.boardOpen) panels.boardOpen = false;
  else panels.menuOpen = !panels.menuOpen;
};
input.onBoard = () => {
  if (net.pub?.phase !== 'playing' || !nearBoard()) return;
  panels.boardOpen = !panels.boardOpen;
  if (panels.boardOpen) sfx.rustle();
};

net.onEvent = (ev) => {
  const at = net.me ? entities.pos.get(net.me.you) : undefined;
  if (ev.kind === 'pop') {
    hud.pop(ev.amount, ev.label, at, stage.camera);
    if (ev.label === 'Something made!') sfx.fanfare();
  }
  if (ev.kind === 'naughty') hud.naughty(ev.words);
  if (ev.kind === 'bonked') hud.bonked();
  if (ev.kind === 'wrongAccusation') { hud.toast('Wrong! Off to the Pen with you.', 'bad'); sfx.sad(); }
  if (ev.kind === 'wrongGuess') { hud.toast('Not it. Your guess is spent. Act natural.', 'bad'); sfx.sad(); }
  if (ev.kind === 'knocked') sfx.boing();
  if (ev.kind === 'caught') { hud.toast('Got one! Only you know.', 'good'); sfx.caught(); }
  if (ev.kind === 'toast') hud.toast(ev.text);
};

function self() {
  return net.pub?.players.find((p) => p.id === net.me?.you);
}

function nearBoard(): boolean {
  return dist(predicted.x, predicted.z, BOARD.x, BOARD.z) <= REACH.board;
}

function promptText(): string {
  const pub = net.pub;
  const me = self();
  if (!pub || !me || me.spectator) return '';
  if (me.inPen) return pub.phase === 'playing' || pub.phase === 'lastcall' ? 'E: throw a snowball' : '';
  if (pub.phase === 'playing' && nearBoard()) return 'Q: open the board';
  if (pub.phase === 'lastcall' && nearBoard()) return 'The board is closed';
  if (me.carrying) {
    const st = STATIONS.find((s) => dist(predicted.x, predicted.z, s.x, s.z) <= REACH.station);
    const owner = st ? pub.stations.find((s) => s.id === st.id)?.owner : undefined;
    const mine = pub.stations.some((s) => s.owner === me.id);
    if (st && pub.phase !== 'lobby' && (owner === me.id || (!owner && !mine))) return `E: place the ${itemById.get(me.carrying)!.name.toLowerCase()}`;
    return `E: drop the ${itemById.get(me.carrying)!.name.toLowerCase()}`;
  }
  const near = net.pub?.items.find((it) => it.uid === nearestItem());
  return near ? `E: pick up the ${itemById.get(near.id)!.name.toLowerCase()}` : '';
}

/** The item E would pick up: the closest one in reach (the same rule as the server). */
function nearestItem(): number | null {
  let best: number | null = null;
  let bd = REACH.item;
  for (const it of net.pub?.items ?? []) {
    const s = it.station ? STATIONS.find((st) => st.id === it.station)! : null;
    const d = dist(predicted.x, predicted.z, s ? s.x : it.x, s ? s.z : it.z);
    if (d < bd) [best, bd] = [it.uid, d];
  }
  return best;
}

let lastSent = '';
let last = performance.now();
// Low-effects mode also caps the frame rate, for weak machines and background test clients.
const minFrameMs = params.has('lowfx') ? 50 : 0;
// Test clients that only need state can skip drawing entirely (?norender).
const noRender = params.has('norender');
function frame(now: number) {
  if (now - last < minFrameMs) return void requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const pub = net.pub;
  const me = self();
  input.blocked = panels.boardOpen || !!document.querySelector('#modal:not(.hidden)');
  const key = `${input.dx},${input.dz}`;
  if (key !== lastSent) {
    net.send({ t: 'input', dx: input.dx, dz: input.dz });
    lastSent = key;
  }
  if (pub && me) {
    // Predict our own walk; ease back toward the server so we never drift far from the truth.
    if (!havePrediction) [predicted.x, predicted.z, havePrediction] = [me.x, me.z, true];
    const len = Math.hypot(input.dx, input.dz) || 1;
    if (!me.inPen && !me.spectator) {
      predicted.x += (input.dx / len) * PLAYER_SPEED * dt;
      predicted.z += (input.dz / len) * PLAYER_SPEED * dt;
    }
    const err = dist(predicted.x, predicted.z, me.x, me.z);
    const pull = err > 2 ? 1 : 1 - Math.exp(-dt * 6);
    predicted.x += (me.x - predicted.x) * pull;
    predicted.z += (me.z - predicted.z) * pull;
    entities.sync(pub, me.id, predicted, dt, now / 1000);
    sounds.update(pub, net.me!, dt);
    entities.highlight(me.carrying || me.inPen || me.spectator ? null : nearestItem());
    followCamera(stage, predicted.x, predicted.z, dt);
    hud.update(pub, net.me!, panels.boardOpen ? '' : promptText());
    panels.render(pub, net.me!);
  }
  hud.connection(net.connected && !!pub);
  if (!noRender) {
    stage.renderer.render(stage.scene, stage.camera);
    stage.labels.render(stage.scene, stage.camera);
  }
  stage.renderer.domElement.dataset.ready = pub ? '1' : '0';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Text state for agents and tests: assert on this, not on pixels.
const w = window as unknown as Record<string, unknown>;
Object.defineProperty(w, '__GAME_STATE__', { get: () => ({ pub: net.pub, me: net.me, connected: net.connected, room }) });
w.render_game_to_text = () => {
  if (!net.pub || !net.me) return JSON.stringify({ error: 'not_ready' });
  const s = self();
  return JSON.stringify({ phase: net.pub.phase, timeLeft: net.pub.timeLeft, you: s?.look.name, role: net.me.role, thing: net.me.thingId, inPen: s?.inPen, carrying: s?.carrying, score: net.me.score, players: net.pub.players.length, prompt: promptText() });
};
if (net instanceof LocalNet) w.__solo_room = net.room;
w.__debug_naughty = (words?: string) => hud.naughty(words);
w.__game_actions__ = { send: (m: Parameters<NetLike['send']>[0]) => net.send(m), teleportHint: () => predicted.toArray() };
