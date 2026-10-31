const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = [];
  for (const p of [host, guest]) p.on('pageerror', (e) => errs.push(e.message));
  await host.goto('http://localhost:8787/?solo&fakeroom&name=Kyle&lowfx');
  await guest.goto('http://localhost:8787/?solo&fakeroom&name=Sam&lowfx');
  const wait = async (p, fn, arg, ms = 20000) => { await p.waitForFunction(fn, arg, { timeout: ms }); };
  await wait(guest, () => window.__party?.games.length > 0);
  console.log('guest sees', await guest.evaluate(() => window.__party.games.map((g) => g.name)));
  await guest.click('[data-act="join"]');
  await wait(host, () => window.__party.guestCount === 1);
  await wait(guest, () => window.__GAME_STATE__.me && window.__GAME_STATE__.pub.dogs.length === 2);
  console.log('guest view dogs', await guest.evaluate(() => window.__GAME_STATE__.pub.dogs.map((d) => d.look.name)), 'me', await guest.evaluate(() => window.__GAME_STATE__.me));
  // Guest moves right for a second: host's room should move Sam.
  const before = await host.evaluate(() => [...window.__solo_room.dogs.values()].find((d) => d.look.name === 'Sam').x);
  await guest.evaluate(() => window.__game_actions__.send({ t: 'input', dx: 1, dz: 0, sprint: false, crouch: false }));
  await guest.waitForTimeout(1000);
  await guest.evaluate(() => window.__game_actions__.send({ t: 'input', dx: 0, dz: 0, sprint: false, crouch: false }));
  await guest.evaluate(() => window.__game_actions__.send({ t: 'bark' }));
  await guest.waitForTimeout(400);
  const after = await host.evaluate(() => { const d = [...window.__solo_room.dogs.values()].find((d) => d.look.name === 'Sam'); return [d.x, d.barks]; });
  console.log('Sam moved', before, '->', after);
  // Host starts the gentle trials; guest should see the run.
  await host.click('[data-v="gentle"]');
  await host.click('[data-act="start"]');
  await wait(guest, () => window.__GAME_STATE__.pub.phase === 'playing', null, 30000);
  const gs = await guest.evaluate(() => JSON.parse(render_game_to_text()));
  console.log('guest in run', gs);
  await guest.screenshot({ path: '/tmp/claude-0/-home-claude/69262ac1-5e4d-5df8-a1a0-141d78a0da98/scratchpad/coop-guest.png' });
  await host.screenshot({ path: '/tmp/claude-0/-home-claude/69262ac1-5e4d-5df8-a1a0-141d78a0da98/scratchpad/coop-host.png' });
  // Host leaves: guest goes back to its own game.
  await host.close();
  await wait(guest, () => window.__party.state === 'solo', null, 20000);
  console.log('guest back solo', await guest.evaluate(() => window.__GAME_STATE__.pub.dogs.map((d) => d.look.name)));
  console.log('errors', errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
