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

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const co = await prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0)
    return NextResponse.json({ error: "no-files" }, { status: 400 });

  const uploaded = [];
  for (const file of files) {
    const result = await uploadFileToR2(file, `change-orders/${id}/attachments`);
    const att = await prisma.changeOrderAttachment.create({
      data: {
        changeOrderId: id,
        fileName: file.name,
        r2Url: result.url,
        mimeType: file.type,
        fileSize: file.size,
        uploadedById: session.user.id,
      },
    });
    uploaded.push({ id: att.id, fileName: att.fileName, r2Url: att.r2Url });
  }
  return NextResponse.json({ attachments: uploaded }, { status: 201 });
}
