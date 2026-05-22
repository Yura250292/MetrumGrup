/**
 * Global concurrent Anthropic call limiter + 429 retry з exponential backoff.
 *
 * Проблема (з Vercel логів): 429 "Number of concurrent connections has
 * exceeded your rate limit" коли material-quotes (8 chunks паралельно
 * × 6 concurrency = 24+ in-flight) та ai-furnish (N кімнат паралельно)
 * запускаються одночасно.
 *
 * Рішення:
 *  1. Per-instance semaphore — обмежує сумарну кількість одночасних
 *     викликів до Anthropic (через всі endpoints).
 *  2. 429-retry з jitter — якщо все одно вдарили limit, пройти ще раз
 *     через 1-2-4 секунди (Anthropic recommended pattern).
 *
 * Note: per-instance — Vercel spawns multiple workers; cap не global,
 * але суттєво згладжує піки в одному запиті.
 */

const MAX_CONCURRENT = 3;

let inFlight = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

/**
 * Викликати fn у межах семафора (макс MAX_CONCURRENT одночасних викликів).
 * Якщо ловить 429 — повторює до 3 разів з exponential backoff.
 */
export async function withAnthropicSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await callWithRetry(fn);
  } finally {
    releaseSlot();
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const is429 =
        /\b429\b/.test(msg) ||
        /rate_limit/.test(msg) ||
        /concurrent connections/i.test(msg);
      if (!is429 || i >= attempts - 1) {
        throw e;
      }
      // Backoff: 1.2s, 2.5s, 5s + jitter
      const baseDelay = 1200 * Math.pow(2, i);
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }
  }
  throw lastError;
}
