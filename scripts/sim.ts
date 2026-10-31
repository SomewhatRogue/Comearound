// Headless herding run: bots only. Usage: tsx scripts/sim.ts [mode] [seeds]
import { GameRoom } from '../src/server/game';
const mode = (process.argv[2] ?? 'trials') as 'trials' | 'versus';
const seeds = Number(process.argv[3] ?? 4);
for (let seed = 1; seed <= seeds; seed++) {
  const room = new GameRoom(() => {}, { seed });
  room.message('c1', JSON.stringify({ t: 'hello', token: 'host', look: { name: 'Host' } }));
  room.message('c1', JSON.stringify({ t: 'start', mode, fillBots: true }));
  // host becomes a bot too so the run is fully automatic
  const host = [...room.dogs.values()].find((d) => d.token === 'host')!;
  const { makeBrain } = await import('../src/server/bots');
  host.bot = makeBrain(0);
  const lines: string[] = [];
  let lastField = -1, t = 0;
  while (room.phase !== 'results' && t < 900) {
    room.tick(0.05); t += 0.05;
    if (room.phase === 'fieldEnd' && room.fieldIdx !== lastField) {
      lastField = room.fieldIdx;
      const s = room.fieldScores[room.fieldIdx];
      lines.push(`  ${room.field.id}: ${s.map((f) => `team${f.team} ${f.penned}/${f.total} score=${f.score} time+${f.timeBonus} calm+${f.calmBonus} goat+${f.goatBonus}`).join(' | ')} left=${room.timeLeft}`);
    }
  }
  console.log(`seed ${seed}: ${room.phase} t=${t.toFixed(0)}s`);
  console.log(lines.join('\n'));
}
