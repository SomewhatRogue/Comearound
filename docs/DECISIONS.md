# DECISIONS

Newest first. Each entry says what was decided and why, signed with the model.

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
