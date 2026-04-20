import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import { FINANCE_ENTRY_SELECT } from "@/lib/financing/queries";
import { deleteFileFromR2 } from "@/lib/r2-client";

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
      }
      if (body.status === "PAID") {
        data.paidAt = new Date();
        // If going directly to PAID without prior approval, mark as approved too
        if (!existing.approvedAt) {
          data.approvedAt = new Date();
          data.approvedById = session.user.id;
        }
      }
    }

    const updated = await prisma.financeEntry.update({
      where: { id },
      data,
      select: FINANCE_ENTRY_SELECT,
    });

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
