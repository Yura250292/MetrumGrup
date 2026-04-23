import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { createPresignedUploadUrl } from "@/lib/r2-client";

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILES = 10;

const ALLOWED_PREFIXES = ["image/", "audio/", "video/", "text/", "application/"];

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const { files } = (await request.json()) as {
      files: { name: string; type: string; size: number }[];
    };

    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Від 1 до ${MAX_FILES} файлів` },
        { status: 400 },
      );
    }

    for (const f of files) {
      if (typeof f?.name !== "string" || typeof f?.type !== "string" || typeof f?.size !== "number") {
        return NextResponse.json({ error: "Некоректні дані файлу" }, { status: 400 });
      }
      if (f.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `Файл "${f.name}" перевищує 25 МБ` },
          { status: 400 },
        );
      }
      if (!ALLOWED_PREFIXES.some((p) => f.type.startsWith(p))) {
        return NextResponse.json(
          { error: `Тип файлу "${f.type}" не дозволено` },
          { status: 400 },
        );
      }
    }

    const uploads = await Promise.all(
      files.map(async (f) => {
        const result = await createPresignedUploadUrl(
          f.name,
          f.type,
          `chat/${session.user.id}`,
        );
        return {
          name: f.name,
          size: f.size,
          mimeType: f.type,
          uploadUrl: result.uploadUrl,
          r2Key: result.key,
          publicUrl: result.publicUrl,
        };
      }),
    );

    return NextResponse.json({ uploads });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    console.error("[chat/upload-url] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
