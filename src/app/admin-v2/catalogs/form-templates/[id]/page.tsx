import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertCanAccessFirm, getActiveRoleFromSession } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { FormBuilderClient } from "./_components/form-builder-client";
import type { FormSchema } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["SUPER_ADMIN", "MANAGER", "HR"]);

type Params = { params: Promise<{ id: string }> };

export default async function FormBuilderPage({ params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/auth/signin?callbackUrl=/admin-v2/catalogs/form-templates/${id}`);
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !ALLOWED.has(role)) redirect("/admin-v2");

  const tpl = await prisma.formTemplate.findUnique({
    where: { id },
    include: {
      revisions: {
        orderBy: { version: "desc" },
        take: 20,
        select: {
          id: true,
          version: true,
          changeNote: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
      _count: { select: { submissions: true } },
    },
  });
  if (!tpl) notFound();
  try {
    assertCanAccessFirm(session, tpl.firmId);
  } catch {
    redirect("/admin-v2");
  }

  return (
    <FormBuilderClient
      template={{
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        version: tpl.version,
        isActive: tpl.isActive,
        schema: tpl.schema as unknown as FormSchema,
        submissionCount: tpl._count.submissions,
        revisions: tpl.revisions.map((r) => ({
          id: r.id,
          version: r.version,
          changeNote: r.changeNote,
          createdAt: r.createdAt.toISOString(),
          createdBy: r.createdBy,
        })),
      }}
    />
  );
}
