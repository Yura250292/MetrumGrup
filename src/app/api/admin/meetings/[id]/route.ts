import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { deleteFileFromR2, deleteFilesFromR2 } from "@/lib/r2-client";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  summary: z.string().max(20000).nullable().optional(),
  transcript: z.string().nullable().optional(),
  // Оригінальна Markdown-нотатка текстової наради. Редагується вручну
  // користувачем; AI-підсумок її ніколи не змінює.
  noteText: z.string().max(100000).nullable().optional(),
  folderId: z.string().min(1).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ meeting });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json());
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

  const meeting = await prisma.meeting.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ meeting });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      audioR2Key: true,
      attachments: { select: { r2Key: true } },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (meeting.audioR2Key) {
    try {
      await deleteFileFromR2(meeting.audioR2Key);
    } catch (err) {
      console.error("Failed to delete R2 audio:", err);
    }
  }

  // Прибираємо файли вкладень з R2 (БД-рядки підуть каскадом).
  const attachmentKeys = meeting.attachments
    .map((a) => a.r2Key)
    .filter(Boolean);
  if (attachmentKeys.length > 0) {
    try {
      await deleteFilesFromR2(attachmentKeys);
    } catch (err) {
      console.error("Failed to delete R2 attachments:", err);
    }
  }

  await prisma.meeting.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
