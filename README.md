# Threes a crowd: Come Bye!

A browser party game for friends. You're a sheepdog. Herd the flock into the pen together
(Co-op Trials) or in two teams (Versus), with crouching, staring, lying down and very careful
barking, because the goat hates barking and will come over and stare you down. Plays on a laptop
or a phone held sideways.

## Play it locally

Needs Node 22 or newer.

```
npm install
npm run dev
```

Open http://localhost:8787. You get a room code in the URL; send that link to someone on your
network (use your machine's IP instead of localhost) or open a second window. Leave "Fill empty
spots with bot dogs" on to play with fewer people. `?solo` runs everything in your browser.

Controls: WASD or arrows, Shift sprint, Space crouch (hold still to lie down), E bark, M sound,
Esc menu. On a phone: drag on the left to steer, BARK / DOWN / SPRINT on the right.

## Tests

```
npm test                                   # rules, about a second
node_modules/.bin/tsx scripts/bench.ts 6   # bots alone herd every field on 6 seeds
npm run probe                              # real browsers incl. a phone, a full run, shots/
```

The probe uses a global Playwright (`PLAYWRIGHT_PATH=$(npm root -g)/playwright`) or a local one
(`npx playwright install chromium`).

## Solo build (one HTML file)

```
npx vite build -c vite.solo.config.ts      # dist-solo/index.html
```

## Deploy (Cloudflare)

```
npx wrangler login
npm run deploy
```

One Worker serves the client and one Durable Object per room. See `docs/RESEARCH.md` for costs.

## Where things are

- `src/shared/` what everyone agrees on: fields, tuning, looks, protocol
- `src/server/` the authoritative room (`game.ts`): flock, goat, dogs, bots, round, view; adapters `node-dev.ts`, `worker.ts`
- `src/client/` Three.js scene, models, HUD, panels, touch controls, synthesized sounds
- `docs/` design, decisions, research, slice specs
