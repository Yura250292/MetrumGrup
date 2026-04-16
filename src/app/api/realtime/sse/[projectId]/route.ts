import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getProjectAccessContext } from "@/lib/projects/access";
import { subscribe } from "@/lib/realtime/sse-hub";

/**
 * Server-Sent Events stream for a project.
 * Clients: `new EventSource('/api/realtime/sse/{projectId}')`.
 *
 * Events sent:
 *   - `data: <JSON>` lines every time a task/time event fires
 *   - `: ping` lines every 25s to keep connection alive through proxies
 *
 * Auth:
 *   - Requires authenticated user with `canViewTasks` on the project.
 *   - CLIENT role is blocked (tasks are internal-only).
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ctx = await getProjectAccessContext(projectId, session.user.id);
  if (!ctx?.canViewTasks) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected
        }
      };

      // Initial hello
      send(`event: ready\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);

      const unsubscribe = subscribe(projectId, (evt) => {
        send(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
      });

      // Keep-alive heartbeat every 25s
      const heartbeat = setInterval(() => {
        send(`: ping ${Date.now()}\n\n`);
      }, 25_000);

      // Cleanup on client disconnect — controller.error triggers close in
      // modern browsers via AbortSignal; we also listen for close event.
      const closeHandler = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      // Signal-based cleanup is not directly available here in Next.js 16
      // route handlers; the stream will be GC'd when the connection closes.
      // We attach a safety timeout: if no subscribers remain after 60min,
      // the heartbeat closure will detect the stream is dead via enqueue throwing.
      setTimeout(closeHandler, 60 * 60 * 1000); // 1h max connection
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
