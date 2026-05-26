import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Відкритий",
  IN_PROGRESS: "В роботі",
  ANSWERED: "Відповідь отримана",
  CLOSED: "Закритий",
  CANCELLED: "Скасований",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Низький",
  NORMAL: "Звичайний",
  HIGH: "Високий",
  URGENT: "Критичний",
};

function daysBetween(from: Date | null, to: Date | null): number | null {
  if (!from) return null;
  const end = to ?? new Date();
  return Math.round((end.getTime() - from.getTime()) / (24 * 3600 * 1000));
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId: firmId ?? undefined },
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const rfis = await prisma.rFI.findMany({
    where: { projectId },
    include: {
      askedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      answeredBy: { select: { name: true } },
    },
    orderBy: { askedAt: "asc" },
  });

  // Dynamic import — mirrors src/lib/export/estimate-v2-export.ts pattern
  // and keeps cold-start bundle slim.
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`RFI ${project.title}`.slice(0, 31));

  ws.columns = [
    { header: "№", key: "number", width: 10 },
    { header: "Тема", key: "subject", width: 40 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Пріоритет", key: "priority", width: 14 },
    { header: "Запитав", key: "askedBy", width: 22 },
    { header: "Дата запиту", key: "askedAt", width: 18 },
    { header: "Виконавець", key: "assignedTo", width: 22 },
    { header: "Дедлайн", key: "dueAt", width: 18 },
    { header: "Дата відповіді", key: "answeredAt", width: 18 },
    { header: "Хто відповів", key: "answeredBy", width: 22 },
    { header: "Дата закриття", key: "closedAt", width: 18 },
    { header: "Днів відкритий", key: "daysOpen", width: 14 },
    { header: "Впливає на графік", key: "impactsSchedule", width: 18 },
    { header: "Впливає на бюджет", key: "impactsBudget", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rfis) {
    ws.addRow({
      number: r.number,
      subject: r.subject,
      status: STATUS_LABEL[r.status] ?? r.status,
      priority: PRIORITY_LABEL[r.priority] ?? r.priority,
      askedBy: r.askedBy?.name ?? "",
      askedAt: r.askedAt,
      assignedTo: r.assignedTo?.name ?? "",
      dueAt: r.dueAt,
      answeredAt: r.answeredAt,
      answeredBy: r.answeredBy?.name ?? "",
      closedAt: r.closedAt,
      daysOpen: daysBetween(r.askedAt, r.closedAt ?? r.cancelledAt),
      impactsSchedule: r.impactsSchedule ? "так" : "ні",
      impactsBudget: r.impactsBudget ? "так" : "ні",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `rfi-${project.title.replace(/[^\p{L}\p{N}._-]+/gu, "_")}.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
