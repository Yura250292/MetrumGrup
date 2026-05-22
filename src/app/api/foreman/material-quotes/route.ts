import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { quoteItemsBatch } from "@/lib/foreman/market-quote";

export const runtime = "nodejs";
// Vercel Pro дає до 300s; web_search для кожного item може зайняти 5-20s.
export const maxDuration = 300;

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        name: z.string().trim().min(1).max(200),
        unit: z.string().trim().max(20).optional(),
        kind: z.enum(["material", "labor"]).default("material"),
      }),
    )
    .min(1)
    // Зменшуємо ліміт: клієнт чанкує по 8 items і шле паралельно.
    .max(12),
});

/**
 * Batch quote: для кожного elementу спершу шукає у SupplierMaterial цієї фірми,
 * потім (якщо порожньо або labor) звертається до Claude Haiku з нативним
 * web_search_20250305 для української роздрібної ціни / розцінки.
 * Concurrency обмежена сервером, відповіді кешуються 24h in-memory.
 */
export async function POST(request: NextRequest) {
  let firmId: string | null;
  try {
    ({ firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }

  // concurrency=3 (плюс semaphore у anthropic-throttle глобально обмежує).
  const quotes = await quoteItemsBatch(firmId, parsed.data.items, 3);
  return NextResponse.json({ quotes });
}
