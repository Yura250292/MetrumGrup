import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import {
  FINANCE_CATEGORY_LABELS,
  FINANCE_ENTRY_TYPE_LABELS,
} from "@/lib/constants";
import {
  parseListParams,
  buildWhere,
  computeSummary,
} from "@/lib/financing/queries";
import {
  generateFinancingExcel,
  type FinancingExportAppliedFilter,
} from "@/lib/export/financing-export";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  try {
    const { searchParams } = new URL(request.url);
    const filters = parseListParams(searchParams);
    const where = buildWhere(filters);

    const [entries, summary] = await Promise.all([
      prisma.financeEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        include: {
          project: { select: { title: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
      }),
      computeSummary(where),
    ]);

    const appliedFilters: FinancingExportAppliedFilter[] = [];
    if (filters.projectId === null) {
      appliedFilters.push({ label: "Проєкт", value: "Постійні витрати компанії" });
    } else if (filters.projectId) {
      const proj = await prisma.project.findUnique({
        where: { id: filters.projectId },
        select: { title: true },
      });
      if (proj) appliedFilters.push({ label: "Проєкт", value: proj.title });
    }
    if (filters.type) {
      appliedFilters.push({
        label: "Тип",
        value: FINANCE_ENTRY_TYPE_LABELS[filters.type] ?? filters.type,
      });
    }
    if (filters.category) {
      appliedFilters.push({
        label: "Категорія",
        value: FINANCE_CATEGORY_LABELS[filters.category] ?? filters.category,
      });
    }
    if (filters.from)
      appliedFilters.push({ label: "Період від", value: filters.from.toISOString().slice(0, 10) });
    if (filters.to)
      appliedFilters.push({ label: "Період до", value: filters.to.toISOString().slice(0, 10) });
    if (filters.search) appliedFilters.push({ label: "Пошук", value: filters.search });
    if (filters.hasAttachments === true)
      appliedFilters.push({ label: "З вкладеннями", value: "Так" });
    if (filters.archived) appliedFilters.push({ label: "Архівні", value: "Так" });

    const buffer = await generateFinancingExcel({
      entries: entries.map((e) => ({
        occurredAt: e.occurredAt,
        type: e.type,
        amount: Number(e.amount),
        currency: e.currency,
        projectTitle: e.project?.title ?? null,
        category: e.category,
        subcategory: e.subcategory,
        title: e.title,
        description: e.description,
        counterparty: e.counterparty,
        createdByName: e.createdBy?.name ?? "—",
        createdAt: e.createdAt,
        updatedByName: e.updatedBy?.name ?? null,
        updatedAt: e.updatedAt,
      })),
      summary,
      appliedFilters,
      generatedAt: new Date(),
    });

    await auditLog({
      userId: session.user.id,
      action: "EXPORT",
      entity: "FinanceEntry",
      newData: { count: entries.length, filters: appliedFilters },
    });

    const fileName = `financing-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[financing/export] error:", error);
    return NextResponse.json({ error: "Помилка експорту" }, { status: 500 });
  }
}
