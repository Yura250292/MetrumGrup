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

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
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

  const meeting = await prisma.meeting.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      folderId: parsed.data.folderId ?? null,
      firmId: firmId ?? null,
      createdById: session.user.id,
      status: "DRAFT",
    },
    include: {
      folder: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ meeting });
}
