# Threes a crowd: agent instructions

Browser multiplayer party game. The current game is **Come Bye!**: you're a sheepdog herding a
flock (and one goat) into a pen with friends, in Co-op Trials or two-team Versus.
Three.js client, TypeScript server rooms, Cloudflare Workers + Durable Objects (PartyServer) in
production, a Node server for local dev and tests. Design: `docs/DESIGN.md`. Research behind the
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
  of every pen wall; dogs treat gates as shut (the pen is for sheep). Tested.
- **Bots only use what a player could see.** They herd with the same moves a player has.
- **No external hosts at runtime.** Fonts and assets are bundled (Discord's proxy blocks
  unmapped hosts, and a blocked font once stalled page load for 10 s).
- **CSS2D labels position themselves with `transform`.** Animate them with the individual
  `rotate`/`scale` properties, never `transform`, or they jump to the top-left corner.
- **No em dashes** anywhere: docs, UI copy, comments (Kyle's standing preference).

## Code conventions

- One job per file; aim for under 200 lines.
- `src/shared/` pure and isomorphic; `src/server/` authoritative; `src/client/` draws and sends intent.
- The HUD is DOM over the canvas; in-world labels use CSS2DRenderer.
- Models are our own primitives (`src/client/models.ts`): dogs are a front and back half joined
  mid-spine so postures can curve the back.
