/**
 * Client entry: joins the room in the URL (or makes one), predicts your own dog's movement,
 * draws the field, and exposes text state for tests (window.__GAME_STATE__, render_game_to_text).
 */
import { fieldById, inMud, inWater } from '../shared/field';
import { BREEDS, COLLARS, DEFAULT_COAT } from '../shared/looks';
import type { Look } from '../shared/protocol';
import { DOG, HAZARD } from '../shared/tuning';
import { collide } from '../server/physics';
import { Entities } from './entities';
import { Hud } from './hud';
import { Input, isTouch } from './input';
import { LocalNet } from './local';
import { Online } from './online';
import { Party, SwitchNet } from './party';
import { breedScale, dogMesh } from './models';
import { Net, type NetLike } from './net';
import { audioState, Panels } from './panels';
import { FieldView, followCamera, glLost, glRestored, makeStage } from './scene';
import { sfx } from './sfx';
import { SoundDirector } from './sounds';
import { WeatherView } from './weatherview';
import { Music } from './music';
import { Minimap } from './minimap';
import { IntroTour } from './intro';
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
// The Vercel build plays online rooms through the room relay (the host's tab runs the game); no room in the link means solo.
const online = import.meta.env.VITE_ONLINE === '1' && !solo;
if (!room && !online) {
  room = Array.from({ length: 4 }, () => 'BCDFGHJKLMNPQRSTVWXZ'[Math.floor(Math.random() * 20)]).join('');
  params.set('room', room);
  try { history.replaceState(null, '', `?${params}`); } catch { /* sandboxed frame */ }
}
// A token per tab-session lets a reload rejoin your seat; ?as= gives tests distinct players.
const tokenKey = `tac-token-${online ? 'online' : room}-${params.get('as') ?? ''}`;
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
const stage = makeStage(document.getElementById('game')!, lowfx, isTouch);
const fieldView = new FieldView(stage, lowfx);
const entities = new Entities(stage);
const weather = new WeatherView(stage, lowfx);
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement);
const tour = new IntroTour(stage);
const hud = new Hud();
const input = new Input();
const local = solo || online ? new LocalNet(() => look) : null;
const net = new SwitchNet(local ?? new Net(room, token, () => look));
// The shareable page: friends who have it open can join each other's games over the viewer's live room.
const party = solo && local ? new Party(local, net, () => look, token) : online && local ? new Online(room, token, local, net, () => look) : null;
const panels = new Panels((m) => net.send(m), look, (l) => { look = l; store.set('tac-dog', JSON.stringify(l)); }, room, solo, party);
if (party) {
  party.onChange = () => panels.refresh();
  void party.start();
}
// Joining or leaving a friend's game: start your dog afresh from the new room's snapshot.
net.onSwap = () => {
  havePrediction = false;
  lastSent = '';
  panels.refresh();
};
const sounds = new SoundDirector();
const music = new Music();

if (!isTouch) document.getElementById('controls')!.hidden = false;
const muteBtn = document.getElementById('mute')!;
const showAudio = (btn: HTMLElement, on: boolean, name: string) => {
  btn.classList.toggle('is-off', !on);
  btn.querySelector('.lbl')!.textContent = `${name} ${on ? 'on' : 'off'}`;
  btn.setAttribute('aria-pressed', String(on));
  btn.title = `${name} ${on ? 'on' : 'off'}${name === 'Sound' ? ' (M)' : ''}`;
  // The menu's buttons show the same.
  for (const el of document.querySelectorAll<HTMLElement>(`[data-act="toggle"][data-v="${name.toLowerCase()}"]`)) el.classList.toggle('on', on), (el.textContent = `${name}: ${on ? 'on' : 'off'}`);
};
const showMute = () => showAudio(muteBtn, !sfx.muted, 'Sound');
showMute();
input.onMute = () => {
  sfx.toggleMute();
  showMute();
};
muteBtn.addEventListener('click', () => input.onMute());
// Browsers only allow sound after the player interacts (iPhones: when a tap ends, so listen to
// those too; the touch controls cancel the touch's click, so touchend is the one that counts).
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, () => (sfx.unlock(), music.start()), { capture: true, passive: true });
const musicBtn = document.getElementById('music')!;
const showMusic = () => showAudio(musicBtn, music.on, 'Music');
audioState.sound = () => !sfx.muted;
audioState.music = () => music.on;
showMusic();
musicBtn.addEventListener('click', () => {
  music.setOn(!music.on);
  showMusic();
});
// The menu's sound and music buttons.
document.addEventListener('toggle-audio', (e) => {
  if ((e as CustomEvent).detail === 'music') musicBtn.click();
  else input.onMute();
});

input.onBark = () => net.send({ t: 'bark' });
input.onEscape = () => (panels.menuOpen = !panels.menuOpen);
document.getElementById('menu-btn')!.addEventListener('click', () => (panels.menuOpen = !panels.menuOpen));

net.onEvent = (ev) => {
  if (ev.kind === 'naughty') {
    hud.naughty(ev.words);
    music.duck(4);
  }
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
let sent = 0;
const sendInput = () => {
  const key = `${input.dx},${input.dz},${input.sprint},${input.crouch}`;
  if (key === lastSent) return;
  net.send({ t: 'input', dx: input.dx, dz: input.dz, sprint: input.sprint, crouch: input.crouch });
  lastSent = key;
  sent++;
};
input.onChange = sendInput;
// ?diag: a one-line readout of what the controls and the room are doing (it found the iPhone
// negative-touch-id bug). Tap it to hide.
const diag = document.getElementById('diag')!;
diag.hidden = !params.has('diag');
diag.addEventListener('click', () => (diag.hidden = true));
let diagAt = 0;
let frames = 0;
let fps = 0;
let fpsAt = 0;
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
  sendInput();
  if (local && net.inner === local) local.pump();
  if (pub && me && net.me) {
    const field = fieldById(pub.fieldId);
    fieldView.show(field, pub.mode);
    fieldView.update(now / 1000, dt, pub);
    // Predict our own run; ease back toward the server so we never drift far from the truth.
    if (!havePrediction) [predicted.x, predicted.z, predicted.rot, havePrediction] = [me.x, me.z, me.rot, true];
    const len = Math.hypot(input.dx, input.dz);
    const canMove = !me.spectator && !me.frozen && (pub.phase === 'playing' || pub.phase === 'lobby');
    if (canMove && len > 0.1) {
      const ground = inMud(field, predicted.x, predicted.z) ? HAZARD.mudSlow : inWater(field, predicted.x, predicted.z) ? HAZARD.wadeSlow : 1;
      const speed = (input.crouch ? DOG.crouch : input.sprint && net.me.stamina > 1 ? DOG.sprint : DOG.walk) * ground;
      const k = Math.min(1, len);
      const from = { x: predicted.x, z: predicted.z };
      predicted.x += (input.dx / len) * speed * k * dt;
      predicted.z += (input.dz / len) * speed * k * dt;
      [predicted.x, predicted.z] = collide(field, predicted.x, predicted.z, DOG.radius, { from, gateShut: pub.mode === 'versus' && pub.phase !== 'lobby', water: false });
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
    // A new field opens with a tour: the pen, the sheep, then your dog.
    const touring = tour.focus(pub, field, predicted, now);
    const focus = touring ?? (me.spectator ? centroid(pub.sheep) ?? predicted : predicted);
    // While you dress your dog (the lobby panel open) the camera comes in close on it.
    const dressing = pub.phase === 'lobby' && !panels.collapsed;
    const close = pub.phase === 'lobby' && (dressing || idleFor > 1.2);
    if (!noLoop) followCamera(stage, focus.x, focus.z, dt, close, !!touring, dressing && !touring ? breedScale(look.breed) : 0);
    frameBesidePanel(dressing, dt);
    weather.update(pub, focus, dt);
    music.setRain(pub.phase !== 'lobby' && pub.weather.kind !== 'clear');
    minimap.draw(pub, field, me.id, now);
    hud.update(pub, net.me);
    input.setBarkReady(net.me.barkReady);
    if (party) watchPack(pub, net.me.you);
    panels.render(pub, net.me);
  }
  hud.connection(net.connected && !!pub);
  if (!noRender) {
    stage.renderer.render(stage.scene, stage.camera);
    stage.labels.render(stage.scene, stage.camera);
  }
  stage.renderer.domElement.dataset.ready = pub ? '1' : '0';
  frames++;
  if (now - fpsAt > 1000) [fps, frames, fpsAt] = [frames, 0, now];
  if (!diag.hidden && now - diagAt > 250 && pub && me) {
    diagAt = now;
    const srv = local && net.inner === local ? [...local.room.dogs.values()].find((d) => d.id === me.id) : null;
    diag.textContent = `${input.debug()} | sent ${sent} | room dx ${srv ? `${srv.dx.toFixed(2)},${srv.dz.toFixed(2)}` : '?'} | dog ${me.x.toFixed(1)},${me.z.toFixed(1)} ${me.frozen ? 'frozen' : me.down ? 'down' : me.posture}${me.spectator ? ' SPECTATOR' : ''} | me ${predicted.x.toFixed(1)},${predicted.z.toFixed(1)} | ${pub.phase} | ${fps} fps${local ? ` | ticks ${local.ticks}` : ''}${party ? ` | net ${party.state} ${party.key()}` : ''} | gl ${stage.renderer.getContext().isContextLost() ? 'LOST' : 'ok'} lost ${glLost}/${glRestored} draws ${stage.renderer.info.render.calls} | sheep0 ${pub.sheep[0] ? pub.sheep[0].x.toFixed(1) : '-'}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/**
 * Keep your dog in the middle of the part of the screen the lobby panel doesn't cover (left of it
 * on a laptop, above it on a phone held upright), by sliding the camera's view window.
 */
const viewShift = { x: 0, y: 0 };
function frameBesidePanel(on: boolean, dt: number): void {
  const w = stage.renderer.domElement.clientWidth;
  const h = stage.renderer.domElement.clientHeight;
  let [tx, ty] = [0, 0];
  const r = on ? document.getElementById('lobby')?.getBoundingClientRect() : null;
  if (r && r.width > 0) {
    if (r.left > w * 0.3) tx = w / 2 - r.left / 2;
    else if (r.top > h * 0.25) ty = h / 2 - (r.top + 90) / 2;
  }
  const k = 1 - Math.exp(-dt * 6);
  viewShift.x += (tx - viewShift.x) * k;
  viewShift.y += (ty - viewShift.y) * k;
  if (Math.abs(viewShift.x) < 0.5 && Math.abs(viewShift.y) < 0.5 && !on) {
    if (stage.camera.view?.enabled) stage.camera.clearViewOffset();
    return;
  }
  stage.camera.setViewOffset(w, h, viewShift.x, viewShift.y, w, h);
}

/** Friends coming and going: a pop-up and a whistle, so you notice someone joined your pack. */
let packIds: Map<string, string> | null = null;
let packRoom: unknown = null;
function watchPack(pub: NonNullable<typeof net.pub>, you: string): void {
  const now = new Map(pub.dogs.filter((d) => !d.bot && d.connected).map((d) => [d.id, d.look.name]));
  // A new room (joined someone, or went back to your own) starts a fresh list.
  if (packRoom !== net.inner) [packIds, packRoom] = [null, net.inner];
  if (packIds) {
    for (const [id, name] of now) if (!packIds.has(id) && id !== you) (hud.toast(`${name} joined your pack!`), sfx.whistle());
    for (const [id, name] of packIds) if (!now.has(id) && id !== you) hud.toast(`${name} left`);
  }
  packIds = now;
}

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
    penned: `${pub.sheep.filter((q) => q.penned).length}/${pub.sheep.length}`, goats: pub.goats.map((g) => `${g.mood} annoy=${g.annoy}`), wind: `${pub.wind.s}`, lost: pub.sheep.filter((q) => q.lost).length,
    dogs: pub.dogs.length, scores: pub.fieldScores.map((f) => f.map((q) => q.score)),
  });
};
if (local) {
  w.__solo_room = local.room;
  w.__pause = (on = true) => (local.paused = on);
  w.__party = party;
}
w.__debug_naughty = (words?: string) => hud.naughty(words);
w.__music = music;
w.__stage = stage;
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
    rig.tail.rotation.x = 0.6;
    stage.scene.add(rig.root);
    ((w.__lineupRigs ??= []) as unknown[]).push(rig);
  });
  document.getElementById('lobby')!.hidden = true;
  stage.camera.position.set(0, 4.2, 40.5);
  stage.camera.lookAt(0, 0.3, 30);
  stage.renderer.render(stage.scene, stage.camera);
};
let noLoop = false;
