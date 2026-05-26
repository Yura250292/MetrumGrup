import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { FormTemplatesListClient } from "./_list-client";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["SUPER_ADMIN", "MANAGER", "HR"]);

export default async function FormTemplatesListPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?callbackUrl=/admin-v2/catalogs/form-templates");
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !ALLOWED.has(role)) redirect("/admin-v2");

  const templates = await prisma.formTemplate.findMany({
    where: { firmId: firmId ?? undefined },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { submissions: true, revisions: true } },
    },
  });

  return (
    <FormTemplatesListClient
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        version: t.version,
        isActive: t.isActive,
        firmId: t.firmId,
        createdBy: t.createdBy,
        submissionCount: t._count.submissions,
        revisionCount: t._count.revisions,
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
