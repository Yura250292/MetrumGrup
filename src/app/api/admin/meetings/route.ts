import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { z } from "zod";

// projectId більше не приймаємо — наради не привʼязуються до проєкту.
// Скоуп — фірма (firmId), сортування — за папкою наради.
const createSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  folderId: z.string().min(1).optional().nullable(),
  // Текстова нарада: оригінальна Markdown-нотатка замість аудіозапису.
  noteText: z.string().max(100000).optional().nullable(),
  // Чи запускати «АІ покращення» (підсумок + вичищена версія тексту).
  // false = «Зберегти» — текст уже готовий, AI не потрібен.
  analyze: z.boolean().optional().default(true),
  // Дата проведення наради. Якщо не передано — береться поточна (default
  // у схемі). Корисно коли файл завантажують пізніше за саму нараду.
  recordedAt: z.coerce.date().optional(),
});

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const folderIdParam = searchParams.get("folderId");

  const { firmId } = await resolveFirmScopeForRequest(session);

  const where: Record<string, unknown> = {};
  if (firmId) where.firmId = firmId;
  if (folderIdParam === "root") {
    where.folderId = null;
  } else if (folderIdParam) {
    where.folderId = folderIdParam;
  }

  const meetings = await prisma.meeting.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { recordedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
    take: 200,
  });

  return NextResponse.json({ meetings });
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некоректні дані форми", details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (parsed.data.folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: parsed.data.folderId },
        select: { domain: true },
      });
      if (!folder || folder.domain !== "MEETING") {
        return NextResponse.json(
          { error: "Папку нарад не знайдено" },
          { status: 400 },
        );
      }
    }

    const { firmId } = await resolveFirmScopeForRequest(session);

    const noteText = parsed.data.noteText?.trim() || null;

    // Текстова нарада: «АІ покращення» → TRANSCRIBED (клієнт запустить
    // аналіз), «Зберегти» (analyze=false) → READY, нарада вже готова.
    // Аудіо-нарада завжди стартує як DRAFT.
    const status: "DRAFT" | "TRANSCRIBED" | "READY" = noteText
      ? parsed.data.analyze
        ? "TRANSCRIBED"
        : "READY"
      : "DRAFT";

    const meeting = await prisma.meeting.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        folderId: parsed.data.folderId ?? null,
        firmId: firmId ?? null,
        createdById: session.user.id,
        noteText,
        status,
        // undefined → спрацьовує @default(now()) зі схеми.
        recordedAt: parsed.data.recordedAt ?? undefined,
      },
      include: {
        folder: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ meeting });
  } catch (err) {
    // Повертаємо реальну причину, а не глуху 500 — щоб у UI було видно,
    // що саме пішло не так (напр. застарілий Prisma-клієнт після міграції).
    const message =
      err instanceof Error ? err.message : "Не вдалося створити нараду";
    console.error("[meetings POST] create failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
