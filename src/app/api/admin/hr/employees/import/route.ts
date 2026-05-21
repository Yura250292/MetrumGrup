import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  parseEmployeesExcel,
  readSheetAsRows,
  applyEmployeeMapping,
  EMPLOYEE_FIELDS,
  type ImportResult,
  type EmployeeImportRow,
} from "@/lib/import/hr-import";
import { inferColumnMapping } from "@/lib/import/ai-mapper";
import { syncEmployeeSalaryCache } from "@/lib/hr/employee-salary";

async function parseWithAi(buffer: Buffer): Promise<ImportResult<EmployeeImportRow>> {
  const rows = await readSheetAsRows(buffer);
  const mapping = await inferColumnMapping(rows, EMPLOYEE_FIELDS);
  return applyEmployeeMapping(rows, mapping.headerRow, mapping.columnMap);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Підтримуються тільки Excel файли (.xlsx, .xls)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed: ImportResult<EmployeeImportRow>;
    let usedAi = false;
    try {
      parsed = await parseEmployeesExcel(buffer);
      if (parsed.validRows === 0) {
        parsed = await parseWithAi(buffer);
        usedAi = true;
      }
    } catch {
      parsed = await parseWithAi(buffer);
      usedAi = true;
    }

    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "validate") {
      return NextResponse.json({ preview: parsed, usedAi });
    }

    // Створюємо співробітників разом з першим записом історії ЗП.
    // У новій моделі salaryAmount/salaryType — лише deprecated кеш, який
    // підтягне syncEmployeeSalaryCache() після створення EmployeeSalary.
    let created = 0;
    let skipped = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of parsed.data) {
        // Видаляємо deprecated поля яких більше нема на Employee. extraData
        // дописуємо до notes (зберігаємо інформацію).
        const {
          salaryAmount,
          salaryType,
          currency,
          extraData,
          notes,
          ...employeeData
        } = row;
        // Дедуплікація за табельним номером — якщо є employeeNumber і вже
        // існує запис із таким номером, пропускаємо (повторний upload штату).
        if (employeeData.employeeNumber) {
          const existing = await tx.employee.findUnique({
            where: { employeeNumber: employeeData.employeeNumber },
            select: { id: true },
          });
          if (existing) {
            skipped++;
            continue;
          }
        }
        const mergedNotes = [notes, extraData]
          .filter((v): v is string => Boolean(v && v.trim()))
          .join("\n\n") || null;
        const emp = await tx.employee.create({
          data: { ...employeeData, notes: mergedNotes },
        });
        if (salaryAmount != null && salaryAmount > 0) {
          // Якщо в Excel була ставка погодинна — переводимо в місячну з
          // грубим коефіцієнтом 168 год/міс (інакше нова модель не приймає).
          const monthly = salaryType === "HOURLY" ? salaryAmount * 168 : salaryAmount;
          await tx.employeeSalary.create({
            data: {
              employeeId: emp.id,
              baseSalary: monthly,
              coefficient: 0,
              currency: currency || "UAH",
              effectiveFrom: emp.hiredAt ?? emp.createdAt,
            },
          });
          await syncEmployeeSalaryCache(emp.id, tx);
        }
        created++;
      }
    });

    return NextResponse.json({
      created,
      skipped,
      totalRows: parsed.totalRows,
      errors: parsed.errors,
      usedAi,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Помилка імпорту";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
