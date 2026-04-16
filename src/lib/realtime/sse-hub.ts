/**
 * In-memory SSE (Server-Sent Events) fanout hub.
 *
 * Works per-process (Node lambda/serverless instance). For multi-instance
 * production, swap for Redis/Upstash pub-sub by re-exporting `subscribe` and
 * `emit` with pub-sub backing.
 *
 * API:
 *   subscribe(projectId, handler) → () => void (unsubscribe)
 *   emit(projectId, event) — broadcast to all local subscribers
 *
 * Events have shape: { type: string; data: unknown; ts: string }
 */

type Handler = (evt: RealtimeEvent) => void;

export type RealtimeEvent = {
  type: string;
  data: unknown;
  ts: string;
};

const channels = new Map<string, Set<Handler>>();

export function subscribe(projectId: string, handler: Handler): () => void {
  let set = channels.get(projectId);
  if (!set) {
    set = new Set();
    channels.set(projectId, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
    if (set!.size === 0) channels.delete(projectId);
  };
}

export function emit(projectId: string, type: string, data: unknown) {
  const evt: RealtimeEvent = { type, data, ts: new Date().toISOString() };
  const set = channels.get(projectId);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(evt);
    } catch (err) {
      console.error("[sse-hub] handler failed", err);
    }
  }
}

export function channelCount(): number {
  return channels.size;
}

export function subscriberCount(projectId: string): number {
  return channels.get(projectId)?.size ?? 0;
}
