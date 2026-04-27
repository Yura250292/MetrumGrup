import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  key?: string;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

function clientKey(req: NextRequest, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

export function rateLimit(req: NextRequest, opts: RateLimitOptions): RateLimitResult {
  const scope = opts.key ?? new URL(req.url).pathname;
  const id = clientKey(req, scope);
  const now = Date.now();
  const existing = buckets.get(id);

  if (!existing || existing.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(id, fresh);
    return { ok: true, remaining: opts.max - 1, resetAt: fresh.resetAt };
  }

  existing.count += 1;
  const ok = existing.count <= opts.max;
  return { ok, remaining: Math.max(0, opts.max - existing.count), resetAt: existing.resetAt };
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too Many Requests", message: "Перевищено ліміт запитів" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    }
  );
}
