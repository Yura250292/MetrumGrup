/**
 * Supplier debt — FIFO allocation core.
 *
 * Один платіж постачальнику (SupplierPayment) розкидається по найстаріших
 * несплачених FinanceEntry (kind=FACT, type=EXPENSE, status APPROVED|PENDING)
 * у scope (counterpartyId, firmId, опційно projectId). Кожна часткова allocation
 * — рядок SupplierPaymentAllocation. Коли SUM(allocations) на FE = amount,
 * статус FE переводиться в PAID.
 *
 * Concurrency: транзакція бере SELECT FOR UPDATE по рядку counterparties — два
 * паралельні платежі на того самого постачальника серіалізуються, тому один
 * FE не отримає більше allocations ніж його amount.
 *
 * Idempotency:
 *   - SupplierPayment.idempotencyKey має @unique → повторний submit з тим самим
 *     ключем повертає вже створений payment (createSupplierPayment перевіряє це
 *     до транзакції).
 *   - SupplierPaymentAllocation @@unique([paymentId, financeEntryId]) — другий
 *     рівень захисту якщо алгоритм допустив повторний прогон.
 */
import { Prisma, type FinanceEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const ZERO = new Decimal(0);

export type AllocationLine = {
  financeEntryId: string;
  occurredAt: Date;
  title: string;
  projectId: string | null;
  outstandingBefore: Decimal;
  allocate: Decimal;
  outstandingAfter: Decimal;
  willBecomePaid: boolean;
};

export type AllocationPlan = {
  lines: AllocationLine[];
  totalAllocated: Decimal;
  unallocated: Decimal;
};

type Tx = Prisma.TransactionClient;

type CandidateRow = Pick<
  FinanceEntry,
  "id" | "amount" | "occurredAt" | "title" | "projectId"
> & { allocated: Decimal };

/** Сумарна allocation на конкретний FE (for-the-record use only). */
export async function getAllocatedAmount(
  tx: Tx | typeof prisma,
  financeEntryId: string,
): Promise<Decimal> {
  const row = await tx.supplierPaymentAllocation.aggregate({
    where: { financeEntryId },
    _sum: { amount: true },
  });
  return new Decimal(row._sum.amount ?? 0);
}

/**
 * Бере несплачені FinanceEntry постачальника у FIFO-порядку (occurredAt ASC, id ASC),
 * рахує allocated на кожному. Використовується і для preview, і для actual allocation.
 */
async function loadCandidates(
  tx: Tx | typeof prisma,
  args: { counterpartyId: string; firmId: string; projectId?: string | null },
): Promise<CandidateRow[]> {
  const entries = await tx.financeEntry.findMany({
    where: {
      counterpartyId: args.counterpartyId,
      firmId: args.firmId,
      type: "EXPENSE",
      kind: "FACT",
      isArchived: false,
      status: { in: ["APPROVED", "PENDING"] },
      ...(args.projectId ? { projectId: args.projectId } : {}),
    },
    select: {
      id: true,
      amount: true,
      occurredAt: true,
      title: true,
      projectId: true,
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });

  if (entries.length === 0) return [];

  const allocated = await tx.supplierPaymentAllocation.groupBy({
    by: ["financeEntryId"],
    where: { financeEntryId: { in: entries.map((e) => e.id) } },
    _sum: { amount: true },
  });
  const allocatedMap = new Map<string, Decimal>();
  for (const r of allocated) {
    allocatedMap.set(r.financeEntryId, new Decimal(r._sum.amount ?? 0));
  }

  return entries.map((e) => ({
    ...e,
    amount: new Decimal(e.amount),
    allocated: allocatedMap.get(e.id) ?? ZERO,
  }));
}

/**
 * Стратегія розподілу платежу між несплаченими фактами:
 *
 * - HYBRID — пропорційно по проєктах (за часткою боргу), FIFO всередині проєкту.
 *   Дефолт: розкидає гроші справедливо між обʼєктами + всередині обʼєкта
 *   закриває старіші накладні першими.
 *
 * - FIFO — глобально найстаріші факти першими, без врахування проєктів.
 *   Корисно якщо постачальник тисне за конкретні старі накладні.
 *
 * - PROPORTIONAL — кожен факт отримує % пропорційний своїй частці у боргу.
 *   Усі накладні стають частково оплачені — використовується рідко, для
 *   звітності "кожен факт сплачено на 50%".
 */
export type AllocationStrategy = "HYBRID" | "FIFO" | "PROPORTIONAL";

const DEFAULT_STRATEGY: AllocationStrategy = "HYBRID";

function makeLine(
  c: CandidateRow,
  outstanding: Decimal,
  take: Decimal,
): AllocationLine {
  const after = outstanding.minus(take);
  return {
    financeEntryId: c.id,
    occurredAt: c.occurredAt,
    title: c.title,
    projectId: c.projectId,
    outstandingBefore: outstanding,
    allocate: take,
    outstandingAfter: after,
    willBecomePaid: after.lessThanOrEqualTo(0),
  };
}

/** Pure FIFO: проходимо по всіх кандидатах у відсортованому порядку. */
function planFifo(
  candidates: CandidateRow[],
  amount: Decimal,
): AllocationPlan {
  let remaining = new Decimal(amount);
  const lines: AllocationLine[] = [];
  for (const c of candidates) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const outstanding = c.amount.minus(c.allocated);
    if (outstanding.lessThanOrEqualTo(0)) continue;
    const take = Decimal.min(outstanding, remaining);
    lines.push(makeLine(c, outstanding, take));
    remaining = remaining.minus(take);
  }
  const totalAllocated = new Decimal(amount).minus(remaining);
  return { lines, totalAllocated, unallocated: remaining };
}

/**
 * Пропорційно по фактах: кожен FE отримує `(outstanding / totalOutstanding) * amount`.
 * Округлення до 2 знаків. Останній (найбільший) FE отримує rounding-error,
 * щоб сума allocations точно = amount.
 */
function planProportional(
  candidates: CandidateRow[],
  amount: Decimal,
): AllocationPlan {
  const live = candidates
    .map((c) => ({ c, outstanding: c.amount.minus(c.allocated) }))
    .filter((r) => r.outstanding.greaterThan(0));

  if (live.length === 0) {
    return { lines: [], totalAllocated: ZERO, unallocated: amount };
  }

  const grandTotal = live.reduce((acc, r) => acc.plus(r.outstanding), ZERO);
  // Cap проти overpayment: не дозволяємо платити більше ніж загальний борг.
  const usable = Decimal.min(amount, grandTotal);

  // Сортуємо по outstanding desc — найбільший факт прийме rounding-error.
  const sorted = [...live].sort((a, b) =>
    b.outstanding.comparedTo(a.outstanding),
  );

  const lines: AllocationLine[] = [];
  let assigned = ZERO;
  for (let i = 0; i < sorted.length; i++) {
    const { c, outstanding } = sorted[i];
    let take: Decimal;
    if (i === sorted.length - 1) {
      // Найменший — додаємо те що лишилось щоб не було rounding-drift.
      take = usable.minus(assigned);
    } else {
      const share = outstanding.dividedBy(grandTotal);
      take = usable.times(share).toDecimalPlaces(2);
    }
    take = Decimal.min(take, outstanding);
    if (take.greaterThan(0)) {
      lines.push(makeLine(c, outstanding, take));
      assigned = assigned.plus(take);
    }
  }

  // Повертаємо в природному порядку (по occurredAt) для UI.
  lines.sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.financeEntryId.localeCompare(b.financeEntryId),
  );

  return {
    lines,
    totalAllocated: assigned,
    unallocated: amount.minus(assigned),
  };
}

/**
 * Гібрид (default): пропорційно ділимо `amount` між проєктами за часткою боргу,
 * всередині кожного проєкту — FIFO по найстаріших накладних.
 *
 * Edge case: факти без projectId групуються в окрему "віртуальну" групу — отримують
 * свою частку як окремий "проєкт".
 */
function planHybrid(
  candidates: CandidateRow[],
  amount: Decimal,
): AllocationPlan {
  const groups = new Map<string, CandidateRow[]>();
  const groupKey = (c: CandidateRow) => c.projectId ?? "__no_project__";

  for (const c of candidates) {
    const k = groupKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }

  type GroupInfo = { key: string; rows: CandidateRow[]; outstanding: Decimal };
  const groupInfos: GroupInfo[] = [];
  let grandTotal = ZERO;
  for (const [k, rows] of groups) {
    let total = ZERO;
    for (const r of rows) {
      const out = r.amount.minus(r.allocated);
      if (out.greaterThan(0)) total = total.plus(out);
    }
    if (total.greaterThan(0)) {
      groupInfos.push({ key: k, rows, outstanding: total });
      grandTotal = grandTotal.plus(total);
    }
  }

  if (grandTotal.equals(0)) {
    return { lines: [], totalAllocated: ZERO, unallocated: amount };
  }

  const usable = Decimal.min(amount, grandTotal);

  // Сортуємо групи по outstanding desc — найбільший проєкт прийме rounding-error.
  groupInfos.sort((a, b) => b.outstanding.comparedTo(a.outstanding));

  // Розподіл бюджету по проєктах.
  const groupAllocations = new Map<string, Decimal>();
  let assignedToGroups = ZERO;
  for (let i = 0; i < groupInfos.length; i++) {
    const g = groupInfos[i];
    let alloc: Decimal;
    if (i === groupInfos.length - 1) {
      alloc = usable.minus(assignedToGroups);
    } else {
      const share = g.outstanding.dividedBy(grandTotal);
      alloc = usable.times(share).toDecimalPlaces(2);
    }
    alloc = Decimal.min(alloc, g.outstanding);
    groupAllocations.set(g.key, alloc);
    assignedToGroups = assignedToGroups.plus(alloc);
  }

  // FIFO всередині кожного проєкту. Rows вже відсортовано по occurredAt при load.
  const lines: AllocationLine[] = [];
  let totalAssigned = ZERO;
  for (const g of groupInfos) {
    let remaining = groupAllocations.get(g.key) ?? ZERO;
    for (const r of g.rows) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const out = r.amount.minus(r.allocated);
      if (out.lessThanOrEqualTo(0)) continue;
      const take = Decimal.min(out, remaining);
      lines.push(makeLine(r, out, take));
      remaining = remaining.minus(take);
      totalAssigned = totalAssigned.plus(take);
    }
  }

  lines.sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.financeEntryId.localeCompare(b.financeEntryId),
  );

  return {
    lines,
    totalAllocated: totalAssigned,
    unallocated: amount.minus(totalAssigned),
  };
}

function planLines(
  candidates: CandidateRow[],
  amount: Decimal,
  strategy: AllocationStrategy = DEFAULT_STRATEGY,
): AllocationPlan {
  switch (strategy) {
    case "FIFO":
      return planFifo(candidates, amount);
    case "PROPORTIONAL":
      return planProportional(candidates, amount);
    case "HYBRID":
    default:
      return planHybrid(candidates, amount);
  }
}

/**
 * Read-only preview плану розподілу за обраною стратегією. UI кличе перед
 * сабмітом форми, щоб показати "цей платіж покриє: цемент 40 → плитка 30 …".
 */
export async function previewSupplierAllocation(args: {
  counterpartyId: string;
  firmId: string;
  amount: number | string | Decimal;
  projectId?: string | null;
  strategy?: AllocationStrategy;
}): Promise<AllocationPlan> {
  const candidates = await loadCandidates(prisma, args);
  return planLines(
    candidates,
    new Decimal(args.amount),
    args.strategy ?? DEFAULT_STRATEGY,
  );
}

export type CreateSupplierPaymentInput = {
  counterpartyId: string;
  firmId: string;
  projectId?: string | null;
  amount: number | string | Decimal;
  currency?: string;
  occurredAt: Date;
  method?: "CASH" | "BANK_TRANSFER" | "CARD";
  reference?: string | null;
  notes?: string | null;
  createdById: string;
  /** Header X-Idempotency-Key. Повторний submit з тим самим ключем поверне вже створений платіж. */
  idempotencyKey?: string | null;
  /** За замовчуванням HYBRID. */
  strategy?: AllocationStrategy;
};

export type CreatedSupplierPayment = {
  payment: {
    id: string;
    amount: Decimal;
    currency: string;
    occurredAt: Date;
    status: "POSTED";
    counterpartyId: string;
    firmId: string;
    projectId: string | null;
  };
  plan: AllocationPlan;
  /** true якщо повернули існуючий платіж за idempotencyKey (без побічних ефектів). */
  idempotentReplay: boolean;
};

/**
 * Створити SupplierPayment + auto-allocate FIFO у транзакції.
 *
 * Інваріант: жоден FE не отримає allocations > свого amount. Гарантовано
 * (a) SELECT FOR UPDATE на counterparty-row (від паралельних платежів),
 * (b) перерахунком allocated всередині транзакції,
 * (c) unique([paymentId, financeEntryId]).
 */
export async function createSupplierPaymentWithAllocation(
  input: CreateSupplierPaymentInput,
): Promise<CreatedSupplierPayment> {
  // Idempotency check ДО транзакції — швидкий шлях для ретраїв.
  if (input.idempotencyKey) {
    const existing = await prisma.supplierPayment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { allocations: true },
    });
    if (existing) {
      const lines: AllocationLine[] = existing.allocations.map((a) => ({
        financeEntryId: a.financeEntryId,
        occurredAt: existing.occurredAt,
        title: "",
        projectId: null,
        outstandingBefore: new Decimal(a.amount),
        allocate: new Decimal(a.amount),
        outstandingAfter: ZERO,
        willBecomePaid: false,
      }));
      const totalAllocated = lines.reduce(
        (acc, l) => acc.plus(l.allocate),
        ZERO,
      );
      return {
        payment: {
          id: existing.id,
          amount: new Decimal(existing.amount),
          currency: existing.currency,
          occurredAt: existing.occurredAt,
          status: "POSTED",
          counterpartyId: existing.counterpartyId,
          firmId: existing.firmId,
          projectId: existing.projectId,
        },
        plan: {
          lines,
          totalAllocated,
          unallocated: new Decimal(existing.amount).minus(totalAllocated),
        },
        idempotentReplay: true,
      };
    }
  }

  const amount = new Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Сума має бути більше нуля");
  }

  const result = await prisma.$transaction(async (tx) => {
    // SELECT FOR UPDATE — серіалізує паралельні платежі на одного постачальника.
    // Без цього два паралельні запити могли б побачити однаковий outstanding
    // і алоцювати на той самий FE двічі (хоч @@unique і не дав би вставити —
    // другий впав би з помилкою). Ця lock-стратегія дає чистий retry на app-рівні.
    await tx.$queryRaw`SELECT id FROM "counterparties" WHERE id = ${input.counterpartyId} FOR UPDATE`;

    const candidates = await loadCandidates(tx, {
      counterpartyId: input.counterpartyId,
      firmId: input.firmId,
      projectId: input.projectId ?? null,
    });
    const plan = planLines(candidates, amount, input.strategy ?? DEFAULT_STRATEGY);

    const payment = await tx.supplierPayment.create({
      data: {
        counterpartyId: input.counterpartyId,
        firmId: input.firmId,
        projectId: input.projectId ?? null,
        amount,
        currency: input.currency ?? "UAH",
        occurredAt: input.occurredAt,
        method: input.method ?? "BANK_TRANSFER",
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        status: "POSTED",
        createdById: input.createdById,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        occurredAt: true,
        counterpartyId: true,
        firmId: true,
        projectId: true,
      },
    });

    if (plan.lines.length > 0) {
      await tx.supplierPaymentAllocation.createMany({
        data: plan.lines.map((l) => ({
          paymentId: payment.id,
          financeEntryId: l.financeEntryId,
          amount: l.allocate,
        })),
      });

      const paidIds = plan.lines
        .filter((l) => l.willBecomePaid)
        .map((l) => l.financeEntryId);
      if (paidIds.length > 0) {
        await tx.financeEntry.updateMany({
          where: { id: { in: paidIds } },
          data: {
            status: "PAID",
            paidAt: input.occurredAt,
            updatedById: input.createdById,
          },
        });
      }
    }

    return { payment, plan };
  });

  return {
    payment: { ...result.payment, status: "POSTED" as const, amount: new Decimal(result.payment.amount) },
    plan: result.plan,
    idempotentReplay: false,
  };
}

export type VoidSupplierPaymentInput = {
  paymentId: string;
  voidedById: string;
  reason?: string | null;
};

/**
 * Скасувати платіж: видалити всі його allocations, поставити status=VOIDED,
 * і повернути зачеплені FinanceEntry назад у APPROVED (якщо тепер outstanding > 0).
 * Idempotent: повторний void на VOIDED — no-op.
 */
export async function voidSupplierPayment(input: VoidSupplierPaymentInput) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.findUnique({
      where: { id: input.paymentId },
      include: { allocations: { select: { financeEntryId: true } } },
    });
    if (!payment) {
      throw Object.assign(new Error("Платіж не знайдено"), { status: 404 });
    }
    if (payment.status === "VOIDED") {
      return { payment, alreadyVoided: true };
    }

    const affectedFeIds = payment.allocations.map((a) => a.financeEntryId);

    // Видалити allocations цього платежу.
    await tx.supplierPaymentAllocation.deleteMany({
      where: { paymentId: input.paymentId },
    });

    // Повернути зачеплені FE у APPROVED, якщо вони залишилися без повного покриття.
    if (affectedFeIds.length > 0) {
      const remainAlloc = await tx.supplierPaymentAllocation.groupBy({
        by: ["financeEntryId"],
        where: { financeEntryId: { in: affectedFeIds } },
        _sum: { amount: true },
      });
      const remainMap = new Map<string, Decimal>();
      for (const r of remainAlloc) {
        remainMap.set(r.financeEntryId, new Decimal(r._sum.amount ?? 0));
      }
      const fes = await tx.financeEntry.findMany({
        where: { id: { in: affectedFeIds } },
        select: { id: true, amount: true, status: true },
      });
      for (const fe of fes) {
        const stillAllocated = remainMap.get(fe.id) ?? ZERO;
        const fullyCovered = stillAllocated.greaterThanOrEqualTo(fe.amount);
        if (fullyCovered) continue; // інший платіж досі покриває повністю — лишаємо PAID
        if (fe.status === "PAID") {
          await tx.financeEntry.update({
            where: { id: fe.id },
            data: {
              status: "APPROVED",
              paidAt: null,
              updatedById: input.voidedById,
            },
          });
        }
      }
    }

    const updated = await tx.supplierPayment.update({
      where: { id: input.paymentId },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: input.voidedById,
        voidReason: input.reason ?? null,
      },
    });

    return { payment: updated, alreadyVoided: false };
  });
}
