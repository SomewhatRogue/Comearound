# Online play: how it works, what has gone wrong, how to test and debug it

Learnings from building Come Bye!'s online rooms and from Kyle's live playtests (Oct 2026).
Read this before touching `api/`, `src/client/{online,relay,local}.ts`, `src/server/{game,resume,lobby}.ts`,
or anything that decides who a player is. Every failure listed here happened for real.

## The shape of it

- **The game runs in the host's browser tab.** The host's `GameRoom` (via `LocalNet`) ticks the
  sheep, scores fields, decides everything. There is no game server on Vercel (Functions can't
  tick a room). Friends' browsers draw what the host sends and send their input.
- **Everyone connects to `/api/room`**, a WebSocket Vercel Function (`api/room.ts` + `api/_relay.ts`).
  It only routes: friends' messages to the host, the host's snapshots (~15 a second, the compact
  wire format in `src/shared/wire.ts`) to everyone. Instances share rooms through Marketplace
  Redis: one pub/sub channel per room, keys for who hosts (`cb:host:ROOM`), when the host was last
  heard (`cb:seen:ROOM`), and each player's newest connection (`cb:conn:ROOM:ID`).
- **Roles:** `host` (made the room, or hosted it on this device), `take` (was playing in it and
  its host has gone) and `join` (opened someone's code: never claims a room, waits for a host).
  A host silent for `STALE_MS` (8 s) may be replaced by a `host`/`take` connection. Only what a
  host sends keeps its claim fresh: connecting doesn't, a new claim holds just 1.5 s until its host
  speaks, and a host's goodbye makes the room free to take at once.
- **Identity:** a player's token is their relay id and their seat key. It lives per tab
  (`sessionStorage`) and on the device (`localStorage`); a new tab takes the device's token back
  unless another open tab is using it (`tac-live-<token>` stamped every 2 s). The host's own
  dog always has token `solo` inside its own room.
- **Seats:** held 30 s in the hub, and for the whole run mid-game. Late joiners watch (spectate)
  until the next run. A player gets their seat back by token, or, when that fails, **by dog
  name** if the seat with that name is empty (its player left, or has been quiet 8 s:
  `SEAT_QUIET_SEC`). A watcher whose same-named seat goes quiet is moved into it (`reseat`).
- **Everyone talks at least every 3 s** (clients resend their input as a keepalive; sockets ping
  the relay every 4 s). Silence is how dead players and dead hosts are found, because a crashed
  phone's socket can look open for a long time and no goodbye ever comes.
- **The host saves its room every 2 s** (`GameRoom.save`, `src/server/resume.ts`, in
  `localStorage` as `cbx-save-ROOM`). A page that becomes host of a room restores the newest of:
  its own save (under 3 min old) or the last snapshot it saw as a guest (under 90 s). So the game
  carries on when the host's page restarts, and when a friend takes the room over.
- **Who takes over, when:** a guest told the host left waits 13 to 16 s before claiming the room
  (a host that's only reconnecting gets back first). A guest that hears nothing from its host for
  9 to 13 s (each player differs, so two don't grab it at once) asks the relay again as `take`.
- **Sockets swap themselves every 4 min** (`RelaySocket.rotate`, new one first) because Vercel ends
  a function at its maximum duration (default 300 s; ours is 800). Only the newest connection may
  say goodbye, so the swap is invisible.

## What it costs (free plans)

(The portable version, for other projects on the same setup: `docs/REALTIME-REDIS-BUDGET.md`.)

- **Redis is Upstash on its free plan: 500K commands a month.** Over that, commands fail with
  "max requests limit exceeded" until the month resets (no charge unless a card is added). Online
  play would then break: players on different instances can't reach each other, and claims fail.
- Publishing every message was ~15 snapshots a second from the host plus every input: about
  100K to 250K commands an hour for 5 players, so the month went in a few hours of play. Since
  Oct 31 a relay instance only publishes a room's messages while another instance has players in
  it: PUBLISH's reply says how many instances heard it (1 means only us), anything heard from
  another instance keeps the room open for 10 s, and one message still goes out every 2 s to find
  newcomers. Joins and leaves always go out. With everyone on one instance a room costs about
  1.5 commands a second (mostly the host's claim refresh), ~5K an hour.
- **Vercel is the Hobby plan.** Over its included usage the project pauses (no charge). WebSockets
  count provisioned memory while open (360 GB-hrs included) and active CPU (4 CPU-hrs); a relay
  is mostly idle waiting, so a game night is well inside both.
- Anything new that talks to Redis per message (or per tick) needs the same thought: count it.

## What has gone wrong (all live), and the rule each one taught

| When | What players saw | Cause | Rule now |
|---|---|---|---|
| Oct 31 pm | Joining never worked on real devices | WebRTC peer links (PeerJS, STUN/TURN) failing across networks | One relay everyone connects to; no peer-to-peer, no third-party hosts |
| Oct 31 eve | Friend couldn't join after the host sent the link from Messages | iOS hands back a socket that says open but is dead | Heartbeat every 4 s; reconnect after 10 s silence or on coming back on screen |
| Oct 31 eve | Late goodbye from an old socket gave the room away | Old connection closing after the player reconnected | Only a player's newest connection may say they left |
| Oct 31 night | Friend told "no host" for a room whose host was right there, alone | A lone host sends only heartbeats, which didn't count as alive | Anything from the host, heartbeats included, keeps its claim fresh |
| Oct 31 night | Versus "host left" at 5 minutes | Vercel ended the function at max duration; host's phone didn't notice for 10 s | Swap sockets every 4 min; maxDuration 800 |
| Oct 31 eve | Friend crashed, came back and could only watch | Token was per tab only; new token = stranger = spectator mid-run | Token also on the device; seats come back by dog name; watchers move into their quiet seat |
| Oct 31 late | Whole group dropped at once, one couldn't get back | Redis hiccup made an un-awaited promise reject; Node killed the instance | Every fire-and-forget call goes through `safe()`; last-resort `unhandledRejection` handler |
| Oct 31 late | Host's page restarted; everyone rejoined to the lobby | The game only existed in the host's tab | Host saves every 2 s; a returning host or a friend taking over restores the run |
| Oct 31 late | Someone could never rejoin at all | Following a crashed host whose socket still looked open, forever | Guests treat 9 to 13 s of host silence as gone and ask again |
| Oct 31 late | Host's restarted tab made a new room by accident | Opened without the room in the link; Rejoin was hidden in a sheet | Big "Back to X's game? Rejoin" in the hub |
| Oct 31 (stress test) | Host left, nobody could take the room for 40+ s | Crashed pages whose timers kept reconnecting them: each reconnect refreshed a host claim (or, after a goodbye deleted it, made a fresh one, good for 8 s) though they never sent anything | Reconnecting to a claim you hold doesn't refresh it; a goodbye clears last-seen but keeps the claim; a new claim holds 1.5 s until its host speaks (the game pings at once); only messages keep a room |
| Oct 31 (found in review) | Nothing yet: online would have stopped after a few hours of play a month | Every message went through Redis, 500K commands a month on the free plan | Publish only while another instance is in the room |

### Rules of thumb

1. **Never trust a socket that looks open, or a connection that just opened.** Decide liveness by
   what you've heard recently.
2. **Never let one failure take others down.** No un-awaited promise in the relay without `safe()`.
   A relay instance dying drops every player on it at once and sends no goodbyes.
3. **Identify players by token first, then by dog name** (only for an empty seat). Never give away
   a seat whose player is still talking.
4. **The host's tab is fragile; the game must outlive it.** Anything new in the room's state that
   matters across a restart goes in `RoomSave` (`src/server/resume.ts`).
5. **Make the way back obvious.** People reopen the site from a bookmark, a fresh tab, a different
   browser. The hub offers the last friends' room for 3 h.
6. **Every fix gets a test that fails on the old code** (relay test or browser scenario), then the
   whole online suite, then the stress run.

## Testing (fast to slow)

- `npm test`: rules in Node, seconds. Includes `tests/relay.test.ts` (two relay instances, shared
  memory and real Redis: roles, routing, takeovers, heartbeats, a Redis that fails every command),
  seat reclaim by token and name, reseat, save and restore.
- `npm run test:online`: real browsers, each player its own profile, relay as two instances with
  memory and with real Redis. Scenarios: A/B three players (memory, Redis), C host frozen when the
  friend joins, D host leaves and a friend takes over, E host connection dropped, F friend waits for
  a closed host, G host holding a dead socket, H host alone 20 s, R friend crashes mid-run and comes
  back fresh, S host's page crashes and opens the link again, T host crashes for good and a friend
  takes over, V versus for a minute on a relay that cuts connections every 25 s. `ONLY=S,T` runs some.
- `npm run stress:online` (`SEED`, `SECS`, `PLAYERS`, `PORT`/`REDIS_PORT` for parallel runs): a room
  of real browsers joining, leaving, crashing (silently), reloading, coming back with their storage or
  fresh, the host starting and ending games, a relay instance dying. It checks throughout: never two
  hosts for long, never nobody hosting for long, nobody stuck outside the game, everyone sees the
  host's phase and field, no player with two dogs, nobody watching beside their own empty seat,
  no page errors; and at the end, after a calm, that it all settled.
- Simulating failures in Playwright: a crash is `window.__dead = true` and every socket a zombie
  (silent both ways, looks open). Don't use Chrome's `Page.crash` or `Debugger.pause` on a page whose
  context you'll reuse: a new page in the same profile shares the process and hangs. A restarted
  browser is a new context seeded with the old page's `localStorage`.
- Stress-test gotchas: run parallel stress runs with different `PORT`/`REDIS_PORT`, and expect them
  to be slow (each is 7 browsers; three at once starve the CPU). They all build `dist/` at start, so
  start them a few seconds apart. `RELAY_LOG=file` keeps the relay's lines; a violation names who
  the stuck player follows, so grep the log for that id. A crashed page in the test is network-dead
  but its timers still run (it reconnects and goes on silently): harsher than a real frozen phone,
  and it found a real bug.
- The dev server's test hooks: `RELAY_MAX_MS` (cut every relay connection after that long, the browser
  not told), `/__crash_instance?i=0` (a relay instance dies, no goodbyes, a fresh one takes over),
  `/__report?room=` (one-line room summary).

## Debugging a playtest

1. Ask what happened and roughly when (local time), who hosted, who dropped, what they saw.
2. Pull the relay's lines from Vercel runtime logs for that window (MCP `get_runtime_logs`, project
   `comearound`, `since` covering it). Each line is JSON: `join` (room, id, want, inst), `decide`
   (holder), `gone` (host, newest), `err`, `unhandled`, and every 5 min per instance `meter`
   (`pub`: messages that went through Redis, `kept`: messages that didn't need to). Ids are the first 8 characters of a player's
   token; the room code is in each line.
3. Read it as a story per player id: joins and rotations every ~4 min are normal; a `gone` with
   `newest:true` is a real leave; a host `gone` then friends `decide` with `holder:null` is a
   takeover window; a different room code from the same id means that player's page made a new room.
   Look for `Unhandled Rejection` and `exited with exit status`: an instance died.
4. Write what you find into `docs/DECISIONS.md`, with the fix and the test that fails without it.

## Playtest checklist

- Before: the Vercel deployment is Ready; `npm run test:online` and a stress run are green.
- During: note the times of anything odd, and who was on which device.
- Things worth trying on purpose: the host locking their phone mid-run, a friend closing the tab
  and reopening from a bookmark, two friends joining at the same moment, someone on mobile data.
- After: pull the logs (above), compare with the notes, fix with a test, record in DECISIONS.

## Known limits

- A host who puts their phone away for more than ~10 s mid-game hands the room to a friend (the run
  carries on; the host rejoins as a player). That's the price of detecting crashed hosts quickly.
- Two players with the same dog name can be confused for each other when one of their seats is empty.
- A takeover restores from the newest snapshot (up to ~1 s old) and re-picks the rest of a versus
  match's fields; goats' moods and bots' plans restart.
- The game's authority is the host's tab. A room server (the PartyServer worker in `src/server/worker.ts`
  already runs rooms server-side) would remove host fragility, at the cost of another host to run.
