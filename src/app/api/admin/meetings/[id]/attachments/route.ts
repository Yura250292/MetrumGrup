import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import {
  attachmentKindFor,
  isAllowedAttachment,
} from "@/lib/meetings/attachments";
import { z } from "zod";

// Фіксація вкладення наради у БД після успішного завантаження файлу в R2.
const schema = z.object({
  r2Key: z.string().min(1),
  url: z.string().url(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().max(128).optional().default(""),
  size: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    select: { id: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  if (!isAllowedAttachment(parsed.data.mimeType, parsed.data.originalName)) {
    return NextResponse.json(
      { error: "Непідтримуваний тип файлу" },
      { status: 400 }
    );
  }

  const mimeType = parsed.data.mimeType || "application/octet-stream";
  const attachment = await prisma.meetingAttachment.create({
    data: {
      meetingId: id,
      r2Key: parsed.data.r2Key,
      url: parsed.data.url,
      originalName: parsed.data.originalName,
      mimeType,
      size: parsed.data.size,
      kind: attachmentKindFor(mimeType, parsed.data.originalName),
      uploadedById: session.user.id,
    },
  });

  return NextResponse.json({ attachment });
}
