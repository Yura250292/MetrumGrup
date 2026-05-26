import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../_components/foreman-shell";
import { FORM_CATEGORY_LABELS } from "@/lib/constants";
import type { FormCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ForemanFormsListPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?callbackUrl=/foreman/forms");
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (role !== "FOREMAN") redirect("/foreman");

  const templates = await prisma.formTemplate.findMany({
    where: { isActive: true, firmId: firmId ?? undefined },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      version: true,
    },
  });

  const byCategory = new Map<FormCategory, typeof templates>();
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  return (
    <ForemanShell title="Форми" backHref="/foreman" firmId={firmId}>
      <div className="space-y-6 px-4 pb-12 pt-4">
        {templates.length === 0 && (
          <div className="rounded-2xl bg-white/5 p-6 text-center text-[13px] text-white/70">
            Поки немає доступних форм. Поверніться пізніше або зверніться до менеджера.
          </div>
        )}
        {Array.from(byCategory.entries()).map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-2 text-[11px] uppercase tracking-wide text-white/50">
              {FORM_CATEGORY_LABELS[cat]}
            </h2>
            <div className="space-y-2">
              {list.map((t) => (
                <Link
                  key={t.id}
                  href={`/foreman/forms/${t.id}`}
                  className="block rounded-2xl bg-white/[0.05] p-4 transition active:bg-white/[0.08]"
                >
                  <div className="flex items-start gap-3">
                    <ClipboardList size={18} className="mt-0.5 text-white/70" />
                    <div className="flex-1">
                      <div className="text-[15px] font-medium text-white">{t.name}</div>
                      {t.description && (
                        <div className="mt-1 text-[12px] text-white/60">{t.description}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ForemanShell>
  );
}
