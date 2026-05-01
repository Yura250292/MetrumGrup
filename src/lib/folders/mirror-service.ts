import { prisma } from "@/lib/prisma";
import type { Prisma, Folder } from "@prisma/client";
import { markProjectProjected } from "@/lib/projects/plan-source";

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
      // Раніше було isSystem=true (показувало 🔒). Прибрали — родитель "Проєкти"
      // це лише організаційний контейнер mirror-папок, не корпоративна структура.
      // Колодка лишається тільки на "Загальні витрати" та її піддереві.
      isSystem: false,
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
    select: { id: true, name: true, color: true, parentId: true, sortOrder: true, domain: true, firmId: true },
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

  // Parent: mirror батьківської PROJECT-папки АБО root рівень FINANCE.
  // Раніше для папок без parent використовувався проміжний контейнер "Проєкти"
  // — прибрали його, бо він дублював sidebar "Проекти" у фінансуванні.
  const parentMirrorId: string | null = project.parentId
    ? await ensureMirror(project.parentId, tx)
    : null;

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
      firmId: project.firmId ?? "metrum-group",
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
export async function backfillProjectMirrors(options?: {
  systemUserId?: string;
}): Promise<{
  moved: number;
  linked: number;
  created: number;
  dedup: number;
  projectMirrors: number;
  budgetsSynced: number;
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

  // 3. Mirror кожний проєкт як FINANCE-папку + upsert PROJECT_BUDGET запис
  const projects = await prisma.project.findMany({
    where: { slug: { not: { startsWith: "temp-" } } },
    select: { id: true, totalBudget: true },
  });

  let projectMirrors = 0;
  let budgetsSynced = 0;

  // Для syncProjectBudgetEntry треба userId. Якщо не передано — беремо
  // будь-якого SUPER_ADMIN.
  let fallbackUserId = options?.systemUserId;
  if (!fallbackUserId) {
    const admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true },
    });
    fallbackUserId = admin?.id;
  }

  for (const p of projects) {
    const beforeMirror = await prisma.folder.findUnique({
      where: { mirroredFromProjectId: p.id },
      select: { id: true },
    });
    await ensureProjectMirror(p.id);
    if (!beforeMirror) projectMirrors++;

    if (fallbackUserId && Number(p.totalBudget) > 0) {
      await syncProjectBudgetEntry(p.id, fallbackUserId);
      budgetsSynced++;
    }
  }

  return { moved, linked, created, dedup, projectMirrors, budgetsSynced };
}

export function isMirror(folder: Pick<Folder, "mirroredFromId">): boolean {
  return folder.mirroredFromId !== null;
}

/**
 * Перевіряє, чи FINANCE-папка належить піддереву кореневої "Проєкти".
 */
export async function isInsideFinanceProjectsTree(
  folderId: string,
  tx: Tx = prisma,
): Promise<boolean> {
  const rootId = await ensureFinanceProjectsRoot(tx);
  let currentId: string | null = folderId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === rootId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const row: { parentId: string | null } | null = await tx.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!row) return false;
    currentId = row.parentId;
  }
  return false;
}

/**
 * Створює PROJECT-папку для заданої FINANCE-папки (зворотній мирор FINANCE → PROJECT).
 * Викликається після створення FINANCE-папки під "Проєкти" root. Ідемпотентно:
 * якщо FINANCE-папка вже mirror — нічого не робить.
 */
export async function autoCreateProjectMirrorForFinanceFolder(
  financeFolderId: string,
  tx: Tx = prisma,
): Promise<void> {
  const f = await tx.folder.findUnique({
    where: { id: financeFolderId },
    select: {
      id: true,
      domain: true,
      name: true,
      color: true,
      parentId: true,
      sortOrder: true,
      mirroredFromId: true,
      mirroredFromProjectId: true,
      isSystem: true,
    },
  });
  if (!f) return;
  if (f.domain !== "FINANCE") return;
  if (f.isSystem) return;
  if (f.mirroredFromId || f.mirroredFromProjectId) return;
  if (!f.parentId) return;
  if (!(await isInsideFinanceProjectsTree(f.id, tx))) return;

  // Визначаємо PROJECT-parent: якщо finance-parent сам — mirror PROJECT-папки,
  // використовуємо ту PROJECT-папку. Якщо finance-parent — mirror Project
  // (mirroredFromProjectId), то підпапки проекту в PROJECT-домені не мають сенсу
  // — не створюємо. Якщо parent — root "Проєкти", PROJECT-parent = null.
  const parent = await tx.folder.findUnique({
    where: { id: f.parentId },
    select: { mirroredFromId: true, mirroredFromProjectId: true, slug: true },
  });
  let projectParentId: string | null = null;
  if (parent) {
    if (parent.mirroredFromProjectId) return; // не плодимо папки під Project-mirror
    if (parent.mirroredFromId) projectParentId = parent.mirroredFromId;
  }

  const projectFolder = await tx.folder.create({
    data: {
      domain: "PROJECT",
      name: f.name,
      color: f.color,
      parentId: projectParentId,
      sortOrder: f.sortOrder,
    },
    select: { id: true },
  });
  await tx.folder.update({
    where: { id: f.id },
    data: { mirroredFromId: projectFolder.id },
  });
}

/**
 * Backfill FINANCE → PROJECT: для кожної FINANCE-папки під "Проєкти", яка ще не
 * має mirroredFromId — створити PROJECT-папку і прив'язати.
 */
export async function backfillFinanceToProjectFolders(): Promise<{
  created: number;
}> {
  const rootId = await ensureFinanceProjectsRoot();
  let created = 0;

  async function walk(
    financeParentId: string,
    projectParentId: string | null,
  ): Promise<void> {
    const children = await prisma.folder.findMany({
      where: { parentId: financeParentId, isSystem: false },
      select: {
        id: true,
        name: true,
        color: true,
        sortOrder: true,
        mirroredFromId: true,
        mirroredFromProjectId: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    for (const f of children) {
      if (f.mirroredFromProjectId) continue;
      if (f.mirroredFromId) {
        // Уже mirror на PROJECT-folder — спускаємось вглиб.
        await walk(f.id, f.mirroredFromId);
        continue;
      }
      const newProject = await prisma.folder.create({
        data: {
          domain: "PROJECT",
          name: f.name,
          color: f.color,
          parentId: projectParentId,
          sortOrder: f.sortOrder,
        },
        select: { id: true },
      });
      await prisma.folder.update({
        where: { id: f.id },
        data: { mirroredFromId: newProject.id },
      });
      created++;
      await walk(f.id, newProject.id);
    }
  }

  await walk(rootId, null);
  return { created };
}

/**
 * Повертає id FINANCE-mirror для заданого Project. Якщо mirror ще нема —
 * створює. Parent mirror-папки = FINANCE-mirror від project.folderId
 * (якщо є), інакше = коренева системна "Проєкти".
 */
export async function ensureProjectMirror(
  projectId: string,
  tx: Tx = prisma,
  opts?: { linkExistingFolderId?: string | null },
): Promise<string> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, folderId: true, firmId: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  const existing = await tx.folder.findUnique({
    where: { mirroredFromProjectId: project.id },
    select: { id: true },
  });
  if (existing) return existing.id;

  const parentMirrorId = await resolveProjectParentMirror(project.folderId, tx);

  // Якщо вказана existing FINANCE-папка для merge — приєднуємо її як mirror.
  // Папка має бути FINANCE, без іншого mirror, тієї ж фірми.
  if (opts?.linkExistingFolderId) {
    const target = await tx.folder.findUnique({
      where: { id: opts.linkExistingFolderId },
      select: {
        id: true,
        domain: true,
        mirroredFromProjectId: true,
        mirroredFromId: true,
        firmId: true,
      },
    });
    if (!target) throw new Error("Папку для обʼєднання не знайдено");
    if (target.domain !== "FINANCE") {
      throw new Error("Обʼєднання можливе лише з FINANCE-папкою");
    }
    if (target.mirroredFromProjectId || target.mirroredFromId) {
      throw new Error("Папка вже привʼязана до іншого проекту/папки");
    }
    if (
      target.firmId &&
      project.firmId &&
      target.firmId !== project.firmId
    ) {
      throw new Error("Папка належить іншій фірмі");
    }
    await tx.folder.update({
      where: { id: target.id },
      data: {
        mirroredFromProjectId: project.id,
        parentId: parentMirrorId,
        firmId: project.firmId ?? "metrum-group",
      },
    });
    return target.id;
  }

  // Дедубл: якщо під тим же parent'ом уже є FINANCE-папка з такою ж назвою без
  // mirrored-ссилок — прив'язати її.
  const nameMatch = await tx.folder.findFirst({
    where: {
      domain: "FINANCE",
      parentId: parentMirrorId,
      name: project.title,
      mirroredFromId: null,
      mirroredFromProjectId: null,
    },
    select: { id: true },
  });
  if (nameMatch) {
    await tx.folder.update({
      where: { id: nameMatch.id },
      data: {
        mirroredFromProjectId: project.id,
        firmId: project.firmId ?? "metrum-group",
      },
    });
    return nameMatch.id;
  }

  const created = await tx.folder.create({
    data: {
      domain: "FINANCE",
      name: project.title,
      parentId: parentMirrorId,
      mirroredFromProjectId: project.id,
      firmId: project.firmId ?? "metrum-group",
    },
    select: { id: true },
  });
  return created.id;
}

async function resolveProjectParentMirror(
  projectFolderId: string | null,
  tx: Tx,
): Promise<string | null> {
  // Проект НЕ у PROJECT-папці → mirror лежить прямо на root рівні FINANCE.
  // Раніше використовувався контейнер "Проєкти" (slug=mirrored-projects), але
  // користувачі хочуть пласку структуру (дублювання з sidebar "Проекти").
  if (!projectFolderId) return null;
  const folder = await tx.folder.findUnique({
    where: { id: projectFolderId },
    select: { domain: true },
  });
  // Якщо folderId зіпсований — теж кладемо на root.
  if (!folder || folder.domain !== "PROJECT") return null;
  return ensureMirror(projectFolderId, tx);
}

export async function updateProjectMirror(
  projectId: string,
  tx: Tx = prisma,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, folderId: true },
  });
  if (!project) return;

  const mirror = await tx.folder.findUnique({
    where: { mirroredFromProjectId: project.id },
    select: { id: true },
  });
  if (!mirror) {
    await ensureProjectMirror(project.id, tx);
    return;
  }

  const parentMirrorId = await resolveProjectParentMirror(project.folderId, tx);

  await tx.folder.update({
    where: { id: mirror.id },
    data: { name: project.title, parentId: parentMirrorId },
  });
}

export async function deleteProjectMirror(
  projectId: string,
  tx: Tx = prisma,
): Promise<void> {
  const mirror = await tx.folder.findUnique({
    where: { mirroredFromProjectId: projectId },
    select: { id: true },
  });
  if (!mirror) return;

  const rootId = await ensureFinanceProjectsRoot(tx);
  const subtreeIds = await collectSubtreeIds(tx, [mirror.id]);
  await tx.financeEntry.updateMany({
    where: { folderId: { in: subtreeIds } },
    data: { folderId: rootId },
  });
  await tx.folder.delete({ where: { id: mirror.id } });
}

/**
 * Узгодити FinanceEntry з source=PROJECT_BUDGET для проекту. Якщо у проекта
 * totalBudget > 0 — створити/оновити один запис (kind=PLAN, type=EXPENSE).
 * Інакше — видалити запис, якщо він є.
 */
export async function syncProjectBudgetEntry(
  projectId: string,
  userId: string,
  tx: Tx = prisma,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      totalBudget: true,
      startDate: true,
      createdAt: true,
      isTestProject: true,
      firmId: true,
    },
  });
  if (!project) return;

  const budget = Number(project.totalBudget);
  const existing = await tx.financeEntry.findFirst({
    where: { projectId: project.id, source: "PROJECT_BUDGET" },
    select: { id: true },
  });

  // Тестові проєкти не враховуються у фінансуванні — видаляємо plan-запис,
  // якщо він був (наприклад, після того як юзер позначив проект тестовим).
  if (project.isTestProject || budget <= 0) {
    if (existing) {
      await tx.financeEntry.delete({ where: { id: existing.id } });
    }
    return;
  }

  const folderId = await ensureProjectMirror(project.id, tx);
  const occurredAt = project.startDate ?? project.createdAt ?? new Date();
  const title = `Плановий бюджет проєкту «${project.title}»`;
  const firmId = project.firmId ?? "metrum-group";

  if (existing) {
    await tx.financeEntry.update({
      where: { id: existing.id },
      data: {
        title,
        amount: budget,
        occurredAt,
        folderId,
        firmId,
        updatedById: userId,
      },
    });
  } else {
    await tx.financeEntry.create({
      data: {
        title,
        amount: budget,
        kind: "PLAN",
        type: "EXPENSE",
        status: "APPROVED",
        source: "PROJECT_BUDGET",
        isDerived: true,
        projectId: project.id,
        firmId,
        folderId,
        category: "Плановий бюджет",
        occurredAt,
        createdById: userId,
      },
    });
  }

  // Phase 6.3: bump projection metadata. PROJECT_BUDGET — теж materialize-подія
  // (rollup-проєкція з Project.totalBudget у фінансовий журнал).
  await markProjectProjected(projectId, userId, tx);
}
