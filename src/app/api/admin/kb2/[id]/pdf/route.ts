import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { generateKB2Pdf } from "@/lib/financing/kb2-pdf";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const form = await prisma.kB2Form.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          client: { select: { name: true, email: true, phone: true } },
        },
      },
      counterparty: true,
      estimate: { select: { number: true, title: true } },
      items: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!form) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  try {
    const buf = await generateKB2Pdf(form);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${form.number}.pdf"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[kb2/pdf] error:", err);
    return NextResponse.json({ error: "Помилка генерації PDF" }, { status: 500 });
  }
}
