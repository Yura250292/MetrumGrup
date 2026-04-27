import { log } from "@/lib/logger";

/**
 * Error reporting with optional Sentry forwarding.
 *
 * If `SENTRY_DSN` is set AND `@sentry/nextjs` is installed, errors are also
 * sent to Sentry. Otherwise the call is a structured log + no-op for the
 * external service.
 *
 * Use everywhere instead of bare `console.error`. Especially in:
 * - API route catch blocks
 * - background jobs
 * - webhook delivery failures
 * - AI provider errors
 */

type Context = {
  userId?: string;
  projectId?: string;
  route?: string;
  [key: string]: unknown;
};

type SentryLike = {
  captureException: (e: unknown, hint?: { extra?: Context }) => void;
};

let sentryClient: SentryLike | null = null;
let initialized = false;

async function initSentry(): Promise<SentryLike | null> {
  if (initialized) return sentryClient;
  initialized = true;

  if (!process.env.SENTRY_DSN) return null;

  try {
    // dynamic import — package is optional; if not installed, this returns null
    // @ts-expect-error optional peer dep, may not be installed
    const mod = (await import("@sentry/nextjs").catch(() => null)) as SentryLike | null;
    sentryClient = mod;
    if (mod) log.info("sentry:initialized");
    return mod;
  } catch {
    return null;
  }
}

export async function captureException(error: unknown, ctx?: Context): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  log.error("captureException", {
    message,
    stack,
    ...ctx,
  });

  const client = await initSentry();
  if (client) {
    client.captureException(error, ctx ? { extra: ctx } : undefined);
  }
}

export function captureExceptionSync(error: unknown, ctx?: Context): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  log.error("captureException", {
    message,
    stack,
    ...ctx,
  });

  if (sentryClient) {
    sentryClient.captureException(error, ctx ? { extra: ctx } : undefined);
  }
}
