# Threes a crowd: agent instructions

Browser multiplayer party game. Three.js client, TypeScript server rooms, Cloudflare Workers +
Durable Objects (PartyServer) in production, a Node server for local dev and tests.
Design: `docs/DESIGN.md`. Research behind the stack: `docs/RESEARCH.md`.

This project is separate from Kyle's Unity games (The Old Gods, the drone game). Never touch those.

## The cycle

```
1. SYNC    read PLAN.md + docs/DECISIONS.md
2. SPEC    write/confirm docs/features/<slice>.md (EARS: When / If-then / While / shall)
3. BUILD   one vertical slice, playable end to end, however ugly
4. VERIFY  npm test (seconds) and npm run probe (real browsers), then LOOK at shots/
5. RECORD  update PLAN.md + docs/DECISIONS.md, signed with the model name
```

## The loop is seconds. Keep it that way.

- `npm test`: pure rules in Node, under a second. Run it after every change.
- `npm run probe`: one blocking call, one JSON report. Boots the server with a fast clock
  (`TIMESCALE`), opens real browsers (host renders; others use `&lowfx&norender`), plays a round
  with bots, reloads a player mid-round, screenshots each phase to `shots/`. Open the screenshots.
- Poll for state (`window.__GAME_STATE__`, `render_game_to_text()`); never sleep on a guess.
- `GameRoom.report()` is the one-line server summary; `/__report?room=` serves it in dev.

## Hard rules

- **The server decides everything; secrets never reach a client that should not have them.**
  The ask, roles, scores before the reveal, why someone is in the Pen and whether an accusation
  was right stay on the server (`src/server/view.ts`). `tests/rules.test.ts` reads a :( player's
  messages and fails if an ask appears, with a positive control on a knower so the check can fail.
- **Minigames are judged on the server** from the press time the client reports (ms since the
  lane appeared on its screen), against the lane the server dealt. Lag never decides a hit.
- **Never `Math.random` for outcomes.** Use the room's seeded `Rng`.
- **Join and rejoin are one path.** Every snapshot is full state; a token gets your seat back.
  Seats are held 30 s in the lobby and for the whole round mid-game.
- **Transport-agnostic rooms.** Game logic lives in `GameRoom`; `node-dev.ts` and `worker.ts`
  only adapt sockets. Nothing in `src/server/` except those two files may know about either.
- **Content is data.** Activities and their attributes live in `src/shared/activities.ts`; how
  asks are built and scored lives in `src/shared/tasks.ts`; spots live in `src/shared/map.ts`.
  A new activity is an entry in each, a skin in `src/client/minigame.ts` and a prop in `village.ts`.
- **What is drawn and what is decided share one source.** Map geometry lives in
  `src/shared/map.ts`, read by both the client and the server.
- **Bots only know what a human would.** Knower bots know the ask; :( bots copy what they see
  others catch. They play the minigames with a timing error, so they miss.
- **No external hosts at runtime.** Fonts and assets are bundled (Discord's proxy blocks
  unmapped hosts, and a blocked font once stalled page load for 10 s).
- **No em dashes** anywhere: docs, UI copy, comments (Kyle's standing preference).

## Code conventions

- One job per file; aim for under 200 lines.
- `src/shared/` pure and isomorphic; `src/server/` authoritative; `src/client/` draws and sends intent.
- Tuning numbers sit at the top of the file that owns them (`POINTS`, `REACH`, goat timings).
- The HUD is DOM over the canvas; in-world labels use CSS2DRenderer.
