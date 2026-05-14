import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PivotPageClient } from "../_components/pivot-page-client";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
  firmWhereForProject,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const dynamic = "force-dynamic";

export default async function FinancingPivotPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  // Зведена таблиця — фінансовий інструмент. Лише SUPER_ADMIN бачить цифри.
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN") redirect("/admin-v2");

  const sp = await searchParams;
  const projectId = sp.projectId;

  // Якщо переданий projectId — підвантажимо тайтл для підзаголовка.
  // findFirst (не findUnique) бо where комбінує id + firm-фільтр.
  const scope = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, ...firmWhereForProject(firmId) },
        select: { id: true, title: true },
      })
    : null;

  return <PivotPageClient scope={scope ?? undefined} />;
}
