import type { JobBackend } from "@/lib/jobs/queue";
import { log } from "@/lib/logger";

/**
 * Example adapter that swaps the in-memory job dispatcher for Inngest.
 *
 * Wiring (when ready):
 *   1. `npm i inngest`
 *   2. Create the Inngest client and a route at `app/api/inngest/route.ts`:
 *        export const { GET, POST, PUT } = serve({ client, functions: [...] });
 *   3. At server startup (e.g. instrumentation.ts or a top-level import):
 *        import { setJobBackend } from "@/lib/jobs/queue";
 *        import { makeInngestBackend } from "@/lib/jobs/inngest-adapter";
 *        setJobBackend(makeInngestBackend(client));
 *   4. Each `defineJob(name, handler)` call still defines the handler — but
 *      you must ALSO register an Inngest function with the same `name`
 *      so Inngest knows what to invoke when the event arrives.
 *
 * The point of this file is to keep the application call-sites
 * (`enqueue(payload)`) free of any backend-specific code.
 */

type InngestLike = {
  send: (event: { name: string; data: unknown }) => Promise<unknown>;
};

export function makeInngestBackend(client: InngestLike): JobBackend {
  return {
    name: "inngest",
    async enqueue<T>(jobName: string, payload: T) {
      try {
        await client.send({ name: jobName, data: payload as unknown });
      } catch (err) {
        log.error("inngest:send-failed", {
          jobName,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
