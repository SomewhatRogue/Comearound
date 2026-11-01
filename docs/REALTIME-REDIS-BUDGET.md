# Realtime on Vercel + Upstash Redis: spending few commands without adding lag

A portable guide for any project that does what Come Bye! does: players hold WebSockets to a
Vercel Function, any function instance may hold any player, and instances share rooms through
Redis (one pub/sub channel per room, a few keys for who's where). Written Oct 31 2026 from Come
Bye!'s relay (`api/_relay.ts`), its tests (`tests/relay.test.ts`) and live playtests.

## 1. The budget

- **Upstash Redis free plan: 500K commands a month**, 250 MB data, 10 GB bandwidth. Over the limit,
  commands fail ("max requests limit exceeded") until the month resets. No charge: billing only
  starts if a card is entered (pay-as-you-go, $0.20 per 100K commands; set a monthly budget there
  and it rate-limits instead of billing more).
- **Vercel Hobby:** over its included usage the project pauses, no charge. WebSocket functions bill
  provisioned memory while open (360 GB-hrs included) and active CPU (4 CPU-hrs). A relay mostly
  waits, so it's rarely the limit. Hobby caps a function at 300 s: rotate sockets before that.
- 500K a month is ~16K a day, **~700 an hour if spread evenly.** That's tiny next to a game's
  message rate, so the design has to keep most messages away from Redis entirely.

## 2. Count before you build

Every Redis call is a command: PUBLISH, SET, GET, EXPIRE, DEL, SUBSCRIBE. Assume each message a
subscriber receives may count as well (Upstash's docs don't say; plan as if it does).

Come Bye! before the fix, 5 players in one room:

| Source | Rate | Commands an hour |
|---|---|---|
| Host snapshots, PUBLISH each | 15 a second | 54,000 |
| Guest inputs, PUBLISH each (4 guests, ~5 changes a second while moving) | ~20 a second | 72,000 |
| Host claim refresh (SET + EXPIRE every 2 s) | 1 a second | 3,600 |
| Deliveries to the other instance (if they count) | same as publishes | up to 126,000 |
| **Total** | | **~130K to 250K** |

So the whole month went in **2 to 4 hours of play**. After the fix, with everyone on one
instance (the usual case): **~5K an hour**, about 100 hours of play a month.

Rule: for anything that runs per message or per tick, write down commands per second × players ×
hours a month before shipping it.

## 3. Techniques, by payoff (and what each costs in latency)

### a. Deliver locally first; Redis only carries what must cross instances (latency: lower)
Each instance delivers a message to its own sockets straight away, then publishes for the others,
tagging it with its own origin id so its echo is skipped. Players on the same instance never wait on
Redis at all.

### b. Publish only while another instance is listening (latency: none in steady state)
Most rooms live on one instance (Fluid compute reuses warm instances). PUBLISH's reply is the
number of subscribers that got the message, and the sender is subscribed itself, so **a reply of 1
means nobody else is here**. Then:

- stop publishing that room's ordinary messages, but **let one through every 2 s** (a probe), so a
  newcomer elsewhere is found;
- **anything received from another instance opens the room again at once**, and keeps it open for
  10 s regardless of PUBLISH counts (covers a count that under-reports);
- **joins, leaves and "I'm the host now" always go out** (rare and important);
- **fail open:** a reply of 0 or an error can't be right (we're subscribed), so keep publishing.

```ts
private alone = new Map<string, number>();      // room -> when PUBLISH said only we heard it
private elsewhere = new Map<string, number>();  // room -> when we last heard another instance

private async send(room: string, env: Envelope) {
  this.deliver(room, env);                        // our own sockets, now
  const now = Date.now();
  const at = this.alone.get(room);
  const quiet = now - (this.elsewhere.get(room) ?? 0) > 10_000;
  if (env.k === 'msg' && quiet && at !== undefined && now - at < 2000) return;
  const heard = await bus.publish(chan(room), JSON.stringify(env)); // node-redis returns the count
  if (heard === 1) this.alone.set(room, now); else this.alone.delete(room);
}
private fromBus(room: string, raw: string) {
  const env = JSON.parse(raw);
  if (env.o === this.origin) return;               // our own echo
  this.alone.delete(room);
  this.elsewhere.set(room, Date.now());
  this.deliver(room, env);
}
```

This is only safe when the protocol tolerates a message lost while the room was thought empty:
- state messages are **full state** (a snapshot, the current input), so the next one repairs it;
- anything that must arrive (a "hello, I'm joining") is **repeated until answered**;
- the newcomer **speaks first** (its hello goes out because its instance hears the host's traffic,
  or because the probe found it), so the room opens before the reply is sent.

Test it both ways (see `tests/relay.test.ts`, "the relay spares Redis"): a few seconds of play on
one instance must publish only a handful of times, and a friend joining on a second instance must
still get the hello through, a direct reply, and every following message.

### c. Never send heartbeats through Redis (latency: none)
Answer application pings at the instance (`{ping:1}` gets `{t:'pong'}` straight back). Liveness
between players comes from the messages they already send.

### d. Throttle liveness writes (latency: none)
Refresh a claim at most every 2 s per room, not per message. Better still: one `SET key val EX ttl`
that carries both the claim and the last-seen time, rather than SET + EXPIRE (halves that line).

### e. Send less to begin with (latency: none, or better)
- Inputs: send only when they change, plus a slow keepalive (Come Bye!: every 3 s).
- Snapshots: ~15 a second with client interpolation feels smooth; 60 a second is 4× the cost for
  little gain. A compact wire format also saves bandwidth (Upstash's 10 GB a month counts payload).

### f. Put the function region next to the Redis region (latency: lower)
Every PUBLISH that does go out is a round trip. Same region is ~1 ms; across the US ~70 ms.
Pick the Upstash region to match the Vercel Functions region (Vercel's default is `iad1`, US East).

### g. Watch the meter
- Log a per-instance command counter every few minutes (one line, so it shows in runtime logs).
- The Upstash console shows commands per day; check it after a playtest.
- If commands start failing with a limit error, degrade: keep delivering locally, log it once, and
  tell players on other instances the room can't reach them, rather than hanging.

## 4. Things that save commands but cost latency (avoid for realtime)

- **Polling** Redis lists or keys as mailboxes: commands on every poll, plus up to one poll
  interval of delay. Pub/sub pushes.
- **Batching** several messages into one publish: saves commands only by waiting.
- **Dropping the snapshot rate** below ~10 a second: players feel it.
- **Sticky routing** isn't available on Vercel Functions; don't build on it. Measure how often
  rooms split across instances instead (log the instance id on join).

## 5. Pitfalls we hit

- **An unhandled promise rejection kills the instance and every player on it.** Redis drops its
  connection now and then; any fire-and-forget command must be wrapped (`safe(p)` logs and
  swallows), and keep a last-resort `process.on('unhandledRejection')` in the function.
- **Liveness is proven by messages, never by connecting.** A crashed page whose timers still ran
  kept reconnecting every 10 s and never sent anything. Each reconnect refreshed its host claim,
  so nobody else could take the room. A host coming back to a claim it already holds must not
  refresh it until it actually sends something. And on a goodbye, don't delete the claim (the next
  connect would then be a fresh claim): clear its last-seen time instead, so it's takeable at once
  but only messages win it back. A brand-new claim gets only a short grace (1.5 s) before its
  holder must speak, and the client pings the moment it's told it holds the room. (All three found
  by the stress test, with several dead pages reconnecting in turn.)
- **A socket that says open can be dead** (iOS after backgrounding). Heartbeat both ways and
  reconnect on silence.
- **Only a player's newest connection may say goodbye**, or a late close from an old socket
  undoes a reconnect. Keep the newest connection id in a key.
- **Rotate sockets before the function's maximum duration** (Hobby 300 s): open the new one first,
  then close the old.
- **Dead subscribers inflate PUBLISH counts** until their connection closes. That only makes the
  gate in 3b publish more than needed (safe direction).

## 6. Checklist for a new project with this setup

1. Same region for Functions and Redis.
2. Local delivery first, origin-tagged publishes, echoes skipped.
3. Gate publishes on PUBLISH's count (3b), fail open, probes, always publish joins and leaves.
4. Full-state messages, and repeat-until-answered for anything that must arrive.
5. Pings answered at the edge; claim refresh throttled to ~2 s; one SET with EX.
6. `safe()` around every un-awaited Redis call, plus an `unhandledRejection` handler.
7. A test that counts publishes for a one-instance room, and one that splits players across two
   instances (memory backend and real `redis-server`).
8. A log line with the instance id per join and a command counter, then read the logs after the
   first real session.
