"use client";

import { useEffect, useRef } from "react";

type RealtimeEvent = {
  type: string;
  data: unknown;
  ts: string;
};

type Handler = (event: RealtimeEvent) => void;

/**
 * Subscribe to Server-Sent Events for a project.
 *
 * Usage:
 *   useProjectRealtime(projectId, (event) => {
 *     if (event.type === "task.updated") refetchTasks();
 *   });
 *
 * Auto-reconnects on network drop with exponential backoff (native EventSource).
 * Cleans up on unmount or projectId change.
 */
export function useProjectRealtime(
  projectId: string | null | undefined,
  onEvent: Handler,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;

    const source = new EventSource(`/api/realtime/sse/${projectId}`);

    const onMessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        handlerRef.current(parsed);
      } catch {
        // Malformed event — ignore
      }
    };

    // Listen to named events (task.created, task.updated, etc.)
    const types = [
      "task.created",
      "task.updated",
      "task.archived",
      "timer.started",
      "timer.stopped",
    ];
    for (const t of types) source.addEventListener(t, onMessage);

    return () => {
      for (const t of types) source.removeEventListener(t, onMessage);
      source.close();
    };
  }, [projectId]);
}
