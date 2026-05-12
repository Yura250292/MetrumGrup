import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import type {
  ImportPlan,
  FirmId,
} from "@/lib/financing/invoice-import/build-plan";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

/// Per-row overrides від UI: дозволяє користувачу перепризначити фірму,
/// проект, або вручну прив'язати invoice до конкретного counterparty.
type Override = {
  firmId?: FirmId;
  projectId?: string | null;
  counterpartyId?: string;
  /// Якщо true — рядок не імпортується (юзер маркує як "skip").
  skip?: boolean;
};

type CommitBody = {
  plan: ImportPlan;
  /// Map по rowNumber. UI відправляє лише ті рядки, де є change.
  overrides?: Record<string, Override>;
  /// Map по normalizedKey: дозволяє юзеру перейменувати display name
  /// перед створенням Counterparty.
  clusterOverrides?: Record<
    string,
    { displayName?: string; type?: "LEGAL" | "FOP" | "INDIVIDUAL"; skip?: boolean }
  >;
};

const BOTH_FIRMS: FirmId[] = ["metrum-group", "metrum-studio"];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.plan?.clusters || !body?.plan?.invoices) {
    return NextResponse.json({ error: "Невалідний plan" }, { status: 400 });
  }

  const userId = session.user.id;
  const overrides = body.overrides ?? {};
  const clusterOverrides = body.clusterOverrides ?? {};

  /// Підсумки для звіту.
  const createdCounterpartyIds: Record<FirmId, string[]> = {
    "metrum-group": [],
    "metrum-studio": [],
  };
  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];
  const errors: { rowNumber: number; error: string }[] = [];

  await prisma.$transaction(
    async (tx) => {
      // 1. Створити/підтягнути counterparties у ОБИДВІ фірми. Зберігаємо
      // map normalizedKey → { groupId, studioId } для подальшого матчингу
      // invoice → counterparty.
      const keyToFirmIds = new Map<string, Record<FirmId, string>>();

      for (const cluster of body.plan.clusters) {
        const co = clusterOverrides[cluster.normalizedKey] ?? {};
        if (co.skip) continue;

        const displayName = (co.displayName?.trim() || cluster.displayName).trim();
        const type = co.type ?? cluster.inferredType;

        const ids: Record<FirmId, string> = {
          "metrum-group": "",
          "metrum-studio": "",
        };

        for (const firmId of BOTH_FIRMS) {
          const matched =
            firmId === "metrum-group" ? cluster.groupMatch : cluster.studioMatch;
          if (matched) {
            ids[firmId] = matched.id;
            continue;
          }
          const created = await tx.counterparty.create({
            data: {
              name: displayName,
              type,
              roles: ["SUPPLIER"],
              isActive: true,
              firmId,
            },
            select: { id: true },
          });
          ids[firmId] = created.id;
          createdCounterpartyIds[firmId].push(created.id);
        }

        keyToFirmIds.set(cluster.normalizedKey, ids);
      }

      // 2. Створити FinanceEntry + (для paid) SupplierPayment + Allocation.
      for (const inv of body.plan.invoices) {
        const ov = overrides[String(inv.rowNumber)] ?? {};
        if (ov.skip) {
          skipped.push({ rowNumber: inv.rowNumber, reason: "user-skipped" });
          continue;
        }
        if (inv.amount === null || inv.amount === undefined) {
          skipped.push({
            rowNumber: inv.rowNumber,
            reason: "missing-amount",
          });
          continue;
        }

        const firmId: FirmId = ov.firmId ?? inv.firmIdAssigned;
        const cluster = body.plan.clusters.find(
          (c) => c.normalizedKey === inv.supplierKey,
        );
        if (!cluster) {
          errors.push({
            rowNumber: inv.rowNumber,
            error: "cluster not found for supplier",
          });
          continue;
        }
        if (clusterOverrides[cluster.normalizedKey]?.skip) {
          skipped.push({
            rowNumber: inv.rowNumber,
            reason: "cluster-skipped",
          });
          continue;
        }

        const ids = keyToFirmIds.get(cluster.normalizedKey);
        if (!ids) {
          errors.push({
            rowNumber: inv.rowNumber,
            error: "supplier ids not resolved",
          });
          continue;
        }
        const counterpartyId = ov.counterpartyId ?? ids[firmId];
        if (!counterpartyId) {
          errors.push({
            rowNumber: inv.rowNumber,
            error: `no counterparty for firm ${firmId}`,
          });
          continue;
        }

        // Idempotency: skip if same (firmId, counterpartyId, invoiceNumber)
        // already exists. Захищає від подвійного commit.
        if (inv.invoiceNumber) {
          const existing = await tx.financeEntry.findFirst({
            where: {
              firmId,
              counterpartyId,
              invoiceNumber: inv.invoiceNumber,
            },
            select: { id: true },
          });
          if (existing) {
            skipped.push({
              rowNumber: inv.rowNumber,
              reason: `duplicate invoice ${inv.invoiceNumber} for supplier in ${firmId}`,
            });
            continue;
          }
        }

        const projectId =
          ov.projectId !== undefined ? ov.projectId : inv.matchedProjectId;
        const supplierDisplay = cluster.displayName;
        const deliveryDate = inv.deliveryDate ? new Date(inv.deliveryDate) : null;
        const paymentDate = inv.paymentDate ? new Date(inv.paymentDate) : null;
        const occurredAt = deliveryDate ?? paymentDate ?? new Date();

        const baseData: Prisma.FinanceEntryUncheckedCreateInput = {
          occurredAt,
          kind: "FACT",
          type: "EXPENSE",
          amount: new Prisma.Decimal(inv.amount),
          currency: "UAH",
          projectId: projectId ?? null,
          category: "Постачальники",
          title: `${supplierDisplay} — рах. ${inv.invoiceNumber ?? "—"}`,
          description: inv.destination
            ? `Куди везли: ${inv.destination}`
            : null,
          counterparty: supplierDisplay,
          counterpartyId,
          invoiceNumber: inv.invoiceNumber,
          firmId,
          source: "MANUAL",
          createdById: userId,
          approvedAt: new Date(),
          approvedById: userId,
        };

        if (inv.isPaid) {
          baseData.status = "PAID";
          baseData.paidAt = paymentDate ?? occurredAt;
          // Safe Finance Migration Phase 5.1: paid invoice = actual cash out.
          baseData.financeNature = "ACTUAL_EXPENSE";
        } else {
          baseData.status = "APPROVED";
          if (paymentDate) baseData.remindAt = paymentDate;
          // Safe Finance Migration Phase 5.1: unpaid invoice = liability,
          // not actual cash. Стане ACTUAL_EXPENSE коли буде SupplierPayment.
          baseData.financeNature = "COMMITTED_EXPENSE";
        }

        const entry = await tx.financeEntry.create({
          data: baseData,
          select: { id: true, amount: true },
        });
        createdInvoiceIds.push(entry.id);

        // Для оплачених — створити SupplierPayment + 1:1 Allocation,
        // щоб ledger показав outstanding=0.
        if (inv.isPaid) {
          const payment = await tx.supplierPayment.create({
            data: {
              counterpartyId,
              firmId,
              projectId: projectId ?? null,
              amount: entry.amount,
              currency: "UAH",
              occurredAt: paymentDate ?? occurredAt,
              method: "BANK_TRANSFER",
              reference: inv.invoiceNumber,
              status: "POSTED",
              createdById: userId,
              notes: "Імпорт з xlsx (кошторисниця)",
              allocations: {
                create: {
                  financeEntryId: entry.id,
                  amount: entry.amount,
                },
              },
            },
            select: { id: true },
          });
          createdPaymentIds.push(payment.id);
        }
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  return NextResponse.json({
    created: {
      counterpartiesGroup: createdCounterpartyIds["metrum-group"].length,
      counterpartiesStudio: createdCounterpartyIds["metrum-studio"].length,
      invoices: createdInvoiceIds.length,
      payments: createdPaymentIds.length,
    },
    skipped,
    errors,
  });
}
