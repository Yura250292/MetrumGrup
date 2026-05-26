import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; v: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id, v } = await params;

  const version = parseInt(v, 10);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "InvalidVersion" }, { status: 400 });
  }

  // Перевіряємо доступ через template firm (revision firm не зберігаємо).
  const tpl = await prisma.formTemplate.findUnique({
    where: { id },
    select: { firmId: true },
  });
  if (!tpl) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, tpl.firmId);
  } catch {
    return forbiddenResponse();
  }

  const rev = await prisma.formTemplateRevision.findUnique({
    where: { templateId_version: { templateId: id, version } },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!rev) return NextResponse.json({ error: "NotFound" }, { status: 404 });

  return NextResponse.json({ data: rev });
}
