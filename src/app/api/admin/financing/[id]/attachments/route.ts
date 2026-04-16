import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

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
    const body = await request.json();
    const files = Array.isArray(body.files) ? body.files : null;
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "files обов'язковий" }, { status: 400 });
    }

    const created = await prisma.$transaction(
      files.map((f: any) =>
        prisma.financeEntryAttachment.create({
          data: {
            entryId: id,
            r2Key: String(f.r2Key ?? f.key ?? ""),
            originalName: String(f.originalName ?? f.fileName ?? "file"),
            mimeType: String(f.mimeType ?? f.contentType ?? "application/octet-stream"),
            size: Number(f.size ?? 0),
            uploadedById: session.user.id,
          },
        })
      )
    );

    await prisma.financeEntry.update({
      where: { id },
      data: { updatedById: session.user.id },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[financing/attachments/POST] error:", error);
    return NextResponse.json({ error: "Помилка реєстрації файлів" }, { status: 500 });
  }
}
