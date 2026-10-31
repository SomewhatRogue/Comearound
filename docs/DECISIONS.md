# DECISIONS

Newest first. Each entry says what was decided and why, signed with the model.

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
