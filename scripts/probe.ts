/**
 * One blocking call, one report: boots the dev server with a fast clock, opens three real
 * browsers (host, friend, late joiner), plays a full round against bots, reloads a player mid-round
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

const server = spawn('node_modules/.bin/tsx', ['src/server/node-dev.ts'], { env: { ...process.env, PORT: String(PORT), TIMESCALE: '6', SEED: '11' }, stdio: ['ignore', 'ignore', 'inherit'] });
const until = async <T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 20000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
let lastBoardDebug = '';
let browser: any = null;
const state = (p: Page) => p.evaluate(() => (window as any).__GAME_STATE__);

async function main() {
  mkdirSync('shots', { recursive: true });
  await until('server', async () => (await fetch(`http://localhost:${PORT}/__report?room=x`)).ok);
  mark('server up');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (as: string, name: string, lowfx = true) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    page.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${PORT}/?room=${ROOM}&as=${as}&name=${name}${lowfx ? '&lowfx&norender' : ''}`);
    await until(`${name} ready`, async () => (await state(page))?.pub);
    return { page, errors };
  };
  const host = await open('a', 'Kyle', false);
  const friend = await open('b', 'Dana');
  mark('two clients in lobby');
  await until('both visible', async () => (await state(host.page)).pub.players.length === 2);
  await host.page.waitForTimeout(300);
  await host.page.screenshot({ path: 'shots/1-lobby.png' });

  // Movement: hold D on the friend and check the server moved them.
  const x0 = (await state(friend.page)).pub.players.find((p: any) => p.look.name === 'Dana').x;
  await friend.page.keyboard.down('d');
  const moved = await until('friend moved', async () => {
    const x = (await state(friend.page)).pub.players.find((p: any) => p.look.name === 'Dana').x;
    return x - x0 > 1 ? x - x0 : null;
  });
  await friend.page.keyboard.up('d');
  mark(`movement ok (+${moved.toFixed(2)} m)`);

  await host.page.click('[data-act="len"][data-v="300"]');
  await host.page.click('[data-act="start"]');
  await until('round started', async () => (await state(host.page)).pub.phase === 'playing');
  mark('round started');
  // Walk the host up to the board and open it.
  await until('host at board', async () => {
    const st = await state(host.page);
    const me = st.pub.players.find((p: any) => p.id === st.me.you);
    const [dx, dz] = [0 - me.x, -2 - me.z];
    const d = Math.hypot(dx, dz);
    lastBoardDebug = `d=${d.toFixed(2)} me=${me.x},${me.z} inPen=${me.inPen} text=${await host.page.evaluate(() => (window as any).render_game_to_text())}`;
    await host.page.evaluate(([x, z]: number[]) => (window as any).__game_actions__.send({ t: 'input', dx: x, dz: z }), d < 1.2 ? [0, 0] : [dx / d, dz / d]);
    return d < 1.2 && (await host.page.evaluate(() => (window as any).render_game_to_text())).includes('board');
  });
  await host.page.keyboard.press('q');
  await until('board open', async () => host.page.$('.sheet.board'));
  await host.page.waitForTimeout(400);
  await host.page.screenshot({ path: 'shots/2c-board.png' });
  const dbg = await host.page.evaluate(() => ({ modal: document.querySelector('#modal')!.className, html: document.querySelector('#modal')!.innerHTML.slice(0, 80), phase: (window as any).__GAME_STATE__.pub.phase }));
  if (process.env.PROBE_STOP === 'board') throw new Error('stop ' + JSON.stringify(dbg));
  await host.page.keyboard.press('Escape');
  await until('board closed', async () => !(await host.page.$('.sheet.board')));
  await host.page.waitForTimeout(3000);
  mark('board opened');
  const roleBefore = (await state(friend.page)).me.role;
  const late = await open('c', 'Latecomer');
  const lateState = await state(late.page);
  const lateSpectator = lateState.pub.players.find((p: any) => p.id === lateState.me.you).spectator;
  mark(`late joiner spectator=${lateSpectator}`);

  await friend.page.reload();
  await until('friend back', async () => (await state(friend.page))?.me);
  const roleAfter = (await state(friend.page)).me.role;
  mark(`rejoin role kept=${roleBefore === roleAfter}`);

  await host.page.screenshot({ path: 'shots/2-playing.png' });
  await friend.page.screenshot({ path: 'shots/2b-playing-friend.png' });
  await host.page.evaluate(() => (window as any).__debug_naughty());
  await host.page.waitForTimeout(2600);
  await host.page.screenshot({ path: 'shots/3-naughty.png' });

  await until('reveal', async () => (await state(host.page)).pub.phase === 'results', 60000);
  mark('reveal reached');
  await host.page.waitForTimeout(2500);
  await host.page.screenshot({ path: 'shots/4-reveal.png' });
  const reveal = (await state(host.page)).pub.reveal;
  const gl = await host.page.evaluate(() => {
    const c = document.querySelector('canvas')!.getContext('webgl2') as WebGL2RenderingContext;
    const d = c.getExtension('WEBGL_debug_renderer_info');
    return d ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)).slice(0, 40) : 'webgl2';
  });
  const errors = [...host.errors, ...friend.errors, ...late.errors];
  console.log(JSON.stringify({
    ok: errors.length === 0 && lateSpectator && roleBefore === roleAfter,
    timeline: log,
    reveal: { winner: reveal.winner, thing: reveal.thingId, made: reveal.rows.filter((r: any) => r.creation).length, rows: reveal.rows.length },
    gl,
    firstErrors: errors.slice(0, 3),
    shots: ['shots/1-lobby.png', 'shots/2-playing.png', 'shots/2c-board.png', 'shots/2b-playing-friend.png', 'shots/3-naughty.png', 'shots/4-reveal.png'],
  }, null, 1));
  await browser.close();
}

main().catch((e) => console.log(JSON.stringify({ ok: false, error: String(e), timeline: log, lastBoardDebug }))).finally(async () => {
  await browser?.close().catch(() => {});
  server.kill();
});
