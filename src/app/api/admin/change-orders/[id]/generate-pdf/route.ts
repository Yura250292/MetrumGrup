import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { generateChangeOrderPdf } from "@/lib/change-orders/pdf-generator";
import { uploadBufferToR2 } from "@/lib/r2-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const co = await prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    include: {
      firm: { select: { name: true, legalName: true } },
      project: { select: { title: true, address: true } },
      requestedBy: { select: { name: true } },
      items: {
        include: { costCode: { select: { code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const buf = await generateChangeOrderPdf(co);
  const key = `change-orders/${id}/CO-${co.number}.pdf`;
  const pdfUrl = await uploadBufferToR2(key, buf, "application/pdf");
  await prisma.changeOrder.update({ where: { id }, data: { pdfUrl } });
  return NextResponse.json({ pdfUrl });
}
