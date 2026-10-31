# PLAN

## Current slice

**Slice 2: Come Bye! herding, end to end** (Claude Opus 5.5, 2026-10-30). Built and verified;
waiting on Kyle's first play. Spec: `docs/features/slice-02.md`.

## Done

- [x] Multiplayer foundation (kept from slice 1): rooms, token rejoin, held seats, host hand-off,
      spectators, solo mode in the browser, Node dev server, PartyServer worker
- [x] Herding sim: boids flock, flight zones by posture, the eye, lying down calms, barks and
      bleats as noise, lonely sheep rejoin, follow-the-leader at the gate, fences that never leak
- [x] The goat: wanders, bleats (scatters sheep), barely gives way, comes to stare down whoever
      barks too much near it (frozen 4 s, NAUGHTY close-up)
- [x] Co-op Trials (3 fields) and Versus (2 teams, 3 fields, own-colour sheep, raider bots at 3+ a side)
- [x] Scoring: sheep, time left once all are in and held, calm herding (fewer barks), goat bonus
- [x] Room leaderboard (top 10) and a best-run per browser
- [x] Herding bots: groups, outrun on a wide arc, flanks, gate keeper, corner rescue
- [x] 8 breeds (the pack's four first), 8 coats, 3 eye colours, 10 collars; postures pose the spine
- [x] HUD, intro cards, field score cards, results; phone controls held sideways
- [x] Lobby practice flock
- [x] 12 unit tests; bot bench; probe with 3 browsers including a phone

## Done (night of 2026-10-30)

- [x] iPhone controls fixed (negative touch ids); portrait plays; `?diag` readout
- [x] Goat mischief and several goats; harder herding; prettier fields
- [x] Tricky and Wild courses: streams and bridges, mud, brambles, broken fences, wind and scent,
      rain and lightning, black-and-white sorting, a 72 m pasture with 24 sheep; Riverside versus
- [x] Farm props, minimap, six synthesized lofi tracks

- [x] Dogs can walk into pens in the trials (versus keeps them out)
- [x] Co-op on the shareable page over the viewer's live room (join a friend's game; host runs it)

- [x] Vercel deploy: peer-to-peer online rooms (host's browser runs the game), Solo / With friends switch, join pop-ups
- [x] Dressing-room camera in the lobby; visible collars

## Next (in order)

1. Kyle plays it with friends (solo link first, then a hosted room). Collect taste calls:
   speeds, flight distances, bark strength, how often the goat comes over, camera height.
2. Kyle adds Upstash Redis to the Vercel project; test online rooms from two networks and a phone. Add a TURN relay if some networks can't connect.
3. Persistent leaderboard (D1) keyed by the pack's names; guest identity, then Discord linking.
4. Dog photo upload (Kyle's wish): photo becomes a collar tag / portrait at minimum; coat colours
   sampled from the photo as a stretch.
5. A nip (Kyle floated it): short-range shove for stubborn sheep and to bump other dogs in versus.
6. More fields (a bridge, a lane between hedges, a moving gate), weather, a shepherd's whistle.
7. Discord Activity: URL mappings, instanceId as room.
