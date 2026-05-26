import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { uploadFileToR2 } from "@/lib/r2-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const rfi = await prisma.rFI.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true, status: true },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (rfi.status === "CANCELLED") return NextResponse.json({ error: "rfi-cancelled" }, { status: 400 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const context = (form.get("context") as string) === "ANSWER" ? "ANSWER" : "QUESTION";
  if (files.length === 0) return NextResponse.json({ error: "no-files" }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: "file-too-large", fileName: f.name }, { status: 413 });
    }
  }

  const uploaded = [];
  for (const file of files) {
    const result = await uploadFileToR2(file, `rfis/${id}/attachments`);
    const att = await prisma.rFIAttachment.create({
      data: {
        rfiId: id,
        fileName: file.name,
        r2Key: result.key,
        mimeType: file.type,
        fileSize: file.size,
        uploadedById: session.user.id,
        context,
      },
      select: { id: true, fileName: true, r2Key: true, fileSize: true, mimeType: true, context: true, uploadedAt: true },
    });
    uploaded.push(att);
  }
  return NextResponse.json({ attachments: uploaded }, { status: 201 });
}
