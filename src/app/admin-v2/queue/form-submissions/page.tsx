import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  FORM_CATEGORY_LABELS,
  FORM_SUBMISSION_STATUS_LABELS,
} from "@/lib/constants";
import type { FormSubmissionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["SUPER_ADMIN", "MANAGER", "HR"]);

const STATUS_COLOR: Record<FormSubmissionStatus, string> = {
  DRAFT: T.textMuted,
  SUBMITTED: T.accentPrimary,
  APPROVED: T.success,
  REJECTED: T.danger,
};

type SearchParams = Promise<{ status?: string; templateId?: string }>;

export default async function FormSubmissionsQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?callbackUrl=/admin-v2/queue/form-submissions");
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !ALLOWED.has(role)) redirect("/admin-v2");

  const sp = await searchParams;
  const statusFilter =
    sp.status && ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].includes(sp.status)
      ? (sp.status as FormSubmissionStatus)
      : undefined;

  const submissions = await prisma.formSubmission.findMany({
    where: {
      firmId: firmId ?? undefined,
      status: statusFilter,
      templateId: sp.templateId || undefined,
    },
    orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
    take: 100,
    include: {
      template: { select: { id: true, name: true, category: true } },
      project: { select: { id: true, title: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: T.textPrimary }}>
          Заповнені форми
        </h1>
        <div className="flex gap-1">
          <FilterChip href="/admin-v2/queue/form-submissions" active={!statusFilter}>
            Усі
          </FilterChip>
          {(["SUBMITTED", "APPROVED", "REJECTED", "DRAFT"] as FormSubmissionStatus[]).map((s) => (
            <FilterChip
              key={s}
              href={`/admin-v2/queue/form-submissions?status=${s}`}
              active={statusFilter === s}
            >
              {FORM_SUBMISSION_STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
      >
        <table className="w-full text-left text-[13px]">
          <thead style={{ color: T.textMuted }}>
            <tr className="border-b" style={{ borderColor: T.borderSoft }}>
              <th className="px-4 py-2 font-medium">Форма</th>
              <th className="px-4 py-2 font-medium">Проєкт</th>
              <th className="px-4 py-2 font-medium">Виконавець</th>
              <th className="px-4 py-2 font-medium">Подано</th>
              <th className="px-4 py-2 font-medium">Статус</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center" style={{ color: T.textMuted }}>
                  Немає заповнених форм за цим фільтром.
                </td>
              </tr>
            )}
            {submissions.map((s) => (
              <tr
                key={s.id}
                className="border-b transition hover:bg-white/[0.03]"
                style={{ borderColor: T.borderSoft, color: T.textPrimary }}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin-v2/queue/form-submissions/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.template.name}
                  </Link>
                  <div className="text-[11px]" style={{ color: T.textMuted }}>
                    {FORM_CATEGORY_LABELS[s.template.category]} · v{s.templateVersion}
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: T.textMuted }}>
                  {s.project?.title ?? "—"}
                </td>
                <td className="px-4 py-3">{s.submittedBy.name}</td>
                <td className="px-4 py-3 tabular-nums" style={{ color: T.textMuted }}>
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase"
                    style={{
                      backgroundColor: `${STATUS_COLOR[s.status]}22`,
                      color: STATUS_COLOR[s.status],
                    }}
                  >
                    {FORM_SUBMISSION_STATUS_LABELS[s.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/api/admin/form-submissions/${s.id}/pdf`}
                    className="text-[12px]"
                    style={{ color: T.accentPrimary }}
                    target="_blank"
                  >
                    PDF
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1 text-[12px]"
      style={{
        backgroundColor: active ? T.accentPrimary : T.panelSoft,
        color: active ? "white" : T.textMuted,
      }}
    >
      {children}
    </Link>
  );
}
