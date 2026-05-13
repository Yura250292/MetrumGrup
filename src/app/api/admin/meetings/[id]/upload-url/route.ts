import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { createPresignedUploadUrl } from "@/lib/r2-client";
import { z } from "zod";

// AssemblyAI (наш дефолтний провайдер) приймає до 5 GB / 10 годин.
// Whisper fallback має ліміт 25 MB, але у такому випадку розпізнавання
// просто завершиться помилкою на /transcribe — а сам запис ми обовʼязково
// маємо зберегти в R2, інакше користувач втрачає нараду цілком.
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "mp4",
  "m4a",
  "mpeg",
  "mpga",
  "wav",
  "webm",
  "ogg",
  "oga",
  "flac",
  "aac",
  "opus",
  "amr",
  "3gp",
]);

function isAcceptableAudio(contentType: string, fileName: string): boolean {
  if (contentType.startsWith("audio/")) return true;
  // Some phones tag audio as video/mp4 or video/webm when saving m4a/webm.
  if (contentType === "video/mp4" || contentType === "video/webm") return true;
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return AUDIO_EXTENSIONS.has(ext);
}

const schema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
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
  const meeting = await prisma.meeting.findUnique({ where: { id } });
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

  if (parsed.data.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error:
          "Файл завеликий. Максимум 500 MB (≈ 10 годин аудіо у 96 кбіт/с).",
      },
      { status: 413 }
    );
  }

  if (!isAcceptableAudio(parsed.data.contentType, parsed.data.fileName)) {
    return NextResponse.json(
      { error: "Дозволені лише аудіо-файли" },
      { status: 400 }
    );
  }

  const { uploadUrl, key, publicUrl } = await createPresignedUploadUrl(
    parsed.data.fileName,
    parsed.data.contentType,
    `meetings/${id}`
  );

  return NextResponse.json({ uploadUrl, key, publicUrl });
}
