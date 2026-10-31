/**
 * The artifact page's live room (the claude.ai viewer's `room` capability): everyone who has the
 * page open right now. We only use presence: each player keeps one small object current, and
 * everyone in the room sees everyone's. `?fakeroom` swaps in a stand-in over BroadcastChannel,
 * so two tabs on one machine can test hosting and joining without the viewer.
 */

export interface Peer {
  peer: string;
  isMe: boolean;
  sameTab: boolean;
  presence: Readonly<Record<string, unknown>>;
}
export interface PeersChange { peers: readonly Peer[]; joined: readonly Peer[]; left: readonly Peer[]; updated: readonly Peer[] }
export interface RoomLike {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly Peer[];
  onPeers(fn: (c: PeersChange) => void, onError?: (e: { code: string }) => void): () => void;
  connected(): boolean;
}
export interface NamedRoomLike extends RoomLike {
  readonly name: string;
  leave(): Promise<void>;
}
export interface LiveRoom extends RoomLike {
  join(name: string): Promise<NamedRoomLike>;
}

export async function getLiveRoom(): Promise<LiveRoom | null> {
  if (new URLSearchParams(location.search).has('fakeroom')) return fakeRoom();
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return null;
  try {
    return ((await c.use('room')) as LiveRoom | null) ?? null;
  } catch {
    return null;
  }
}

/** A stand-in room for local testing: tabs of the same browser talk over a BroadcastChannel. */
function fakeRoom(): LiveRoom {
  const me = Math.random().toString(36).slice(2, 12);
  const bc = new BroadcastChannel('come-bye-fakeroom');
  type R = { name: string; mine: Record<string, unknown>; others: Map<string, Record<string, unknown>>; subs: Set<(c: PeersChange) => void>; pending: { joined: Set<string>; left: Set<string>; updated: Set<string> }; timer: number };
  const rooms = new Map<string, R>();
  const peerList = (r: R): Peer[] => [{ peer: me, isMe: true, sameTab: true, presence: r.mine }, ...[...r.others].map(([peer, presence]) => ({ peer, isMe: false, sameTab: false, presence }))];
  const notify = (r: R, kind: 'joined' | 'left' | 'updated', peer: string) => {
    r.pending[kind].add(peer);
    if (r.timer) return;
    r.timer = window.setTimeout(() => {
      r.timer = 0;
      const peers = peerList(r);
      const pick = (s: Set<string>) => [...s].map((p) => peers.find((q) => q.peer === p) ?? { peer: p, isMe: false, sameTab: false, presence: {} });
      const c = { peers, joined: pick(r.pending.joined), left: pick(r.pending.left), updated: pick(r.pending.updated) };
      r.pending = { joined: new Set(), left: new Set(), updated: new Set() };
      r.subs.forEach((f) => f(c));
    }, 16);
  };
  const say = (r: R, kind: 'hi' | 'set' | 'bye') => bc.postMessage({ room: r.name, peer: me, kind, presence: r.mine });
  const make = (name: string): R => {
    const r: R = { name, mine: {}, others: new Map(), subs: new Set(), pending: { joined: new Set(), left: new Set(), updated: new Set() }, timer: 0 };
    rooms.set(name, r);
    say(r, 'hi');
    return r;
  };
  bc.onmessage = (e) => {
    const m = e.data as { room: string; peer: string; kind: 'hi' | 'set' | 'bye'; presence: Record<string, unknown> };
    const r = rooms.get(m.room);
    if (!r || m.peer === me) return;
    if (m.kind === 'bye') {
      if (r.others.delete(m.peer)) notify(r, 'left', m.peer);
      return;
    }
    const known = r.others.has(m.peer);
    r.others.set(m.peer, m.presence);
    notify(r, known ? 'updated' : 'joined', m.peer);
    if (m.kind === 'hi') say(r, 'set');
  };
  addEventListener('pagehide', () => rooms.forEach((r) => say(r, 'bye')));
  const api = (r: R) => ({
    presence: async (patch: Record<string, unknown>) => {
      const next = { ...r.mine };
      for (const [k, v] of Object.entries(patch)) if (v === null) delete next[k]; else next[k] = v;
      r.mine = next;
      say(r, 'set');
    },
    peers: () => peerList(r),
    onPeers: (fn: (c: PeersChange) => void) => {
      r.subs.add(fn);
      setTimeout(() => fn({ peers: peerList(r), joined: peerList(r), left: [], updated: [] }), 0);
      return () => void r.subs.delete(fn);
    },
    connected: () => true,
  });
  const lobby = make('');
  return {
    ...api(lobby),
    join: async (name: string) => {
      const r = rooms.get(name) ?? make(name);
      return { name, ...api(r), leave: async () => { say(r, 'bye'); rooms.delete(name); } };
    },
  };
}
