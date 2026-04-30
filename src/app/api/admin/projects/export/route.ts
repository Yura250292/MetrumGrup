import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  PROJECT_STATUS_LABELS,
  STAGE_LABELS,
  ESTIMATE_STATUS_LABELS
} from "@/lib/constants";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  firmWhereForProject,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";

export async function POST(request: Request) {
  try {
    const session = await auth();

    // Authorization
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { firmId } = await resolveFirmScopeForRequest(session);
    if (!isHomeFirmFor(session, firmId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const activeRole = getActiveRoleFromSession(session, firmId);
    if (activeRole !== "SUPER_ADMIN" && activeRole !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get project IDs from request
    const { projectIds } = await request.json();

    if (!projectIds || !Array.isArray(projectIds)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Firm-scope: ID можуть бути будь-які з форми; AND-имо firm щоб
    // експортувались лише проекти активної фірми.
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds }, ...firmWhereForProject(firmId) },
      include: {
        client: { select: { id: true, name: true } },
        clientCounterparty: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        crewAssignments: {
          where: { endDate: null },
          include: {
            worker: { select: { id: true, name: true, specialty: true } }
          }
        },
        estimates: {
          where: {
            status: { in: ['APPROVED', 'SENT', 'FINANCE_REVIEW', 'ENGINEER_REVIEW'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            number: true,
            finalAmount: true,
            status: true
          }
        }
      },
      orderBy: { title: 'asc' }
    });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Проєкти');

    // Define columns
    worksheet.columns = [
      { header: 'Проєкт', key: 'title', width: 30 },
      { header: 'Клієнт', key: 'client', width: 25 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Етап', key: 'stage', width: 15 },
      { header: 'Менеджер', key: 'manager', width: 20 },
      { header: 'Бригадири', key: 'brigadiers', width: 30 },
      { header: 'Бюджет (₴)', key: 'budget', width: 15 },
      { header: 'Сплачено (₴)', key: 'paid', width: 15 },
      { header: 'Залишок (₴)', key: 'remaining', width: 15 },
      { header: '% оплати', key: 'paymentPercent', width: 12 },
      { header: 'Кошторис №', key: 'estimateNumber', width: 15 },
      { header: 'Сума кошторису (₴)', key: 'estimateAmount', width: 18 },
      { header: 'Статус кошторису', key: 'estimateStatus', width: 20 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    projects.forEach((project) => {
      const brigadiers = project.crewAssignments.filter(ca =>
        ca.role?.toLowerCase().includes('бригадир') ||
        ca.role?.toLowerCase().includes('brigadier') ||
        ca.role?.toLowerCase().includes('foreman')
      );

      const brigadiersText = brigadiers.length > 0
        ? brigadiers.map(ca => `${ca.worker.name} (${ca.worker.specialty})`).join(', ')
        : project.crewAssignments.length > 0
          ? `${project.crewAssignments.length} працівник(ів)`
          : 'Не призначено';

      const budget = Number(project.totalBudget);
      const paid = Number(project.totalPaid);
      const remaining = budget - paid;
      const paymentPercent = budget > 0 ? Math.round((paid / budget) * 100) : 0;

      const latestEstimate = project.estimates[0];

      worksheet.addRow({
        title: project.title,
        client:
          project.clientName ??
          project.clientCounterparty?.name ??
          project.client?.name ??
          "—",
        status: PROJECT_STATUS_LABELS[project.status],
        stage: STAGE_LABELS[project.currentStage],
        manager: project.manager?.name || '-',
        brigadiers: brigadiersText,
        budget: budget,
        paid: paid,
        remaining: remaining,
        paymentPercent: `${paymentPercent}%`,
        estimateNumber: latestEstimate?.number || '-',
        estimateAmount: latestEstimate ? Number(latestEstimate.finalAmount) : '-',
        estimateStatus: latestEstimate ? ESTIMATE_STATUS_LABELS[latestEstimate.status] : '-'
      });
    });

    // Format number columns
    ['budget', 'paid', 'remaining'].forEach(key => {
      const col = worksheet.getColumn(key);
      col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > 1 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      });
    });

    const estimateAmountCol = worksheet.getColumn('estimateAmount');
    estimateAmountCol.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 1 && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
      }
    });

    // Add borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Generate Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="projects-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
