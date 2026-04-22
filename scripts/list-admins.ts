import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  console.log(JSON.stringify(admins, null, 2));
}

main().finally(() => prisma.$disconnect());
