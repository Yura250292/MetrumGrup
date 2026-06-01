import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  ADMIN_ROLES,
} from "@/lib/auth-utils";
import { assertCanAccessFirm, getActiveRoleFromSession } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { auditLog } from "@/lib/audit";
import { checkProjectCompletionReadiness } from "@/lib/projects/activation";

export const runtime = "nodejs";

/**
 * POST /api/admin/projects/[id]/complete (P11) — закриття проєкту вручну PM.
 *
 * Проєкт не закривається автоматично — лише PM/SUPER_ADMIN. Перед закриттям
 * усі розділи (top-level stages) мають бути COMPLETED.
 * При успіху: status = COMPLETED, actualEndDate = now().
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true, status: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }
  let activeFirmId = project.firmId;
  try {
    ({ firmId: activeFirmId } = await resolveFirmScopeForRequest(session));
  } catch {
    /* fallback: project firm */
  }
  const role = getActiveRoleFromSession(session, activeFirmId ?? project.firmId);
  if (!role || !ADMIN_ROLES.includes(role)) return forbiddenResponse();

  if (project.status === "COMPLETED") {
    return NextResponse.json({ error: "Проєкт уже закрито" }, { status: 409 });
  }
  if (project.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Закрити можна лише активний проєкт" },
      { status: 409 },
    );
  }

  const readiness = await checkProjectCompletionReadiness(projectId);
  if (!readiness.ok) {
    return NextResponse.json(
      {
        error: "Project not ready",
        message: "Не всі розділи завершені",
        readiness,
      },
      { status: 422 },
    );
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { status: "COMPLETED", actualEndDate: new Date() },
    select: { id: true, status: true, actualEndDate: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "UPDATE",
    entity: "Project",
    entityId: projectId,
    projectId,
    newData: { status: "COMPLETED" },
  });

  return NextResponse.json({ data: updated });
}

/**
 * GET — readiness-checklist для UI (кнопка «Закрити»).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true, status: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const readiness = await checkProjectCompletionReadiness(projectId);
  return NextResponse.json({ data: { status: project.status, readiness } });
}
