import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { createPresignedUploadUrl } from "@/lib/r2-client";

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const { files } = (await request.json()) as {
      files: { name: string; type: string; size: number }[];
    };

    if (!Array.isArray(files) || files.length === 0 || files.length > 10) {
      return NextResponse.json(
        { error: "Від 1 до 10 файлів" },
        { status: 400 },
      );
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25MB per file
    for (const f of files) {
      if (f.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `Файл "${f.name}" перевищує 25 МБ` },
          { status: 400 },
        );
      }
    }

    const uploads = await Promise.all(
      files.map(async (f) => {
        const result = await createPresignedUploadUrl(
          f.name,
          f.type,
          `comments/${session.user.id}`,
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
    console.error("[comments/upload-presigned] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
