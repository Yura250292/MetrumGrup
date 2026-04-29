import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportsView } from "./_components/reports-view";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  firmWhereForProject,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!activeRole || !ALLOWED.includes(activeRole)) redirect("/admin-v2");

  const [projects, counterparties, employees] = await Promise.all([
    prisma.project.findMany({
      where: {
        slug: { not: { startsWith: "temp-" } },
        ...firmWhereForProject(firmId),
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.counterparty.findMany({
      where: { isActive: true, ...(firmId ? { firmId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <ReportsView
      projects={projects}
      counterparties={counterparties}
      employees={employees}
    />
  );
}
