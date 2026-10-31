import { describe, expect, it } from 'vitest';
import { handleSignal, memoryStore } from '../api/signal';

describe('online matchmaking (/api/signal)', () => {
  it('first claimer hosts; offers and answers pass through mailboxes once; release frees the room', async () => {
    const store = memoryStore();
    const call = async (b: object) => (await handleSignal(b, store)).json as Record<string, unknown>;
    expect(await call({ op: 'claim', room: 'ABCD', me: 'kyle' })).toEqual({ host: 'kyle' });
    expect(await call({ op: 'claim', room: 'ABCD', me: 'sam' })).toEqual({ host: 'kyle' });
    await call({ op: 'send', room: 'ABCD', me: 'sam', to: 'kyle', msg: { t: 'offer', sdp: 'v=0' } });
    expect(await call({ op: 'poll', room: 'ABCD', me: 'kyle' })).toEqual({ msgs: [{ from: 'sam', msg: { t: 'offer', sdp: 'v=0' } }] });
    expect(await call({ op: 'poll', room: 'ABCD', me: 'kyle' })).toEqual({ msgs: [] });
    await call({ op: 'release', room: 'ABCD', me: 'sam' });
    expect(await call({ op: 'claim', room: 'ABCD', me: 'sam' })).toEqual({ host: 'kyle' });
    await call({ op: 'release', room: 'ABCD', me: 'kyle' });
    expect(await call({ op: 'claim', room: 'ABCD', me: 'sam' })).toEqual({ host: 'sam' });
    expect((await handleSignal({ op: 'claim', room: 'bad room!', me: 'x' }, store)).status).toBe(400);
  });
});
