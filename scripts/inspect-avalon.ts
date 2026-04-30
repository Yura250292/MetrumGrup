import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Знаходимо проект Avalon Holiday
  const project = await prisma.project.findFirst({
    where: { title: { contains: "Avalon", mode: "insensitive" } },
    select: { id: true, title: true, firmId: true },
  });
  if (!project) {
    console.log("Не знайдено Avalon");
    return;
  }
  console.log("Project:", project);

  // Mirror папка
  const mirror = await prisma.folder.findUnique({
    where: { mirroredFromProjectId: project.id },
    select: { id: true, name: true },
  });
  console.log("Mirror folder:", mirror);

  if (!mirror) return;

  // Усі дочірні папки рекурсивно
  const allFolders = await prisma.folder.findMany({
    where: { domain: "FINANCE" },
    select: { id: true, parentId: true, name: true },
  });
  const childrenMap = new Map<string, string[]>();
  for (const f of allFolders) {
    if (f.parentId) {
      const arr = childrenMap.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenMap.set(f.parentId, arr);
    }
  }
  const descendants: string[] = [mirror.id];
  const stack = [mirror.id];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const kids = childrenMap.get(id);
    if (kids) {
      descendants.push(...kids);
      stack.push(...kids);
    }
  }
  console.log(`Mirror + descendants: ${descendants.length} folders`);

  // Aggregate FinanceEntry
  const stats = await prisma.financeEntry.groupBy({
    by: ["type", "projectId"],
    where: { folderId: { in: descendants }, isArchived: false },
    _sum: { amount: true },
    _count: { _all: true },
  });
  console.log("By type and projectId:");
  for (const s of stats) {
    console.log(`  type=${s.type} projectId=${s.projectId ?? "NULL"}: count=${s._count._all} sum=${Number(s._sum.amount ?? 0).toLocaleString()}`);
  }

  // Тільки for the project
  const projStats = await prisma.financeEntry.groupBy({
    by: ["type"],
    where: { projectId: project.id, isArchived: false },
    _sum: { amount: true },
    _count: { _all: true },
  });
  console.log("\nWHERE projectId = avalon:");
  for (const s of projStats) {
    console.log(`  type=${s.type}: count=${s._count._all} sum=${Number(s._sum.amount ?? 0).toLocaleString()}`);
  }
}

main().finally(() => prisma.$disconnect());
