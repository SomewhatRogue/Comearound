# Research: how to build it (2026-10-30)

Four research threads, condensed to what we will actually do. Sources at the end of each section.

## 1. Look and feel

- **Lighting:** standard lit flat colours on KayKit/Kenney art (their gradient atlas already reads
  as toon). One hemisphere light (warm sky, green ground) plus one shadowed directional light,
  shadow camera fitted to the village, 1024 map on desktop, 512 on mobile. Blob shadows for small props.
- **Outlines:** inverted-hull outlines on characters and held items only. It also makes "who is
  carrying what" readable across the map. No outlines on the environment.
- **Tonemapping:** NeutralToneMapping (AgX desaturates bright palettes). Exponential fog to the
  dusk sky. Optional later: N8AO ambient occlusion at half res, soft bloom on the moon and pickups.
- **Camera:** narrow-FOV perspective (about 30 degrees), pitched about 50 degrees, following the
  player. No tilt-shift (it blurs distant players we need to read).
- **Characters:** KayKit Adventurers + the free KayKit Character Animations pack share one rig.
  Clone with SkeletonUtils, toggle accessory meshes with `.visible`, parent hats to the head bone,
  tint by cloning the material per player.
- **Juice:** three.quarks for coin bursts and confetti, GSAP (now fully free) for squash and
  stretch, DOM number pops projected from world positions, Howler with pitch stepped by
  semitones for climbing chimes. HUD is a DOM overlay with Discord safe-area variables.
- **Performance:** about 100 draw calls and 100k vertices on mobile; cap pixel ratio at 2
  (1 to 1.5 on phones); instance repeated props; `gltf-transform optimize` (meshopt) and KTX2.
- **Reference:** Messenger by abeto (messenger.abeto.co) is the closest match to the tone.

Sources: kaylousberg.itch.io/kaykit-adventurers, kaylousberg.itch.io/kaykit-character-animations,
github.com/Alchemist0823/three.quarks, github.com/N8python/n8ao, github.com/OmarShehata/webgl-outlines,
threejs.org/docs/pages/OutlineEffect.html, gltf-transform.dev/cli, messenger.abeto.co,
awwwards.com/brunos-portfolio-case-study.html, docs.discord.com/developers/activities/development-guides/mobile

## 2. Test loops

- **Four layers, cheapest first:** pure rules in Node vitest (ms), the room Durable Object in
  `@cloudflare/vitest-plugin` (seconds; renamed from vitest-pool-workers in Aug 2026), a Node bot
  swarm against one server (seconds), Playwright with 2 to 4 real browsers (tens of seconds).
- **Controllable server time:** a test-only time scale (we have `TIMESCALE`) plus seeded RNG so a
  full round runs in seconds and replays exactly.
- **Assert on text, not pixels:** `window.__GAME_STATE__` and `render_game_to_text()`; poll with
  `waitForFunction`. Screenshots are for the agent to look at.
- **WebGL headless:** pass SwiftShader flags explicitly; Mesa llvmpipe under Xvfb is about 4x faster.
- **Bad networks:** Playwright `page.routeWebSocket` per player for latency, drops and forced
  disconnects; Toxiproxy for process-wide latency and resets.
- **CI:** GitHub Actions: vitest jobs in parallel, then the browser job; upload screenshots.

Sources: developers.cloudflare.com/workers/testing/vitest-integration/,
developers.cloudflare.com/changelog/post/2026-08-19-vitest-plugin/, playwright.dev/docs/api/class-websocketroute,
playwright.dev/docs/clock, github.com/Shopify/toxiproxy, microlink.io/blog/webgl-without-a-gpu

## 3. Making sure people can connect

- **One Worker for everything:** static client via Workers static assets (free, unlimited) and
  `/parties/*` to the Durable Objects, `run_worker_first` so SPA fallback never eats the socket.
- **Fresh room id each session:** a Durable Object is placed near its first request and never
  moves. Create rooms through a create call and reject codes that were never created.
- **Reconnect:** token in storage, seat held after close, kick the older socket on a duplicate,
  reconnect on `visibilitychange`, force a reconnect when snapshots stop (dead sockets after sleep).
  Tune partysocket: fast first retry, no queue of stale inputs. (All done in slice 1.)
- **The 20 Hz loop** runs on `setInterval` only while a match is live; empty rooms hibernate.
- **Hostile networks:** wss on 443 passes most proxies. Detect "never opened after 8 s" and tell
  the player their network blocks realtime games. A custom domain filters better than workers.dev.
- **Discord Activity:** everything goes through Discord's proxy; WebSockets yes, WebRTC no. Map
  `/` and `/api` in the Developer Portal; use `discordSdk.instanceId` as the room id.
- **Cost:** the free plan is about 2 to 3 hours a day of a 12-player game at 20 Hz input (incoming
  messages bill at 1/20 of a request), and a hit limit fails mid-match. Workers Paid at $5/month
  removes that worry for a friends game.

Sources: developers.cloudflare.com/durable-objects/best-practices/websockets/,
developers.cloudflare.com/durable-objects/platform/pricing/, developers.cloudflare.com/durable-objects/reference/data-location/,
developers.cloudflare.com/workers/static-assets/, raw.githubusercontent.com/cloudflare/partykit/main/packages/partyserver/README.md,
docs.discord.com/developers/activities/development-guides/networking, docs.discord.com/developers/activities/development-guides/multiplayer-experience

## 4. Logins and saved progress

- **Guest first, Discord second.** First visit creates a guest player and a random session token
  (store only its hash). A "save progress" button links Discord. Inside a Discord Activity the
  player is already identified. Email magic links only if non-Discord friends ask.
- **Library:** a small Lucia-style session layer we write ourselves for v1 (Lucia the package is
  deprecated; its site is now a recipe book). Better Auth if we later want magic links or passkeys.
- **Storage:** D1 is the source of truth (players, identities, sessions, unlocks, matches,
  match_results). Each room writes once, in one batch keyed by match id, at round end. No KV for
  profiles.
- **Anti-cheat:** points computed only in the room; unlocks derived on the server; equip requests
  checked against owned unlocks; award points only for rounds with enough players and time; rate
  limit guest creation.
- **Privacy:** request only Discord's `identify` scope; no email, birthdate or trackers; a delete-
  my-data button; purge idle guests after about 90 days. Expect minors via Discord; avoid free-text chat.

Sources: better-auth.com/docs/plugins/anonymous, lucia-auth.com, github.com/discord/embedded-app-sdk,
docs.discord.com/developers/activities/how-activities-work, developers.cloudflare.com/d1/platform/pricing/,
developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/,
ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
