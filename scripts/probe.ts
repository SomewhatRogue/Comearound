/**
 * One blocking call, one report: boots the dev server with a fast clock, opens real browsers
 * (host on a laptop, a friend, a phone held sideways, then a late joiner), checks movement, bark
 * and crouch reach the server, plays a full Co-op Trials run with bots, reloads a player mid-field
 * to prove rejoin, and screenshots each phase into shots/. Polls for state; never sleeps on a guess.
 *
 *   npm run probe            (builds first)
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright') as any;
type Page = any;
const PORT = 8790;
const ROOM = `probe${Date.now() % 100000}`;
const t0 = Date.now();
const log: string[] = [];
const mark = (s: string) => { const l = `${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`; log.push(l); console.error(l); };

const server = spawn('node_modules/.bin/tsx', ['src/server/node-dev.ts'], { env: { ...process.env, PORT: String(PORT), TIMESCALE: '2', SEED: '3', AUTOPILOT: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
const until = async <T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 20000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
let browser: any = null;
const state = (p: Page) => p.evaluate(() => (window as any).__GAME_STATE__);
const meIn = (st: any) => st.pub.dogs.find((d: any) => d.id === st.me.you);

async function main() {
  mkdirSync('shots', { recursive: true });
  await until('server', async () => (await fetch(`http://localhost:${PORT}/__report?room=x`)).ok);
  mark('server up');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (as: string, name: string, opts: { render?: boolean; phone?: boolean; breed?: string } = {}) => {
    const ctx = await browser.newContext(opts.phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 760 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    page.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${PORT}/?room=${ROOM}&as=${as}&name=${name}${opts.breed ? `&breed=${opts.breed}` : ''}${opts.render ? '' : '&lowfx&norender'}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await until(`${name} ready`, async () => (await state(page))?.pub);
    return { page, errors };
  };
  const host = await open('a', 'Kyle', { render: true, breed: 'collie' });
  const friend = await open('b', 'Dana', { breed: 'keeshond' });
  const phone = await open('p', 'Phone', { render: true, phone: true, breed: 'poodle' });
  mark('three clients in lobby');
  await until('all visible', async () => (await state(host.page)).pub.dogs.length === 3);
  await host.page.waitForTimeout(500);
  await host.page.screenshot({ path: 'shots/1-lobby.png' });
  const touchUi = await phone.page.evaluate(() => document.body.classList.contains('touch') && !document.getElementById('touch')!.hidden);
  mark(`phone touch controls=${touchUi}`);

  // Movement, crouch and bark all reach the server (keyboard on the friend).
  const x0 = meIn(await state(friend.page)).x;
  await friend.page.keyboard.down('d');
  const moved = await until('friend moved', async () => {
    const x = meIn(await state(friend.page)).x;
    return x - x0 > 1 ? x - x0 : null;
  });
  await friend.page.keyboard.up('d');
  await friend.page.keyboard.down(' ');
  await until('friend crouched', async () => meIn(await state(friend.page)).posture === 'crouch');
  await until('friend lying down', async () => meIn(await state(friend.page)).down);
  await friend.page.keyboard.up(' ');
  await friend.page.keyboard.press('e');
  await until('friend barked', async () => meIn(await state(friend.page)).barks === 1);
  mark(`movement +${moved.toFixed(2)} m, crouch, down and bark ok`);

  // The phone's stick: drag it.
  await phone.page.click('[data-act=fold]');
  const px0 = meIn(await state(phone.page)).x;
  await phone.page.locator('#touch .stick-zone').waitFor({ state: 'visible' });
  const box = await phone.page.locator('#touch .stick-zone').boundingBox();
  await phone.page.mouse.move(box.x + 100, box.y + 150);
  await phone.page.mouse.down();
  await phone.page.mouse.move(box.x + 160, box.y + 150, { steps: 4 });
  const phoneMoved = await until('phone moved', async () => {
    const x = meIn(await state(phone.page)).x;
    return x - px0 > 1 ? x - px0 : null;
  });
  await phone.page.mouse.up();
  await phone.page.screenshot({ path: 'shots/1b-phone-lobby.png' });
  mark(`phone stick moved +${phoneMoved.toFixed(2)} m`);

  await host.page.click('[data-act="mode"][data-v="gentle"]');
  await host.page.click('[data-act="start"]');
  await until('intro', async () => (await state(host.page)).pub.phase === 'intro');
  await host.page.waitForTimeout(200);
  await host.page.screenshot({ path: 'shots/2-intro.png' });
  await until('field started', async () => (await state(host.page)).pub.phase === 'playing');
  mark('field 1 started');
  // AUTOPILOT: the human seats herd with the bot brain, so this is a real run. Give it a moment.
  await host.page.waitForTimeout(2500);
  await host.page.screenshot({ path: 'shots/3-playing.png' });
  await phone.page.screenshot({ path: 'shots/3b-phone-playing.png' });

  const late = await open('c', 'Latecomer');
  const lateSt = await state(late.page);
  // Mid-run you watch; if the run already ended (slow machine), you're simply in.
  const midRun = !['lobby', 'results'].includes(lateSt.pub.phase);
  const lateSpectator = meIn(lateSt).spectator === midRun;
  mark(`late joiner (phase ${lateSt.pub.phase}) spectator=${meIn(lateSt).spectator}`);

  const idBefore = (await state(friend.page)).me.you;
  await friend.page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await until('friend back', async () => (await state(friend.page))?.me);
  const idAfter = (await state(friend.page)).me.you;
  mark(`rejoin same seat=${idBefore === idAfter}`);

  await host.page.evaluate(() => (window as any).__debug_naughty());
  await host.page.waitForTimeout(2600);
  await host.page.screenshot({ path: 'shots/4-naughty.png' });

  await until('field card', async () => (await state(host.page)).pub.fieldScores.length >= 1, 120000);
  await host.page.waitForTimeout(1500);
  await host.page.screenshot({ path: 'shots/5-field-card.png' });
  mark(`field 1 done: ${JSON.stringify((await state(host.page)).pub.fieldScores[0])}`);
  await until('results', async () => (await state(host.page)).pub.phase === 'results', 180000);
  await host.page.waitForTimeout(1500);
  await host.page.screenshot({ path: 'shots/6-results.png' });
  const final = (await state(host.page)).pub;
  mark('results reached');
  const gl = await host.page.evaluate(() => {
    const c = document.querySelector('canvas')!.getContext('webgl2') as WebGL2RenderingContext;
    const d = c.getExtension('WEBGL_debug_renderer_info');
    return d ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)).slice(0, 40) : 'webgl2';
  });
  const errors = [...host.errors, ...friend.errors, ...phone.errors, ...late.errors];
  console.log(JSON.stringify({
    ok: errors.length === 0 && lateSpectator && idBefore === idAfter && touchUi,
    timeline: log,
    fields: final.fieldScores.map((f: any) => f.map((s: any) => `${s.penned}/${s.total} = ${s.score}`)),
    leaderboard: final.leaderboard,
    gl,
    firstErrors: errors.slice(0, 3),
    shots: ['1-lobby', '1b-phone-lobby', '2-intro', '3-playing', '3b-phone-playing', '4-naughty', '5-field-card', '6-results'].map((s) => `shots/${s}.png`),
  }, null, 1));
  await browser.close();
}

main().catch((e) => console.log(JSON.stringify({ ok: false, error: String(e), timeline: log }))).finally(async () => {
  await browser?.close().catch(() => {});
  server.kill();
});
