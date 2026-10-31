# Design

The living design doc is in Claude Docs: https://claude.ai/artifact/FECNc8Fhix79Kezs8UK7QD
(working title there: Act Natural). This file is the short version, as built.

- **Roles.** Everyone but the :( player knows the secret thing. :( players: 1 at 3 to 6 players,
  2 at 7 to 9, 3 at 10 to 12. Bots fill to 5 seats.
- **Things are built from parts.** 3 parts each, filled in any order at a station in the thing's
  area; each part accepts several items. Catalog: 10 things, 18 items, 4 areas (`src/shared/catalog.ts`).
- **The board.** Lists every thing in the catalog. A :( player gets one guess. Everyone gets one
  accusation. Closes at last call (20% of the round, max 90 s).
- **The Pen.** Right accusation: the accused goes in. Wrong: the accuser does. Same sign pool
  either way, nobody announced. Only the accuser knows; they choose End now or Keep playing
  (a private meter climbs; the jailed :( can steal it with a last-chance guess at the reveal).
- **The goat** wanders, eats loose items, and stares down someone in the Pen: NAUGHTY.
- **Scoring:** see `docs/DECISIONS.md`. In-round pops never leak which thing is real.
