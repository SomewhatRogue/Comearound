// Online rooms end to end, the way the Vercel site plays them: real browsers, each player in its
// own browser profile (separate storage, separate WebRTC stack), joining one host's room.
// Boots everything itself: a VITE_P2P build, the dev server twice (one with our Redis-style
// /api/signal, one with it switched off so matchmaking falls back to PeerJS), and a local
// PeerServer (the same software as the public 0.peerjs.com).
// Usage: npm run test:online   (prints one JSON report; exit code 1 on any failure)
const { execSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT_SIGNAL = 8795, PORT_NOSIGNAL = 8796, PORT_PEER = 9010;
const PEER = `ws://127.0.0.1:${PORT_PEER}/peerjs`;
const timeline = [];
const t0 = Date.now();
const note = (s) => { const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`; timeline.push(line); console.error(line); };
const procs = [];

function serve(port, env) {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['src/server/node-dev.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env }, stdio: 'ignore' });
  procs.push(p);
}
function peerServer() {
  const express = require(path.join(ROOT, 'node_modules/express'));
  const { ExpressPeerServer } = require(path.join(ROOT, 'node_modules/peer'));
  const app = express();
  const server = http.createServer(app);
  app.use('/', ExpressPeerServer(server, { path: '/' }));
  return new Promise((r) => server.listen(PORT_PEER, '127.0.0.1', () => r(server)));
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
    set onmessage(f) { super.onmessage = (e) => { if (!window.__frozen) f(e); }; }
    get onmessage() { return super.onmessage; }
  };
};

(async () => {
  let browser, peer;
  const report = { ok: false, scenarios: {} };
  try {
    execSync('npx vite build', { cwd: ROOT, env: { ...process.env, VITE_P2P: '1' }, stdio: 'ignore' });
    note('built the Vercel (VITE_P2P) client');
    peer = await peerServer();
    serve(PORT_SIGNAL, {});
    serve(PORT_NOSIGNAL, { SIGNAL_OFF: '1' });
    await Promise.all([up(PORT_SIGNAL), up(PORT_NOSIGNAL)]);
    note('servers up');
    // Chromium hides local addresses behind mDNS names, which don't resolve in a container.
    browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
    const errors = [];

    const open = async (port, name, query = '') => {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
      await ctx.addInitScript(FREEZE);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await p.goto(`http://127.0.0.1:${port}/?noturn&lowfx&norender&peer=${encodeURIComponent(PEER)}&name=${name}${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await p.waitForFunction(() => window.__GAME_STATE__?.pub && window.__party, null, { timeout: 60000 });
      return p;
    };
    const state = (p) => p.evaluate(() => window.__party.state);
    const humans = (p) => p.evaluate(() => (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).map((d) => d.look.name).sort().join(','));
    const host = async (port, name) => {
      const p = await open(port, name);
      await p.click('[data-v="friends"]');
      await p.waitForFunction(() => window.__party.state === 'host', null, { timeout: 20000 });
      return { p, code: await p.evaluate(() => new URL(location.href).searchParams.get('room')) };
    };
    const joinByLink = (port, name, code) => open(port, name, `&room=${code}`);
    const joinByCode = async (port, name, code) => {
      const p = await open(port, name);
      await p.click('[data-v="friends"]');
      await p.waitForSelector('#code-input', { timeout: 20000 });
      await p.fill('#code-input', code.toLowerCase());
      await p.press('#code-input', 'Enter');
      return p;
    };
    const asGuest = (p, ms = 40000) => p.waitForFunction(() => window.__party.state === 'guest' && window.__GAME_STATE__.me, null, { timeout: ms });

    // A and B: a host and two friends (one by link, one by typing the code) play one room.
    const passes = [['A: three players, our /api/signal', PORT_SIGNAL], ['B: three players, PeerJS fallback (no Redis)', PORT_NOSIGNAL]].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY));
    for (const [label, port] of passes) {
      const s = {};
      const { p: h, code } = await host(port, 'Kyle');
      const f1 = await joinByLink(port, 'Sam', code);
      const f2 = await joinByCode(port, 'Ava', code);
      await Promise.all([asGuest(f1), asGuest(f2)]);
      await h.waitForFunction(() => window.__party.friends === 2, null, { timeout: 15000 });
      s.hostSees = await humans(h);
      s.friendsSee = [await humans(f1), await humans(f2)];
      // A friend steers; the host's room (the authority) moves their dog.
      const x = () => h.evaluate(() => [...window.__solo_room.dogs.values()].find((d) => d.look.name === 'Ava').x);
      const before = await x();
      // Steer the way a player does: the D key (after leaving the code box).
      // (Key presses go to the tab in front, as for a real player.)
      await f2.bringToFront();
      await f2.evaluate(() => document.activeElement?.blur());
      // The game re-checks "typing in a box?" once a frame; let a frame run first.
      await f2.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await f2.keyboard.down('d');
      await f2.waitForTimeout(450);
      s.hostSeesAvaSteering = await h.evaluate(() => [...window.__solo_room.dogs.values()].find((d) => d.look.name === 'Ava')?.dx);
      await f2.waitForTimeout(450);
      await f2.keyboard.up('d');
      await f2.waitForTimeout(300);
      s.friendMoved = +((await x()) - before).toFixed(2);
      // The host starts the trials; both friends are in the run.
      await h.click('[data-act="start"]');
      await Promise.all([f1, f2].map((f) => f.waitForFunction(() => window.__GAME_STATE__.pub.phase === 'playing', null, { timeout: 30000 })));
      s.friendsInRun = true;
      s.ok = s.hostSees === 'Ava,Kyle,Sam' && s.friendsSee.every((v) => v === 'Ava,Kyle,Sam') && s.friendMoved > 1;
      report.scenarios[label] = s;
      note(`${label}: ${JSON.stringify(s)}`);
      // D (on the second pass): the host closes the tab; one friend takes the room, the other follows.
      if (port === PORT_NOSIGNAL) {
        await h.close({ runBeforeUnload: true });
        await f1.waitForFunction(() => ['host', 'guest'].includes(window.__party.state), null, { timeout: 30000 });
        await f2.waitForFunction(() => ['host', 'guest'].includes(window.__party.state), null, { timeout: 30000 });
        await Promise.all([f1, f2].map((f) => f.waitForFunction(() => (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).length === 2, null, { timeout: 45000 })));
        const d = { states: [await state(f1), await state(f2)].sort(), together: [await humans(f1), await humans(f2)] };
        d.ok = d.states.join() === 'guest,host' && d.together.every((v) => v === 'Ava,Sam');
        report.scenarios['D: host leaves, a friend takes over, the other follows'] = d;
        note(`D: ${JSON.stringify(d)}`);
      }
      await Promise.all([h, f1, f2].map((p) => p.context().close().catch(() => {})));
    }

    if (!process.env.ONLY || process.env.ONLY === 'C')
    // C: the host's phone is away (page frozen) when the friend opens the code, then comes back.
    {
      const { p: h, code } = await host(PORT_NOSIGNAL, 'Kyle');
      await h.evaluate(() => {
        window.__frozen = true;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const f = await joinByLink(PORT_NOSIGNAL, 'Sam', code);
      await f.waitForTimeout(10000);
      const whileAway = await state(f);
      await h.evaluate(() => {
        window.__frozen = false;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const back = Date.now();
      await asGuest(f, 60000);
      const c = { friendWhileHostAway: whileAway, joinedAfterHostCameBackSec: +((Date.now() - back) / 1000).toFixed(1), together: await humans(h) };
      c.ok = whileAway === 'connecting' && c.together === 'Kyle,Sam';
      c.friendNeverHosted = true;
      report.scenarios['C: host away when the friend joins, then comes back'] = c;
      note(`C: ${JSON.stringify(c)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    // E: the host's phone drops its matchmaking connection while away; the friend must wait (not
    // host an empty room), and the host coming back must pick the room up again.
    if (!process.env.ONLY || process.env.ONLY === 'E') {
      const { p: h, code } = await host(PORT_NOSIGNAL, 'Kyle');
      await h.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.__sockets.forEach((w) => w.close());
      });
      const f = await joinByLink(PORT_NOSIGNAL, 'Sam', code);
      await f.waitForTimeout(8000);
      const whileAway = await state(f);
      await h.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const back = Date.now();
      await asGuest(f, 60000);
      const e = { friendWhileHostAway: whileAway, joinedAfterHostCameBackSec: +((Date.now() - back) / 1000).toFixed(1), hostStill: await state(h), together: await humans(h) };
      e.ok = whileAway === 'connecting' && e.hostStill === 'host' && e.together === 'Kyle,Sam';
      report.scenarios['E: host connection dropped while away, friend waits, host comes back'] = e;
      note(`E: ${JSON.stringify(e)}`);
      await Promise.all([h, f].map((p) => p.context().close().catch(() => {})));
    }

    report.errors = errors;
    report.ok = Object.values(report.scenarios).every((s) => s.ok) && !errors.length;
  } catch (e) {
    report.error = String(e && e.message || e);
  } finally {
    report.timeline = timeline;
    console.log(JSON.stringify(report, null, 1));
    await browser?.close().catch(() => {});
    peer?.close();
    procs.forEach((p) => p.kill());
    process.exit(report.ok ? 0 : 1);
  }
})();
