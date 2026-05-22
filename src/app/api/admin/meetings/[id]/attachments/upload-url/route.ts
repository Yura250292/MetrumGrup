import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { createPresignedUploadUrl } from "@/lib/r2-client";
import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachment,
} from "@/lib/meetings/attachments";
import { z } from "zod";

// Presigned PUT-URL для завантаження вкладення наради у Cloudflare R2.
// Фото/PDF/Excel/документи — довідкові матеріали, AI їх не аналізує.
const schema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(128).optional().default(""),
  size: z.number().int().positive(),
});

export async function POST(
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

  if (parsed.data.size > ATTACHMENT_MAX_BYTES) {
    return NextResponse.json(
      { error: "Файл завеликий. Максимум 50 MB на вкладення." },
      { status: 413 }
    );
  }

  if (!isAllowedAttachment(parsed.data.contentType, parsed.data.fileName)) {
    return NextResponse.json(
      {
        error:
          "Непідтримуваний тип файлу. Дозволені: фото, PDF, Excel, Word, текст.",
      },
      { status: 400 }
    );
  }

  const contentType = parsed.data.contentType || "application/octet-stream";
  const { uploadUrl, key, publicUrl } = await createPresignedUploadUrl(
    parsed.data.fileName,
    contentType,
    `meetings/${id}/attachments`
  );

  return NextResponse.json({ uploadUrl, key, publicUrl });
}
