// Bot benchmark: penned per field across seeds. Usage: tsx scripts/bench.ts [seeds] [course]
import { GameRoom } from '../src/server/game';
import { makeBrain } from '../src/server/bots';
const seeds = Number(process.argv[2] ?? 6);
const course = process.argv[3] ?? 'gentle';
const rows: Record<string, string[]> = {};
for (let seed = 1; seed <= seeds; seed++) {
  const room = new GameRoom(() => {}, { seed });
  room.message('c1', JSON.stringify({ t: 'hello', token: 'host', look: { name: 'Host' } }));
  room.message('c1', JSON.stringify({ t: 'start', mode: 'trials', fillBots: true, course }));
  [...room.dogs.values()].find((d) => d.token === 'host')!.bot = makeBrain(0);
  let t = 0;
  const ids: string[] = [];
  while (room.phase !== 'results' && t < 1200) {
    if (room.phase === 'playing' && ids[room.fieldIdx] === undefined) ids[room.fieldIdx] = room.field.id;
    room.tick(0.05); t += 0.05;
    if (room.phase === 'fieldEnd') room.timeLeft = Math.min(room.timeLeft, 0.01);
  }
  room.fieldScores.forEach((f, i) => (rows[ids[i]] ??= []).push(`${f[0].penned}/${f[0].total}${f[0].lost ? `-${f[0].lost}` : ''}${f[0].timeBonus ? '@' + Math.round(f[0].timeBonus / 4) : ''}${f[0].goatBonus ? 'g' + f[0].goatBonus / 250 : ''}`));
}
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(9), v.join('  '));
