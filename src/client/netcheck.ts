/**
 * What routes this device can offer another player, for the lobby's network check and the
 * failure screen: "host" (same network), "srflx" (direct across the internet, via STUN) and
 * "relay" (through the TURN relay, for networks that won't link directly).
 */
import { iceServers } from './p2p';

export type Routes = { direct: boolean; relay: boolean; types: string[] };

/** The candidate types listed in an SDP (offer or answer). */
export function candidateTypes(sdp: string | undefined | null): string[] {
  const out = new Set<string>();
  for (const m of (sdp ?? '').matchAll(/ typ (host|srflx|prflx|relay)/g)) out.add(m[1]);
  return [...out].sort();
}

/** Gather candidates once (no other player needed) and see which kinds of route this network allows. */
export async function checkRoutes(timeoutMs = 6000): Promise<Routes> {
  const pc = new RTCPeerConnection({ iceServers: await iceServers() });
  try {
    pc.createDataChannel('probe');
    const types = new Set<string>();
    pc.onicecandidate = (e) => {
      const t = / typ (\w+)/.exec(e.candidate?.candidate ?? '')?.[1];
      if (t) types.add(t);
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((done) => {
      const t = setTimeout(done, timeoutMs);
      pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && (clearTimeout(t), done());
    });
    for (const t of candidateTypes(pc.localDescription?.sdp)) types.add(t);
    return { direct: types.has('srflx') || types.has('prflx'), relay: types.has('relay'), types: [...types].sort() };
  } catch {
    return { direct: false, relay: false, types: [] };
  } finally {
    pc.close();
  }
}

/** A plain-words line for the lobby. */
export function routesLine(r: Routes): string {
  if (r.relay) return 'Network check: good. Direct links work here, and the backup relay is reachable.';
  if (r.direct) return 'Network check: direct links work here, but the backup relay isn\'t reachable, so a friend on a strict network (like mobile data) may not be able to join.';
  return 'Network check: this network blocks the routes other players need. Try Wi-Fi or another network.';
}
