// Online rooms the Vercel way, on one machine: two separate browser profiles open the same room
// link on a VITE_P2P build served by the dev server (which serves /api/signal from memory).
// Usage: VITE_P2P=1 npx vite build; PORT=8791 tsx src/server/node-dev.ts; node scripts/p2p-probe.cjs [port] [shotsDir]
const { chromium } = require('playwright');
const PORT = process.argv[2] ?? '8791';
const SHOTS = process.argv[3] ?? 'shots';
(async () => {
  // Chromium hides local addresses behind mDNS names, which don't resolve in a container.
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const room = 'P' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const errs = [];
  const open = async (name, q) => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await p.goto(`http://localhost:${PORT}/?${q}name=${name}&lowfx`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    return p;
  };
  // Kyle opens the site (solo), flips the lobby switch to With friends and gets a room link.
  const host = await open('Kyle', '');
  await host.waitForFunction(() => window.__party?.mode === 'solo' && document.querySelector('[data-v="friends"]'), null, { timeout: 30000 });
  await host.screenshot({ path: `${SHOTS}/p2p-lobby-solo.png` });
  await host.click('[data-v="friends"]');
  await host.waitForFunction(() => window.__party?.state === 'host', null, { timeout: 20000 });
  const link = new URL(host.url());
  console.log('room link', link.search);
  const guest = await open('Sam', `room=${link.searchParams.get('room')}&`);
  await guest.waitForFunction(() => window.__party?.state === 'guest', null, { timeout: 30000 });
  await host.waitForFunction(() => window.__party.friends === 1, null, { timeout: 10000 });
  await host.waitForTimeout(600);
  await host.screenshot({ path: `${SHOTS}/p2p-lobby-host.png` });
  await guest.screenshot({ path: `${SHOTS}/p2p-lobby-guest.png` });
  console.log('guest sees', await guest.evaluate(() => window.__GAME_STATE__.pub.dogs.map((d) => d.look.name)));
  const samX = () => host.evaluate(() => [...window.__solo_room.dogs.values()].find((d) => d.look.name === 'Sam')?.x);
  const before = await samX();
  await guest.evaluate(() => window.__game_actions__.send({ t: 'input', dx: 1, dz: 0, sprint: false, crouch: false }));
  await guest.waitForTimeout(1000);
  await guest.evaluate(() => window.__game_actions__.send({ t: 'input', dx: 0, dz: 0, sprint: false, crouch: false }));
  console.log('Sam moved', before, '->', await samX());
  await host.click('[data-act="start"]');
  await guest.waitForFunction(() => window.__GAME_STATE__.pub.phase === 'playing', null, { timeout: 30000 });
  console.log('guest in run', await guest.evaluate(() => render_game_to_text()));
  await guest.screenshot({ path: `${SHOTS}/p2p-guest.png` });
  // The host closes their tab: the guest re-claims the room and hosts it.
  await host.close({ runBeforeUnload: true });
  const t0 = Date.now();
  await guest.waitForFunction(() => window.__party.state === 'host', null, { timeout: 70000 }).catch(async (e) => { console.log('guest state', await guest.evaluate(() => window.__party.state)); throw e; });
  console.log(`took over in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('guest now hosts the room');
  console.log('errors', errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
