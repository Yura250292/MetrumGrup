import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications/create";
import {
  findOverdueForEscalation,
  findPendingReminders,
  markEscalated,
  markReminderSent,
} from "@/lib/rfi/escalation";

type RFIRow = Awaited<ReturnType<typeof findPendingReminders>>[number];

async function notifyDueSoon(rfi: RFIRow): Promise<void> {
  if (!rfi.assignedToId) return;
  await notifyUsers({
    userIds: [rfi.assignedToId],
    actorId: rfi.askedById,
    type: "RFI_DUE_SOON",
    title: `${rfi.number}: близький дедлайн`,
    body: `Запит "${rfi.subject}" наближається до 80% дедлайну.`,
    relatedEntity: "RFI",
    relatedId: rfi.id,
    skipActor: false,
  });
}

async function notifyOverdue(rfi: RFIRow): Promise<void> {
  // Notify assignee + project manager (if set).
  const project = await prisma.project.findUnique({
    where: { id: rfi.projectId },
    select: { managerId: true },
  });
  const targets = new Set<string>();
  if (rfi.assignedToId) targets.add(rfi.assignedToId);
  if (project?.managerId) targets.add(project.managerId);
  if (targets.size === 0) return;

  await notifyUsers({
    userIds: [...targets],
    actorId: rfi.askedById,
    type: "RFI_OVERDUE",
    title: `${rfi.number}: дедлайн пропущено`,
    body: `Запит "${rfi.subject}" прострочений.`,
    relatedEntity: "RFI",
    relatedId: rfi.id,
    skipActor: false,
  });
}

/// Called once per cron tick. Returns { remindersSent, escalationsSent }.
/// Idempotent via single-shot `reminderSentAt` / `escalatedAt` flags.
export async function fireRFIEscalations(): Promise<{ remindersSent: number; escalationsSent: number }> {
  const now = new Date();
  let remindersSent = 0;
  let escalationsSent = 0;

  const reminders = await findPendingReminders(now);
  for (const r of reminders) {
    try {
      await notifyDueSoon(r);
      await markReminderSent(r.id, now);
      remindersSent += 1;
    } catch {
      // Swallow per-RFI errors; keep processing the rest.
    }
  }

  const overdue = await findOverdueForEscalation(now);
  for (const r of overdue) {
    try {
      await notifyOverdue(r);
      await markEscalated(r.id, now);
      escalationsSent += 1;
    } catch {
      // ditto
    }
  }

  return { remindersSent, escalationsSent };
}
