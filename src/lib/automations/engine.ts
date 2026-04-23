import { prisma } from "@/lib/prisma";
import type { AutomationTrigger, Task } from "@prisma/client";
import { notifyUsers } from "@/lib/notifications/create";
import { fanout as fanoutWebhook } from "@/lib/webhooks/deliver";

/**
 * Minimal automation engine.
 *
 * Event → Automation matching:
 *   - Select active automations where trigger matches the event,
 *     and scope matches (projectId equal or null=global).
 *   - Evaluate conditions (simple JSON-logic subset).
 *   - Execute actions in order.
 *
 * Conditions JSON (supported operators):
 *   { "all": [ {"field": "priority", "op": "eq", "value": "URGENT"} ] }
 *   { "any": [ ... ] }
 *
 * Actions JSON (array of action objects):
 *   { "type": "setStatus",    "statusName": "In Review" }
 *   { "type": "assignUser",   "userId": "u_xxx" }
 *   { "type": "addLabel",     "labelName": "urgent" }
 *   { "type": "notifyUsers",  "userIds": ["u_a","u_b"], "title": "..." }
 *   { "type": "emitWebhook",  "event": "task.status.changed" }
 *   { "type": "createSubtask", "title": "QA check" }
 *
 * Rate-limit: max 3 runs per automation per task per minute (AutomationRunLog count).
 */

type FieldOp = "eq" | "neq" | "gt" | "lt" | "contains" | "in";

type ConditionLeaf = {
  field: string;
  op: FieldOp;
  value: unknown;
};

type ConditionTree =
  | { all: (ConditionTree | ConditionLeaf)[] }
  | { any: (ConditionTree | ConditionLeaf)[] }
  | ConditionLeaf;

type Action =
  | { type: "setStatus"; statusName: string }
  | { type: "assignUser"; userId: string }
  | { type: "addLabel"; labelName: string }
  | { type: "notifyUsers"; userIds: string[]; title: string; body?: string }
  | { type: "emitWebhook"; event: string }
  | { type: "createSubtask"; title: string; description?: string };

export type EventContext = {
  event: AutomationTrigger;
  projectId: string;
  actorId: string;
  task?: Task & {
    status?: { name: string; isDone: boolean };
  };
  payload?: Record<string, unknown>;
};

/**
 * Fire an event. Runs matching automations; never throws.
 */
export async function dispatchEvent(ctx: EventContext): Promise<void> {
  try {
    const automations = await prisma.automation.findMany({
      where: {
        isActive: true,
        trigger: ctx.event,
        OR: [{ projectId: ctx.projectId }, { projectId: null }],
      },
    });

    for (const a of automations) {
      await runAutomation(a.id, ctx).catch((err) => {
        console.error(`[automations] run ${a.id} failed`, err);
      });
    }
  } catch (err) {
    console.error("[automations] dispatch failed", err);
  }
}

async function runAutomation(automationId: string, ctx: EventContext) {
  const start = Date.now();
  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation || !automation.isActive) return;

  // Rate limit: don't fire more than 3 times per automation per task per minute
  if (ctx.task) {
    const minuteAgo = new Date(Date.now() - 60_000);
    const recent = await prisma.automationRunLog.count({
      where: {
        automationId,
        triggeredAt: { gte: minuteAgo },
        context: { path: ["taskId"], equals: ctx.task.id },
      },
    });
    if (recent >= 3) {
      await logRun(automationId, ctx, "skipped", "rate-limit", start);
      return;
    }
  }

  // Conditions
  try {
    if (automation.conditionsJson) {
      const ok = evalConditions(
        automation.conditionsJson as unknown as ConditionTree,
        buildEvalRecord(ctx),
      );
      if (!ok) {
        await logRun(automationId, ctx, "skipped", "condition-false", start);
        return;
      }
    }
  } catch (err) {
    await logRun(automationId, ctx, "failed", String(err), start);
    return;
  }

  // Actions
  const actions = (automation.actionsJson as unknown as Action[]) ?? [];
  try {
    for (const action of actions) {
      await runAction(action, ctx);
    }
    await prisma.automation.update({
      where: { id: automationId },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
      },
    });
    await logRun(automationId, ctx, "success", null, start);
  } catch (err) {
    await logRun(automationId, ctx, "failed", String(err), start);
  }
}

function buildEvalRecord(ctx: EventContext): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    event: ctx.event,
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    ...(ctx.payload ?? {}),
  };
  if (ctx.task) {
    rec.task = {
      id: ctx.task.id,
      title: ctx.task.title,
      priority: ctx.task.priority,
      statusId: ctx.task.statusId,
      statusName: ctx.task.status?.name,
      isDone: ctx.task.status?.isDone ?? false,
      isPrivate: ctx.task.isPrivate,
      dueDate: ctx.task.dueDate?.toISOString() ?? null,
    };
  }
  return rec;
}

function evalConditions(tree: ConditionTree, rec: Record<string, unknown>): boolean {
  if ("all" in tree) return tree.all.every((c) => evalConditions(c, rec));
  if ("any" in tree) return tree.any.some((c) => evalConditions(c, rec));
  return evalLeaf(tree, rec);
}

function evalLeaf(leaf: ConditionLeaf, rec: Record<string, unknown>): boolean {
  const val = getField(rec, leaf.field);
  switch (leaf.op) {
    case "eq":
      return val === leaf.value;
    case "neq":
      return val !== leaf.value;
    case "gt":
      return typeof val === "number" && typeof leaf.value === "number" && val > leaf.value;
    case "lt":
      return typeof val === "number" && typeof leaf.value === "number" && val < leaf.value;
    case "contains":
      return typeof val === "string" && typeof leaf.value === "string" && val.includes(leaf.value);
    case "in":
      return Array.isArray(leaf.value) && leaf.value.includes(val);
    default:
      return false;
  }
}

function getField(rec: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = rec;
  for (const p of parts) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

async function runAction(action: Action, ctx: EventContext): Promise<void> {
  switch (action.type) {
    case "setStatus": {
      if (!ctx.task) return;
      const st = await prisma.taskStatus.findFirst({
        where: { projectId: ctx.projectId, name: action.statusName },
      });
      if (!st) return;
      await prisma.task.update({
        where: { id: ctx.task.id },
        data: {
          statusId: st.id,
          completedAt: st.isDone ? new Date() : null,
        },
      });
      return;
    }
    case "assignUser": {
      if (!ctx.task) return;
      await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: ctx.task.id, userId: action.userId } },
        update: {},
        create: { taskId: ctx.task.id, userId: action.userId },
      });
      return;
    }
    case "addLabel": {
      if (!ctx.task) return;
      const lbl = await prisma.taskLabel.findFirst({
        where: { projectId: ctx.projectId, name: action.labelName },
      });
      if (!lbl) return;
      await prisma.taskLabelAssignment.upsert({
        where: { taskId_labelId: { taskId: ctx.task.id, labelId: lbl.id } },
        update: {},
        create: { taskId: ctx.task.id, labelId: lbl.id },
      });
      return;
    }
    case "notifyUsers": {
      await notifyUsers({
        userIds: action.userIds,
        actorId: ctx.actorId,
        type: "TASK_CREATED",
        title: action.title,
        body: action.body,
        relatedEntity: ctx.task ? "Task" : "Project",
        relatedId: ctx.task
          ? `${ctx.projectId}:${ctx.task.id}`
          : ctx.projectId,
      });
      return;
    }
    case "emitWebhook": {
      await fanoutWebhook({
        event: action.event,
        payload: { task: ctx.task, projectId: ctx.projectId, actorId: ctx.actorId },
        projectId: ctx.projectId,
      });
      return;
    }
    case "createSubtask": {
      if (!ctx.task) return;
      await prisma.task.create({
        data: {
          projectId: ctx.projectId,
          stageId: ctx.task.stageId,
          statusId: ctx.task.statusId,
          parentTaskId: ctx.task.id,
          title: action.title,
          description: action.description ?? null,
          priority: "NORMAL",
          createdById: ctx.actorId,
        },
      });
      return;
    }
  }
}

async function logRun(
  automationId: string,
  ctx: EventContext,
  result: "success" | "failed" | "skipped",
  errorMessage: string | null,
  startedMs: number,
) {
  await prisma.automationRunLog.create({
    data: {
      automationId,
      context: {
        event: ctx.event,
        projectId: ctx.projectId,
        taskId: ctx.task?.id ?? null,
      },
      result,
      errorMessage,
      durationMs: Date.now() - startedMs,
    },
  });
}
