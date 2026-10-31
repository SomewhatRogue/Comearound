// Bot benchmark: penned per field across seeds. Usage: tsx scripts/bench.ts [seeds]
import { GameRoom } from '../src/server/game';
import { makeBrain } from '../src/server/bots';
import { TRIALS } from '../src/shared/field';
const seeds = Number(process.argv[2] ?? 6);
const rows: Record<string, string[]> = {};
for (let seed = 1; seed <= seeds; seed++) {
  const room = new GameRoom(() => {}, { seed });
  room.message('c1', JSON.stringify({ t: 'hello', token: 'host', look: { name: 'Host' } }));
  room.message('c1', JSON.stringify({ t: 'start', mode: 'trials', fillBots: true }));
  [...room.dogs.values()].find((d) => d.token === 'host')!.bot = makeBrain(0);
  let t = 0;
  while (room.phase !== 'results' && t < 900) { room.tick(0.05); t += 0.05; if (room.phase === 'fieldEnd') room.timeLeft = Math.min(room.timeLeft, 0.01); }
  room.fieldScores.forEach((f, i) => (rows[TRIALS[i].id] ??= []).push(`${f[0].penned}/${f[0].total}${f[0].timeBonus ? '@' + Math.round(f[0].timeBonus / 4) : ''}`));
}
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(9), v.join('  '));
