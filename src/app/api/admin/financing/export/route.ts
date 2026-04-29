import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor } from "@/lib/firm/scope";
import {
  FINANCE_CATEGORY_LABELS,
  FINANCE_ENTRY_TYPE_LABELS,
} from "@/lib/constants";

const KIND_LABELS: Record<"PLAN" | "FACT", string> = { PLAN: "План", FACT: "Факт" };
import {
  parseListParams,
  expandFolderFilter,
  computeSummary,
} from "@/lib/financing/queries";
import {
  generateFinancingExcel,
  type FinancingExportAppliedFilter,
  type FinancingExportInput,
} from "@/lib/export/financing-export";
import { generateFinancingPdf } from "@/lib/export/financing-pdf";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

const COST_TYPE_LABELS: Record<string, string> = {
  MATERIAL: "Матеріали",
  LABOR: "Робота (ЗП)",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  try {
    const { searchParams } = new URL(request.url);
    const filters = parseListParams(searchParams, firmId);
    const where = await expandFolderFilter(filters);

    const [entries, summary] = await Promise.all([
      prisma.financeEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        include: {
          project: { select: { title: true } },
          folder: { select: { name: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
      }),
      computeSummary(where),
    ]);

    const appliedFilters: FinancingExportAppliedFilter[] = [];
    if (filters.folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: filters.folderId },
        select: { name: true },
      });
      if (folder) appliedFilters.push({ label: "Папка", value: folder.name });
    } else if (filters.projectId === null) {
      appliedFilters.push({ label: "Проєкт", value: "Без проєкту" });
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
    if (filters.kind) {
      appliedFilters.push({ label: "Вид", value: KIND_LABELS[filters.kind] ?? filters.kind });
    }
    if (filters.category) {
      appliedFilters.push({
        label: "Категорія",
        value: FINANCE_CATEGORY_LABELS[filters.category] ?? filters.category,
      });
    }
    if (filters.costCodeId) {
      const cc = await prisma.costCode.findUnique({
        where: { id: filters.costCodeId },
        select: { code: true, name: true },
      });
      if (cc) appliedFilters.push({ label: "Стаття", value: `${cc.code} ${cc.name}` });
    }
    if (filters.costType) {
      appliedFilters.push({
        label: "Тип витрат",
        value: COST_TYPE_LABELS[filters.costType] ?? filters.costType,
      });
    }
    if (filters.counterpartyId) {
      const cp = await prisma.counterparty.findFirst({
        where: {
          id: filters.counterpartyId,
          ...(firmId ? { firmId } : {}),
        },
        select: { name: true },
      });
      if (cp) appliedFilters.push({ label: "Контрагент", value: cp.name });
    }
    if (filters.from)
      appliedFilters.push({ label: "Період від", value: filters.from.toISOString().slice(0, 10) });
    if (filters.to)
      appliedFilters.push({ label: "Період до", value: filters.to.toISOString().slice(0, 10) });
    if (filters.search) appliedFilters.push({ label: "Пошук", value: filters.search });
    if (filters.hasAttachments === true)
      appliedFilters.push({ label: "З вкладеннями", value: "Так" });
    if (filters.archived) appliedFilters.push({ label: "Архівні", value: "Так" });

    const exportInput: FinancingExportInput = {
      entries: entries.map((e) => ({
        occurredAt: e.occurredAt,
        kind: e.kind,
        type: e.type,
        amount: Number(e.amount),
        currency: e.currency,
        projectTitle: e.project?.title ?? e.folder?.name ?? null,
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
    };

    const format = (searchParams.get("format") ?? "xlsx").toLowerCase();
    const reportTitle = searchParams.get("title") ?? undefined;
    const today = new Date().toISOString().slice(0, 10);

    await auditLog({
      userId: session.user.id,
      action: "EXPORT",
      entity: "FinanceEntry",
      newData: { count: entries.length, filters: appliedFilters, format },
    });

    if (format === "pdf") {
      const pdf = await generateFinancingPdf(exportInput, { reportTitle });
      const fileName = `financing-${today}.pdf`;
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await generateFinancingExcel(exportInput);
    const fileName = `financing-${today}.xlsx`;
    return new NextResponse(buffer as unknown as BodyInit, {
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
