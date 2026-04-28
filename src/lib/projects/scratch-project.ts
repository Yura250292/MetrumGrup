import { prisma } from "@/lib/prisma";

/**
 * Returns a single per-user "scratch" project used to host AI-estimate
 * generations that have not yet been saved to a real project. The slug is
 * prefixed with `temp-` so the project is filtered out of every user-facing
 * listing (see `listProjectsWithAggregations` and `/api/admin/projects`).
 *
 * Reusing one record per user avoids accumulating dozens of orphan projects
 * with each generation while still satisfying the FK on `Estimate.projectId`.
 */
export async function getOrCreateScratchProject(userId: string): Promise<string> {
  const slug = `temp-scratch-${userId}`;

  const existing = await prisma.project.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Scratch проєкт належить тій самій фірмі, що й користувач — інакше studio
  // директор не зможе генерувати AI-кошториси.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firmId: true },
  });

  const created = await prisma.project.create({
    data: {
      title: "AI scratch (internal)",
      slug,
      description: "Внутрішній службовий проєкт для незбережених AI-кошторисів",
      status: "DRAFT",
      clientId: userId,
      managerId: userId,
      firmId: user?.firmId ?? "metrum-group",
    },
    select: { id: true },
  });
  return created.id;
}
