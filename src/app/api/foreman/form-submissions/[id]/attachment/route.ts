import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getForemanPutUrl } from "@/lib/foreman/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;

const Body = z.object({
  fieldKey: z.string().min(1).max(64),
  fileName: z.string().min(1).max(256),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(MAX_SIZE),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let session;
  let firmId: string | null;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Доступ: foreman додає вкладення лише до власного submission, у своїй фірмі.
  const sub = await prisma.formSubmission.findUnique({
    where: { id },
    select: { id: true, firmId: true, submittedById: true },
  });
  if (!sub) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  if (sub.submittedById !== session.user.id) return forbiddenResponse();
  if (sub.firmId && firmId && sub.firmId !== firmId) return forbiddenResponse();

  let presigned;
  try {
    presigned = await getForemanPutUrl({
      userId: session.user.id,
      originalName: parsed.data.fileName,
      mimeType: parsed.data.contentType,
    });
  } catch (e) {
    console.error("[foreman/form-submissions/attachment] presign failed:", e);
    return NextResponse.json(
      { error: "Server", message: "Не вдалось отримати посилання" },
      { status: 500 },
    );
  }

  const created = await prisma.formSubmissionAttachment.create({
    data: {
      submissionId: id,
      fieldKey: parsed.data.fieldKey,
      r2Key: presigned.key,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
    },
  });

  return NextResponse.json({
    attachmentId: created.id,
    r2Key: presigned.key,
    putUrl: presigned.putUrl,
  }, { status: 201 });
}
