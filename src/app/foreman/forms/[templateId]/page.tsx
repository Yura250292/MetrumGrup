import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../../_components/foreman-shell";
import { ForemanFormFillClient } from "./_components/foreman-form-fill-client";
import type { FormSchema } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ templateId: string }> };

export default async function ForemanFillFormPage({ params }: Params) {
  const { templateId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/auth/signin?callbackUrl=/foreman/forms/${templateId}`);
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (role !== "FOREMAN") redirect("/foreman");

  const tpl = await prisma.formTemplate.findFirst({
    where: { id: templateId, isActive: true, firmId: firmId ?? undefined },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      version: true,
      schema: true,
    },
  });
  if (!tpl) notFound();

  // Список проєктів виконроба для прив'язки.
  const { getForemanProjects } = await import("@/lib/auth-utils");
  const projects = await getForemanProjects(session.user.id, firmId);

  return (
    <ForemanShell title={tpl.name} backHref="/foreman/forms" firmId={firmId}>
      <ForemanFormFillClient
        template={{
          id: tpl.id,
          name: tpl.name,
          description: tpl.description,
          version: tpl.version,
          schema: tpl.schema as unknown as FormSchema,
        }}
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
      />
    </ForemanShell>
  );
}
