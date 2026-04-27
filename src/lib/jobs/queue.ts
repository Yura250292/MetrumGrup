import { log } from "@/lib/logger";
import { captureExceptionSync } from "@/lib/errors";

/**
 * Job dispatcher with pluggable backends.
 *
 * Default backend is `in-memory` — single-instance, non-durable, fire-and-forget.
 * Use that for dev and for low-stakes side effects only.
 *
 * For production-critical AI flows / webhook deliveries, swap the backend by
 * calling `setJobBackend()` once at startup with an Inngest, Trigger.dev, or
 * DB-backed adapter that conforms to `JobBackend`.
 *
 * The call sites (`defineJob().enqueue(payload)`) stay identical across backends.
 *
 * For non-blocking work tied to a single request, prefer `next/server` `after()`.
 */

export type JobBackend = {
  name: string;
  enqueue<T>(jobName: string, payload: T): Promise<void> | void;
};

type Handler<T> = (payload: T) => Promise<void>;

const registry = new Map<string, Handler<unknown>>();

const inMemoryBackend: JobBackend = {
  name: "in-memory",
  enqueue<T>(jobName: string, payload: T) {
    const handler = registry.get(jobName);
    if (!handler) {
      log.error("job:unknown", { jobName });
      return;
    }
    setImmediate(async () => {
      const start = Date.now();
      try {
        await handler(payload as unknown);
        log.info("job:completed", { jobName, durationMs: Date.now() - start });
      } catch (err) {
        captureExceptionSync(err, { jobName, durationMs: Date.now() - start });
      }
    });
  },
};

let backend: JobBackend = inMemoryBackend;

export function setJobBackend(b: JobBackend): void {
  backend = b;
  log.info("job:backend", { backend: b.name });
}

export function getJobBackend(): JobBackend {
  return backend;
}

export function defineJob<T>(name: string, handler: Handler<T>) {
  if (registry.has(name)) {
    log.warn("job:redefined", { name });
  }
  registry.set(name, handler as Handler<unknown>);
  return {
    name,
    enqueue(payload: T) {
      const result = backend.enqueue(name, payload);
      if (result instanceof Promise) {
        result.catch((err) => captureExceptionSync(err, { jobName: name, stage: "enqueue" }));
      }
    },
    async runNow(payload: T): Promise<void> {
      await handler(payload);
    },
  };
}

export function getRegisteredJobs(): string[] {
  return Array.from(registry.keys());
}
