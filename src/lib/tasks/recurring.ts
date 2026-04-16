import { prisma } from "@/lib/prisma";
import { RRule, rrulestr } from "rrule";

/**
 * Recurring task spawner.
 *
 * === Product spec (decided as of 2026-04-16) ===
 * Mode: "schedule-based" — spawn ahead of time based on RRULE,
 *       independent of whether the previous occurrence is complete.
 *       (NOT "spawn-after-completion" — that would be a different model.)
 *
 * What is copied from the template to each child:
 *   ✓ title, description, priority, estimatedHours, isPrivate
 *   ✓ assignees (TaskAssignee rows)
 *   ✓ labels (TaskLabelAssignment rows)
 *   ✓ customFields (entire JSON blob)
 *   ✓ statusId (starts in the template's current status)
 *   ✗ checklist items — NOT copied (design: each occurrence starts with
 *     empty checklist; if checklist reuse is needed, convert the
 *     template to a TaskTemplate instead)
 *   ✗ subtasks — NOT copied (same rationale; use TaskTemplate for
 *     hierarchical blueprints)
 *   ✗ time logs, comments, attachments — never copied
 *
 * Duplicate prevention: spawn only for occurrences strictly after the
 * latest already-spawned child's dueDate (or the template's creation
 * date if no children yet). Cron runs every 5 min; horizon is 24h —
 * if the cron is down for >24h, subsequent runs will backfill since
 * they always look "after latest existing child".
 *
 * Overdue handling: a child task spawned on day N with dueDate = day N
 * becomes overdue on day N+1 if unfinished. It does NOT block future
 * spawns — each recurrence is an independent task instance.
 *
 * Manual editing of template: takes effect on the *next* spawn only.
 * Previously-spawned children are independent — editing template
 * title/assignees/etc. does not retroactively update children.
 *
 * UI filtering: templates (isRecurring=true) ARE shown in task lists,
 * identifiable by `_count.recurrenceChildren` or `isRecurring` flag.
 * Children have `recurrenceParentId` set so they can be filtered by
 * "all instances of template X" if needed.
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
