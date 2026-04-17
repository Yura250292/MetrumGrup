/**
 * Data migration: split existing `name` into `firstName` + `lastName`
 * Run: npx tsx scripts/migrate-name-split.ts
 *
 * Safe to run multiple times — skips users that already have firstName set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { firstName: null },
    select: { id: true, name: true },
  });

  console.log("Found " + users.length + " users without firstName/lastName");

  let updated = 0;
  for (const user of users) {
    const parts = (user.name || "").trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";

    if (!firstName) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: { firstName, lastName: lastName || null },
    });
    updated++;
    console.log("  " + user.name + " -> firstName=" + firstName + " lastName=" + (lastName || "(none)"));
  }

  console.log("Done. Updated " + updated + " users.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
