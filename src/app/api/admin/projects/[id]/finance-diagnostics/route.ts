import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
  assertCanAccessFirm,
} from "@/lib/firm/scope";
import { syncProjectBudgetEntry } from "@/lib/folders/mirror-service";
import { canRunFinanceDiagnostics } from "@/lib/financing/rbac";

export const runtime = "nodejs";

/**
 * Шукає розбіжності між фінансовими записами проекту і його mirror-папкою:
 *  1. orphansInMirror — у mirror+піддерево, але projectId != цей проект
 *     (зазвичай projectId IS NULL; ці записи показуються у Фінансуванні
 *     розділу, але не на сторінці проекту).
 *  2. outsideOfMirror — projectId = цей, але folderId не у mirror-tree
 *     (записи проекту "висять" поза його папкою).
 *  3. missingFirmId — projectId = цей, але firmId IS NULL.
 *
 * GET — повертає лічильники + по кілька зразків для preview.
 * POST — виправляє: stamp projectId на orphans, stamp firmId на missing,
 *        переносить outside-записи у mirror-папку (folderId = mirror.id).
 *        Потім запускає syncProjectBudgetEntry щоб оновити PLAN-EXPENSE.
 */
async function loadContext(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) return null;

  const mirror = await prisma.folder.findUnique({
    where: { mirroredFromProjectId: project.id },
    select: { id: true, name: true },
  });

  // Усі FINANCE папки для recursion descendants.
  const allFolders = await prisma.folder.findMany({
    where: { domain: "FINANCE" },
    select: { id: true, parentId: true },
  });
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    if (f.parentId) {
      const arr = childrenMap.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenMap.set(f.parentId, arr);
    }
  }

  let mirrorDescendants: string[] = [];
  if (mirror) {
    const stack = [mirror.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      mirrorDescendants.push(id);
      const kids = childrenMap.get(id);
      if (kids) stack.push(...kids);
    }
  }

  return { project, mirror, mirrorDescendants };
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await ctx.params;
  const c = await loadContext(projectId);
  if (!c) return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!canRunFinanceDiagnostics(activeRole)) return forbiddenResponse();
  try {
    assertCanAccessFirm(session, c.project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const [orphansInMirror, outsideOfMirror, missingFirmId] = await Promise.all([
    c.mirrorDescendants.length > 0
      ? prisma.financeEntry.findMany({
          where: {
            folderId: { in: c.mirrorDescendants },
            isArchived: false,
            OR: [{ projectId: null }, { projectId: { not: c.project.id } }],
          },
          select: {
            id: true,
            title: true,
            type: true,
            kind: true,
            amount: true,
            projectId: true,
            project: { select: { title: true } },
          },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.financeEntry.findMany({
      where: {
        projectId: c.project.id,
        isArchived: false,
        ...(c.mirrorDescendants.length > 0
          ? { OR: [{ folderId: null }, { folderId: { notIn: c.mirrorDescendants } }] }
          : {}),
      },
      select: {
        id: true,
        title: true,
        type: true,
        kind: true,
        amount: true,
        folderId: true,
        folder: { select: { name: true } },
      },
      take: 20,
    }),
    prisma.financeEntry.count({
      where: {
        projectId: c.project.id,
        isArchived: false,
        firmId: null,
      },
    }),
  ]);

  // Точні лічильники без обмеження take.
  const [orphansInMirrorCount, outsideOfMirrorCount] = await Promise.all([
    c.mirrorDescendants.length > 0
      ? prisma.financeEntry.count({
          where: {
            folderId: { in: c.mirrorDescendants },
            isArchived: false,
            OR: [{ projectId: null }, { projectId: { not: c.project.id } }],
          },
        })
      : Promise.resolve(0),
    prisma.financeEntry.count({
      where: {
        projectId: c.project.id,
        isArchived: false,
        ...(c.mirrorDescendants.length > 0
          ? { OR: [{ folderId: null }, { folderId: { notIn: c.mirrorDescendants } }] }
          : {}),
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      mirrorFolderId: c.mirror?.id ?? null,
      mirrorFolderName: c.mirror?.name ?? null,
      counts: {
        orphansInMirror: orphansInMirrorCount,
        outsideOfMirror: outsideOfMirrorCount,
        missingFirmId,
      },
      samples: {
        orphansInMirror: orphansInMirror.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          kind: e.kind,
          amount: Number(e.amount),
          currentProjectTitle: e.project?.title ?? null,
        })),
        outsideOfMirror: outsideOfMirror.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          kind: e.kind,
          amount: Number(e.amount),
          folderName: e.folder?.name ?? null,
        })),
      },
    },
  });
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await ctx.params;
  const c = await loadContext(projectId);
  if (!c) return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!canRunFinanceDiagnostics(activeRole)) return forbiddenResponse();
  try {
    assertCanAccessFirm(session, c.project.firmId);
  } catch {
    return forbiddenResponse();
  }

  let stampedProjectId = 0;
  let stampedFirmId = 0;
  let movedIntoMirror = 0;

  if (c.mirrorDescendants.length > 0) {
    // 1) Orphans у mirror-tree з projectId IS NULL → stamp projectId.
    const r1 = await prisma.financeEntry.updateMany({
      where: {
        folderId: { in: c.mirrorDescendants },
        isArchived: false,
        projectId: null,
      },
      data: { projectId: c.project.id },
    });
    stampedProjectId = r1.count;
  }

  if (c.project.firmId) {
    const r2 = await prisma.financeEntry.updateMany({
      where: { projectId: c.project.id, isArchived: false, firmId: null },
      data: { firmId: c.project.firmId },
    });
    stampedFirmId = r2.count;
  }

  // 3) Записи з projectId=цей, але folderId або null, або поза mirror-tree —
  // переносимо у mirror-папку (якщо є). Records з folderId у іншій PROJECT mirror
  // (тобто у чужому mirror-tree) НЕ чіпаємо — це може бути спільний контекст.
  if (c.mirror) {
    const r3 = await prisma.financeEntry.updateMany({
      where: {
        projectId: c.project.id,
        isArchived: false,
        OR: [
          { folderId: null },
          {
            // folderId не входить у наше піддерево І не належить mirror-папці іншого проекту
            AND: [
              { folderId: { notIn: c.mirrorDescendants } },
              {
                folder: {
                  is: {
                    AND: [
                      { mirroredFromProjectId: null },
                      { mirroredFromId: null },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      data: { folderId: c.mirror.id },
    });
    movedIntoMirror = r3.count;
  }

  try {
    await syncProjectBudgetEntry(projectId, session.user.id);
  } catch (err) {
    console.error("[finance-diagnostics] sync budget failed:", err);
  }

  return NextResponse.json({
    data: { stampedProjectId, stampedFirmId, movedIntoMirror },
  });
}
