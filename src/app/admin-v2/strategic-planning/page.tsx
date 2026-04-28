import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import type {
  EmployeeDTO,
  InitialData,
  ProjectDTO,
  TemplateDTO,
} from "@/lib/strategic-planning/types";
import { Calculator } from "./_components/calculator";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);

export default async function StrategicPlanningPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.has(session.user.role)) redirect("/admin-v2");

  const { firmId } = await resolveFirmScopeForRequest(session);

  // Проекти поточної фірми (DRAFT і ACTIVE — на стадії планування / в роботі).
  const projectsRaw = await prisma.project.findMany({
    where: {
      ...(firmId ? { firmId } : {}),
      status: { in: ["DRAFT", "ACTIVE"] },
      isTestProject: false,
    },
    select: {
      id: true,
      title: true,
      totalBudget: true,
      totalPaid: true,
      startDate: true,
      expectedEndDate: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Співробітники поточної фірми. Employee не має firmId напряму — фільтруємо
  // через user.firmId. Якщо userId=null (зовнішні) — показуємо всім.
  const employeesRaw = await prisma.employee.findMany({
    where: {
      isActive: true,
      salaryAmount: { not: null },
      OR: firmId
        ? [{ userId: null }, { user: { firmId } }]
        : undefined,
    },
    select: {
      id: true,
      fullName: true,
      position: true,
      salaryType: true,
      salaryAmount: true,
      burdenMultiplier: true,
    },
    orderBy: { fullName: "asc" },
  });

  // Шаблони постійних витрат. Folder не має firmId — показуємо всі активні.
  const templatesRaw = await prisma.financeExpenseTemplate.findMany({
    where: { isActive: true, type: "EXPENSE" },
    select: {
      id: true,
      name: true,
      defaultAmount: true,
      category: true,
      emoji: true,
      folder: { select: { name: true } },
    },
    orderBy: [{ folderId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const projects: ProjectDTO[] = projectsRaw.map((p) => ({
    id: p.id,
    title: p.title,
    totalBudget: Number(p.totalBudget),
    totalPaid: Number(p.totalPaid),
    startDate: p.startDate ? p.startDate.toISOString() : null,
    expectedEndDate: p.expectedEndDate ? p.expectedEndDate.toISOString() : null,
  }));

  const employees: EmployeeDTO[] = employeesRaw.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    position: e.position,
    salaryType: e.salaryType,
    salaryAmount: e.salaryAmount ? Number(e.salaryAmount) : 0,
    burdenMultiplier:
      e.burdenMultiplier !== null && e.burdenMultiplier !== undefined
        ? Number(e.burdenMultiplier)
        : null,
  }));

  const templates: TemplateDTO[] = templatesRaw.map((t) => ({
    id: t.id,
    name: t.name,
    defaultAmount: Number(t.defaultAmount),
    category: t.category,
    emoji: t.emoji,
    folderName: t.folder?.name ?? "Інше",
  }));

  const initialData: InitialData = { projects, employees, templates };

  return <Calculator initialData={initialData} />;
}
