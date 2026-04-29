import { prisma } from "@/lib/prisma";
import type { FolderDomain } from "@prisma/client";
import {
  ensureMirror,
  updateMirror,
  deleteMirrorByProjectId,
  autoCreateProjectMirrorForFinanceFolder,
} from "@/lib/folders/mirror-service";

export const SYSTEM_FOLDER_RENAME_ERROR = "Системну папку перейменувати не можна";
export const SYSTEM_FOLDER_MOVE_ERROR = "Системну папку переміщувати не можна";
export const SYSTEM_FOLDER_DELETE_ERROR = "Системну папку видалити не можна";
export const MIRROR_FOLDER_EDIT_ERROR =
  "Папка синхронізована з Проєктами — редагуйте її через розділ Проєкти";
export const MIRROR_FOLDER_DELETE_ERROR =
  "Папка синхронізована з Проєктами — видаляйте її через розділ Проєкти";

const USER_ROOT_FINANCE_MIN_SORT = 100;

export async function createFolder(opts: {
  domain: FolderDomain;
  name: string;
  parentId?: string | null;
  color?: string | null;
  /** firmId stamping. Береться з активної firm (cookie) у API роуті. */
  firmId?: string | null;
}) {
  // Validate parent belongs to same domain
  let parentFirmId: string | null = null;
  if (opts.parentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: opts.parentId },
      select: { domain: true, mirroredFromProjectId: true, firmId: true },
    });
    if (!parent || parent.domain !== opts.domain) {
      throw new Error("Батьківська папка не знайдена");
    }
    // Не дозволяємо створювати папки-діти під FINANCE-mirror конкретного проєкту —
    // проєкт не папка, у ньому не має бути підпапок у дереві.
    if (parent.mirroredFromProjectId) {
      throw new Error(MIRROR_FOLDER_EDIT_ERROR);
    }
    parentFirmId = parent.firmId;
  }

  // Get next sortOrder
  const last = await prisma.folder.findFirst({
    where: { domain: opts.domain, parentId: opts.parentId ?? null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  let sortOrder = (last?.sortOrder ?? 0) + 1;
  if (opts.domain === "FINANCE" && !opts.parentId && sortOrder < USER_ROOT_FINANCE_MIN_SORT) {
    sortOrder = USER_ROOT_FINANCE_MIN_SORT;
  }

  // firmId: явно з opts > успадковується з parent > metrum-group fallback
  const firmId = opts.firmId ?? parentFirmId ?? "metrum-group";

  const folder = await prisma.folder.create({
    data: {
      domain: opts.domain,
      name: opts.name.trim(),
      parentId: opts.parentId ?? null,
      color: opts.color ?? null,
      sortOrder,
      firmId,
    },
  });

  if (folder.domain === "PROJECT") {
    await ensureMirror(folder.id);
  } else if (folder.domain === "FINANCE") {
    // Якщо FINANCE-папка створена під деревом "Проєкти" — створити PROJECT-джерело
    await autoCreateProjectMirrorForFinanceFolder(folder.id);
  }

  return folder;
}

export async function renameFolder(id: string, name: string) {
  const existing = await prisma.folder.findUnique({
    where: { id },
    select: { isSystem: true, domain: true, mirroredFromId: true },
  });
  if (!existing) throw new Error("Папку не знайдено");
  if (existing.isSystem) throw new Error(SYSTEM_FOLDER_RENAME_ERROR);
  if (existing.mirroredFromId) throw new Error(MIRROR_FOLDER_EDIT_ERROR);

  const updated = await prisma.folder.update({
    where: { id },
    data: { name: name.trim() },
  });

  if (updated.domain === "PROJECT") {
    await updateMirror(updated.id);
  }

  return updated;
}

export const FOLDER_CYCLE_ERROR =
  "Не можна перемістити папку всередину самої себе або своїх вкладень";

async function wouldCreateCycle(folderId: string, newParentId: string): Promise<boolean> {
  if (folderId === newParentId) return true;
  let cursor: string | null = newParentId;
  // Walk parent chain — if we hit folderId, we'd close a cycle.
  // Bound the traversal to avoid runaway loops on already-corrupted data.
  for (let i = 0; i < 64 && cursor; i += 1) {
    if (cursor === folderId) return true;
    const parent: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    if (!parent) return false;
    cursor = parent.parentId;
  }
  return false;
}

export async function updateFolder(
  id: string,
  data: { name?: string; color?: string | null; parentId?: string | null; sortOrder?: number },
  opts: { allowSystemBypass?: boolean } = {},
) {
  const existing = await prisma.folder.findUnique({
    where: { id },
    select: { isSystem: true, domain: true, mirroredFromId: true },
  });
  if (!existing) throw new Error("Папку не знайдено");

  if (existing.isSystem && !opts.allowSystemBypass) {
    if (data.name !== undefined) throw new Error(SYSTEM_FOLDER_RENAME_ERROR);
    if (data.parentId !== undefined) throw new Error(SYSTEM_FOLDER_MOVE_ERROR);
  }
  if (existing.mirroredFromId && !opts.allowSystemBypass) {
    throw new Error(MIRROR_FOLDER_EDIT_ERROR);
  }

  if (data.parentId && (await wouldCreateCycle(id, data.parentId))) {
    throw new Error(FOLDER_CYCLE_ERROR);
  }

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.color !== undefined) update.color = data.color;
  if (data.parentId !== undefined) update.parentId = data.parentId;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

  const updated = await prisma.folder.update({ where: { id }, data: update });

  if (updated.domain === "PROJECT") {
    await updateMirror(updated.id);
  }

  return updated;
}

export async function deleteFolder(
  id: string,
  opts: { allowSystemBypass?: boolean } = {},
) {
  const existing = await prisma.folder.findUnique({
    where: { id },
    select: { isSystem: true, domain: true, mirroredFromId: true },
  });
  if (existing?.isSystem && !opts.allowSystemBypass) {
    throw new Error(SYSTEM_FOLDER_DELETE_ERROR);
  }
  if (existing?.mirroredFromId && !opts.allowSystemBypass) {
    throw new Error(MIRROR_FOLDER_DELETE_ERROR);
  }

  if (existing?.domain === "PROJECT") {
    await deleteMirrorByProjectId(id);
  }

  return prisma.folder.delete({ where: { id } });
}

export async function moveItems(opts: {
  domain: FolderDomain;
  itemIds: string[];
  targetFolderId: string | null;
}) {
  // Validate target folder if provided
  if (opts.targetFolderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: opts.targetFolderId },
      select: { domain: true },
    });
    if (!folder || folder.domain !== opts.domain) {
      throw new Error("Цільова папка не знайдена");
    }
  }

  const data = { folderId: opts.targetFolderId };

  switch (opts.domain) {
    case "PROJECT":
      return prisma.project.updateMany({
        where: { id: { in: opts.itemIds } },
        data,
      });
    case "ESTIMATE":
      return prisma.estimate.updateMany({
        where: { id: { in: opts.itemIds } },
        data,
      });
    case "FINANCE":
      return prisma.financeEntry.updateMany({
        where: { id: { in: opts.itemIds } },
        data,
      });
    case "MEETING":
      return prisma.meeting.updateMany({
        where: { id: { in: opts.itemIds } },
        data,
      });
  }
}
