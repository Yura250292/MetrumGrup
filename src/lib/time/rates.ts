import { prisma } from "@/lib/prisma";

/**
 * Resolve the hourly rate for a user within a project at a specific point in time.
 *
 * Priority:
 *   1. Project-specific rate effective at `at`
 *   2. Global rate (projectId = null) effective at `at`
 *   3. null (no rate configured)
 *
 * Effective semantics: effectiveFrom <= at AND (effectiveTo IS NULL OR effectiveTo >= at).
 * Returns the rate value as number, or null when no row matches.
 */
export async function resolveUserRateAt(
  userId: string,
  projectId: string | null,
  at: Date = new Date(),
): Promise<{ rate: number; currency: string } | null> {
  // Project-specific first
  if (projectId) {
    const project = await prisma.userHourlyRate.findFirst({
      where: {
        userId,
        projectId,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (project) return { rate: Number(project.rate), currency: project.currency };
  }

  // Global fallback
  const global = await prisma.userHourlyRate.findFirst({
    where: {
      userId,
      projectId: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (global) return { rate: Number(global.rate), currency: global.currency };

  return null;
}

export async function setUserRate(opts: {
  userId: string;
  projectId?: string | null;
  rate: number;
  currency?: string;
  effectiveFrom?: Date;
}) {
  const effectiveFrom = opts.effectiveFrom ?? new Date();

  // Close any currently-open rate for this scope by setting effectiveTo
  await prisma.userHourlyRate.updateMany({
    where: {
      userId: opts.userId,
      projectId: opts.projectId ?? null,
      effectiveTo: null,
      effectiveFrom: { lte: effectiveFrom },
    },
    data: { effectiveTo: new Date(effectiveFrom.getTime() - 1000) },
  });

  return prisma.userHourlyRate.create({
    data: {
      userId: opts.userId,
      projectId: opts.projectId ?? null,
      rate: opts.rate,
      currency: opts.currency ?? "UAH",
      effectiveFrom,
    },
  });
}

export async function listUserRates(userId: string) {
  return prisma.userHourlyRate.findMany({
    where: { userId },
    orderBy: [{ effectiveFrom: "desc" }],
    include: { project: { select: { id: true, title: true } } },
  });
}

export async function deleteUserRate(rateId: string) {
  return prisma.userHourlyRate.delete({ where: { id: rateId } });
}
