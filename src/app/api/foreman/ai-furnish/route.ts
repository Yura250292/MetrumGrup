import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { aiFurnish } from "@/lib/foreman/ai-furnish";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  rooms: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        name: z.string().trim().min(1).max(120),
        w: z.number().positive(),
        h: z.number().positive(),
        ceilingHeight: z.number().positive(),
      }),
    )
    .min(1)
    .max(20),
  openings: z
    .array(
      z.object({
        roomId: z.string(),
        side: z.enum(["N", "E", "S", "W"]),
        offset: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        type: z.enum(["door", "window"]),
      }),
    )
    .max(80)
    .default([]),
});

/**
 * AI меблювання: Claude Haiku класифікує кімнати і пропонує меблі/техніку
 * з координатами у локальній системі кожної кімнати. Координати клемпаються
 * на сервері в межі кімнати; невалідні items відкидаються.
 */
export async function POST(request: NextRequest) {
  try {
    await requireForeman();
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

  try {
    const result = await aiFurnish(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка генерації";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
