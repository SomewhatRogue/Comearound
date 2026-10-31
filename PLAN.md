# PLAN

## Current slice

**Slice 1: one full round, end to end** (Claude Opus 5.5, 2026-10-30). Built and verified;
waiting on Kyle's first play.

## Done

- [x] Repo scaffold: Vite + TypeScript client, shared rules, Node dev server, PartyServer worker
- [x] Rules engine: roles, one guess, one accusation, the Pen with a shared sign pool, accuser's
      choice (end now / keep playing with a meter), last call, last-chance guess, reveal tally
- [x] Parts-based judge (any order, one item per part, location matters)
- [x] Goat: wanders, eats loose items (they respawn), stares down a Pen player (NAUGHTY close-up)
- [x] Bots fill to 5 seats; knower bots hold the giveaway part until last call
- [x] Lobby wardrobe (name, 12 colours, 7 hats), host controls, invite link
- [x] HUD: moon clock, role card with parts, score pops with climbing chimes, toasts, meter
- [x] Reconnect: token rejoin, seat grace, dead-socket detection
- [x] Tests: 12 unit tests (< 1 s); probe with 3 real browsers and screenshots

## Next (in order)

1. Kyle plays it with a friend or two. Collect taste calls.
2. Decide the location question (see DECISIONS 2026-10-30: everyone converging on one area is a tell).
3. Deploy to Cloudflare (`npm run deploy`) on a custom domain; test from two networks.
4. Art pass: KayKit characters (shared rig, toggled hats), props, outlines on characters and held items.
5. Pen minigames (snowball fight first), tomato throwing.
6. Single-player tutorial (reuses bots).
7. Guest identity + saved meta score and cosmetics (D1), then Discord linking.
8. Discord Activity: touch controls, URL mappings, instanceId as room.
9. More catalog clusters, multiple :( players in big games, map areas scaling with players.
