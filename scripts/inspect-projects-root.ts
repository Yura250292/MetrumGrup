import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roots = await prisma.folder.findMany({
    where: { domain: "FINANCE", slug: "mirrored-projects" },
    select: { id: true, firmId: true, name: true },
  });
  for (const root of roots) {
    console.log(`\nROOT id=${root.id} firm=${root.firmId} name=${root.name}`);
    const children = await prisma.folder.findMany({
      where: { parentId: root.id },
      select: {
        id: true,
        name: true,
        mirroredFromProjectId: true,
        mirroredFromId: true,
        firmId: true,
        _count: { select: { financeEntries: true, children: true } },
      },
    });
    for (const c of children) {
      console.log(
        `  - ${c.name} | mirroredFromProjectId=${c.mirroredFromProjectId} | mirroredFromId=${c.mirroredFromId} | entries=${c._count.financeEntries} children=${c._count.children}`,
      );
    }
  }
}

main().finally(() => prisma.$disconnect());
