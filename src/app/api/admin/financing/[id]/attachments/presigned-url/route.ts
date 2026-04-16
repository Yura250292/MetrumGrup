import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { createPresignedUploadUrl } from "@/lib/r2-client";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const entry = await prisma.financeEntry.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Операція не знайдена" }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const files = Array.isArray(body.files) ? body.files : null;
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "files обов'язковий" }, { status: 400 });
    }

    const presignedUrls = await Promise.all(
      files.map(async (f: { name?: unknown; type?: unknown }) => {
        const fileName = typeof f.name === "string" ? f.name : "file";
        const contentType =
          typeof f.type === "string" && f.type ? f.type : "application/octet-stream";
        const { uploadUrl, key, publicUrl } = await createPresignedUploadUrl(
          fileName,
          contentType,
          `financing/${id}`
        );
        return { fileName, contentType, uploadUrl, key, publicUrl };
      })
    );

    return NextResponse.json({ presignedUrls });
  } catch (error) {
    console.error("[financing/attachments/presigned-url] error:", error);
    return NextResponse.json({ error: "Помилка створення URL" }, { status: 500 });
  }
}
