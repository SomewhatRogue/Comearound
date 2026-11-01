# Come Bye!: agent instructions

**Come Bye!** (call it Come Bye or comebye; "Threes a crowd" was the project's old working name):
a browser multiplayer party game. You're a sheepdog herding a flock (and one goat) into a pen with
friends, in Co-op Trials or two-team Versus. Live at https://comebye.online (Vercel project
`comearound`, GitHub `SomewhatRogue/Comearound`).
Three.js client, TypeScript game rooms. Deployed on Vercel (`vercel.json`): the host's browser runs
the room; every player connects to `api/room.ts`, a WebSocket relay Function that shares rooms
across instances through Marketplace Redis (Vercel's documented realtime pattern). The PartyServer
worker (Cloudflare) and the Node server (local dev and tests) run rooms server-side. Design: `docs/DESIGN.md`. Research behind the
stack: `docs/RESEARCH.md`. Earlier designs (Act Natural, tasks) are in git (tag `act-natural-final`).

This project is separate from Kyle's Unity games (The Old Gods, the drone game). Never touch those.

## The cycle

```
1. SYNC    read PLAN.md + docs/DECISIONS.md
2. SPEC    write/confirm docs/features/<slice>.md (EARS: When / If-then / While / shall)
3. BUILD   one vertical slice, playable end to end, however ugly
4. VERIFY  npm test (seconds), the bot bench, npm run probe (real browsers), then LOOK at shots/
5. RECORD  update PLAN.md + docs/DECISIONS.md, signed with the model name
```

## The loop is seconds. Keep it that way.

- `npm test`: pure rules in Node, about a second. Run it after every change.
- `node_modules/.bin/tsx scripts/bench.ts 6`: bots alone play all three trials on 6 seeds and
  print sheep penned per field (`8/8@61` = all in with 61 s left). Run it after any change to
  flock, goat, dog or bot behaviour. `scripts/trace.ts <field> <seed>` prints one run as text.
- `node scripts/coop-probe.cjs` (dev server up on 8787): two tabs play together over the stand-in
  live room (`?fakeroom`): join, move, bark, start a run, host leaves.
- `npm run test:online`: online rooms in real browsers, several players each in their own
  profile, the relay as two instances (memory, and real Redis if `redis-server` exists), host
  frozen / dropped / leaving / closed / holding a dead socket / cut at the max duration. Boots its own servers. Run it after any change to
  `src/client/{online,relay}.ts` or `api/`. `tests/relay.test.ts` covers the relay alone.
- `npm run stress:online` (`SEED=`, `SECS=`, `PLAYERS=`): a room of real browsers joining, leaving,
  crashing, reloading and the relay dying at random, with invariants checked throughout. Run it
  before a playtest and after any change to how players join, leave or take over.
- **Read `docs/ONLINE.md` before touching online play**: how it works, every failure seen in live
  playtests and the rule it taught, how to read the Vercel relay logs after a playtest. Redis is on
  Upstash's free plan (500K commands a month): anything that talks to Redis per message needs
  counting first (`docs/REALTIME-REDIS-BUDGET.md`).
- `npm run probe`: one blocking call, one JSON report. Boots the server with a fast clock
  (`TIMESCALE`) and `AUTOPILOT=1` (human seats herd with the bot brain), opens a laptop, a friend
  and a phone held sideways, checks move/crouch/down/bark and the touch stick, plays a full run,
  reloads a player mid-field, screenshots each phase to `shots/`. Open the screenshots.
- Poll for state (`window.__GAME_STATE__`, `render_game_to_text()`); never sleep on a guess.
  Solo builds expose `__solo_room` and `__pause()` for screenshots on slow machines;
  `__lineup('walk'|'crouch'|'down')` shows every breed side by side for art review.
- `GameRoom.report()` is the one-line server summary; `/__report?room=` serves it in dev.
- Use `node_modules/.bin/tsx`, not `npx tsx` (npx startup stalls here). Never `pkill -f` a pattern
  that matches your own shell command line.

## Hard rules

- **The server decides everything.** Clients send intent (stick, sprint, crouch, bark); the room
  moves dogs, sheep and goat and scores fields. Client prediction is cosmetic and eases back.
- **Never `Math.random` for outcomes.** Use the room's seeded `Rng`.
- **Join and rejoin are one path.** Every snapshot is full state; a token gets your seat back.
  Seats are held 30 s in the lobby and for the whole run mid-game. Late joiners watch.
- **Transport-agnostic rooms.** Game logic lives in `GameRoom`; `node-dev.ts` and `worker.ts`
  only adapt sockets. Nothing in `src/server/` except those two files may know about either.
- **What is drawn and what is decided share one source.** Fields (fences, pens with their gate
  gaps, obstacles, flocks, starts) live in `src/shared/field.ts`; the client draws them and the
  server collides against them. Tuning numbers live in `src/shared/tuning.ts`.
- **Fences never leak.** Collision takes the position before the move and keeps you on that side
  of every pen wall. Dogs can walk into pens in the trials (to fetch extras out); in versus, and
  for bot dogs, gates are shut to dogs. Tested.
- **Bots only use what a player could see.** They herd with the same moves a player has.
- **No external hosts at runtime.** Fonts and assets are bundled (Discord's proxy blocks
  unmapped hosts, and a blocked font once stalled page load for 10 s). Online play only talks to
  our own Vercel Function (`/api/room`).
- **CSS2D labels position themselves with `transform`.** Animate them with the individual
  `rotate`/`scale` properties, never `transform`, or they jump to the top-left corner.
- **No em dashes** anywhere: docs, UI copy, comments (Kyle's standing preference).

## Code conventions

- One job per file; aim for under 200 lines.
- `src/shared/` pure and isomorphic; `src/server/` authoritative; `src/client/` draws and sends intent.
- The HUD is DOM over the canvas; in-world labels use CSS2DRenderer.
- Models are our own primitives (`src/client/models.ts`): dogs are a front and back half joined
  mid-spine so postures can curve the back.
