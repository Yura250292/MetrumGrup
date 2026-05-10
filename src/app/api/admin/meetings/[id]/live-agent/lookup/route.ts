import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { lookupEntity } from "@/lib/meetings/live-lookup";

export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().min(2).max(200),
});

// POST /api/admin/meetings/[id]/live-agent/lookup
// Body: { text: "АТБ-Гірник" }
// Повертає: { query, matches: [{kind, id, title, snippet, url, ...}] }
//
// Лук-ап безкоштовний (просто SQL), AI не використовується. Дешево і швидко.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, firmId: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Скоупимо за фірмою наради. Якщо нарада без фірми — використовуємо
  // активний скоуп користувача.
  const { firmId: scopeFirmId } = await resolveFirmScopeForRequest(session);
  const firmId = meeting.firmId ?? scopeFirmId ?? null;

  const result = await lookupEntity({
    text: parsed.data.text,
    firmId,
    excludeMeetingId: id,
  });

  return NextResponse.json(result);
}
