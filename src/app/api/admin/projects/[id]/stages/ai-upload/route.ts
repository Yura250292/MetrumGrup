import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { putObjectToR2 } from "@/lib/foreman/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024; // 20 МБ

/**
 * Серверне завантаження файлу в R2 для AI-помічника «Етапи виконання»
 * (Excel-кошториси, PDF накладних, фото). Файл іде multipart клієнт → сервер
 * → R2, щоб уникнути браузерного CORS на бакеті. Повертає { key }.
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Очікується multipart/form-data" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передано" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Завеликий або порожній файл" },
      { status: 400 },
    );
  }

  try {
    const body = Buffer.from(await file.arrayBuffer());
    const result = await putObjectToR2({
      userId: session.user.id,
      originalName: file.name || "upload",
      mimeType: file.type || "application/octet-stream",
      prefix: "stages-ai",
      source: "stages-ai-assistant",
      body,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai-upload] server upload failed:", err);
    return NextResponse.json(
      { error: "Не вдалось завантажити файл" },
      { status: 500 },
    );
  }
}
