// Online rooms end to end, the way the Vercel site plays them: real browsers, each player in its
// own browser profile, all connected to the room relay (api/room.ts). The dev server runs the
// relay as two instances and alternates players between them, like Vercel spreading connections
// across function instances. Two servers: one where the instances share rooms in memory, one
// where they share them through a real Redis (started here), as on Vercel with Marketplace Redis.
// Usage: npm run test:online   (prints one JSON report; exit code 1 on any failure)
//        ONLY=A node scripts/online-test.cjs   (one scenario)
const { execSync, spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT_MEM = 8795, PORT_REDIS = 8796, PORT_CUT = 8797, REDIS_PORT = 6411;
// PORT_CUT: like PORT_REDIS, but every connection is cut after CUT_MS, as Vercel does at a
// function's maximum duration; its pages swap connections every ROTATE_MS (?rotate=).
const CUT_MS = 25000, ROTATE_MS = Number(process.env.ROTATE_MS) || 15000;
const timeline = [];
const t0 = Date.now();
const note = (s) => { const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`; timeline.push(line); console.error(line); };
const procs = [];
const only = (k) => !process.env.ONLY || process.env.ONLY === k;

function serve(port, env) {
  // RELAY_LOG=dir keeps each server's relay log (joins, roles, goodbyes) for debugging.
  const out = process.env.RELAY_LOG ? require('fs').openSync(path.join(process.env.RELAY_LOG, `relay-${port}.log`), 'w') : 'ignore';
  const p = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['src/server/node-dev.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', out, out] });
  procs.push(p);
}
async function up(port) {
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise((r) => http.get(`http://127.0.0.1:${port}/`, (res) => (res.resume(), r(res.statusCode === 200))).on('error', () => r(false)));
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server on ${port} never came up`);
}

// Phones freeze a page in the background: its sockets stay open but nothing handles messages.
const FREEZE = () => {
  const W = window.WebSocket;
  window.__frozen = false;
  window.__sockets = [];
  window.WebSocket = class extends W {
    constructor(...a) { super(...a); window.__sockets.push(this); }
    // __zombie: this socket looks open but is dead both ways (a phone back from the background).
    set onmessage(f) { super.onmessage = (e) => { if (!window.__frozen && !this.__zombie) f(e); }; }
    get onmessage() { return super.onmessage; }
    send(d) { if (!this.__zombie) super.send(d); }
  };
};

(async () => {
  let browser;
  const report = { ok: false, scenarios: {}, errors: [] };
  try {
    execSync('npx vite build', { cwd: ROOT, env: { ...process.env, VITE_ONLINE: '1' }, stdio: 'ignore' });
    note('built the Vercel (VITE_ONLINE) client');
    const haveRedis = spawnSync('which', ['redis-server']).status === 0;
    if (haveRedis) procs.push(spawn('redis-server', ['--port', String(REDIS_PORT), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' }));
    await new Promise((r) => setTimeout(r, 400));
    serve(PORT_MEM, {});
    if (haveRedis) serve(PORT_REDIS, { REDIS_URL: `redis://127.0.0.1:${REDIS_PORT}` });
    if (haveRedis && only('V')) serve(PORT_CUT, { REDIS_URL: `redis://127.0.0.1:${REDIS_PORT}`, RELAY_MAX_MS: String(CUT_MS) });
    await Promise.all([up(PORT_MEM), haveRedis ? up(PORT_REDIS) : null, haveRedis && only('V') ? up(PORT_CUT) : null]);
    note(`servers up${haveRedis ? ' (with Redis)' : ' (no redis-server: Redis scenario skipped)'}`);
    browser = await chromium.launch();
    const errors = report.errors;

    const open = async (port, name, query = '') => {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
      await ctx.addInitScript(FREEZE);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await p.goto(`http://127.0.0.1:${port}/?lowfx&norender&name=${name}${port === PORT_CUT ? `&rotate=${ROTATE_MS}` : ''}${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await p.waitForFunction(() => window.__GAME_STATE__?.pub && window.__party, null, { timeout: 60000 });
      return p;
    };
    const state = (p) => p.evaluate(() => window.__party.state);
    const humans = (p) => p.evaluate(() => (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).map((d) => d.look.name).sort().join(','));
    const host = async (port, name) => {
      const p = await open(port, name);
      await p.click('#hubbar [data-v="friends"]');
      await p.click('[data-act="join"][data-v="friends"]');
      await p.waitForFunction(() => window.__party.state === 'host', null, { timeout: 20000 });
      return { p, code: await p.evaluate(() => new URL(location.href).searchParams.get('room')) };
    };
    const joinByLink = (port, name, code) => open(port, name, `&room=${code}`);
    const joinByCode = async (port, name, code) => {
      const p = await open(port, name);
      await p.click('#hubbar [data-v="friends"]');
      await p.click('[data-act="join"][data-v="friends"]');
      await p.waitForSelector('#code-input', { timeout: 20000 });
      await p.fill('#code-input', code.toLowerCase());
      await p.press('#code-input', 'Enter');
      return p;
    };
    const asGuest = (p, ms = 40000) => p.waitForFunction(() => window.__party.state === 'guest' && window.__GAME_STATE__.me, null, { timeout: ms });
    // The host's view catches up a moment after the friend's: wait for it before reading who's in.
    const hostHas = (h, n) => h.waitForFunction((k) => window.__party.friends === k && (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).length === k + 1, n, { timeout: 15000 }).catch(() => {});
    const steer = async (h, f, name) => {
      const x = () => h.evaluate((n) => [...window.__solo_room.dogs.values()].find((d) => d.look.name === n).x, name);
      const before = await x();
      await f.bringToFront();
      await f.evaluate(() => document.activeElement?.blur());
      await f.keyboard.down('d');
      await f.waitForTimeout(900);
      await f.keyboard.up('d');
      await f.waitForTimeout(300);
      return +((await x()) - before).toFixed(2);
    };

    // A and B: a host and two friends (one by link, one by typing the code) play one room.
    const passes = [['A', 'three players, instances share rooms in memory', PORT_MEM], ['B', 'three players, instances share rooms through real Redis', PORT_REDIS]].filter(([k]) => only(k) && (k !== 'B' || haveRedis));
    for (const [k, label, port] of passes) {
      const s = {};
      const { p: h, code } = await host(port, 'Kyle');
      const f1 = await joinByLink(port, 'Sam', code);
      const f2 = await joinByCode(port, 'Ava', code);
      await Promise.all([asGuest(f1), asGuest(f2)]);
      await h.waitForFunction(() => window.__party.friends === 2, null, { timeout: 15000 });
      await hostHas(h, 2);
      s.hostSees = await humans(h);
      s.friendsSee = [await humans(f1), await humans(f2)];
      s.friendMoved = await steer(h, f2, 'Ava');
      // A pat from a friend reaches the host's room (and everyone sees it).
      const kyleId = await h.evaluate(() => window.__GAME_STATE__.me.you);
      await f1.evaluate((id) => window.__game_actions__.send({ t: 'pet', id }), kyleId);
      s.patSeen = await f2.waitForFunction((id) => window.__GAME_STATE__.pub.dogs.find((d) => d.id === id)?.pets === 1, kyleId, { timeout: 8000 }).then(() => true).catch(() => false);
      await h.click('#hubbar [data-v="play"]');
      await h.click('[data-act="start"]');
      await Promise.all([f1, f2].map((f) => f.waitForFunction(() => window.__GAME_STATE__.pub.phase === 'playing', null, { timeout: 30000 })));
      s.friendsInRun = true;
      s.ok = s.hostSees === 'Ava,Kyle,Sam' && s.friendsSee.every((v) => v === 'Ava,Kyle,Sam') && s.friendMoved > 1 && s.patSeen;
      report.scenarios[`${k}: ${label}`] = s;
      note(`${k}: ${JSON.stringify(s)}`);
      if (k === 'A') {
        // D: the host closes the tab mid-run; one friend takes the room over, the other follows.
        await h.close({ runBeforeUnload: true });
        await Promise.all([f1, f2].map((f) => f.waitForFunction(() => ['host', 'guest'].includes(window.__party.state) && (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).length === 2, null, { timeout: 45000 })));
        const d = { states: [await state(f1), await state(f2)].sort(), together: [await humans(f1), await humans(f2)] };
        d.ok = d.states.join() === 'guest,host' && d.together.every((v) => v === 'Ava,Sam');
        report.scenarios['D: host leaves, a friend takes over, the other follows'] = d;
        note(`D: ${JSON.stringify(d)}`);
      }
      await Promise.all([h, f1, f2].map((p) => p.context().close().catch(() => {})));
    }

    // C: the host's page is frozen (phone in the background) when the friend joins, then comes back.
    if (only('C')) {
      const { p: h, code } = await host(PORT_MEM, 'Kyle');
      await h.evaluate(() => (window.__frozen = true));
      const f = await joinByLink(PORT_MEM, 'Sam', code);
      await f.waitForTimeout(6000);
      const whileAway = await state(f);
      await h.evaluate(() => (window.__frozen = false));
      const back = Date.now();
      await asGuest(f, 30000);
      await hostHas(h, 1);
      const c = { friendWhileHostAway: whileAway, joinedAfterHostCameBackSec: +((Date.now() - back) / 1000).toFixed(1), together: await humans(h) };
      c.ok = ['connecting', 'waiting'].includes(whileAway) && c.together === 'Kyle,Sam';
      report.scenarios['C: host frozen when the friend joins, then back'] = c;
      note(`C: ${JSON.stringify(c)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    // E: the host's connection drops (phone in the background); it reconnects by itself and the friend gets in.
    if (only('E')) {
      const { p: h, code } = await host(PORT_MEM, 'Kyle');
      await h.evaluate(() => window.__sockets.forEach((w) => w.close()));
      const f = await joinByLink(PORT_MEM, 'Sam', code);
      await asGuest(f, 30000);
      await hostHas(h, 1);
      const e = { hostState: await state(h), together: await humans(h) };
      e.ok = e.hostState === 'host' && e.together === 'Kyle,Sam';
      report.scenarios['E: host connection dropped, reconnects, friend joins'] = e;
      note(`E: ${JSON.stringify(e)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    // G: the host's phone comes back holding a dead socket (looks open, nothing gets through). The
    // friend opens the code meanwhile; the host's heartbeat notices, it reconnects, the friend gets in.
    if (only('G')) {
      const { p: h, code } = await host(PORT_MEM, 'Kyle');
      await h.evaluate(() => window.__sockets.forEach((w) => (w.__zombie = true)));
      const f = await joinByLink(PORT_MEM, 'Sam', code);
      const t = Date.now();
      await asGuest(f, 40000);
      await h.waitForFunction(() => window.__party.state === 'host' && window.__party.friends === 1, null, { timeout: 25000 }).catch(() => {});
      await hostHas(h, 1);
      const g = { joinedAfterSec: +((Date.now() - t) / 1000).toFixed(1), hostState: await state(h), together: await humans(h) };
      g.debug = { hostDogs: await h.evaluate(() => [...window.__solo_room.dogs.values()].map((d) => `${d.look.name}:${d.connected ? 'on' : 'off'}:${d.bot ? 'bot' : ''}`).join(' ')), friends: await h.evaluate(() => window.__party.friends), hostSockets: await h.evaluate(() => window.__sockets.map((w) => w.readyState + (w.__zombie ? 'z' : '')).join(',')), samSockets: await f.evaluate(() => window.__sockets.map((w) => w.readyState).join(',')), samState: await state(f), samSees: await humans(f) };
      g.ok = g.hostState === 'host' && g.together === 'Kyle,Sam';
      report.scenarios['G: host holding a dead socket, heartbeat reconnects it, friend joins'] = g;
      note(`G: ${JSON.stringify(g)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    // R: mid-run, the friend's phone crashes: its page stops dead (JavaScript paused) but its
    // connection still looks open. She opens the link again in a fresh browser (a new token, the
    // same dog name) and should be back in the run in her own seat, not watching from the side.
    if (only('R')) {
      const { p: h, code } = await host(PORT_MEM, 'Kyle');
      const f = await joinByLink(PORT_MEM, 'Sam', code);
      await asGuest(f);
      await hostHas(h, 1);
      await h.click('#hubbar [data-v="play"]');
      await h.click('[data-act="start"]');
      await f.waitForFunction(() => window.__GAME_STATE__.pub.phase === 'playing', null, { timeout: 30000 });
      const seat = await f.evaluate(() => window.__GAME_STATE__.me.you);
      const cdp = await f.context().newCDPSession(f);
      await cdp.send('Debugger.enable');
      await cdp.send('Debugger.pause');
      const t0 = Date.now();
      const f2 = await joinByLink(PORT_MEM, 'Sam', code);
      const back = await f2.waitForFunction(() => {
        const g = window.__GAME_STATE__;
        const d = g.me && g.pub?.dogs.find((q) => q.id === g.me.you);
        return window.__party.state === 'guest' && g.pub?.phase === 'playing' && d && !d.spectator;
      }, null, { timeout: 30000 }).then(() => true).catch(() => false);
      const r = {
        backInRunSec: +((Date.now() - t0) / 1000).toFixed(1),
        back,
        sameSeat: (await f2.evaluate(() => window.__GAME_STATE__.me?.you)) === seat,
        humans: await h.evaluate(() => window.__GAME_STATE__.pub.dogs.filter((d) => !d.bot).map((d) => d.look.name).sort().join(',')),
      };
      r.ok = r.back && r.sameSeat && r.humans === 'Kyle,Sam';
      report.scenarios['R: a friend crashes mid-run, comes back in a fresh browser, gets her seat back'] = r;
      note(`R: ${JSON.stringify(r)}`);
      await cdp.send('Debugger.resume').catch(() => {});
      await Promise.all([h, f, f2].map((p) => p.context().close().catch(() => {})));
    }

    // H: the host makes a room and waits a while (texting the code) before the friend types it in.
    // The host is alone the whole time, sending only heartbeats; the friend must join it, not be
    // told there's no host (which once made friends host instead, the wrong way round).
    if (only('H')) {
      const { p: h, code } = await host(PORT_MEM, 'Kyle');
      await h.waitForTimeout(20000);
      const f = await joinByCode(PORT_MEM, 'Sam', code);
      await asGuest(f, 20000).catch(() => {});
      await hostHas(h, 1);
      const g = { friendState: await state(f), hostState: await state(h), together: await humans(h) };
      g.ok = g.friendState === 'guest' && g.hostState === 'host' && g.together === 'Kyle,Sam';
      report.scenarios['H: host alone for 20 s, then the friend types the code'] = g;
      note(`H: ${JSON.stringify(g)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    // V: a versus match, host and friend, played for a minute, on a relay that cuts every
    // connection after 25 s (Vercel's maximum duration, scaled down): nobody should lose the host.
    if (only('V') && haveRedis) {
      const { p: h, code } = await host(PORT_CUT, 'Kyle');
      const f = await joinByCode(PORT_CUT, 'Sam', code);
      await asGuest(f);
      await hostHas(h, 1);
      await h.click('#hubbar [data-v="play"]');
      await h.click('[data-act="tab"][data-v="versus"]');
      await h.click('[data-act="start"]');
      // The host's own game starts at once (it runs the room): if not, the click went astray.
      await h.waitForFunction(() => window.__GAME_STATE__.pub.phase !== 'lobby', null, { timeout: 5000 }).catch(() => { throw new Error('V: the host pressed Start but its own game did not start'); });
      await f.waitForFunction(() => window.__GAME_STATE__.pub.phase === 'playing' && window.__GAME_STATE__.pub.mode === 'versus', null, { timeout: 30000 });
      const v = { states: [], toasts: [] };
      await f.evaluate(() => { window.__toasts = []; new MutationObserver(() => document.querySelectorAll('.toast').forEach((t) => window.__toasts.includes(t.textContent) || window.__toasts.push(t.textContent))).observe(document.body, { childList: true, subtree: true }); });
      for (let i = 0; i < 12; i++) {
        await f.keyboard.down(i % 2 ? 'a' : 'w');
        await f.waitForTimeout(5000);
        await f.keyboard.up(i % 2 ? 'a' : 'w');
        v.states.push(`${await state(h)}/${await state(f)}/${await f.evaluate(() => window.__GAME_STATE__.pub.phase)}`);
      }
      v.toasts = await f.evaluate(() => window.__toasts);
      v.ok = v.states.every((s) => s.startsWith('host/guest/')) && !v.toasts.some((t) => /host left/i.test(t));
      report.scenarios['V: a versus match for a minute, connections cut every 25 s, keeps its host'] = v;
      note(`V: ${JSON.stringify(v)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    // F: the friend opens the code while the host's game is closed; they wait (never host it);
    // the host opens their own link again (same device, new tab) and the friend joins.
    if (only('F')) {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
      const hp = await ctx.newPage();
      await hp.goto(`http://127.0.0.1:${PORT_MEM}/?lowfx&norender&name=Kyle`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await hp.waitForFunction(() => window.__party, null, { timeout: 60000 });
      await hp.click('#hubbar [data-v="friends"]');
      await hp.click('[data-act="join"][data-v="friends"]');
      await hp.waitForFunction(() => window.__party.state === 'host', null, { timeout: 20000 });
      const code = await hp.evaluate(() => new URL(location.href).searchParams.get('room'));
      await hp.close({ runBeforeUnload: true });
      const f = await joinByLink(PORT_MEM, 'Sam', code);
      await f.waitForTimeout(3000);
      const friendFirst = await state(f);
      const hp2 = await ctx.newPage();
      await hp2.goto(`http://127.0.0.1:${PORT_MEM}/?lowfx&norender&name=Kyle&room=${code}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await hp2.waitForFunction(() => window.__party?.state === 'host', null, { timeout: 20000 });
      await asGuest(f, 30000);
      await hostHas(hp2, 1);
      const fr = { friendBeforeHost: friendFirst, together: await humans(hp2) };
      fr.ok = friendFirst === 'waiting' && fr.together === 'Kyle,Sam';
      report.scenarios['F: friend waits for a closed host, host reopens their link'] = fr;
      note(`F: ${JSON.stringify(fr)}`);
      await Promise.all([ctx, f.context()].map((c) => c.close().catch(() => {})));
    }

    report.ok = Object.keys(report.scenarios).length > 0 && Object.values(report.scenarios).every((s) => s.ok) && !errors.length;
  } catch (e) {
    report.error = String(e && e.message || e);
  } finally {
    report.timeline = timeline;
    console.log(JSON.stringify(report, null, 1));
    await browser?.close().catch(() => {});
    procs.forEach((p) => p.kill());
    process.exit(report.ok ? 0 : 1);
  }
})();
