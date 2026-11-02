// Trace one bot-only field: [COURSE=highland] tsx scripts/trace.ts <fieldIdx> <seed> [everySec] [fromSec]
import { GameRoom } from '../src/server/game';
import { makeBrain } from '../src/server/bots';
import { isPenned } from '../src/server/flock';
const field = Number(process.argv[2] ?? 0), seed = Number(process.argv[3] ?? 1), every = Number(process.argv[4] ?? 4), from = Number(process.argv[5] ?? 0);
const room = new GameRoom(() => {}, { seed });
room.message('c1', JSON.stringify({ t: 'hello', token: 'host', look: { name: 'Host' } }));
room.message('c1', JSON.stringify({ t: 'start', mode: 'trials', fillBots: true, course: process.env.COURSE ?? 'gentle' }));
[...room.dogs.values()].find((d) => d.token === 'host')!.bot = makeBrain(0);
while (room.fieldIdx < field || room.phase !== 'playing') { room.tick(0.05); if (room.phase === 'fieldEnd') room.timeLeft = 0; }
const f = (n: number) => n.toFixed(1);
let t = 0, k = 0;
while (room.phase === 'playing') {
  room.tick(0.05); t += 0.05; k++;
  if (t >= from && k % Math.round(every * 20) === 0) {
    const open = room.sheep.filter((o) => !isPenned(room.field, o));
    console.log(`t=${f(t)} pen=${room.sheep.length - open.length}/${room.sheep.length} open=${open.map((o) => `${f(o.x)},${f(o.z)}`).join(' ')}${room.goats.map((g) => ` goat=${f(g.x)},${f(g.z)} ${g.mood}`).join('')}`);
    console.log('   dogs ' + [...room.dogs.values()].map((d) => `(${f(d.x)},${f(d.z)})${d.posture[0]}${d.frozen > 0 ? 'F' : ''}`).join(' '));
  }
}
console.log(room.report());
