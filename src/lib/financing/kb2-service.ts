/**
 * KB-2в (Акт виконаних будівельних робіт) service.
 *
 * Workflow:
 *   DRAFT → ISSUED  (PDF generated, sent to client; locks items + amounts)
 *   ISSUED → SIGNED (signed by client; creates FinanceEntry INCOME PLAN +
 *                    auto-creates RetentionRecord if retentionPercent > 0)
 *   any   → CANCELLED (voids; if SIGNED, cancels the linked FinanceEntry too)
 *
 * Data model: items are SNAPSHOT from EstimateItem at form creation. Even if
 * the source estimate is later edited, the act stays frozen.
 */
import { Prisma, type CostType, type KB2Status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

export class KB2Error extends Error {
  constructor(message: string, public statusHint = 400) {
    super(message);
    this.name = "KB2Error";
  }
}

/** Allocate the next document number for a given prefix using DocumentSequence. */
async function nextNumber(prefix: string, tx: Prisma.TransactionClient): Promise<string> {
  const seq = await tx.documentSequence.upsert({
    where: { id: prefix },
    create: { id: prefix, prefix, last: 1 },
    update: { last: { increment: 1 } },
  });
  return `${prefix}-${String(seq.last).padStart(4, "0")}`;
}

export type CreateKB2Input = {
  projectId: string;
  estimateId?: string | null;
  counterpartyId?: string | null;
  periodFrom: Date;
  periodTo: Date;
  retentionPercent?: number | null;
  notes?: string | null;
  /// Per-item input. Operator picks which estimate items go on this act and at
  /// what completion (cumulative qty completed). amount = completedQty * unitPrice.
  items: Array<{
    estimateItemId?: string | null;
    description: string;
    unit: string;
    totalQty: number;
    unitPrice: number;
    completedQty: number;
    costCodeId?: string | null;
    costType?: CostType | null;
    sortOrder?: number;
  }>;
};

export async function createKB2Form(input: CreateKB2Input, userId: string) {
  if (input.items.length === 0) {
    throw new KB2Error("Список позицій порожній", 400);
  }
  if (input.periodFrom > input.periodTo) {
    throw new KB2Error("periodFrom має бути ≤ periodTo", 400);
  }

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, retentionPercent: true },
  });
  if (!project) throw new KB2Error("Проєкт не знайдено", 404);

  const retentionPercent =
    input.retentionPercent ?? Number(project.retentionPercent ?? 0);

  // Compute totals.
  let total = new Prisma.Decimal(0);
  const itemRows = input.items.map((it, idx) => {
    if (it.completedQty < 0) throw new KB2Error("completedQty не може бути < 0", 400);
    if (it.totalQty < 0) throw new KB2Error("totalQty не може бути < 0", 400);
    if (it.completedQty > it.totalQty)
      throw new KB2Error(`Виконання > 100% у позиції "${it.description.slice(0, 40)}"`, 400);

    const amount = new Prisma.Decimal(it.completedQty).mul(it.unitPrice);
    total = total.plus(amount);
    const completionPercent =
      it.totalQty > 0 ? new Prisma.Decimal(it.completedQty).div(it.totalQty).mul(100) : null;

    return {
      estimateItemId: it.estimateItemId ?? null,
      description: it.description,
      unit: it.unit,
      totalQty: new Prisma.Decimal(it.totalQty),
      unitPrice: new Prisma.Decimal(it.unitPrice),
      completedQty: new Prisma.Decimal(it.completedQty),
      amount,
      completionPercent,
      costCodeId: it.costCodeId ?? null,
      costType: it.costType ?? null,
      sortOrder: it.sortOrder ?? idx,
    };
  });

  const retentionAmount = total.mul(retentionPercent).div(100).toDecimalPlaces(2);
  const netPayable = total.minus(retentionAmount);

  return prisma.$transaction(async (tx) => {
    const number = await nextNumber("КБ2", tx);
    const form = await tx.kB2Form.create({
      data: {
        number,
        projectId: input.projectId,
        estimateId: input.estimateId ?? null,
        counterpartyId: input.counterpartyId ?? null,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        totalAmount: total,
        retentionPercent,
        retentionAmount,
        netPayable,
        notes: input.notes ?? null,
        createdById: userId,
        items: { create: itemRows },
      },
      include: { items: true, project: true, counterparty: true },
    });

    await auditLog({
      userId,
      action: "CREATE",
      entity: "KB2Form",
      entityId: form.id,
      projectId: form.projectId,
      newData: {
        number: form.number,
        total: total.toNumber(),
        items: itemRows.length,
      },
    });

    return form;
  });
}

/** DRAFT → ISSUED. Stamps issuedAt; PDF will reference this state. */
export async function issueKB2Form(formId: string, userId: string) {
  const form = await prisma.kB2Form.findUnique({ where: { id: formId } });
  if (!form) throw new KB2Error("Форму не знайдено", 404);
  if (form.status !== "DRAFT") {
    throw new KB2Error(`Форма у статусі ${form.status}, її не можна issue`, 409);
  }

  const updated = await prisma.kB2Form.update({
    where: { id: formId },
    data: { status: "ISSUED", issuedAt: new Date() },
  });

  await auditLog({
    userId,
    action: "STATUS_CHANGE",
    entity: "KB2Form",
    entityId: formId,
    projectId: form.projectId,
    oldData: { status: "DRAFT" },
    newData: { status: "ISSUED" },
  });

  return updated;
}

/**
 * ISSUED → SIGNED.
 * Effects:
 *   1. Status → SIGNED, signedAt = now.
 *   2. Creates a FinanceEntry: INCOME PLAN, amount = netPayable, status APPROVED,
 *      counterparty = form.counterparty, costCode = null (per-line items live in KB2FormItem).
 *   3. If retentionAmount > 0, creates RetentionRecord with releaseDate =
 *      project.expectedEndDate + 12 months (fallback: now + 12 months).
 */
export async function signKB2Form(
  formId: string,
  userId: string,
  opts?: { signedAt?: Date; retentionReleaseDate?: Date | null },
) {
  const form = await prisma.kB2Form.findUnique({
    where: { id: formId },
    include: { project: { select: { id: true, expectedEndDate: true } }, counterparty: true },
  });
  if (!form) throw new KB2Error("Форму не знайдено", 404);
  if (form.status !== "ISSUED" && form.status !== "DRAFT") {
    throw new KB2Error(`Форма у статусі ${form.status}, не можна підписати`, 409);
  }

  const signedAt = opts?.signedAt ?? new Date();
  const releaseDate =
    opts?.retentionReleaseDate ??
    (form.project.expectedEndDate
      ? new Date(form.project.expectedEndDate.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(signedAt.getTime() + 365 * 24 * 60 * 60 * 1000));

  return prisma.$transaction(async (tx) => {
    // Income FinanceEntry — net amount payable to us.
    const entry = await tx.financeEntry.create({
      data: {
        kind: "PLAN",
        type: "INCOME",
        status: "APPROVED",
        amount: form.netPayable,
        currency: "UAH",
        occurredAt: signedAt,
        projectId: form.projectId,
        category: "client_advance",
        title: `${form.number} • очікувана оплата`,
        description: `Підписаний акт виконаних робіт ${form.number} за період ${form.periodFrom.toISOString().slice(0, 10)} – ${form.periodTo.toISOString().slice(0, 10)}`,
        counterparty: form.counterparty?.name ?? null,
        counterpartyId: form.counterpartyId,
        createdById: userId,
        approvedById: userId,
        approvedAt: signedAt,
        source: "MANUAL",
      },
      select: { id: true },
    });

    // Retention.
    let retentionId: string | null = null;
    if (Number(form.retentionAmount) > 0) {
      const retention = await tx.retentionRecord.create({
        data: {
          kb2FormId: form.id,
          amount: form.retentionAmount,
          releaseDate,
          status: "HELD",
        },
        select: { id: true },
      });
      retentionId = retention.id;
    }

    const updated = await tx.kB2Form.update({
      where: { id: formId },
      data: {
        status: "SIGNED",
        signedAt,
        approvedById: userId,
        financeEntryId: entry.id,
      },
    });

    await auditLog({
      userId,
      action: "STATUS_CHANGE",
      entity: "KB2Form",
      entityId: formId,
      projectId: form.projectId,
      oldData: { status: form.status },
      newData: {
        status: "SIGNED",
        financeEntryId: entry.id,
        retentionId,
      },
    });

    return updated;
  });
}

/** Cancel any state. If SIGNED, also archives linked FinanceEntry and cancels retention. */
export async function cancelKB2Form(formId: string, userId: string, reason?: string) {
  const form = await prisma.kB2Form.findUnique({
    where: { id: formId },
    include: { retentions: true },
  });
  if (!form) throw new KB2Error("Форму не знайдено", 404);
  if (form.status === "CANCELLED") {
    throw new KB2Error("Форма вже скасована", 409);
  }

  return prisma.$transaction(async (tx) => {
    if (form.financeEntryId) {
      await tx.financeEntry.update({
        where: { id: form.financeEntryId },
        data: { isArchived: true, updatedById: userId },
      });
    }
    for (const r of form.retentions) {
      if (r.status === "HELD") {
        await tx.retentionRecord.update({
          where: { id: r.id },
          data: { status: "CANCELLED" },
        });
      }
    }
    const updated = await tx.kB2Form.update({
      where: { id: formId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        notes: reason ? `[CANCEL] ${reason}\n\n${form.notes ?? ""}` : form.notes,
      },
    });

    await auditLog({
      userId,
      action: "STATUS_CHANGE",
      entity: "KB2Form",
      entityId: formId,
      projectId: form.projectId,
      oldData: { status: form.status },
      newData: { status: "CANCELLED", reason: reason ?? null },
    });

    return updated;
  });
}

/**
 * Release retention: marks RELEASED + creates a FinanceEntry FACT EXPENSE
 * (we owe the client back the held amount on completion).
 *
 * Or — depending on accounting model — INCOME (we receive what was held).
 * Here we treat retention as money we owe the contractor (most common for
 * Metrum acting as GC), so release = OUTGOING payment.
 */
export async function releaseRetention(
  retentionId: string,
  userId: string,
  opts?: { occurredAt?: Date; status?: "APPROVED" | "PAID" },
) {
  const retention = await prisma.retentionRecord.findUnique({
    where: { id: retentionId },
    include: { form: { include: { counterparty: true, project: true } } },
  });
  if (!retention) throw new KB2Error("Утримання не знайдено", 404);
  if (retention.status !== "HELD") {
    throw new KB2Error(`Утримання у статусі ${retention.status}`, 409);
  }

  const occurredAt = opts?.occurredAt ?? new Date();
  const status = opts?.status ?? "APPROVED";

  return prisma.$transaction(async (tx) => {
    const entry = await tx.financeEntry.create({
      data: {
        kind: "FACT",
        type: "EXPENSE",
        status,
        amount: retention.amount,
        currency: "UAH",
        occurredAt,
        projectId: retention.form.projectId,
        category: "subcontractors",
        costType: "OVERHEAD",
        title: `Реліз утримання ${retention.form.number}`,
        description: `Гарантійне утримання ${retention.amount} ₴ повернуто за актом ${retention.form.number}`,
        counterparty: retention.form.counterparty?.name ?? null,
        counterpartyId: retention.form.counterpartyId,
        createdById: userId,
        approvedById: status === "APPROVED" || status === "PAID" ? userId : null,
        approvedAt: status === "APPROVED" || status === "PAID" ? occurredAt : null,
        paidAt: status === "PAID" ? occurredAt : null,
        source: "MANUAL",
      },
      select: { id: true },
    });

    const updated = await tx.retentionRecord.update({
      where: { id: retentionId },
      data: {
        status: "RELEASED",
        releasedAt: occurredAt,
        releasedFinanceEntryId: entry.id,
      },
    });

    await auditLog({
      userId,
      action: "STATUS_CHANGE",
      entity: "RetentionRecord",
      entityId: retentionId,
      projectId: retention.form.projectId,
      oldData: { status: "HELD" },
      newData: { status: "RELEASED", financeEntryId: entry.id },
    });

    return updated;
  });
}

export const KB2_STATUS_LABELS: Record<KB2Status, string> = {
  DRAFT: "Чернетка",
  ISSUED: "Видано",
  SIGNED: "Підписано",
  CANCELLED: "Скасовано",
};
