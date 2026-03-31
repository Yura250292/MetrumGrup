import { prisma } from "@/lib/prisma";

/**
 * Generate next unique estimate number using atomic database increment
 * to prevent race conditions in concurrent requests
 */
export async function getNextEstimateNumber(): Promise<string> {
  const seq = await prisma.documentSequence.upsert({
    where: { id: "EST" },
    update: { last: { increment: 1 } },
    create: { id: "EST", prefix: "EST-", last: 1 },
  });

  return `${seq.prefix}${String(seq.last).padStart(4, "0")}`;
}
