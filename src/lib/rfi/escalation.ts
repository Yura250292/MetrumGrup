import { prisma } from "@/lib/prisma";

/// Returns RFIs whose 80% reminder is due (now >= askedAt + 0.8*(dueAt-askedAt))
/// and have not yet been reminded.
export async function findPendingReminders(now: Date) {
  // Postgres-side filter (avoids loading all open RFIs):
  // now >= askedAt + 0.8 * (dueAt - askedAt)  ⇔
  // 5 * (now - askedAt) >= 4 * (dueAt - askedAt)
  // Easiest is to load active RFIs with dueAt set and filter in JS.
  const candidates = await prisma.rFI.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      reminderSentAt: null,
      dueAt: { not: null },
      assignedToId: { not: null },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      projectId: true,
      firmId: true,
      assignedToId: true,
      askedById: true,
      askedAt: true,
      dueAt: true,
    },
  });
  const out: typeof candidates = [];
  for (const r of candidates) {
    if (!r.dueAt) continue;
    const threshold = r.askedAt.getTime() + 0.8 * (r.dueAt.getTime() - r.askedAt.getTime());
    if (now.getTime() >= threshold) out.push(r);
  }
  return out;
}

/// Returns RFIs past their `dueAt` that have not yet been escalated.
export async function findOverdueForEscalation(now: Date) {
  return prisma.rFI.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      escalatedAt: null,
      dueAt: { lte: now, not: null },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      projectId: true,
      firmId: true,
      assignedToId: true,
      askedById: true,
      askedAt: true,
      dueAt: true,
    },
  });
}

export async function markReminderSent(id: string, at: Date = new Date()): Promise<void> {
  await prisma.rFI.update({ where: { id }, data: { reminderSentAt: at } });
}

export async function markEscalated(id: string, at: Date = new Date()): Promise<void> {
  await prisma.rFI.update({ where: { id }, data: { escalatedAt: at } });
}
