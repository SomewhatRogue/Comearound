/**
 * Client entry: joins the room in the URL (or makes one), predicts your own dog's movement,
 * draws the field, and exposes text state for tests (window.__GAME_STATE__, render_game_to_text).
 */
import { fieldById } from '../shared/field';
import { BREEDS, COLLARS, DEFAULT_COAT } from '../shared/looks';
import type { Look } from '../shared/protocol';
import { DOG } from '../shared/tuning';
import { collide } from '../server/physics';
import { Entities } from './entities';
import { Hud } from './hud';
import { Input, isTouch } from './input';
import { LocalNet } from './local';
import { dogMesh } from './models';
import { Net, type NetLike } from './net';
import { Panels } from './panels';
import { FieldView, followCamera, makeStage } from './scene';
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
// Solo: the whole room runs in this tab with bot dogs. The shareable solo build sets VITE_SOLO.
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

const NAMES = ['Bramble', 'Nell', 'Moss', 'Pip', 'Fern', 'Tam', 'Juno', 'Skye', 'Bess', 'Rook'];
let look: Look = (() => {
  try {
    const l = JSON.parse(store.get('tac-dog') ?? '');
    return (BREEDS as readonly string[]).includes(l?.breed) ? l : null;
  } catch {
    return null;
  }
})() ?? { name: NAMES[Math.floor(Math.random() * NAMES.length)], breed: 'collie', coat: DEFAULT_COAT.collie, collar: COLLARS[Math.floor(Math.random() * COLLARS.length)], eyes: 'blue' };
if (params.get('name')) look = { ...look, name: params.get('name')!.slice(0, 14) };
if (params.get('breed') && (BREEDS as readonly string[]).includes(params.get('breed')!)) look = { ...look, breed: params.get('breed') as Look['breed'], coat: DEFAULT_COAT[params.get('breed') as Look['breed']] };

const lowfx = params.has('lowfx');
const stage = makeStage(document.getElementById('game')!, lowfx);
const fieldView = new FieldView(stage, lowfx);
const entities = new Entities(stage);
const hud = new Hud();
const input = new Input();
const net: NetLike = solo ? new LocalNet(() => look) : new Net(room, token, () => look);
const panels = new Panels((m) => net.send(m), look, (l) => { look = l; store.set('tac-dog', JSON.stringify(l)); }, room, solo);
const sounds = new SoundDirector();

if (!isTouch) document.getElementById('controls')!.hidden = false;
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

input.onBark = () => net.send({ t: 'bark' });
input.onEscape = () => (panels.menuOpen = !panels.menuOpen);
document.getElementById('menu-btn')!.addEventListener('click', () => (panels.menuOpen = !panels.menuOpen));

net.onEvent = (ev) => {
  if (ev.kind === 'naughty') hud.naughty(ev.words);
  if (ev.kind === 'toast') hud.toast(ev.text);
  if (ev.kind === 'pop') hud.pop(ev.amount, ev.label, entities.pos.get(net.me?.you ?? ''), stage.camera);
};
entities.onBark = (d, at) => {
  sounds.woof(d, Math.hypot(at.x - predicted.x, at.z - predicted.z));
  hud.floatText('WOOF!', at, stage.camera, 'woof');
};
entities.onBleat = (at) => sounds.bleat(Math.hypot(at.x - predicted.x, at.z - predicted.z));

const predicted = { x: 0, z: 0, rot: 0 };
let havePrediction = false;
let idleFor = 0;
let lastSent = '';
let last = performance.now();
// Low-effects mode also caps the frame rate, for weak machines and background test clients.
const minFrameMs = lowfx ? 50 : 0;
// Test clients that only need state can skip drawing entirely (?norender).
const noRender = params.has('norender');

function self() {
  return net.pub?.dogs.find((d) => d.id === net.me?.you);
}

function frame(now: number) {
  if (now - last < minFrameMs) return void requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const pub = net.pub;
  const me = self();
  input.blocked = !!document.querySelector('#modal:not(.hidden):not(.glance)') || document.activeElement?.tagName === 'INPUT';
  const key = `${input.dx},${input.dz},${input.sprint},${input.crouch}`;
  if (key !== lastSent) {
    net.send({ t: 'input', dx: input.dx, dz: input.dz, sprint: input.sprint, crouch: input.crouch });
    lastSent = key;
  }
  if (pub && me && net.me) {
    const field = fieldById(pub.fieldId);
    fieldView.show(field, pub.mode);
    // Predict our own run; ease back toward the server so we never drift far from the truth.
    if (!havePrediction) [predicted.x, predicted.z, predicted.rot, havePrediction] = [me.x, me.z, me.rot, true];
    const len = Math.hypot(input.dx, input.dz);
    const canMove = !me.spectator && !me.frozen && (pub.phase === 'playing' || pub.phase === 'lobby');
    if (canMove && len > 0.1) {
      const speed = input.crouch ? DOG.crouch : input.sprint && net.me.stamina > 1 ? DOG.sprint : DOG.walk;
      const k = Math.min(1, len);
      const from = { x: predicted.x, z: predicted.z };
      predicted.x += (input.dx / len) * speed * k * dt;
      predicted.z += (input.dz / len) * speed * k * dt;
      [predicted.x, predicted.z] = collide(field, predicted.x, predicted.z, DOG.radius, { from, gateShut: true });
      predicted.rot = Math.atan2(input.dx, input.dz);
      idleFor = 0;
    } else idleFor += dt;
    const err = Math.hypot(predicted.x - me.x, predicted.z - me.z);
    const pull = err > 2.5 || !canMove ? 1 - Math.exp(-dt * 10) : 1 - Math.exp(-dt * 4);
    predicted.x += (me.x - predicted.x) * pull;
    predicted.z += (me.z - predicted.z) * pull;
    // Not steering: face the way the server says (your last move, or the autopilot's).
    if (!canMove || len <= 0.1) predicted.rot = me.rot;
    entities.sync(pub, me.id, me.spectator ? null : predicted, dt, now / 1000);
    sounds.update(pub, net.me, dt, now);
    // Spectators watch the flock; everyone else follows their dog. Standing still in the lobby
    // brings the camera in close, to admire your dog.
    const focus = me.spectator ? centroid(pub.sheep) ?? predicted : predicted;
    const close = pub.phase === 'lobby' && idleFor > 1.2;
    // In the lobby the panel sits on the right, so look a little right of your dog.
    const shift = pub.phase === 'lobby' && stage.camera.aspect > 1.2 ? (close ? 2.2 : 6) : 0;
    if (!noLoop) followCamera(stage, focus.x + shift, focus.z, dt, close);
    hud.update(pub, net.me);
    input.setBarkReady(net.me.barkReady);
    panels.render(pub, net.me);
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

function centroid(s: { x: number; z: number }[]): { x: number; z: number } | null {
  if (!s.length) return null;
  return { x: s.reduce((a, o) => a + o.x, 0) / s.length, z: s.reduce((a, o) => a + o.z, 0) / s.length };
}

// Text state for agents and tests: assert on this, not on pixels.
const w = window as unknown as Record<string, unknown>;
Object.defineProperty(w, '__GAME_STATE__', { get: () => ({ pub: net.pub, me: net.me, connected: net.connected, room }) });
w.render_game_to_text = () => {
  const pub = net.pub;
  if (!pub || !net.me) return JSON.stringify({ error: 'not_ready' });
  const s = self();
  return JSON.stringify({
    phase: pub.phase, mode: pub.mode, field: `${pub.fieldIdx + 1}/${pub.fieldCount} ${pub.fieldId}`, timeLeft: pub.timeLeft,
    you: s?.look.name, breed: s?.look.breed, team: s?.team, posture: s?.frozen ? 'frozen' : s?.down ? 'down' : s?.posture, stamina: net.me.stamina, barkReady: net.me.barkReady,
    penned: `${pub.sheep.filter((q) => q.penned).length}/${pub.sheep.length}`, goat: pub.goat ? `${pub.goat.mood} annoy=${pub.goat.annoy}` : null,
    dogs: pub.dogs.length, scores: pub.fieldScores.map((f) => f.map((q) => q.score)),
  });
};
if (net instanceof LocalNet) {
  w.__solo_room = net.room;
  w.__pause = (on = true) => ((net as LocalNet).paused = on);
}
w.__debug_naughty = (words?: string) => hud.naughty(words);
w.__game_actions__ = { send: (m: Parameters<NetLike['send']>[0]) => net.send(m), predicted: () => ({ ...predicted }) };

/** Art review: every breed in a row, in a pose, with the camera close. `__lineup('crouch')`. */
w.__lineup = (pose = 'walk') => {
  noLoop = true;
  BREEDS.forEach((b, i) => {
    const rig = dogMesh({ name: b, breed: b, coat: DEFAULT_COAT[b], collar: '#e4572e', eyes: b === 'collie' ? 'blue' : 'brown' });
    rig.root.position.set(-5.6 + i * 1.6, 0, 30);
    rig.root.rotation.y = 0.5;
    if (pose === 'crouch') { rig.rig.position.y *= 0.6; rig.front.rotation.x = 0.2; rig.head.rotation.x = 0.38; rig.legs.forEach((l) => (l.scale.y = 0.6)); }
    if (pose === 'down') { rig.rig.position.y *= 0.3; rig.front.rotation.x = -0.12; rig.head.rotation.x = -0.25; rig.legs.forEach((l, j) => ((l.rotation.x = j < 2 ? -1.45 : -1.1), (l.scale.y = 0.55))); }
    stage.scene.add(rig.root);
  });
  document.getElementById('lobby')!.hidden = true;
  stage.camera.position.set(0, 4.2, 40.5);
  stage.camera.lookAt(0, 0.3, 30);
  stage.renderer.render(stage.scene, stage.camera);
};
let noLoop = false;
