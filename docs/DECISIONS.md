# DECISIONS

Newest first. Each entry says what was decided and why, signed with the model.

## 2026-10-31 (evening): back in after a crash, and a link preview (Claude Opus 5.5)

- **Seen live:** a friend's game crashed mid-run; she reopened it and got into the room, but only
  as a spectator. Her token lived in `sessionStorage`, which a crash or browser restart loses, so
  she came back as a stranger, and late joiners watch.
- **Your seat back by name:** a hello with an unknown token takes an empty human seat with the same
  dog name (any phase). A seat is empty if its player left, or has been quiet for 8 s
  (`SEAT_QUIET_SEC`): a crashed phone's socket can look open for 15 to 30 s, so every client now
  says something every 3 s (its current input) and the room tracks `Dog.heardAt`. If she arrives
  before the old seat goes quiet she starts as a watcher and `reseat()` (each tick) moves her into
  it as soon as it does; in the lobby the old quiet duplicate is simply removed. The old
  connection loses its claim, so its late goodbye changes nothing. A live player (talking every
  3 s) can never lose their seat to a same-named newcomer.
- **Token kept on the device too:** `localStorage` as well as per tab; a new tab takes it back
  unless another open tab is using it (each tab stamps `tac-live-<token>` every 2 s).
- **Rejoin button:** opening the site with no room within 3 h of playing in a friends' room offers
  "Rejoin Kyle's game (room X)" in the lobby.
- New online scenario R: mid-run the friend's page is frozen solid (debugger paused, socket left
  open), she opens the link in a fresh browser with the same name: back in her own seat in under
  8 s (before the fix: a second "Sam" watching from the side). Two unit tests cover the rules.
- **Link preview:** Open Graph and Twitter tags with a 1200x630 card (`public/og.jpg`): a collie
  in the meadow with the title in the game's own lettering, rendered from the game itself. Second
  take (Kyle: the background read as "weird golf balls"): seen from behind with heads down, sheep
  are woolly balls on sticks, so the flock now stands side on with heads up beside the meadow's
  oak, and an orange butterfly flits by her ear. The image URL carries `?v=2` so chat apps that
  cached the first one fetch the new one.

## 2026-10-31 (night, last): an agility course, and piano from the next room (Claude Opus 5.5)

- **Agility, just for fun** (`shared/agility.ts`, pieces are field data like everything else):
  hurdles, a tyre, a tunnel, weave poles and a pause table, numbered in order. The lobby is now its
  own field, `PRACTICE` (The Meadow with its flock, the log and stone wall swapped for a full
  seven-piece course along the top); Big Sky Pasture has a five-piece loop in its south-east
  corner. The pieces become low fences for the rules: hurdles and the tyre are jumpables (sheep go
  round, dogs get the real jump), the tunnel's sides (`edge`) stop everyone so you go in one end
  and out the other, and the table's `skirt` keeps sheep off while dogs hop up (drawn standing on
  it). Weave poles are too thin to matter.
- **Running a round** (`shared/agilityrun.ts`, pure and tested): over a hurdle or through the tyre
  either way, end to end through the tunnel, all six weave poles in order from either end on
  alternating sides, a moment on the table (or lie down on it). Taking piece 1 starts the clock; each
  next piece chimes up the scale; the last gives your time, with your best on this browser. Your
  own dog on your own screen: nothing sent to the room, no points. Numbered flags over each piece,
  the next one bouncing (everywhere in the lobby; within 16 m on Big Sky).
- The first layout hugged the north fence and the wall-ease test caught sheep trapped in the 1.9 m
  behind the tunnel; the course now sits 3.4 m in. Bots never go near the Big Sky corner (Wild bench
  identical with and without it).
- **Piano from the next room** (`client/musicroom.ts`): four new tracks (Upstairs at the Farmhouse,
  Kettle On, Through the Wall, Muddy Boots by the Door), taking turns with the others. A felt
  piano (soft stretched partials, hammer thump, pedalled decays, slightly off-grid timing) rolling
  chords or slow arpeggios with a sparse melody, heard through a wall (low-pass at 1150 Hz with a
  little warmth) into a small room's echo; a kick and brush thump through the floor on two of
  them. Levelled by rendering offline: 1 to 2 dB under the other tracks.

## 2026-10-31 (night, latest): bark voices, Clean dogs, and a chicken (Claude Opus 5.5)

- **The bark follows the build:** each breed has a base pitch (`BARK_PITCH`), and a chonkier dog
  barks lower (7% per build step). Or pick it yourself: a **Bark** row (Auto, Deep, Low, Normal,
  High, Squeaky) plays a preview when you tap it, so a Chonk with a Squeaky bark is one tap away.
  `Look.voice` (-2..2, missing means Auto) is clamped by the room and carried on the wire.
- **Mud cakes dogs, water washes it off:** standing in mud cakes a dog in about two seconds,
  wading a stream washes it in about two, and it dries off slowly anywhere else (`Dog.mud`, 0..1,
  on the wire). Drawn as brown socks creeping up the legs, muddy paws, and splotches
  (`client/mud.ts`). **Clean dogs** on any field with mud: up to 150 points for how clean the
  team's dogs are when the field ends (`HAZARD.cleanBonus`), on the field card and as a Clean
  column in the results (only on courses that have mud). Rules only: it doesn't change herding,
  bench unchanged.
- **Play as a chicken** (`client/chicken.ts`): a round hen on the dogs' rig (so postures, the
  jump, the lobby antics and pats all work), with comb, wattle, beak, tail fan, two yellow legs,
  and wings that flap when it sprints, jumps, bawks or gets a pat. Five hens to choose from
  (red, white, black, buff, speckled; chicken coats and dog coats are kept apart by `coatsFor`).
  It bawks instead of woofing ("BAWK!" over its head), clucks when patted, and takes the same
  build and voice options. Bots stay dogs (`DOG_BREEDS`).

## 2026-10-31 (night, later still): sprint leaps, logs and walls, a calm sky, chatty sheep (Claude Opus 5.5)

- **Sprinting through a jump keeps its speed:** a sprinting dog slows only to 90% (walking: 62%) and
  its leap stretches half as long again (gather, leap and landing all scale; the length is fixed
  when the jump starts, so running out of stamina mid-air doesn't hiccup). Prediction matches.
- **Logs and dry-stone walls to jump** (`LowFence.kind: 'log' | 'stones'`, drawn in
  `client/jumpables.ts`): fallen logs with bark, cut ends, a branch stub and moss; low walls of
  rough stones with coping on top. Thicker than a fence rail (`jumpableHalf`), measured from their
  face for the jump. One to three in every field, in open ground. Bench unchanged within noise
  (Bramble Lane over 12 seeds: 7.7 with, 6.3 without).
- **The strobing on windy fields fixed.** Gusts and cloud shadows were placed at clock times wind
  speed, so every change in a gusty wind jumped the whole pattern. They now travel by accumulated
  distance (`advanceAir`): the wind changes their speed, never their position. The look of the
  wind follows the real wind slowly; gusts are softer and slower; the sun eases in and out of a
  cloud's shadow over a few seconds. Lightning is one bright flash and a softer flicker, not three.
- **The open gate lies flat against the outside of the pen fence** (nothing collides with it); a
  challenge pen's gate swings shut through the field side.
- **Sheep chat:** every few seconds a calm sheep near you gives a contented baa at its own pitch
  (now and then a high, young one), quieter further off. Grazing sheep nibble with a little chewing
  nod and look up now and then. (Frightened sheep already gave a worried baa.)

## 2026-10-31 (night, last): a real jump over low fences (Claude Opus 5.5)

Kyle: make the fence jump more dynamic and clearly a jump: a gather, a leap, a landing.

- **Three parts, from where the dog is and which way it faces** (`jumpAt` in `client/lowfence.ts`,
  so every player sees the same jump): the gather (1.45 to 0.85 m out: down on the haunches,
  weight back, nose dipping); the leap (0.85 m either side of the rail: a 0.72 m arc, nose up on
  the way up and down on the way over, front legs reaching then reaching for the ground, back legs
  pushing off then trailing, ears back, tail streaming); the landing (front legs taking the
  weight, a squash, a puff of dust). A whoosh on takeoff and a soft thud on landing for your own dog.
- **Dogs slow to 62% within 1.1 m of a low fence** (room and prediction alike, `DOG.hopSlow`), so
  the jump takes about half a second at a walk instead of a fifth: long enough to read.

## 2026-10-31 (night, latest): ambient beauty, calm play, hops, chonk (Claude Opus 5.5)

Kyle's list: jump low or half-broken fences; reward slow, calm play (hard eye, little movement);
pond life that startles and resettles; clouds overhead that change the look; wind you can see
moving through the grass; a little elevation; a lean-to-chonk dog option; and sheep that get
stuck on walls.

- **Low fences** (`FieldDef.lowFences`, some marked broken): knee-high, weathered, two rails, the
  tumbledown ones leaning with rails dropped. Sheep and goats collide with them; dogs pass
  (`collide(..., { hop: true })`) and hop visibly as they cross (`client/lowfence.ts`). In The
  Meadow (so the lobby teaches it), Windy Hillside and Big Sky Pasture. Bot bench unchanged.
- **Calm herding** (`server/calm.ts`) replaces the barks-only bonus: up to 500 a field (calm
  flock 220 from average flock fear, soft feet 160 from little sprinting and time stalking,
  quiet 120 from barks), scaled by the share penned. A calm field now pays as well as a fast one.
  Measured: calm bots 400 to 500, a rough sprint-and-bark player 200 to 350.
- **Sheep ease off walls:** left against the outer fence, a pen's outside or a low fence for 2 s
  while no dog is driving them, sheep drift back into the open (about 1 m to 2.6 m over 8 s), and
  graze a couple of metres in from the fence. Never out of a pen. Thunder Hill over 12 seeds: 14.7
  with, 14.1 without (the 6-seed bench is noise there).
- **Wildlife** (`client/wildlife.ts`): ducks on ponds and streams (paddling, dipping), little
  flocks of birds hopping and pecking in the grass. A dog rushing them (fast and close) or a bark
  nearby sends them flapping off; they circle and settle again, ducks on their water, birds on
  another patch. A quack or a flutter if it's near you. Cosmetic, per browser.
- **Wind and clouds** (`client/windshader.ts`): gust bands roll downwind through the grass and
  flowers (tips bend and catch the light) and as a faint sheen over the ground, always a little
  even on still fields; soft cloud shadows drift over the ground with the wind, and the sun dims
  a little when one passes over your dog.
- **Elevation** (`client/terrain.ts`): gentle swells up to about 1 m, flat by the outer fence,
  round pens and gates, water and mud. Visual only: the rules play on the flat. Ground, flowers,
  grass, props, dogs, sheep, goat and fences all sit on it; rises are a touch sunnier.
- **Lean to chonk:** `Look.build` from -2 (lean) to 2 (chonk) in the dog options; rounder body,
  thicker and slightly shorter legs. Sent on the wire (index 14).

## 2026-10-31 (late evening, later): the lobby pack (Claude Opus 5.5)

Kyle: practising in the lobby is good, but he likes seeing the other dogs join; stop them moving
there, give them idle animations, let you pet them, and show outfits changing.

- **The lobby has a row.** Every dog that isn't practising stands in a row across the lower left
  of The Meadow, facing the camera, in join order (`src/server/lobby.ts`). The room walks dogs to
  their spot, so a friend who joins trots in from the corner and a dog done practising trots back.
  Steering does nothing while you stand in the row. Sheep ignore dogs in the row (they still
  bump into them rather than walking through).
- **Practising is the panel folded.** Fold it (Practise), or just start steering, and your dog
  runs free at the flock; open the panel and it trots back. Coming back from a run, everyone
  gathers in the row with the panel open. New message `{t:'practise', on}`.
- **Pats.** Tap (phone) or click (laptop) a dog in the lobby: hearts rise off it, it wiggles, tilts
  its head and wags fast, everyone sees it, and its owner gets "Kyle gave you a pat". New message
  `{t:'pet', id}`, at most one every 0.45 s per player; `DogPub.pets` counts up so each pat shows
  once. Relay guests and the Claude artifact's live room pass both new messages to the host.
- **Waiting dogs get up to things** (client-side, cosmetic): breathing, looking about, sitting,
  lying down, now and then a play bow. **A new outfit poofs**: a ring in the collar colour, a hop
  and a poof sound.
- **Cameras.** The close-up while dressing pulls back a little so the dogs either side show; on
  a phone held upright it pulls back further (the screen is narrow).
- **Tests:** four room tests (the row, practising and back, sheep ignoring the row, pats and
  their rate limit and toast); the browser online test now has a friend's pat reach the room.
  The lightning test asserted every sheep panicked, which only held by luck of where the strike
  landed; it now checks the sheep within the strike's reach.

## 2026-10-31 (late evening): phones, upright first; no sprint button (Claude Opus 5.5)

Kyle: sideways "almost doesn't work as well"; upright plays better. And the SPRINT button is
redundant (dragging the stick far already sprints), blocks things and makes too many buttons.

- **Sprint button gone.** On a phone you sprint by dragging past the stick's ring, which now
  lights up yellow while you do. The lobby tip and the menu say so.
- **Sideways phones (landscape, under 500 px tall) get a compact layout:** a smaller top bar,
  a smaller minimap (104 px wide, was 150), DOWN and BARK side by side and smaller, a smaller
  stick, and the camera rides a little higher so there's field above and below your dog.
- **The "sideways gives you more field" tip is gone**: upright is the way to play.

## 2026-10-31 (evening, late): comebye.online, and the name is Come Bye (Claude Opus 5.5)

- Kyle bought **comebye.online**. Added to the Vercel project as the main domain, with
  www.comebye.online redirecting to it (308). DNS at the registrar: A @ 216.150.1.1 and
  216.150.16.1, CNAME www 3b3a6fcf3ab08f8e.vercel-dns-016.com (what Vercel recommends for it).
- **Invite links use the address the player is on** (comebye.online, or the vercel.app alias),
  except on a deployment's own Vercel URL, which sits behind Vercel's sign-in; only there do they
  switch to the public production domain. Before, links always used the build-time production
  domain, which would have pointed at comebye.online before its DNS worked.
- **The project is called Come Bye** (comebye), not "Threes a crowd": tab title, README,
  CLAUDE.md, package names.

## 2026-10-31 (night, later): versus lost its host at five minutes; sound and music on screen (Claude Opus 5.5)

Co-op worked, versus "said host left". The relay log: the host's connection ended almost exactly
300 s after it opened, Vercel's default maximum duration for a function, and the host's phone
didn't hear about it until its heartbeat noticed 10 s later; meanwhile the friend was told the
host left, took the room over after 6 to 9 s, and the match was gone. Co-op had simply ended
within five minutes. Nothing to do with versus.

- **Every socket swaps itself for a fresh one every 4 minutes** (`RelaySocket.rotate`), new one
  first, the old one closing once the new one talks, so nobody ever reaches the limit. Only the
  newest connection may say goodbye, so the swap is invisible to the room.
- **`api/room.ts` maxDuration raised to 800 s** (Pro with Fluid compute), as a second margin.
- **A friend waits 13 to 16 s, not 6 to 9, before taking over a room whose host left**, longer
  than a host needs to notice a silently cut connection and come back.
- **Tests:** the dev server can cut every relay connection after `RELAY_MAX_MS` without telling
  the browser (what was seen live); browser scenario (V) plays a versus match for a minute on a
  relay that cuts connections every 25 s. Without the swap it fails with "The host left", like
  Kyle's match; with it, the host holds throughout.
- **Verified live:** a host and a friend (by code) on comearound-lyart.vercel.app for 9 minutes,
  a whole versus match and then the results screen; checked every 30 s, the host stayed host and
  both dogs stayed connected throughout, well past the old 5-minute cut.
- **Sound and music are on screen at every size** (they were hidden on phones, reachable only in
  the menu): small speaker and note buttons in the top bar, labelled on wide screens, crossed out
  when off; the menu leads with Sound: on/off and Music: on/off.

## 2026-10-31 (night): friends were told an empty room had no host; sound on iPhones (Claude Opus 5.5)

Kyle made a room and texted his friend the code; when she typed it in she was told there was no
host, so she pressed Host and he joined her: it worked, backwards. The relay log showed it: she
joined 22 s after he made the room and got "no host". A host alone in its room sends nothing but
heartbeats, and the relay only counted real messages as signs of life, so after 8 s it called the
host gone. Every test had friends joining within seconds, so none caught it.

- **The relay counts the heartbeat as the host being there** (`touch` on every message, the ping
  included; touch at most every 2 s, or a quarter of the stale time in tests). A frozen phone
  sends no heartbeat, so it can still be replaced.
- **Tests:** relay test "a host alone, sending only heartbeats, still gets the friend who joins
  later" (fails on the old relay); browser scenario (H): host alone 20 s, then the friend types
  the code.
- **No sound (iPhone):** audio unlocked only on pointerdown, which iOS doesn't count as a tap; the
  touch controls cancel the click too. Now unlocked on touchend, pointerup and click as well, with
  a silent buffer played inside the tap (iOS needs that), resumed after the phone was away
  ("interrupted"), and `navigator.audioSession.type = 'playback'` so the ringer switch doesn't
  silence a game (Sound off still mutes it).

## 2026-10-31 (evening): a phone host that leaves to send the link (Claude Opus 5.5)

Kyle hosted from his phone, tapped Share, sent the link from Messages and came back; his friend
never got in, by link or by typed code. Kyle's read, which matches: leaving the game for the
texting app quietly killed the host's connection, and coming back didn't revive it. iOS can hand
back a socket that still says "open" but carries nothing, so the relay kept the room with a host
nobody could reach.

- **Heartbeat on every socket.** Each player pings the relay every 4 s (`{ping:1}`, answered with
  a pong and never relayed); 10 s without hearing anything means reconnect. Coming back on screen
  (visibilitychange, pageshow, online) pings at once and reconnects if there's no answer in 2.5 s,
  so a phone back from Messages is live again in a few seconds. The relay pings each socket every
  15 s and drops ones that stop answering.
- **Only a player's newest connection can say goodbye.** A dead old socket that closes late used
  to announce "left" and give up the room after the player had already reconnected. The relay
  keeps the newest connection per player (`cb:conn:ROOM:ID`) and only that one may publish "left"
  or drop the host claim; messages carry the connection id so clients ignore a stale goodbye too.
- **Relay logs** (one JSON line per join, decision and goodbye) show in Vercel's runtime logs.
- **Tests:** `tests/relay.test.ts` adds a late close from an old connection and the heartbeat;
  `npm run test:online` adds (G) the host holding a dead socket when the friend joins. Two
  timing waits in the browser test now wait for the host's own view to catch up before reading
  it (the room has the friend a tick before the drawn view does). Full suite green four times in
  a row.
- **Verified live** on comearound-lyart.vercel.app from a Vercel Sandbox (`scripts/live-phone.cjs`):
  the host's page script fully paused and its socket dead (a phone in Messages) while the friend
  opens the link; the friend waits, and joins within half a second of the host coming back, both
  after 12 s away and after 45 s away (long enough for the room's host claim to lapse).

## 2026-10-31 (afternoon, later): online rooms through a Vercel relay, per Vercel's docs (Claude Opus 5.5)

Online play had never once connected on Kyle's real devices (same Wi-Fi, screens on), while a
friend's server-relayed game worked fine. Kyle: "I'm deploying on Vercel. Read their docs and
figure out the right way, even if we have to refactor."

- **Vercel's documented pattern for realtime on Functions** (docs: WebSockets; KB: "Publish and
  subscribe to realtime data on Vercel", "multiplayer cursors"): every client holds a WebSocket to
  a Function; a connection is pinned to one instance and instances share no memory, so rooms,
  presence and pub/sub live in Redis from the Marketplace; each instance delivers to its own
  sockets first and publishes with its origin id, skipping its own echoes; clients reconnect
  (connections end at the function's max duration) and reload full state.
- **So: `api/room.ts` (+ `api/_relay.ts`) is a WebSocket relay.** One Redis pub/sub channel per
  room for messages, keys for who hosts and when the host was last heard from. The game still runs
  in the host's browser (no server can tick a room on Functions); the relay carries friends' input
  to the host and the host's snapshots (the compact wire format, ~15/s) to everyone. Roles:
  host/take may claim a room (or replace a host silent for 8 s, e.g. a frozen phone, which steps
  down when it returns); join (opened someone's code) never claims, gets "nohost" and then
  "hosted" when one arrives. REDIS_URL (Marketplace Redis) or KV_URL (Upstash); without either
  it runs in memory and the lobby warns that online play isn't fully set up.
- **Gone: WebRTC, the PeerJS public server, STUN/TURN, `/api/signal`.** No more third-party
  hosts for online play.
- Client: `src/client/relay.ts` (RelaySocket with backoff reconnect, RelayHost, RelayNet) and a
  rewritten `online.ts`. Build flag renamed VITE_ONLINE.
- **Tests:** `tests/relay.test.ts` (in `npm test`): two relay instances with players spread
  across them, each a real WebSocket, run twice (shared memory, and a real `redis-server`): roles,
  routing (to host, broadcast, direct), friend before host, host leaves and a player takes over,
  a quiet host replaced and stepping down, a joiner never claiming. `npm run test:online`: real
  browsers, each player its own profile, the dev server running the relay as two alternating
  instances: (A) host + two friends (link and typed code) sharing rooms in memory, (B) the same
  through real Redis, (C) host frozen when the friend joins, (D) host leaves mid-run, (E) host's
  connection drops, (F) friend waits while the host's game is closed, host reopens its link. All
  pass, twice.
- **Verified live (2026-10-31, after Kyle added Upstash Redis):** from a Vercel Sandbox, two
  separate browsers on comearound-lyart.vercel.app: HostDog hosted, TestPup joined by code in
  about 19 s, both saw both, TestPup's steering moved it on the host, both entered the run; the
  relay reported shared rooms (Redis). Kyle then joined a live sandbox-hosted room from his phone.
- **Kyle needs to add Redis to the Vercel project** (Storage, Redis from the Marketplace) so
  instances share rooms. Function max duration is left at the 300 s default (all plans);
  clients reconnect on their own. 800 s is available on Pro if the reconnects are noticeable.

## 2026-10-31 (afternoon): why joining failed, and real multi-player tests (Claude Opus 5.5)

Kyle hosted on his iPhone, shared the code from the share sheet, came back, and his friend still
couldn't join. A fresh review of the online code (a separate agent) plus new tests found:

- **The host's matchmaking connection died in the background and never came back.** Fixed: on
  returning to the page the host always re-attaches its room id (same token, so it works even
  while the server still holds the dead socket), and re-registers if the socket closed.
- **A friend opening the code while the host was away could become the host of an empty copy of
  the room** (and see "send this link" instead of the game). Fixed: claiming takes a `take` flag;
  a joiner (opened someone's code, never hosted it on this device) only ever joins, waits up to
  two minutes while the host isn't answering ("Waiting for room X's host..."), and can choose
  "Host this room myself". Players already in the room may still take it over if the host leaves.
  `/api/signal` gained `peek` (who hosts, without claiming).
- **Tapping your own link opened a new tab that didn't know it was the host.** The host token is
  per device now (localStorage), so the new tab re-attaches to the room.
- **A late answer to an old attempt could jam the next one**: offers carry a nonce; answers must
  echo it. **Errors could strand a friend on "Connecting"**: caught, they show the failure screen.
  Friend ids keep one token across retries (no clashes with a lingering socket); a back/forward
  cache restore reconnects; `signal()` times out after 8 s.
- **Controls checked "typing in a box?" only once a frame**, so steering right after typing a
  room code and pressing Enter could be ignored. Now checked live.
- **Tests that show several players in one room:** `tests/matchmaking.test.ts` (in `npm test`)
  runs a real PeerServer in-process: three friends reach one host and each gets its own answer, a
  dropped host re-attaches, a host told when its room was taken, a joiner never takes a room, the
  host's new tab takes the room back, and the Redis path with three friends. `npm run test:online`
  (scripts/online-test.cjs) boots everything and plays in real browsers, each player in its own
  profile: (A) host + two friends (link and typed code) on /api/signal, (B) the same on the
  PeerJS fallback, (C) host's page frozen when the friend joins then back, (D) host leaves and a
  friend takes over with the other following, (E) host's connection dropped while away. All pass.
- Still unverifiable from here: the live 0.peerjs.com and the Open Relay TURN server.
- **Diagnostics in the game** (Kyle: joining failed even with the screen on, same Wi-Fi; it worked
  when his friend hosted). With friends now runs a network check (which route kinds this device
  can offer: same-network, direct, relay) and shows it in plain words; a failed join shows what
  happened (matchmaking route, whether the host answered, each side's routes, how the link ended)
  with a Copy details button. `VITE_TURN_API` takes a TURN provider's credentials URL (Metered).

## 2026-10-31 (midday): new room button; the chihuahua (Claude Opus 5.5)

- **"new code"** next to the room code (and "Start my own room" on the failure screen, "Leave and
  start my own room" for a guest) makes a fresh room with a new code and hosts it straight away.
- **Chihuahua** (Kyle): ninth breed, tiny (0.58 of a collie), spindly legs, apple head (1.3x),
  big splayed "satellite" ears, big round eyes, sickle tail; new Fawn coat. The dressing-room
  camera now frames by breed size, so small dogs get a closer look.

## 2026-10-31 (after midnight): rooms with no setup; collar and tail fixes (Claude Opus 5.5)

- **Kyle wants online rooms to work with just a code, no setup.** Matchmaking now tries our own
  Redis-backed function first and, if the site doesn't have Redis, falls back to the **free public
  PeerJS server** (`0.peerjs.com`): the host takes the id `cbx-<code>`, anyone else opening the
  code finds it taken and sends their offer there (`src/client/brokers.ts`). Only the offer and
  answer pass through it; the game runs directly between players. This is the one runtime
  dependency on an outside host (plus public STUN servers), and only for online play; adding
  Upstash Redis on Vercel takes it out of the path. Tested against a local copy of the real
  PeerServer (`peer` dev dependency); the container can't reach the public one.
- **A relay for networks that won't connect directly** (Kyle's friend got "couldn't connect").
  ICE now includes a TURN relay by default: the free Open Relay server's public static-auth
  endpoint, with time-limited credentials signed in the browser from its published shared secret
  (the coturn REST scheme Nextcloud Talk uses). Direct routes are still preferred; the relay only
  carries the game when two networks (mobile data, strict routers) won't link. `VITE_TURN_*`
  swaps in our own; `?noturn` drops it. ICE gathering waits up to 5 s, the link up to 12 s more.
  The failure screen now says which went wrong: the host never answered (wrong code, or the host's
  game paused because it's a phone in the background) or the two networks couldn't link. The host
  sees "A friend is joining..." when an offer arrives. Can't reach the relay from this container,
  so it's untested against the real thing.
- **Invite links use the production domain** (`VERCEL_PROJECT_PRODUCTION_URL`, baked in at build):
  a deployment's own URL sits behind Vercel's sign-in, which is what Kyle's friend hit.
- Lobby shows the **room code** big and has a **"Friend's code" box** (Enter or Join).
- **Collar redesigned** (Kyle: "giant donuts"). Now a flat open strap (both faces drawn) where the
  neck meets the chest, square to the chest-to-head line, sized from the shapes it wraps so it sits
  just proud of the fur, with a brass tag at the throat. A keeshond's sits on its bib and sinks into
  the ruff at the sides. Checked in screenshots for collie, keeshond, golden and pug. **Tails** root on the rump's surface and wag about that root (rotation order
  YXZ: lift, then swing), so they stay attached.

## 2026-10-30 (midnight): online play on Vercel; dressing-room camera (Claude Opus 5.5)

- **Kyle: "Use Vercel for this."** Vercel Functions now hold WebSockets, but each connection is
  pinned to its own instance and Vercel's docs say rooms must live in an outside store, so a
  GameRoom can't live in a function. Instead **the host's browser runs the game and friends
  connect to it directly (WebRTC)**. `api/signal.ts` (a Vercel Function) only introduces them:
  first tab in a room claims it, friends drop their connection offer in the host's mailbox, the
  host answers; Redis from the Vercel Marketplace (Upstash) holds the claims and mailboxes, a
  handful of commands per join. Snapshots go over an unreliable, unordered data channel (the
  compact `wire.ts` format, 20 Hz); messages and events over a reliable one. If the host leaves,
  everyone drops to their own game and the first to re-claim the room hosts it (about 6 s).
  Trade-off: a few strict networks block direct connections; `VITE_TURN_URL/USER/PASS` add a
  relay server if that bites. `vercel.json` builds with `VITE_P2P=1`.
- **Lobby has a Solo / With friends switch** (Kyle couldn't see how to switch or who joined).
  With friends shows the room link (Share or Copy), "Your pack" with who's in, and a pop-up plus a
  whistle when someone joins or leaves. Course names lose "Co-op" (they play either way).
- **Dressing your dog**: with the lobby panel open the camera comes down low and close, and the
  view slides so your dog sits in the middle of the screen the panel doesn't cover (left of it on
  a laptop, above it on a phone). Collars are chunkier with a brass tag (a keeshond wears it
  round its ruff), and your name tag's border is your collar colour.
- Headless Chromium paints a pale blue box over part of the canvas next to the lobby panel in
  screenshots; the WebGL pixels underneath are right (read back), so it's a test-browser artifact.

## 2026-10-30 (near midnight): dogs in pens; co-op on the shareable page (Claude Opus 5.5)

- **Pens are locked to dogs only in versus** (Kyle: "if there's too many it says so but you
  can't go into the pen"). In the trials you can walk in through the gate, even a shut challenge
  gate, and fetch an extra sheep out. Versus keeps the gate shut to dogs so nobody raids from
  inside. Bot dogs still keep out (they never need to go in, and wandering in would push sheep out).
- **Co-op on the shareable page** (Kyle: "allow co-op for trials"). The page runs in the claude.ai
  viewer, which offers a live room of everyone who has it open (the `room` capability). Everyone
  runs their own game and advertises it in the room's lobby presence; "Join Kyle's game" switches
  your connection to his. **The joined tab is the host**: its GameRoom (LocalNet) stays the
  authority. Friends talk only through presence: theirs carries token, look, stick and a bark
  counter (fed to the room as ordinary client messages); the host's carries one compact snapshot
  (`src/shared/wire.ts`, under 4 KB, the presence limit) plus each friend's stamina and events,
  about 15 times a second, in a named room per game (so the lobby presence stays a small advert).
  Works for versus too. Up to 7 friends. Viewers must be signed in and invited to the artifact
  (a public link can't join the room). `?fakeroom` swaps in a BroadcastChannel stand-in so two
  tabs can test it; `node scripts/coop-probe.cjs` (with the dev server up) joins, moves, barks,
  plays a field and checks the guest falls back to solo when the host leaves.

## 2026-10-30 (later still): intro tours and the Challenge course (Claude Opus 5.5)

- **Every field opens with a camera tour** (Kyle): the pen or pens, then each group of sheep
  (tagged "8 sheep"), then down to your dog. The intro is now 6 s so the tour fits; it runs on
  the client during the server's intro countdown (`src/client/intro.ts`).
- **Challenge course: exact numbers per pen** (Kyle). Split the Flock (5 and 5), Three Little
  Pens (3, 4, 5), Odd One Out (1 and 9, across a stream, in the rain, with goats). Only up to
  each quota counts; the field ends when every pen is exact. **A pen's gate swings shut when its
  count is exactly right** (so a flock pouring in doesn't overfill it) and opens again if it does
  get too many, so the extras can be barked back out. Signs and HUD pills show 3 / 5, green when
  exact, red when over. Bots send each group to the nearest pen with room for it.

## 2026-10-30 (late night): scenarios, hazards, weather, music (Claude Opus 5.5)

Kyle: more scenarios; the goat isn't impactful enough (more chaos or more goats); things to avoid
in later levels (streams, trees); wind on the grass that can spook the herd if you're upwind;
then: windmills and cute things, bigger maps and flocks, sorting two colours, spring lofi music
(several tracks), rain and lightning that really scares the sheep and the dog.

- **Three trials courses.** Gentle (Meadow, Orchard, Windy Hillside), Tricky (Brook Farm, Bramble
  Lane, Three Billy Goats), Wild (Black and White, Big Sky Pasture, Thunder Hill). The host picks
  one; the room leaderboard and the browser's best are kept per course. Versus is now Field Day,
  Riverside (your sheep start on the far bank), Field Day.
- **Hazards are data on the field** (`src/shared/levels.ts`) and drawn from the same data:
  streams sheep and goats can't cross except at bridges (dogs wade, slowly); mud slows everyone;
  brambles are solid and make sheep shy away, and bolt if they touch; a broken fence lets sheep
  out (lost: they no longer count toward "all in", and cost 75 each).
- **Wind** drifts and gusts per field. A dog upwind of sheep (within range, roughly in line)
  makes them nervous and drift downwind; crouching halves it, lying down stops it. Grass and
  flowers sway with it (a vertex shader), white streaks blow across, the HUD shows an arrow.
- **More goats, more chaos.** Fields can have several goats (different coats). New mischief:
  charging through the flock ("HUP HUP") and raiding a pen to bleat sheep back out. Bleats are
  louder and wider. The goat bonus is per goat.
- **Weather.** Rain dims and cools the light, falls round the camera, and makes sheep bolt at
  nothing twice as often. Storms add lightning: a bolt, a flash, thunder delayed by distance,
  every sheep panics away from the strike (even penned ones, half as hard), every dog cowers for
  1.6 s (slow, low, shivering, "Eek! Lightning!").
- **Sorting.** Black and White: white sheep (team 0) and black sheep (team 1) graze together;
  each colour has its own pen. Bots group by colour and drive each group to its pen.
- **Big fields** (up to 72 by 48 m, 24 sheep) get a minimap in the corner (all fields do).
- **Farm props** on the hills: windmills (sails turn with the wind; one stands in Big Sky), a
  farmhouse with chimney smoke, scarecrow, well, beehives, hay cart, ducks on every pond.
- **Music is synthesized live** (`src/client/music.ts`): six warm lofi tracks (electric piano
  chords, round bass, swung brushed drums, a music-box melody through an echo, vinyl crackle,
  tape wobble). Rain fields get "Rain on the Barn"; otherwise tracks take turns every 16 bars.
  Music on/off is its own button (in the menu on phones); it dips for the NAUGHTY close-up.

## 2026-10-30 (night): first phone play, goat mischief, harder, prettier (Claude Opus 5.5)

- **iPhone movement bug:** iOS hands out negative touch identifiers, and the stick treated
  `id >= 0` as "held", so the knob followed your finger while the dog stood still. Found with an
  on-screen readout (`?diag`) from Kyle's screenshot. Ids are now strings; never compare them to 0.
  Also on the way: touch events (non-passive) instead of pointer events for the stick, a window
  blur no longer drops the stick, portrait plays, solo catches up to real time each frame.
- **Kyle: "goat needs work".** It now picks mischief every 7 to 12 s: strolls into the biggest
  loose group and bleats in it ("hehe"), or stands in a pen's gateway so sheep won't pass
  ("NOPE"), or grazes. Penned, it wanders back out ("bye!") unless a dog lies down by the gate, so
  the goat bonus has to be held to the end. Dogs can drive it: the eye best, walking shoves it,
  sprinting at it moves it more but annoys it (Kyle's original "lunge at it, it stares").
- **Kyle: "a little too easy".** Sheep bolt at nothing now and then (not near a dog lying down),
  follow-the-leader at the gate is weaker and shorter range, lonely sheep pull back less, and
  fields are shorter (100 / 120 / 150 s; versus 150). Bots alone now miss sheep on some seeds.
- **Kyle: more beauty.** Patchy grass, wildflower patches per field (meadow daisies and
  buttercups, orchard clover and poppies with windfall apples, hillside heather and bluebells,
  Field Day poppies and bunting), tall grass along fences and round trees, butterflies, rolling
  hills, hedgerows, a red barn and silo, drifting clouds. All instanced (`src/client/scenery.ts`).

## 2026-10-30 (late): pivot to Come Bye!, a sheepdog herding game (Claude Opus 5.5)

Kyle: the minigames were all basically the same thing; scrap it. New idea (his): you're a dog,
herding sheep and one rascally goat into a pen with your friends, co-op or two teams, points for
speed and accuracy, pick your breed, playable on a phone held sideways.

- **No lunge.** Kyle questioned what it adds; the moves are walk, sprint, crouch (stalk), lie
  down (crouch and hold still) and bark. A nip may come later.
- **Bark is the risky shortcut** (Kyle): sheep run faster from it, but it has a 1.6 s cooldown,
  costs calm-herding points, and annoys the goat. Enough barks near it and it walks over, stares
  you down for 4 s and you get the NAUGHTY close-up (kept from the old game; now it lasts exactly
  as long as you're frozen).
- **The eye and the down are real herding behaviour** (Kyle: "spine curved, able to go down into
  the grass or just STARE"). Crouched and facing sheep within a cone moves them calmly; lying down
  calms everything nearby. Both are drawn on the ground (pale cone, green ring) to teach them.
- **The pack's dogs first:** Border Collie (black and white, brilliant blue eyes), Keeshond,
  Malinois, golden Standard Poodle. Then Golden, Corgi, Husky, Pug. Photo upload stays on the list.
- **Dogs can't enter pens** (gates are shut to dogs). Without it, dogs walking in behind sheep
  shoved them out through the back. The pen is for sheep and the goat.
- **Fences use the position before the move** to decide which side you're on, so a hard shove
  can never push a sheep through a fence. Found when bots squeezed sheep out of the meadow pen.
- **Sheep follow the leaders at the gate.** Once one is in, sheep near the gate want in too.
  Real sheep do this, and without it the last two or three sheep were a slog even for bots.
  Lone sheep head back to the flock; frightened sheep bunch tighter.
- **Versus starts both flocks side by side in the middle** with the goat between, so teams have
  to work past each other. First version (flocks by their own pens) ended in 25 seconds.
  A field ends when both teams are in (each keeps its own time bonus) or on time; 3 fields a match.
- **Lobby practice flock.** The lobby is The Meadow with its sheep out, so you learn the moves
  while you pick your dog. On phones the panel folds away ("Practise").
- **Test hooks:** `AUTOPILOT=1` drives human seats with the bot brain (probe), `__pause()` and
  `__lineup()` in solo builds, `scripts/bench.ts` for bot herding across seeds.
- **Working title Come Bye!** (the herding call for "go round clockwise"). Kyle may rename it.

## 2026-10-30 (night): tasks and skill minigames replace building (Claude Opus 5.5)

Kyle, after playing: recipes like boot + hat + flower = frog throne made no sense to anyone, three
tables per area was too few, nothing stopped theft, and the :( guessing to win felt wrong.

- **A round is 3 tasks in sequence**, each one activity. Everyone sees the activity; only knowers
  see the exact ask. The :( player fakes it and gets **x2** on their points if never caught.
  No guessing to win any more.
- **Six skill minigames on one lane engine:** fishing, fruit picking, baking, candle lighting,
  archery (precision decides the ring) and painting (medium, colour and subject, then a steady
  hand). What you catch has attributes; the ask cares about some of them, so a watcher sees a
  small yellow fish but not whether "small" or "yellow" mattered (Kyle's idea).
- **Scored at the reveal** on closeness to the ask (best try per task). In-round points are a
  flat +5 per catch so they never leak the ask.
- **Five spots per activity**; progress is a personal basket (nothing to steal). The goat spooks
  people mid-minigame and eats from baskets, but leaves painters alone while they choose colours.
- **Server-judged timing:** the server deals each lane and judges the client's reported press time.
- **Painting claims the easel on E**, then the stroke starts when you finish choosing. Found when a
  bot took the easel while a player was picking colours.
- Removed: items, tables, the thing catalog, guessing, last call, last chance.
- Next activity idea from Kyle: a tree you water that grows different fruit depending on what you graft.

## 2026-10-30 (evening): first playtest notes from Kyle (Claude Opus 5.5)

- **:( players only guess the thing; they cannot accuse.** Kyle's call after playing. The board
  shows a :( player the guess list only. Server enforces it; tested.
- **The host can end or abandon a round** from the Esc menu (End the round now / Back to the lobby).
- **People did not know what they could do.** Esc opens How to play; the lobby has a 4-line version;
  role cards now say what to do next; the item E would pick up shows its name above it.
- **The goat gets in the way, and stares at the Pen less.** It walks into a player's path and knocks
  a carried item loose, pulls items off tables, and blocks you (you cannot walk through it). Free
  players get a WHAT ARE YOU DOING close-up (every 35 s at most); the Pen stare is every 70 s at most.
  The close-up fades in over ~1.3 s, the goat has ears and horns, and the words sit on a dark band.
- **Pen minigame: snowball fight.** E throws the way you last walked. Bonk another Pen player (+5),
  knock a crow off the fence (+10, it pops back up), hit the goat (it stares at you next).
- **Items are recognisable.** Each item has its own model (stem and leaf on the apple, ribbed pumpkin,
  teacup with handle and saucer, candle with flame...), 25% bigger.
- **Areas are places.** Pond (water, bank, lily pads, cattails, thistle, rocks, dock), cottage kitchen
  (plank floor, walls, stove, counter, rug), garden (rows, cabbages, sunflowers, picket fence), chapel
  (stone floor, chapel with bell tower, candles everywhere, the well), dirt paths, trees and bushes.
  All primitives, instanced; still a placeholder for an art pass.
- **Bots pick up exactly the item they walked to.** With the goat dropping things beside tables, a bot
  grabbing "whatever is nearest" picked up its giveaway part early. The act-natural test now runs on
  five seeds.
- **Solo mode** (`?solo`, and the single-file build behind the shareable link) runs the real room and
  bots in the browser.

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
