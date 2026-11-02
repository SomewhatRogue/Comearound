/**
 * The hub's buttons and sheets. Between games everyone runs free in the meadow; three buttons
 * along the top open a sheet each:
 * - My dog: name, breed, coat, build, bark, eyes, collar (the camera comes in close).
 * - Friends: solo or with friends, the room code and invite, joining a friend, who's here.
 * - Play: Trials (pick a course) and Versus, each its own section; the host starts.
 */
import { COURSES, VERSUS_POOL, type CourseId } from '../shared/field';
import { BREEDS, BREED_NAMES, BUILDS, COLLARS, EYES, VOICES, coatsFor } from '../shared/looks';
import { botSeats, type Look, type Mode, type PrivateView, type PublicView } from '../shared/protocol';

export type Sheet = 'dog' | 'friends' | 'play';
export type PlayTab = 'trials' | 'versus';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The three buttons along the top of the hub. */
export function hubBar(look: Look, open: Sheet | null, friendsNote: string): string {
  const b = (v: Sheet, icon: string, name: string, note = '') => `<button class="hub-btn ${open === v ? 'on' : ''}" data-act="sheet" data-v="${v}"><span class="ico" aria-hidden="true">${icon}</span>${name}${note ? `<small>${note}</small>` : ''}</button>`;
  return b('dog', '&#128062;', look.breed === 'chicken' ? 'My chicken' : 'My dog') + b('friends', '&#128101;', 'Friends', friendsNote) + b('play', '&#9654;', 'Play');
}

const head = (title: string) => `<div class="sheet-head"><h2>${title}</h2><button class="x" data-act="sheet" data-v="" aria-label="Close">&times;</button></div>`;

export function dogSheet(look: Look): string {
  const chicken = look.breed === 'chicken';
  const breeds = BREEDS.map((b) => `<button class="chip ${b === look.breed ? 'on' : ''}" data-act="breed" data-v="${b}">${BREED_NAMES[b]}</button>`).join('');
  const coats = coatsFor(look.breed).map((c) => `<button class="swatch coat ${c.id === look.coat ? 'on' : ''}" style="--a:${c.main};--b:${c.accent};--c:${c.mask}" data-act="coat" data-v="${c.id}" title="${c.name}" aria-label="${c.name}"></button>`).join('');
  const eyes = EYES.map((e) => `<button class="chip eye-chip ${e.id === look.eyes ? 'on' : ''}" data-act="eyes" data-v="${e.id}"><i style="background:${e.color}"></i>${e.name}</button>`).join('');
  const builds = BUILDS.map((b) => `<button class="chip ${b.v === (look.build ?? 0) ? 'on' : ''}" data-act="build" data-v="${b.v}">${b.name}</button>`).join('');
  const auto = look.voice === undefined || look.voice === null;
  const voices = [`<button class="chip ${auto ? 'on' : ''}" data-act="voice" data-v="auto" title="Pitched to the breed and build">Auto</button>`, ...VOICES.map((o) => `<button class="chip ${!auto && o.v === look.voice ? 'on' : ''}" data-act="voice" data-v="${o.v}">${o.name}</button>`)].join('');
  const collars = COLLARS.map((c) => `<button class="swatch ${c === look.collar ? 'on' : ''}" style="background:${c}" data-act="collar" data-v="${c}" aria-label="collar ${c}"></button>`).join('');
  return `${head(chicken ? 'My chicken' : 'My dog')}
    <label>Name<input id="name-input" maxlength="14" value="${esc(look.name)}"></label>
    <div class="label">Breed</div><div class="row wrap">${breeds}</div>
    <div class="label">Coat</div><div class="swatches">${coats}</div>
    <div class="label">Build</div><div class="row wrap">${builds}</div>
    <div class="label">${chicken ? 'Bawk' : 'Bark'}</div><div class="row wrap">${voices}</div>
    <div class="label">Eyes</div><div class="row wrap">${eyes}</div>
    <div class="label">Collar</div><div class="swatches">${collars}</div>
    <button class="big" data-act="sheet" data-v="">Done</button>`;
}

/** Who's here: everyone in the room (not the bots). */
function packList(pub: PublicView, me: PrivateView): string {
  const humans = pub.dogs.filter((d) => !d.bot);
  const li = humans.map((d) => `<li><i style="background:${esc(d.look.collar)}"></i>${esc(d.look.name)} <span class="quiet">${BREED_NAMES[d.look.breed]}</span>${d.id === me.you ? ' <span class="quiet">(you)</span>' : ''}${d.id === pub.hostId ? ' <em>host</em>' : ''}${d.connected ? '' : ' <span class="quiet">(away)</span>'}</li>`).join('');
  return `<div class="label">Here now (${humans.length})</div><ul class="who">${li}</ul>`;
}

/** `rooms`: the online layer's own part (solo or with friends, code, invite, join), if there is one. */
export function friendsSheet(pub: PublicView, me: PrivateView, rooms: string | null, roomCode: string): string {
  // The online layer lists who's here itself once you're in a room.
  const own = rooms ?? `<p class="quiet">Room <b>${esc(roomCode)}</b> <button class="link" data-act="copy">copy invite link</button></p>`;
  return `${head('Friends')}${own}${rooms && rooms.includes('class="who"') ? '' : packList(pub, me)}`;
}

export interface PlayState { tab: PlayTab; course: CourseId; bots: boolean; showBots: boolean; bests: Record<CourseId, number> }

/**
 * The host's choice of bot dogs, said plainly: on (and how many will join, for who's here now) or
 * off (just the people). Shown before every start, so nobody's surprised by a stranger dog.
 */
export function botsPick(pub: PublicView, mode: Mode, on: boolean): string {
  const humans = pub.dogs.filter((d) => !d.bot && d.connected).length;
  const n = botSeats(mode, humans);
  const people = humans === 1 ? 'just you' : `just the ${humans} of you`;
  const note = !n ? `No bot dogs needed: there are ${humans} of you.` : on ? `${n} bot dog${n > 1 ? 's' : ''} will join ${humans === 1 ? 'you' : `the ${humans} of you`}${mode === 'versus' ? ' to even up the teams' : ''}.` : `No bot dogs: ${people}.`;
  return `<div class="bots-pick"><div class="label">Bot dogs</div><div class="seg"><button class="${on ? 'on' : ''}" data-act="bots" data-v="on">Fill in</button><button class="${on ? '' : 'on'}" data-act="bots" data-v="off">Off</button></div><p class="quiet">${note}</p></div>`;
}

export function playSheet(pub: PublicView, me: PrivateView, s: PlayState): string {
  const host = pub.hostId === me.you;
  const tabs = `<div class="seg"><button class="${s.tab === 'trials' ? 'on' : ''}" data-act="tab" data-v="trials">Trials</button><button class="${s.tab === 'versus' ? 'on' : ''}" data-act="tab" data-v="versus">Versus</button></div>`;
  const hostName = pub.dogs.find((d) => d.id === pub.hostId)?.look.name ?? 'The host';
  const bots = host && s.showBots ? botsPick(pub, s.tab, s.bots) : '';
  let body = '';
  if (s.tab === 'trials') {
    const courses = (Object.keys(COURSES) as CourseId[]).map((id) => {
      const c = COURSES[id];
      const best = s.bests[id] ? `<em>best ${s.bests[id]}</em>` : '';
      return `<button class="mode ${id === s.course ? 'on' : ''}" data-act="course" data-v="${id}" ${host ? '' : 'disabled'}><b>${c.name} ${best}</b><span>${c.blurb}</span><span class="fields">${c.fields.map((f) => esc(f.name)).join(' &middot; ')}</span></button>`;
    }).join('');
    body = `<p class="quiet">Work together: pen the flock on each field. Calm herding scores as well as speed.</p><div class="modes">${courses}</div>${host ? `<div class="sheet-foot">${bots}<button class="big" data-act="start" data-v="trials">Start ${esc(COURSES[s.course].name)}</button></div>` : ''}`;
  } else {
    body = `<p>Two teams, two pens. Your sheep wear your colour: pen yours, or go and stir up theirs.</p>
      <p class="quiet">A match is three fields, drawn from: ${VERSUS_POOL.map((f) => esc(f.name)).join(', ')}. Teams are picked for you, evenly.</p>${host ? `<div class="sheet-foot">${bots}<button class="big" data-act="start" data-v="versus">Start the match</button></div>` : ''}`;
  }
  const wait = host ? '' : `<p class="wait">${esc(hostName)} starts the game. Have a go at the agility course while you wait!</p>`;
  const how = `<details class="how"><summary>How to herd</summary><ul class="how-mini">
      <li>Sheep move away from you. Get <b>behind</b> them, on the far side from the pen.</li>
      <li><b>Crouch</b> and face them to give them <b>the eye</b>: they ease away calmly.</li>
      <li>Hold still while crouched to <b>lie down</b> and settle them.</li>
      <li><b>Bark</b> sends them running, but the goat hates it.</li>
    </ul></details>`;
  const at = body.indexOf('<div class="sheet-foot">');
  return at < 0 ? `${head('Play')}${tabs}${wait}${body}${how}` : `${head('Play')}${tabs}${wait}${body.slice(0, at)}${how}${body.slice(at)}`;
}
