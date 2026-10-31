# DECISIONS

Newest first. Each entry says what was decided and why, signed with the model.

## 2026-10-30 (night): first phone play, goat mischief, harder, prettier (Claude Opus 5.5)

- **iPhone movement bug:** iOS hands out negative touch identifiers, and the stick treated
  `id >= 0` as "held", so the knob followed your finger while the dog stood still. Found with an
  on-screen readout (`?diag`) from Kyle's screenshot. Ids are now strings; never compare them to 0.
  Also on the way: touch events (non-passive) instead of pointer events for the stick, a window
  blur no longer drops the stick, portrait plays, solo catches up to real time each frame.
- **Kyle: "goat needs work".** It now picks mischief every 7 to 12 s: strolls into the biggest
  loose group and bleats in it ("hehe"), or stands in a pen's gateway so sheep won't pass
  ("NOPE"), or grazes. Penned, it wanders back out ("bye!") unless a dog lies down by the gate, so
  the goat bonus has to be held to the end. Dogs can drive it: the eye best, walking shoves it,
  sprinting at it moves it more but annoys it (Kyle's original "lunge at it, it stares").
- **Kyle: "a little too easy".** Sheep bolt at nothing now and then (not near a dog lying down),
  follow-the-leader at the gate is weaker and shorter range, lonely sheep pull back less, and
  fields are shorter (100 / 120 / 150 s; versus 150). Bots alone now miss sheep on some seeds.
- **Kyle: more beauty.** Patchy grass, wildflower patches per field (meadow daisies and
  buttercups, orchard clover and poppies with windfall apples, hillside heather and bluebells,
  Field Day poppies and bunting), tall grass along fences and round trees, butterflies, rolling
  hills, hedgerows, a red barn and silo, drifting clouds. All instanced (`src/client/scenery.ts`).

## 2026-10-30 (late): pivot to Come Bye!, a sheepdog herding game (Claude Opus 5.5)

Kyle: the minigames were all basically the same thing; scrap it. New idea (his): you're a dog,
herding sheep and one rascally goat into a pen with your friends, co-op or two teams, points for
speed and accuracy, pick your breed, playable on a phone held sideways.

- **No lunge.** Kyle questioned what it adds; the moves are walk, sprint, crouch (stalk), lie
  down (crouch and hold still) and bark. A nip may come later.
- **Bark is the risky shortcut** (Kyle): sheep run faster from it, but it has a 1.6 s cooldown,
  costs calm-herding points, and annoys the goat. Enough barks near it and it walks over, stares
  you down for 4 s and you get the NAUGHTY close-up (kept from the old game; now it lasts exactly
  as long as you're frozen).
- **The eye and the down are real herding behaviour** (Kyle: "spine curved, able to go down into
  the grass or just STARE"). Crouched and facing sheep within a cone moves them calmly; lying down
  calms everything nearby. Both are drawn on the ground (pale cone, green ring) to teach them.
- **The pack's dogs first:** Border Collie (black and white, brilliant blue eyes), Keeshond,
  Malinois, golden Standard Poodle. Then Golden, Corgi, Husky, Pug. Photo upload stays on the list.
- **Dogs can't enter pens** (gates are shut to dogs). Without it, dogs walking in behind sheep
  shoved them out through the back. The pen is for sheep and the goat.
- **Fences use the position before the move** to decide which side you're on, so a hard shove
  can never push a sheep through a fence. Found when bots squeezed sheep out of the meadow pen.
- **Sheep follow the leaders at the gate.** Once one is in, sheep near the gate want in too.
  Real sheep do this, and without it the last two or three sheep were a slog even for bots.
  Lone sheep head back to the flock; frightened sheep bunch tighter.
- **Versus starts both flocks side by side in the middle** with the goat between, so teams have
  to work past each other. First version (flocks by their own pens) ended in 25 seconds.
  A field ends when both teams are in (each keeps its own time bonus) or on time; 3 fields a match.
- **Lobby practice flock.** The lobby is The Meadow with its sheep out, so you learn the moves
  while you pick your dog. On phones the panel folds away ("Practise").
- **Test hooks:** `AUTOPILOT=1` drives human seats with the bot brain (probe), `__pause()` and
  `__lineup()` in solo builds, `scripts/bench.ts` for bot herding across seeds.
- **Working title Come Bye!** (the herding call for "go round clockwise"). Kyle may rename it.

## 2026-10-30 (night): tasks and skill minigames replace building (Claude Opus 5.5)

Kyle, after playing: recipes like boot + hat + flower = frog throne made no sense to anyone, three
tables per area was too few, nothing stopped theft, and the :( guessing to win felt wrong.

- **A round is 3 tasks in sequence**, each one activity. Everyone sees the activity; only knowers
  see the exact ask. The :( player fakes it and gets **x2** on their points if never caught.
  No guessing to win any more.
- **Six skill minigames on one lane engine:** fishing, fruit picking, baking, candle lighting,
  archery (precision decides the ring) and painting (medium, colour and subject, then a steady
  hand). What you catch has attributes; the ask cares about some of them, so a watcher sees a
  small yellow fish but not whether "small" or "yellow" mattered (Kyle's idea).
- **Scored at the reveal** on closeness to the ask (best try per task). In-round points are a
  flat +5 per catch so they never leak the ask.
- **Five spots per activity**; progress is a personal basket (nothing to steal). The goat spooks
  people mid-minigame and eats from baskets, but leaves painters alone while they choose colours.
- **Server-judged timing:** the server deals each lane and judges the client's reported press time.
- **Painting claims the easel on E**, then the stroke starts when you finish choosing. Found when a
  bot took the easel while a player was picking colours.
- Removed: items, tables, the thing catalog, guessing, last call, last chance.
- Next activity idea from Kyle: a tree you water that grows different fruit depending on what you graft.

## 2026-10-30 (evening): first playtest notes from Kyle (Claude Opus 5.5)

- **:( players only guess the thing; they cannot accuse.** Kyle's call after playing. The board
  shows a :( player the guess list only. Server enforces it; tested.
- **The host can end or abandon a round** from the Esc menu (End the round now / Back to the lobby).
- **People did not know what they could do.** Esc opens How to play; the lobby has a 4-line version;
  role cards now say what to do next; the item E would pick up shows its name above it.
- **The goat gets in the way, and stares at the Pen less.** It walks into a player's path and knocks
  a carried item loose, pulls items off tables, and blocks you (you cannot walk through it). Free
  players get a WHAT ARE YOU DOING close-up (every 35 s at most); the Pen stare is every 70 s at most.
  The close-up fades in over ~1.3 s, the goat has ears and horns, and the words sit on a dark band.
- **Pen minigame: snowball fight.** E throws the way you last walked. Bonk another Pen player (+5),
  knock a crow off the fence (+10, it pops back up), hit the goat (it stares at you next).
- **Items are recognisable.** Each item has its own model (stem and leaf on the apple, ribbed pumpkin,
  teacup with handle and saucer, candle with flame...), 25% bigger.
- **Areas are places.** Pond (water, bank, lily pads, cattails, thistle, rocks, dock), cottage kitchen
  (plank floor, walls, stove, counter, rug), garden (rows, cabbages, sunflowers, picket fence), chapel
  (stone floor, chapel with bell tower, candles everywhere, the well), dirt paths, trees and bushes.
  All primitives, instanced; still a placeholder for an art pass.
- **Bots pick up exactly the item they walked to.** With the goat dropping things beside tables, a bot
  grabbing "whatever is nearest" picked up its giveaway part early. The act-natural test now runs on
  five seeds.
- **Solo mode** (`?solo`, and the single-file build behind the shareable link) runs the real room and
  bots in the browser.

## 2026-10-30: slice 1 built (Claude Opus 5.5)

**Stack.** Three.js r187 with the WebGL renderer (WebGPU buys nothing for this look, and most
stylized-post libraries are WebGL only). Rooms in plain TypeScript (`GameRoom`), wrapped by a
Node `ws` server for dev and a PartyServer Durable Object for production. PartyKit's hosted
platform shut down on 2026-10-23, so PartyServer on our own Cloudflare account it is.

**Full snapshots, every tick.** At 3 to 12 players the state is a few KB; sending it whole at
20 Hz means late join, rejoin and reconnect need no catch-up path. Deltas only if size bites.

**Movement is server-authoritative with local prediction** for your own villager, eased back to
the server. Other players ease toward snapshots. No physics engine yet: nothing needs it until
throwing (tomatoes, snowballs), when Rapier comes in.

**Seats are held.** A probe on a loaded machine showed a stalled host tab reconnecting, the
lobby deleting the empty seat, and host passing to someone else. Seats now survive 30 s in the
lobby and the whole round mid-game; host moves only when the host's seat is actually gone.

**Fonts are bundled.** A Google Fonts link stalled page load for ~10 s when the host was
unreachable, and Discord's proxy would block it anyway. `@fontsource/fredoka` instead.

**Bots act natural.** First version: knower bots built the real thing immediately and in plain
sight, so a human :( could read it at a glance. Now they fill the least telling part first and
hold the giveaway part until last call. Enforced by a test.

**Open design question for Kyle: location is a strong tell.** Every knower walks to the same area
to build, so a watcher learns the area for free and the :( bot could guess within a minute of
game time. Options: (a) keep it and lean in (the narrowing step is the area); (b) give each
player a home plot anywhere and drop location from the rules, so only items are clues;
(c) let creations be assembled anywhere and *delivered* to the area at last call.
The :( bot is tuned down (waits until 40% of the round has passed) until this is decided.

**Scoring as built:** +10 for a part of any catalog thing (honest, leaks nothing), +50 for any
finished thing, x3 on station points at the reveal if it was the real thing, +100 for a catch
then a 2/s meter while play continues, +300 for a :( correct guess, +200 for a :( free at the
reveal with a passing creation, +150 and the meter for a jailed :( correct last-chance guess,
+50 to each knower when the village wins.

**Test loop.** `npm test` (12 tests, < 1 s). `npm run probe` (3 browsers, ~85 s on a 2-CPU
container; most of that is software WebGL). Background clients use `&lowfx&norender`.
