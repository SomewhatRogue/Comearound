// Online stress: a room full of real browsers that keep joining, leaving, crashing, reloading
// and coming back, while games start and end and a relay instance dies now and then. Checks,
// all the way through, that the room holds together:
//   - never two hosts for long (split brain), and never nobody hosting for long;
//   - every page that's open finds its way into the game (host or guest), not stuck waiting;
//   - everyone sees the same game (phase and field) as the host;
//   - no player has two dogs, and nobody watches from the side beside their own empty seat;
//   - no page errors.
// Then everything calms down, and at the end it must all have settled.
// Usage: npm run stress:online   (SEED=n, SECS=n, PLAYERS=n; prints a JSON report; exit 1 on failure)
const { execSync, spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8798, REDIS_PORT = Number(process.env.REDIS_PORT) || 6412;
const SEED = Number(process.env.SEED) || Date.now() % 100000;
const SECS = Number(process.env.SECS) || 240;
const PLAYERS = Number(process.env.PLAYERS) || 6;
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const timeline = [];
const note = (s) => { const line = `${now().toFixed(1)}s ${s}`; timeline.push(line); console.error(line); };
let seed = SEED;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const procs = [];

const FREEZE = () => {
  const W = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = class extends W {
    constructor(...a) { super(...a); window.__sockets.push(this); if (window.__dead) this.__zombie = true; }
    set onmessage(f) { super.onmessage = (e) => { if (!this.__zombie) f(e); }; }
    get onmessage() { return super.onmessage; }
    send(d) { if (!this.__zombie) super.send(d); }
  };
};

const get = (p) => new Promise((r) => http.get(`http://127.0.0.1:${PORT}${p}`, (res) => (res.resume(), r(res.statusCode))).on('error', () => r(0)));

(async () => {
  const report = { ok: false, seed: SEED, secs: SECS, players: PLAYERS, violations: [], counts: {}, errors: [] };
  let browser;
  try {
    execSync('npx vite build', { cwd: ROOT, env: { ...process.env, VITE_ONLINE: '1' }, stdio: 'ignore' });
    const haveRedis = spawnSync('which', ['redis-server']).status === 0;
    if (haveRedis) procs.push(spawn('redis-server', ['--port', String(REDIS_PORT), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' }));
    await new Promise((r) => setTimeout(r, 400));
    const out = process.env.RELAY_LOG ? require('fs').openSync(process.env.RELAY_LOG, 'w') : 'ignore';
    procs.push(spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['src/server/node-dev.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ...(haveRedis ? { REDIS_URL: `redis://127.0.0.1:${REDIS_PORT}` } : {}) }, stdio: ['ignore', out, out] }));
    for (let i = 0; i < 100 && (await get('/')) !== 200; i++) await new Promise((r) => setTimeout(r, 200));
    note(`server up (${haveRedis ? 'Redis' : 'memory'}), seed ${SEED}`);
    browser = await chromium.launch();

    /** Each player: a name, and (when present) a browser profile and page. `state` is what we did to it last. */
    const players = Array.from({ length: PLAYERS }, (_, i) => ({ name: `P${i}`, ctx: null, page: null, state: 'away', since: 0, keep: null }));
    let code = '';
    let calmUntil = 0;
    const count = (k) => (report.counts[k] = (report.counts[k] ?? 0) + 1);

    const open = async (pl, query, keep) => {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 520 } });
      await ctx.addInitScript(FREEZE);
      // Coming back after a crash with what the browser had saved (its storage).
      if (keep) await ctx.addInitScript((kv) => { if (!sessionStorage.getItem('kept')) { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); sessionStorage.setItem('kept', '1'); } }, keep);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => report.errors.push(`${pl.name}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${PORT}/?lowfx&norender&name=${pl.name}${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__GAME_STATE__?.pub && window.__party, null, { timeout: 60000 });
      Object.assign(pl, { ctx, page, state: 'here', since: now() });
    };
    const close = async (pl) => {
      const ctx = pl.ctx;
      Object.assign(pl, { ctx: null, page: null, state: 'away', since: now() });
      await ctx?.close().catch(() => {});
    };
    const here = () => players.filter((p) => p.page && p.state === 'here');
    const look = async (pl) => pl.page.evaluate(() => {
      const g = window.__GAME_STATE__;
      const o = window.__party;
      return { party: o.state, follows: o.guest?.hostId?.slice(0, 8), me: String(o.me ?? '').slice(0, 8), joiner: o.joiner, phase: g.pub?.phase, field: g.pub?.fieldId, you: g.me?.you, dogs: (g.pub?.dogs ?? []).filter((d) => !d.bot).map((d) => ({ id: d.id, name: d.look.name, on: d.connected, spec: d.spectator })) };
    }).catch(() => null);

    // The first host makes the room; everyone else joins by link.
    await open(players[0], '');
    await players[0].page.click('#hubbar [data-v="friends"]');
    await players[0].page.click('[data-act="join"][data-v="friends"]');
    await players[0].page.waitForFunction(() => window.__party.state === 'host', null, { timeout: 20000 });
    code = await players[0].page.evaluate(() => new URL(location.href).searchParams.get('room'));
    for (const pl of players.slice(1, 4)) await open(pl, `&room=${code}`);
    note(`room ${code}: ${here().map((p) => p.name).join(',')}`);

    const actions = {
      // Someone new (or back) opens the link.
      join: async () => {
        const pl = pick(players.filter((p) => p.state === 'away'));
        if (!pl) return false;
        await open(pl, `&room=${code}`);
        return `${pl.name} joins`;
      },
      // Back after a crash: the browser restarts with its storage (half the time) or fresh.
      back: async () => {
        const pl = pick(players.filter((p) => p.state === 'crashed'));
        if (!pl) return false;
        const old = pl.ctx;
        const keep = rnd() < 0.5 ? pl.keep : null;
        await open(pl, `&room=${code}`, keep);
        old?.close().catch(() => {});
        return `${pl.name} back after a crash (${keep ? 'its storage' : 'fresh browser'})`;
      },
      // Closes the tab: a proper goodbye.
      leave: async () => {
        const pl = pick(here());
        if (!pl || here().length < 3) return false;
        await close(pl);
        return `${pl.name} leaves`;
      },
      // A phone crash: the page goes silent both ways, no goodbye, its socket still looks open.
      crash: async () => {
        const pl = pick(here());
        if (!pl || here().length < 3) return false;
        pl.keep = await pl.page.evaluate(() => Object.fromEntries(Object.entries(localStorage))).catch(() => null);
        await pl.page.evaluate(() => { window.__dead = true; for (const s of window.__sockets) s.__zombie = true; }).catch(() => {});
        Object.assign(pl, { state: 'crashed', since: now() });
        return `${pl.name} crashes${(await look(pl))?.party === 'host' ? ' (the host)' : ''}`;
      },
      // A reload (same tab: keeps its token).
      reload: async () => {
        const pl = pick(here());
        if (!pl) return false;
        await pl.page.reload({ waitUntil: 'domcontentloaded' });
        await pl.page.waitForFunction(() => window.__GAME_STATE__?.pub && window.__party, null, { timeout: 60000 });
        pl.since = now();
        return `${pl.name} reloads`;
      },
      // The host starts a run (if everyone's in the hub), or sends everyone back to it.
      game: async () => {
        for (const pl of here()) {
          const l = await look(pl);
          if (l?.party !== 'host') continue;
          if (l.phase === 'lobby') {
            await pl.page.evaluate(() => window.__game_actions__.send({ t: 'start', mode: Math.random() < 0.5 ? 'trials' : 'versus', fillBots: true, course: 'gentle' }));
            return `${pl.name} (host) starts a game`;
          }
          await pl.page.evaluate(() => window.__game_actions__.send({ t: 'toLobby' }));
          return `${pl.name} (host) sends everyone back to the hub`;
        }
        return false;
      },
      // A relay instance dies: its players drop without anyone being told.
      relay: async () => {
        const i = Math.floor(rnd() * 2);
        await get(`/__crash_instance?i=${i}`);
        return `relay instance ${i} crashes`;
      },
    };
    const weights = [['join', 3], ['back', 3], ['leave', 2], ['crash', 3], ['reload', 2], ['game', 2], ['relay', 1]];
    const total = weights.reduce((n, [, w]) => n + w, 0);
    const choose = () => { let r = rnd() * total; for (const [k, w] of weights) if ((r -= w) < 0) return k; return 'join'; };

    // Problems that last: tracked from when they start, reported if they go on too long.
    const open_ = new Map();
    const hold = (key, bad, limit, what) => {
      if (!bad) return open_.delete(key);
      const since = open_.get(key) ?? now();
      open_.set(key, since);
      if (now() - since > limit && now() > calmUntil) {
        report.violations.push(`${now().toFixed(0)}s ${what}`);
        open_.set(key, now() + 1e9);
      }
    };
    const check = async (strict = false) => {
      const ls = [];
      for (const pl of here()) ls.push([pl, await look(pl)]);
      // Someone who left starts afresh when they come back.
      for (const pl of players.filter((p) => !here().includes(p))) for (const k of [...open_.keys()]) if (k.endsWith(`-${pl.name}`)) open_.delete(k);
      const hosts = ls.filter(([, l]) => l?.party === 'host');
      hold('twohosts', hosts.length > 1, strict ? 0 : 8, `two hosts: ${hosts.map(([p]) => p.name).join(',')}`);
      hold('nohost', ls.length > 0 && hosts.length === 0, strict ? 0 : 35, `nobody hosting (${ls.map(([p, l]) => `${p.name}:${l?.party}`).join(' ')})`);
      const h = hosts[0]?.[1];
      for (const [pl, l] of ls) {
        if (!l) continue;
        hold(`stuck-${pl.name}`, !['host', 'guest'].includes(l.party), strict ? 0 : 40, `${pl.name} stuck ${l.party} (me ${l.me}, following ${l.follows ?? 'nobody'}${l.joiner ? ', joiner' : ''}; host is ${h ? `${hosts[0][0].name}/${h.me}` : 'nobody'})`);
        if (!h || l.party !== 'guest') continue;
        hold(`same-${pl.name}`, l.phase !== h.phase || l.field !== h.field, strict ? 0 : 12, `${pl.name} sees ${l.phase}/${l.field}, host ${h.phase}/${h.field}`);
        // Watching from the side while a dog with your name sits empty in the game.
        const mine = h.dogs.find((d) => d.id === l.you);
        const empty = h.dogs.find((d) => d.name === pl.name && d.id !== l.you && !d.spec);
        hold(`side-${pl.name}`, !!mine?.spec && !!empty, strict ? 0 : 25, `${pl.name} watching beside its own seat`);
      }
      if (h) {
        const names = h.dogs.map((d) => d.name);
        const dup = names.filter((n, i) => names.indexOf(n) !== i && here().some((p) => p.name === n));
        hold('dups', dup.length > 0, strict ? 0 : 30, `two dogs for ${[...new Set(dup)].join(',')}`);
      }
      return ls;
    };

    // The storm.
    const end = now() + SECS;
    let nextAct = now() + 4;
    while (now() < end) {
      if (now() >= nextAct) {
        const k = choose();
        const did = await actions[k]().catch((e) => `${k} failed: ${String(e).slice(0, 90)}`);
        if (did) {
          note(did);
          count(k);
        }
        nextAct = now() + 3 + rnd() * 5;
      }
      await check();
      await new Promise((r) => setTimeout(r, 1500));
    }

    // The calm: everyone who crashed comes back, then nothing happens for a while.
    for (const pl of players.filter((p) => p.state === 'crashed')) {
      note(await actions.back());
    }
    calmUntil = now() + 45;
    note('calm: waiting for everything to settle');
    while (now() < calmUntil) await new Promise((r) => setTimeout(r, 2000));
    open_.clear();
    const final = await check(true);
    const hostL = final.find(([, l]) => l?.party === 'host')?.[1];
    report.final = final.map(([p, l]) => `${p.name}:${l?.party}/${l?.phase}/${l?.field}/${l?.you}`);
    report.hostSees = hostL?.dogs.map((d) => `${d.name}${d.on ? '' : '(away)'}${d.spec ? '(watching)' : ''}`);
    // Everyone here is in the host's game, connected.
    const missing = here().filter((p) => !hostL?.dogs.some((d) => d.name === p.name && d.on));
    if (missing.length) report.violations.push(`at the end, not in the host's game: ${missing.map((p) => p.name).join(',')}`);
    report.ok = report.violations.length === 0 && report.errors.length === 0;
  } catch (e) {
    report.error = String(e?.stack ?? e).slice(0, 600);
  } finally {
    report.timeline = timeline;
    console.log(JSON.stringify(report, null, 1));
    await browser?.close().catch(() => {});
    procs.forEach((p) => p.kill());
    process.exit(report.ok ? 0 : 1);
  }
})();
