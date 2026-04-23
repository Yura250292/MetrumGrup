import { prisma } from "@/lib/prisma";
import type { Prisma, Folder } from "@prisma/client";

export const FINANCE_PROJECTS_ROOT_SLUG = "mirrored-projects";
const FINANCE_PROJECTS_ROOT_NAME = "Проєкти";
const FINANCE_PROJECTS_ROOT_SORT = 10;

type Tx = Prisma.TransactionClient | typeof prisma;

export async function ensureFinanceProjectsRoot(tx: Tx = prisma): Promise<string> {
  const existing = await tx.folder.findFirst({
    where: { domain: "FINANCE", slug: FINANCE_PROJECTS_ROOT_SLUG },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.folder.create({
    data: {
      domain: "FINANCE",
      name: FINANCE_PROJECTS_ROOT_NAME,
      slug: FINANCE_PROJECTS_ROOT_SLUG,
      isSystem: true,
      parentId: null,
      sortOrder: FINANCE_PROJECTS_ROOT_SORT,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Повертає id FINANCE-mirror для заданої PROJECT-папки. Якщо mirror ще нема —
 * створює рекурсивно по всьому ланцюгу батьків. Ідемпотентно.
 */
export async function ensureMirror(
  projectFolderId: string,
  tx: Tx = prisma,
): Promise<string> {
  const project = await tx.folder.findUnique({
    where: { id: projectFolderId },
    select: { id: true, name: true, color: true, parentId: true, sortOrder: true, domain: true },
  });
  if (!project) throw new Error("Папку не знайдено");
  if (project.domain !== "PROJECT") {
    throw new Error("ensureMirror можна викликати лише для PROJECT-папки");
  }

  const existingMirror = await tx.folder.findUnique({
    where: { mirroredFromId: project.id },
    select: { id: true },
  });
  if (existingMirror) return existingMirror.id;

  // Parent: root "Проєкти" або mirror батьківської PROJECT-папки
  const parentMirrorId = project.parentId
    ? await ensureMirror(project.parentId, tx)
    : await ensureFinanceProjectsRoot(tx);

  // Дедублікат за назвою: якщо під тим же parent уже існує FINANCE-папка з такою ж
  // назвою без mirroredFromId — прив'язати її замість створення нової.
  const nameMatch = await tx.folder.findFirst({
    where: {
      domain: "FINANCE",
      parentId: parentMirrorId,
      name: project.name,
      mirroredFromId: null,
    },
    select: { id: true },
  });
  if (nameMatch) {
    await tx.folder.update({
      where: { id: nameMatch.id },
      data: { mirroredFromId: project.id, color: project.color },
    });
    return nameMatch.id;
  }

  const created = await tx.folder.create({
    data: {
      domain: "FINANCE",
      name: project.name,
      color: project.color,
      parentId: parentMirrorId,
      mirroredFromId: project.id,
      sortOrder: project.sortOrder,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Синхронізувати зміни PROJECT-папки у її FINANCE-mirror (name, color, parent, sortOrder).
 */
export async function updateMirror(
  projectFolderId: string,
  tx: Tx = prisma,
): Promise<void> {
  const project = await tx.folder.findUnique({
    where: { id: projectFolderId },
    select: { id: true, name: true, color: true, parentId: true, sortOrder: true, domain: true },
  });
  if (!project || project.domain !== "PROJECT") return;

  const mirror = await tx.folder.findUnique({
    where: { mirroredFromId: project.id },
    select: { id: true },
  });
  if (!mirror) {
    // mirror'а ще нема — створюємо, не оновлюємо
    await ensureMirror(project.id, tx);
    return;
  }

  const parentMirrorId = project.parentId
    ? await ensureMirror(project.parentId, tx)
    : await ensureFinanceProjectsRoot(tx);

  await tx.folder.update({
    where: { id: mirror.id },
    data: {
      name: project.name,
      color: project.color,
      parentId: parentMirrorId,
      sortOrder: project.sortOrder,
    },
  });
}

/**
 * Видалити FINANCE-mirror, коли видаляється PROJECT-папка. FinanceEntry, що лежать
 * у mirror або його subtree, переносимо у root "Проєкти", щоб не загубити їх.
 * Потім видаляємо сам mirror (дочірні папки каскадно підуть).
 */
export async function deleteMirrorByProjectId(
  projectFolderId: string,
  tx: Tx = prisma,
): Promise<void> {
  const mirror = await tx.folder.findUnique({
    where: { mirroredFromId: projectFolderId },
    select: { id: true },
  });
  if (!mirror) return;

  const subtreeIds = await collectSubtreeIds(tx, [mirror.id]);
  const rootId = await ensureFinanceProjectsRoot(tx);
  await tx.financeEntry.updateMany({
    where: { folderId: { in: subtreeIds } },
    data: { folderId: rootId },
  });
  await tx.folder.delete({ where: { id: mirror.id } });
}

async function collectSubtreeIds(tx: Tx, rootIds: string[]): Promise<string[]> {
  const all = new Set<string>(rootIds);
  let frontier = rootIds;
  while (frontier.length > 0) {
    const children = await tx.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const next = children.map((c) => c.id).filter((id) => !all.has(id));
    next.forEach((id) => all.add(id));
    frontier = next;
  }
  return [...all];
}

/**
 * Backfill: консолідує FINANCE-папки під системну "Проєкти" і зіставляє їх з
 * PROJECT-папками за назвою. Ідемпотентно.
 *
 * Порядок:
 *  1. Зібрати всі кореневі не-системні FINANCE-папки, перемістити під root "Проєкти".
 *  2. Для кожної PROJECT-папки: знайти під root "Проєкти" FINANCE-папку з такою
 *     назвою — звʼязати через mirroredFromId. Якщо нема — створити mirror.
 *  3. Прибрати дублікати: якщо зʼявилось два записи для одного PROJECT (існуюча
 *     + створена раніше некоректним backfill), видалити новішу.
 */
export async function backfillProjectMirrors(): Promise<{
  moved: number;
  linked: number;
  created: number;
  dedup: number;
}> {
  const rootId = await ensureFinanceProjectsRoot();

  // 1a. Розв'язати clash: якщо у корені FINANCE є папка, і під "Проєкти" вже існує
  // mirror з такою ж назвою (створений попереднім невдалим запуском) — злити їх:
  // стару лишаємо як джерело, її зв'язуємо з PROJECT, mirror'у видаляємо.
  const rootFinance = await prisma.folder.findMany({
    where: { domain: "FINANCE", parentId: null, isSystem: false },
    select: { id: true, name: true },
  });
  for (const f of rootFinance) {
    const mirrorClash = await prisma.folder.findFirst({
      where: {
        domain: "FINANCE",
        parentId: rootId,
        name: f.name,
        mirroredFromId: { not: null },
      },
      select: { id: true, mirroredFromId: true },
    });
    if (!mirrorClash) continue;
    // Переносимо FinanceEntry з mirror на стару кореневу папку, видаляємо mirror,
    // стару прикріплюємо як новий mirror.
    await prisma.financeEntry.updateMany({
      where: { folderId: mirrorClash.id },
      data: { folderId: f.id },
    });
    await prisma.folder.delete({ where: { id: mirrorClash.id } });
    await prisma.folder.update({
      where: { id: f.id },
      data: { mirroredFromId: mirrorClash.mirroredFromId },
    });
  }

  // 1b. Перемістити решту кореневих не-системних FINANCE-папок під "Проєкти"
  const rootFinanceAfter = await prisma.folder.findMany({
    where: { domain: "FINANCE", parentId: null, isSystem: false },
    select: { id: true, name: true },
  });
  let moved = 0;
  for (const f of rootFinanceAfter) {
    const clash = await prisma.folder.findFirst({
      where: { domain: "FINANCE", parentId: rootId, name: f.name, NOT: { id: f.id } },
      select: { id: true },
    });
    if (clash) continue;
    await prisma.folder.update({
      where: { id: f.id },
      data: { parentId: rootId },
    });
    moved++;
  }

  // 2. Для кожної PROJECT-папки — звʼязати або створити mirror
  const projectFolders = await prisma.folder.findMany({
    where: { domain: "PROJECT" },
    select: { id: true, name: true, color: true, parentId: true, sortOrder: true },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
  });

  let linked = 0;
  let created = 0;
  let dedup = 0;

  for (const pf of projectFolders) {
    // Визначити батька mirror'а у FINANCE
    const parentMirrorId = pf.parentId
      ? await ensureMirror(pf.parentId)
      : rootId;

    // Чи є вже звʼязаний mirror?
    const existingMirror = await prisma.folder.findUnique({
      where: { mirroredFromId: pf.id },
      select: { id: true, name: true, parentId: true },
    });

    // Чи є під тим же parent'ом FINANCE-папка з тією ж назвою, ще не звʼязана?
    const nameMatch = await prisma.folder.findFirst({
      where: {
        domain: "FINANCE",
        parentId: parentMirrorId,
        name: pf.name,
        mirroredFromId: null,
      },
      select: { id: true, createdAt: true },
    });

    if (existingMirror && nameMatch) {
      // Є і mirror, і не-mirror однойменна — зливаємо: non-mirror лишаємо як джерело,
      // записи з mirror переносимо в non-mirror, далі видаляємо mirror.
      await prisma.financeEntry.updateMany({
        where: { folderId: existingMirror.id },
        data: { folderId: nameMatch.id },
      });
      await prisma.folder.delete({ where: { id: existingMirror.id } });
      await prisma.folder.update({
        where: { id: nameMatch.id },
        data: { mirroredFromId: pf.id, color: pf.color },
      });
      dedup++;
      linked++;
      continue;
    }

    if (existingMirror) {
      // Перенесемо до правильного parent'а якщо зʼїхав
      if (existingMirror.parentId !== parentMirrorId) {
        await prisma.folder.update({
          where: { id: existingMirror.id },
          data: { parentId: parentMirrorId, color: pf.color, sortOrder: pf.sortOrder },
        });
      }
      continue;
    }

    if (nameMatch) {
      await prisma.folder.update({
        where: { id: nameMatch.id },
        data: { mirroredFromId: pf.id, color: pf.color },
      });
      linked++;
      continue;
    }

    await prisma.folder.create({
      data: {
        domain: "FINANCE",
        name: pf.name,
        color: pf.color,
        parentId: parentMirrorId,
        mirroredFromId: pf.id,
        sortOrder: pf.sortOrder,
      },
    });
    created++;
  }

  return { moved, linked, created, dedup };
}

export function isMirror(folder: Pick<Folder, "mirroredFromId">): boolean {
  return folder.mirroredFromId !== null;
}
