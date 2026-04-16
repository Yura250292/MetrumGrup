import { prisma } from "@/lib/prisma";
import { RRule, rrulestr } from "rrule";

/**
 * Recurring task spawner.
 *
 * Tasks with `isRecurring=true` + `recurrenceRule` (RRULE string) act as
 * templates. On each cron tick we compute next occurrences strictly after
 * the latest spawned child's dueDate (or the parent's creation date) and
 * up to `now + horizonHours`. For each, we spawn a child Task with
 * `recurrenceParentId` pointing back to the template, copy core fields,
 * and shift startDate/dueDate to the occurrence.
 *
 * The template itself is never shown in List/Kanban (filter by
 * isRecurring=false OR show with a badge — that's a UI concern).
 */

export async function spawnRecurringOccurrences(opts?: {
  horizonHours?: number;
  now?: Date;
}) {
  const horizon = opts?.horizonHours ?? 24;
  const now = opts?.now ?? new Date();
  const until = new Date(now.getTime() + horizon * 3600 * 1000);

  const templates = await prisma.task.findMany({
    where: {
      isRecurring: true,
      recurrenceRule: { not: null },
      isArchived: false,
    },
    include: {
      assignees: { select: { userId: true } },
      labels: { select: { labelId: true } },
    },
  });

  const results: { templateId: string; spawnedCount: number; error?: string }[] = [];

  for (const tpl of templates) {
    try {
      if (!tpl.recurrenceRule) continue;

      // Find latest already-spawned child so we don't duplicate
      const latestChild = await prisma.task.findFirst({
        where: { recurrenceParentId: tpl.id },
        orderBy: { dueDate: "desc" },
        select: { dueDate: true, startDate: true },
      });
      const after =
        latestChild?.dueDate ?? latestChild?.startDate ?? tpl.createdAt;

      const rule = parseRule(tpl.recurrenceRule, tpl.startDate ?? tpl.createdAt);
      if (!rule) continue;

      const occurrences = rule.between(
        new Date(after.getTime() + 1000),
        until,
        true,
      );

      let spawned = 0;
      for (const when of occurrences) {
        const offsetMs =
          tpl.startDate && tpl.dueDate
            ? tpl.dueDate.getTime() - tpl.startDate.getTime()
            : 0;
        const child = await prisma.task.create({
          data: {
            projectId: tpl.projectId,
            stageId: tpl.stageId,
            statusId: tpl.statusId,
            title: tpl.title,
            description: tpl.description,
            priority: tpl.priority,
            startDate: when,
            dueDate: offsetMs > 0 ? new Date(when.getTime() + offsetMs) : when,
            estimatedHours: tpl.estimatedHours,
            customFields: tpl.customFields ?? undefined,
            isPrivate: tpl.isPrivate,
            createdById: tpl.createdById,
            recurrenceParentId: tpl.id,
            isRecurring: false,
            position: 0,
          },
        });

        // Copy assignees
        if (tpl.assignees.length > 0) {
          await prisma.taskAssignee.createMany({
            data: tpl.assignees.map((a) => ({
              taskId: child.id,
              userId: a.userId,
              assignedById: tpl.createdById,
            })),
            skipDuplicates: true,
          });
        }
        // Copy labels
        if (tpl.labels.length > 0) {
          await prisma.taskLabelAssignment.createMany({
            data: tpl.labels.map((l) => ({
              taskId: child.id,
              labelId: l.labelId,
            })),
            skipDuplicates: true,
          });
        }
        spawned += 1;
      }

      results.push({ templateId: tpl.id, spawnedCount: spawned });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[recurring] template ${tpl.id} failed`, err);
      results.push({ templateId: tpl.id, spawnedCount: 0, error: msg });
    }
  }

  return results;
}

function parseRule(rule: string, dtstart: Date): RRule | null {
  try {
    // rrulestr accepts "FREQ=DAILY;INTERVAL=1" or full "DTSTART:...\nRRULE:..."
    if (rule.trim().startsWith("DTSTART") || rule.includes("RRULE:")) {
      return rrulestr(rule) as RRule;
    }
    return new RRule({ ...RRule.parseString(rule), dtstart });
  } catch (err) {
    console.error("[recurring] parseRule", err);
    return null;
  }
}
