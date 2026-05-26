import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { getR2PutUrl } from "@/lib/foreman/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024; // 20 МБ

const Body = z.object({
  originalName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive().max(MAX_SIZE),
});

/**
 * Видає presigned PUT URL для завантаження файлу в R2 з-під admin-сесії.
 * Використовується AI-помічником у розділі «Етапи виконання» (фото чеків,
 * PDF накладних, Excel-кошторисів). Префікс key: `stages-ai/<userId>/<ts>_<name>`.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невалідні параметри" },
      { status: 400 },
    );
  }

  try {
    const result = await getR2PutUrl({
      userId: session.user.id,
      originalName: parsed.data.originalName,
      mimeType: parsed.data.mimeType,
      prefix: "stages-ai",
      source: "stages-ai-assistant",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai-upload] presign failed:", err);
    return NextResponse.json(
      { error: "Не вдалось отримати посилання на завантаження" },
      { status: 500 },
    );
  }
}
