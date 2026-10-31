# Threes a crowd

A browser party game for 3 to 12 friends. Everyone gets the same secret thing to make in a
cozy, slightly wrong village, except the :( player, who has to fake it until they work out what
the thing is. Accuse wrong and you go to the Pen. The goat is watching.

## Play it locally

Needs Node 22 or newer.

```
npm install
npm run dev
```

Open http://localhost:8787. You get a room code in the URL; send that link to someone on your
network (use your machine's IP instead of localhost) or open a second browser window to play
against yourself. Tick "Fill empty seats with bots" to play with fewer than 3 people.

Controls: WASD or arrows to move, E or Space to pick up and put down, Q at the board, Esc to close.

## Tests

```
npm test          # rules, under a second
npm run probe     # real browsers, a full round with bots, screenshots in shots/
```

The probe needs Playwright's Chromium once: `npx playwright install chromium`.

## Deploy (Cloudflare)

```
npx wrangler login
npm run deploy
```

One Worker serves the client and one Durable Object per room. See `docs/RESEARCH.md` for costs.

## Where things are

- `src/shared/` rules everyone agrees on: catalog (items and things), map, judge, protocol
- `src/server/` the authoritative room (`game.ts`) and its adapters (`node-dev.ts`, `worker.ts`)
- `src/client/` Three.js scene, HUD and panels
- `docs/` design, decisions, research, slice specs
