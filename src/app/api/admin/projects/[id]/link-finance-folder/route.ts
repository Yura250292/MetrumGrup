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
import { ensureProjectMirror, syncProjectBudgetEntry } from "@/lib/folders/mirror-service";

export const runtime = "nodejs";

/**
 * GET — список FINANCE-папок активної фірми, які можна привʼязати до цього
 *      проекту (не привʼязані до іншого проекту, не системні, не mirror).
 *      Підтримує пошук через ?q=name.
 *
 * POST — { folderId } привʼязує вказану FINANCE-папку до проекту.
 *      Якщо у проекту вже є mirror — переносить всі записи + підпапки з
 *      вибраної у mirror, потім видаляє вибрану.
 *      Якщо у проекту mirror немає — робить вибрану папку mirror через
 *      ensureProjectMirror з linkExistingFolderId.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
    return forbiddenResponse();
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const candidates = await prisma.folder.findMany({
    where: {
      domain: "FINANCE",
      isSystem: false,
      mirroredFromProjectId: null,
      mirroredFromId: null,
      ...(project.firmId ? { firmId: project.firmId } : {}),
      ...(q.length >= 2
        ? { name: { contains: q, mode: "insensitive" } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      _count: { select: { financeEntries: true, children: true } },
    },
    orderBy: { name: "asc" },
    take: 30,
  });

  return NextResponse.json({
    data: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      entryCount: c._count.financeEntries,
      subfolderCount: c._count.children,
    })),
  });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, firmId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
    return forbiddenResponse();
  }
  try {
    assertCanAccessFirm(session, project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const body = (await request.json()) as { folderId?: string };
  const selectedFolderId = typeof body.folderId === "string" ? body.folderId : "";
  if (!selectedFolderId) {
    return NextResponse.json({ error: "folderId обовʼязковий" }, { status: 400 });
  }

  const selected = await prisma.folder.findUnique({
    where: { id: selectedFolderId },
    select: {
      id: true,
      domain: true,
      isSystem: true,
      mirroredFromId: true,
      mirroredFromProjectId: true,
      firmId: true,
      _count: { select: { financeEntries: true, children: true } },
    },
  });
  if (!selected) {
    return NextResponse.json({ error: "Папку не знайдено" }, { status: 404 });
  }
  if (selected.domain !== "FINANCE") {
    return NextResponse.json({ error: "Можна привʼязати лише FINANCE-папку" }, { status: 400 });
  }
  if (selected.isSystem || selected.mirroredFromId || selected.mirroredFromProjectId) {
    return NextResponse.json(
      { error: "Папка вже привʼязана або системна" },
      { status: 400 },
    );
  }
  if (
    selected.firmId &&
    project.firmId &&
    selected.firmId !== project.firmId
  ) {
    return NextResponse.json(
      { error: "Папка належить іншій фірмі" },
      { status: 400 },
    );
  }

  // Знаходимо поточний mirror проекту (якщо є).
  const currentMirror = await prisma.folder.findUnique({
    where: { mirroredFromProjectId: projectId },
    select: {
      id: true,
      _count: { select: { financeEntries: true, children: true } },
    },
  });

  let movedEntries = 0;
  let movedSubfolders = 0;
  let mirrorId: string;

  if (!currentMirror) {
    // Просто attach — селектована папка стає mirror.
    mirrorId = await ensureProjectMirror(projectId, undefined, {
      linkExistingFolderId: selected.id,
    });
  } else {
    // Зливаємо: переносимо все з selected → currentMirror, видаляємо selected.
    await prisma.$transaction(async (tx) => {
      const movedFiles = await tx.financeEntry.updateMany({
        where: { folderId: selected.id },
        data: { folderId: currentMirror.id },
      });
      movedEntries = movedFiles.count;

      const movedFolders = await tx.folder.updateMany({
        where: { parentId: selected.id },
        data: { parentId: currentMirror.id },
      });
      movedSubfolders = movedFolders.count;

      await tx.folder.delete({ where: { id: selected.id } });
    });
    mirrorId = currentMirror.id;
  }

  // Усі переміщені/нові FinanceEntry мають отримати firmId проекту і projectId,
  // якщо вони ще не мають — це робить mirror-папку повноцінною частиною проекту.
  await prisma.financeEntry.updateMany({
    where: {
      folderId: mirrorId,
      OR: [
        { projectId: null },
        { firmId: null },
      ],
    },
    data: {
      projectId,
      firmId: project.firmId ?? "metrum-group",
    },
  });

  try {
    await syncProjectBudgetEntry(projectId, session.user.id);
  } catch (err) {
    console.error("[link-finance-folder] sync budget failed:", err);
  }

  return NextResponse.json({
    data: { mirrorId, movedEntries, movedSubfolders },
  });
}
