import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import { FINANCE_ENTRY_SELECT } from "@/lib/financing/queries";
import { deleteFileFromR2 } from "@/lib/r2-client";
import {
  notifyFinanceApprovers,
  notifyFinanceActor,
} from "@/lib/financing/notify-approval";
import { assertCanAccessFirm } from "@/lib/firm/scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
const HARD_DELETE_ROLES: Role[] = ["SUPER_ADMIN"];

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const entry = await prisma.financeEntry.findUnique({
    where: { id },
    select: FINANCE_ENTRY_SELECT,
  });
  if (!entry) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  try {
    assertCanAccessFirm(session, entry.firmId);
  } catch {
    return forbiddenResponse();
  }
  return NextResponse.json({ data: entry });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.financeEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  try {
    assertCanAccessFirm(session, existing.firmId);
  } catch {
    return forbiddenResponse();
  }

  try {
    const body = await request.json();
    const isAutoFromEstimate = existing.source === "ESTIMATE_AUTO";
    const data: Parameters<typeof prisma.financeEntry.update>[0]["data"] = {
      updatedById: session.user.id,
    };

    if (isAutoFromEstimate) {
      const forbiddenKeys = [
        "type",
        "kind",
        "amount",
        "projectId",
        "category",
        "subcategory",
        "title",
        "description",
        "counterparty",
        "counterpartyId",
        "costCodeId",
        "costType",
        "occurredAt",
        "currency",
      ] as const;
      for (const key of forbiddenKeys) {
        if (key in body) {
          return NextResponse.json(
            {
              error:
                "Запис синхронізовано з кошторису. Змінюйте ці поля через кошторис — тут дозволені лише статус, архівація та вкладення.",
            },
            { status: 409 },
          );
        }
      }
    }

    if (body.type === "INCOME" || body.type === "EXPENSE") data.type = body.type;
    if (body.kind === "PLAN" || body.kind === "FACT") data.kind = body.kind;
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "Некоректна сума" }, { status: 400 });
      }
      data.amount = n;
    }
    if (body.occurredAt) {
      const d = new Date(body.occurredAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Некоректна дата" }, { status: 400 });
      }
      data.occurredAt = d;
    }
    if ("projectId" in body) {
      const pid =
        body.projectId === null || body.projectId === "" ? null : String(body.projectId);
      if (pid) {
        const exists = await prisma.project.findUnique({
          where: { id: pid },
          select: { id: true },
        });
        if (!exists) return NextResponse.json({ error: "Проєкт не існує" }, { status: 400 });
      }
      data.projectId = pid;
    }
    if (body.category !== undefined) {
      if (typeof body.category !== "string" || !FINANCE_CATEGORY_LABELS[body.category]) {
        return NextResponse.json({ error: "Некоректна категорія" }, { status: 400 });
      }
      data.category = body.category;
    }
    if ("subcategory" in body)
      data.subcategory =
        typeof body.subcategory === "string" && body.subcategory.trim()
          ? body.subcategory.trim()
          : null;
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
      }
      data.title = body.title.trim();
    }
    if ("description" in body)
      data.description = typeof body.description === "string" ? body.description : null;
    if ("counterparty" in body)
      data.counterparty =
        typeof body.counterparty === "string" && body.counterparty.trim()
          ? body.counterparty.trim()
          : null;

    // Counterparty FK (Phase 1.A2). When set, also refreshes the legacy
    // `counterparty` denormalised cache so listings keep displaying a name.
    if ("counterpartyId" in body) {
      const cpid =
        typeof body.counterpartyId === "string" && body.counterpartyId.trim()
          ? body.counterpartyId.trim()
          : null;
      if (cpid) {
        const cp = await prisma.counterparty.findUnique({
          where: { id: cpid },
          select: { id: true, name: true },
        });
        if (!cp) {
          return NextResponse.json({ error: "Контрагент не існує" }, { status: 400 });
        }
        data.counterpartyId = cp.id;
        data.counterparty = cp.name;
      } else {
        data.counterpartyId = null;
        // Don't wipe legacy `counterparty` text on FK clear — it may be the
        // only value the operator typed. They can clear the string field too.
      }
    }

    // Cost-code axis (Phase 1.A1).
    if ("costCodeId" in body) {
      const ccid =
        typeof body.costCodeId === "string" && body.costCodeId.trim()
          ? body.costCodeId.trim()
          : null;
      if (ccid) {
        const cc = await prisma.costCode.findUnique({
          where: { id: ccid },
          select: { id: true },
        });
        if (!cc) {
          return NextResponse.json({ error: "Статтю витрат не знайдено" }, { status: 400 });
        }
      }
      data.costCodeId = ccid;
    }
    if ("costType" in body) {
      const validCostTypes = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;
      type CostTypeKey = (typeof validCostTypes)[number];
      const ct = body.costType;
      if (ct === null || ct === "") {
        data.costType = null;
      } else if (typeof ct === "string" && validCostTypes.includes(ct as CostTypeKey)) {
        data.costType = ct as CostTypeKey;
      } else {
        return NextResponse.json({ error: "Некоректний тип витрат" }, { status: 400 });
      }
    }

    if ("currency" in body && typeof body.currency === "string" && body.currency)
      data.currency = body.currency;
    if (body.isArchived === true || body.isArchived === false) data.isArchived = body.isArchived;

    // Status workflow
    const VALID_STATUSES = ["DRAFT", "PENDING", "APPROVED", "PAID"] as const;
    if (body.status && VALID_STATUSES.includes(body.status)) {
      data.status = body.status;
      if (body.status === "APPROVED") {
        data.approvedAt = new Date();
        data.approvedById = session.user.id;
        data.remindAt = null;
      }
      if (body.status === "PAID") {
        data.paidAt = new Date();
        data.remindAt = null;
        // If going directly to PAID without prior approval, mark as approved too
        if (!existing.approvedAt) {
          data.approvedAt = new Date();
          data.approvedById = session.user.id;
        }
      }
      if (body.status === "DRAFT") {
        data.remindAt = null;
      }
    }

    // Reminder scheduling: body.remindInMinutes → remindAt = now + N minutes
    if (typeof body.remindInMinutes === "number" && body.remindInMinutes > 0) {
      data.remindAt = new Date(Date.now() + body.remindInMinutes * 60 * 1000);
    }
    if (body.remindAt === null) {
      data.remindAt = null;
    }

    const updated = await prisma.financeEntry.update({
      where: { id },
      data,
      select: FINANCE_ENTRY_SELECT,
    });

    // Notifications on status transitions
    const oldStatus = existing.status;
    const newStatus = updated.status;
    if (oldStatus !== newStatus) {
      const payload = {
        id: updated.id,
        title: updated.title,
        type: updated.type,
        amount: updated.amount as unknown as number,
        counterparty: updated.counterparty,
        projectTitle: updated.project?.title ?? null,
        createdById: existing.createdById,
      };
      if (newStatus === "PENDING") {
        notifyFinanceApprovers(payload, session.user.id).catch(() => {});
      } else if (newStatus === "APPROVED" || newStatus === "PAID") {
        notifyFinanceActor(payload, "APPROVED", session.user.id).catch(() => {});
      } else if (newStatus === "DRAFT" && oldStatus === "PENDING") {
        notifyFinanceActor(payload, "REJECTED", session.user.id).catch(() => {});
      }
    }

    await auditLog({
      userId: session.user.id,
      action: "UPDATE",
      entity: "FinanceEntry",
      entityId: id,
      projectId: updated.projectId ?? undefined,
      oldData: {
        type: existing.type,
        kind: existing.kind,
        amount: Number(existing.amount),
        category: existing.category,
        title: existing.title,
        projectId: existing.projectId,
        isArchived: existing.isArchived,
      },
      newData: {
        type: updated.type,
        kind: updated.kind,
        amount: Number(updated.amount),
        category: updated.category,
        title: updated.title,
        projectId: updated.projectId,
        isArchived: updated.isArchived,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[financing/PATCH] error:", error);
    return NextResponse.json({ error: "Помилка оновлення операції" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const hard = searchParams.get("hard") === "true";

  const existing = await prisma.financeEntry.findUnique({
    where: { id },
    include: { attachments: true },
  });
  if (!existing) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  try {
    assertCanAccessFirm(session, existing.firmId);
  } catch {
    return forbiddenResponse();
  }

  if (hard) {
    if (!HARD_DELETE_ROLES.includes(session.user.role)) return forbiddenResponse();

    await Promise.allSettled(
      existing.attachments.map((a) => deleteFileFromR2(a.r2Key).catch(() => undefined))
    );
    await prisma.financeEntry.delete({ where: { id } });

    await auditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "FinanceEntry",
      entityId: id,
      projectId: existing.projectId ?? undefined,
      oldData: {
        type: existing.type,
        amount: Number(existing.amount),
        category: existing.category,
        title: existing.title,
      },
    });

    return NextResponse.json({ success: true });
  }

  const updated = await prisma.financeEntry.update({
    where: { id },
    data: { isArchived: true, updatedById: session.user.id },
    select: FINANCE_ENTRY_SELECT,
  });

  await auditLog({
    userId: session.user.id,
    action: "STATUS_CHANGE",
    entity: "FinanceEntry",
    entityId: id,
    projectId: existing.projectId ?? undefined,
    oldData: { isArchived: false },
    newData: { isArchived: true },
  });

  return NextResponse.json({ data: updated });
}
