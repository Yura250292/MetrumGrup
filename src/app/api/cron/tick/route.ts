import { NextRequest, NextResponse } from "next/server";
import { spawnRecurringOccurrences } from "@/lib/tasks/recurring";
import { processPending as processWebhooks } from "@/lib/webhooks/deliver";
import { prisma } from "@/lib/prisma";
import { dispatchEvent } from "@/lib/automations/engine";
import { notifyFinanceApprovers } from "@/lib/financing/notify-approval";

/**
 * Vercel cron endpoint — fires every minute (configured in vercel.json).
 * Protected by `CRON_SECRET` env to prevent external abuse.
 *
 * Responsibilities on each tick:
 *   1. Spawn recurring task occurrences (next 24h horizon)
 *   2. Retry pending webhook deliveries
 *   3. Fire `TASK_DUE_APPROACHING` for tasks due within 24h
 *      (debounced — at most once per task per day)
 */

export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const out: Record<string, unknown> = {};
  try {
    out.recurring = await spawnRecurringOccurrences();
  } catch (err) {
    out.recurringError = String(err);
  }

  try {
    out.webhooksProcessed = await processWebhooks(50);
  } catch (err) {
    out.webhooksError = String(err);
  }

  try {
    out.dueApproachingFired = await fireDueApproaching();
  } catch (err) {
    out.dueApproachingError = String(err);
  }

  try {
    out.financeRemindersSent = await fireFinanceReminders();
  } catch (err) {
    out.financeRemindersError = String(err);
  }

  return NextResponse.json({ ok: true, ...out });
}

async function fireFinanceReminders(): Promise<number> {
  const due = await prisma.financeEntry.findMany({
    where: {
      status: "PENDING",
      remindAt: { lte: new Date(), not: null },
    },
    select: {
      id: true,
      title: true,
      type: true,
      amount: true,
      counterparty: true,
      createdById: true,
      project: { select: { title: true } },
    },
    take: 50,
  });

  let sent = 0;
  for (const e of due) {
    await notifyFinanceApprovers(
      {
        id: e.id,
        title: e.title,
        type: e.type,
        amount: Number(e.amount),
        counterparty: e.counterparty,
        projectTitle: e.project?.title ?? null,
      },
      e.createdById, // actorId to exclude
      { isReminder: true },
    );
    // Clear remindAt so we don't send again (until a new "remind" click)
    await prisma.financeEntry.update({
      where: { id: e.id },
      data: { remindAt: null },
    });
    sent += 1;
  }
  return sent;
}

async function fireDueApproaching(): Promise<number> {
  const in24h = new Date(Date.now() + 24 * 3600 * 1000);
  const now = new Date();
  // Pick tasks due within the next 24h (not done, not archived).
  // Debounce via AutomationRunLog: skip tasks where we already fired today.
  const tasks = await prisma.task.findMany({
    where: {
      isArchived: false,
      dueDate: { gte: now, lte: in24h },
      status: { isDone: false },
    },
    include: { status: { select: { name: true, isDone: true } } },
    take: 200,
  });

  let fired = 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  for (const t of tasks) {
    const alreadyFired = await prisma.automationRunLog.findFirst({
      where: {
        triggeredAt: { gte: startOfDay },
        context: { path: ["taskId"], equals: t.id },
        result: "success",
      },
    });
    if (alreadyFired) continue;

    await dispatchEvent({
      event: "TASK_DUE_APPROACHING",
      projectId: t.projectId,
      actorId: t.createdById,
      task: t,
    });
    fired += 1;
  }
  return fired;
}
