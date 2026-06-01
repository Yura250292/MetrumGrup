import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
import { checkProjectActivationReadiness } from "@/lib/projects/activation";

export const runtime = "nodejs";

/**
 * POST /api/admin/projects/[id]/activate (P1/P4) — запуск проєкту.
 *
 * Гард: SUPER_ADMIN / MANAGER у межах фірми проєкту.
 * Перед запуском перевіряємо готовність (checkProjectActivationReadiness):
 *   є кошторис + заморожена активна версія + розділ + робота + усі
 *   reportable-роботи мають effective foreman.
 * При успіху: status = ACTIVE, actualStartDate = дата з форми (або now()).
 */
const Body = z.object({
  actualStartDate: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true, status: true, startDate: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  // Firm-scoped role: роль рахуємо у межах фірми проєкту.
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

  if (project.status === "ACTIVE") {
    return NextResponse.json({ error: "Проєкт уже запущено" }, { status: 409 });
  }
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Завершений/скасований проєкт не можна запустити" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", message: "Невалідна дата старту" },
      { status: 400 },
    );
  }

  const readiness = await checkProjectActivationReadiness(projectId);
  if (!readiness.ok) {
    return NextResponse.json(
      {
        error: "Project not ready",
        message: "Проєкт не готовий до запуску",
        readiness,
      },
      { status: 422 },
    );
  }

  const actualStartDate = parsed.data.actualStartDate
    ? new Date(parsed.data.actualStartDate)
    : new Date();

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { status: "ACTIVE", actualStartDate },
    select: { id: true, status: true, actualStartDate: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "UPDATE",
    entity: "Project",
    entityId: projectId,
    projectId,
    newData: { status: "ACTIVE", actualStartDate },
  });

  return NextResponse.json({ data: updated });
}

/**
 * GET — readiness-checklist для UI (кнопка «Запустити» + чеклист).
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

  const readiness = await checkProjectActivationReadiness(projectId);
  return NextResponse.json({ data: { status: project.status, readiness } });
}
