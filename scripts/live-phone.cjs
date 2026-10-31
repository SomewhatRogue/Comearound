// Live on the Vercel site: a phone host leaves for Messages (page script paused, socket dead), a
// friend opens the link meanwhile, the host comes back. Prints one JSON line.
// Usage: node scripts/live-phone.cjs   (SITE=url, AWAY=ms away; needs a network that reaches SITE)
const { chromium } = require('playwright');
const SITE = process.env.SITE || 'https://comearound-lyart.vercel.app';
const FREEZE = () => {
  const W = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = class extends W {
    constructor(...a) { super(...a); window.__sockets.push(this); }
    set onmessage(f) { super.onmessage = (e) => { if (!this.__zombie) f(e); }; }
    get onmessage() { return super.onmessage; }
    send(d) { if (!this.__zombie) super.send(d); }
  };
};
(async () => {
  const out = { site: SITE, t: {} };
  const t0 = Date.now(); const at = (k) => (out.t[k] = +((Date.now() - t0) / 1000).toFixed(1));
  const b = await chromium.launch();
  const page = async (name, q = '') => {
    const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
    await ctx.addInitScript(FREEZE);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => (out.errors ??= []).push(`${name}: ${e.message}`));
    await p.goto(`${SITE}/?lowfx&norender&name=${name}${q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction(() => window.__GAME_STATE__?.pub && window.__party, null, { timeout: 90000 });
    return p;
  };
  const humans = (p) => p.evaluate(() => (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).map((d) => d.look.name).sort().join(','));
  try {
    const h = await page('PhoneHost');
    await h.click('[data-v="friends"]');
    await h.waitForFunction(() => window.__party.state === 'host', null, { timeout: 30000 });
    const code = await h.evaluate(() => new URL(location.href).searchParams.get('room'));
    out.code = code; at('hosting');
    // Off to Messages: the socket goes dead and the page freezes.
    await h.evaluate(() => window.__sockets.forEach((w) => (w.__zombie = true)));
    const cdp = await h.context().newCDPSession(h);
    // Freeze all of the page's script (a phone suspends it), as Debugger.pause does.
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.pause');
    at('host frozen');
    const f = await page('Friend', `&room=${code}`);
    at('friend opened link');
    await f.waitForTimeout(+(process.env.AWAY || 12000));
    out.friendWhileHostAway = await f.evaluate(() => window.__party.state);
    // Back to the game.
    out.hostTimerTicksWhileAway = 'paused';
    await cdp.send('Debugger.resume');
    await h.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const back = Date.now(); at('host back');
    await f.waitForFunction(() => window.__party.state === 'guest' && window.__GAME_STATE__.me, null, { timeout: 60000 });
    out.friendInAfterHostBackSec = +((Date.now() - back) / 1000).toFixed(1);
    await h.waitForFunction(() => window.__party.friends === 1 && (window.__GAME_STATE__.pub?.dogs ?? []).filter((d) => !d.bot && d.connected).length === 2, null, { timeout: 20000 }).catch(() => {});
    out.hostState = await h.evaluate(() => window.__party.state);
    out.hostSees = await humans(h); out.friendSees = await humans(f);
    out.hostSockets = await h.evaluate(() => window.__sockets.map((w) => w.readyState + (w.__zombie ? 'z' : '')).join(','));
    out.ok = out.hostState === 'host' && out.hostSees === 'Friend,PhoneHost' && out.friendSees === 'Friend,PhoneHost';
  } catch (e) { out.error = String(e.message).slice(0, 300); }
  console.log(JSON.stringify(out));
  await b.close();
})();
