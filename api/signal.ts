/**
 * Matchmaking for online play on Vercel. Games run in the host's browser and players connect to
 * each other directly (WebRTC); this function only introduces them:
 * - claim: the first tab in a room becomes its host (kept alive by re-claiming every 15 s).
 * - send / poll: a tiny mailbox per player, for the connection offers and answers.
 * - release: the host's tab closing frees the room straight away.
 * State lives in Redis from the Vercel Marketplace (Upstash), because Vercel Functions don't keep
 * memory between requests. Self-contained on purpose: the Node dev server imports handleSignal
 * with an in-memory store, so tests run without Redis.
 */

export interface Store {
  /** Run Redis commands in order; `atomic` runs them as one transaction. Returns each result. */
  run(cmds: (string | number)[][], atomic?: boolean): Promise<unknown[]>;
}

const ID = /^[\w-]{1,48}$/;
const HOST_TTL = 30;
const BOX_TTL = 60;
const MAX_MSG = 24_000;

type Body = { op?: string; room?: string; me?: string; to?: string; msg?: unknown };

export async function handleSignal(body: Body, store: Store): Promise<{ status: number; json: unknown }> {
  const { op, room, me } = body;
  if (!room || !me || !ID.test(room) || !ID.test(me)) return { status: 400, json: { error: 'bad room or id' } };
  const hostKey = `cb:host:${room}`;
  const box = (id: string) => `cb:box:${room}:${id}`;
  switch (op) {
    case 'claim': {
      const [, host] = await store.run([['SET', hostKey, me, 'NX', 'EX', HOST_TTL], ['GET', hostKey]]);
      if (host === me) await store.run([['EXPIRE', hostKey, HOST_TTL]]);
      return { status: 200, json: { host } };
    }
    case 'release': {
      const [host] = await store.run([['GET', hostKey]]);
      if (host === me) await store.run([['DEL', hostKey]]);
      return { status: 200, json: { ok: true } };
    }
    case 'send': {
      const to = body.to ?? '';
      const text = JSON.stringify({ from: me, msg: body.msg ?? null });
      if (!ID.test(to) || text.length > MAX_MSG) return { status: 400, json: { error: 'bad message' } };
      await store.run([['RPUSH', box(to), text], ['EXPIRE', box(to), BOX_TTL]]);
      return { status: 200, json: { ok: true } };
    }
    case 'poll': {
      const [list] = await store.run([['LRANGE', box(me), 0, -1], ['DEL', box(me)]], true);
      const msgs = (Array.isArray(list) ? list : []).map((t) => {
        try {
          return JSON.parse(String(t));
        } catch {
          return null;
        }
      }).filter(Boolean);
      return { status: 200, json: { msgs } };
    }
  }
  return { status: 400, json: { error: 'unknown op' } };
}

/** Upstash Redis over its REST API (the Vercel Marketplace integration sets these variables). */
function upstash(): Store | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return {
    async run(cmds, atomic) {
      const res = await fetch(`${url}/${atomic ? 'multi-exec' : 'pipeline'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
      });
      if (!res.ok) throw new Error(`redis ${res.status}`);
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      return out.map((r) => r.result ?? null);
    },
  };
}

/** A store in memory, for the Node dev server and tests (one process, so no Redis needed). */
export function memoryStore(): Store {
  const kv = new Map<string, { v: string | string[]; exp: number }>();
  const live = (k: string) => {
    const e = kv.get(k);
    if (e && e.exp && e.exp < Date.now()) kv.delete(k);
    return kv.get(k);
  };
  const one = (c: (string | number)[]): unknown => {
    const [cmd, k, ...a] = c.map(String);
    switch (cmd) {
      case 'SET':
        if (a.includes('NX') && live(k)) return null;
        kv.set(k, { v: a[0], exp: a.includes('EX') ? Date.now() + Number(a[a.indexOf('EX') + 1]) * 1000 : 0 });
        return 'OK';
      case 'GET': {
        const e = live(k);
        return typeof e?.v === 'string' ? e.v : null;
      }
      case 'EXPIRE': {
        const e = live(k);
        if (e) e.exp = Date.now() + Number(a[0]) * 1000;
        return e ? 1 : 0;
      }
      case 'DEL':
        return kv.delete(k) ? 1 : 0;
      case 'RPUSH': {
        const e = live(k);
        const list = Array.isArray(e?.v) ? e!.v as string[] : [];
        list.push(a[0]);
        kv.set(k, { v: list, exp: e?.exp ?? 0 });
        return list.length;
      }
      case 'LRANGE': {
        const e = live(k);
        return Array.isArray(e?.v) ? [...(e!.v as string[])] : [];
      }
    }
    return null;
  };
  return { run: async (cmds) => cmds.map(one) };
}

export async function POST(request: Request): Promise<Response> {
  const store = upstash();
  if (!store) return Response.json({ error: 'online play needs Redis: add Upstash Redis from the Vercel Marketplace' }, { status: 503 });
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  try {
    const { status, json } = await handleSignal(body, store);
    return Response.json(json, { status });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
