import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { uploadFileToR2 } from "@/lib/r2-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/// Завантаження сканованого підписаного клієнтом PDF.
/// Дозволено SUPER_ADMIN — для off-platform підписів.
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (role !== "SUPER_ADMIN") return forbiddenResponse();

  const { id } = await ctx.params;
  const co = await prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "file-required" }, { status: 400 });

  const result = await uploadFileToR2(file, `change-orders/${id}/signed`);
  await prisma.changeOrder.update({
    where: { id },
    data: { signedPdfUrl: result.url },
  });
  return NextResponse.json({ signedPdfUrl: result.url });
}
