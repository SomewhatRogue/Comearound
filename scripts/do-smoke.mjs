// Smoke test for the Cloudflare path: run 'npx wrangler dev --port 8799' first, then 'node scripts/do-smoke.mjs'.
const url = 'ws://localhost:8799/parties/game-server/dotest';
const start = Date.now();
for (let i = 0; i < 60; i++) {
  try {
    const ok = await new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: 't1', look: { name: 'DO test' } }));
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'state') { res(`phase=${m.pub.phase} players=${m.pub.players.length} you=${m.me.you}`); ws.close(); } };
      ws.onerror = () => rej(new Error('ws error'));
      setTimeout(() => rej(new Error('timeout')), 3000);
    });
    console.log('DO OK after', ((Date.now() - start) / 1000).toFixed(1), 's:', ok);
    process.exit(0);
  } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
console.log('DO FAILED'); process.exit(1);
