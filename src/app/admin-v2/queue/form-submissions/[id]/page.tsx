import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { assertCanAccessFirm, getActiveRoleFromSession } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  FORM_CATEGORY_LABELS,
  FORM_SUBMISSION_STATUS_LABELS,
} from "@/lib/constants";
import { ReviewActions } from "./_review-actions";
import type { FormSchema, SubmissionData } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["SUPER_ADMIN", "MANAGER", "HR"]);

type Params = { params: Promise<{ id: string }> };

export default async function FormSubmissionDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/auth/signin?callbackUrl=/admin-v2/queue/form-submissions/${id}`);
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !ALLOWED.has(role)) redirect("/admin-v2");

  const sub = await prisma.formSubmission.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true, category: true } },
      project: { select: { id: true, title: true } },
      task: { select: { id: true, title: true } },
      foremanReport: { select: { id: true, occurredAt: true } },
      submittedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      attachments: true,
    },
  });
  if (!sub) notFound();
  try {
    assertCanAccessFirm(session, sub.firmId);
  } catch {
    redirect("/admin-v2");
  }

  const revision = await prisma.formTemplateRevision.findUnique({
    where: {
      templateId_version: {
        templateId: sub.templateId,
        version: sub.templateVersion,
      },
    },
    select: { schema: true },
  });
  const schema = (revision?.schema ?? null) as FormSchema | null;
  const data = sub.data as unknown as SubmissionData;

  return (
    <div className="p-6">
      <Link
        href="/admin-v2/queue/form-submissions"
        className="mb-3 inline-flex items-center gap-1 text-[12px]"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={14} />
        До черги
      </Link>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: T.textPrimary }}>
            {sub.template.name}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <span>{FORM_CATEGORY_LABELS[sub.template.category]}</span>
            <span>·</span>
            <span>v{sub.templateVersion}</span>
            <span>·</span>
            <span>{FORM_SUBMISSION_STATUS_LABELS[sub.status]}</span>
          </div>
        </div>
        <Link
          href={`/api/admin/form-submissions/${id}/pdf`}
          target="_blank"
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px]"
          style={{ borderColor: T.borderSoft, color: T.textPrimary }}
        >
          <Download size={14} />
          PDF
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
          >
            <h2 className="mb-3 text-[12px] uppercase tracking-wide" style={{ color: T.textMuted }}>
              Дані форми
            </h2>
            {schema ? (
              <dl className="space-y-3 text-[13px]" style={{ color: T.textPrimary }}>
                {schema.fields.map((f) => {
                  if (f.type === "section") {
                    return (
                      <h3
                        key={f.key}
                        className="border-b pb-1 text-[13px] font-semibold"
                        style={{ borderColor: T.borderSoft }}
                      >
                        {f.label}
                      </h3>
                    );
                  }
                  const v = data[f.key];
                  return (
                    <div key={f.key} className="grid grid-cols-3 gap-3">
                      <dt className="text-[12px]" style={{ color: T.textMuted }}>
                        {f.label}
                      </dt>
                      <dd className="col-span-2">{renderValue(v)}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p style={{ color: T.textMuted }}>Snapshot версії {sub.templateVersion} недоступний.</p>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div
            className="rounded-lg border p-4 text-[12px]"
            style={{ borderColor: T.borderSoft, backgroundColor: T.panel, color: T.textPrimary }}
          >
            <Meta label="Виконавець" value={sub.submittedBy.name} />
            <Meta
              label="Подано"
              value={sub.submittedAt?.toLocaleString("uk-UA") ?? "—"}
            />
            <Meta label="Проєкт" value={sub.project?.title ?? "—"} />
            <Meta label="Задача" value={sub.task?.title ?? "—"} />
            <Meta label="Foreman report" value={sub.foremanReportId ?? "—"} />
            {sub.reviewedBy && (
              <Meta label="Розглянув" value={`${sub.reviewedBy.name} · ${sub.reviewedAt?.toLocaleString("uk-UA") ?? ""}`} />
            )}
            {sub.reviewNote && <Meta label="Коментар рев'ю" value={sub.reviewNote} />}
          </div>

          {sub.status === "SUBMITTED" && <ReviewActions submissionId={id} />}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function renderValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === "") return <span style={{ color: T.textMuted }}>—</span>;
  if (typeof v === "boolean") return v ? "Так" : "Ні";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.map(String).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.lat === "number" && typeof o.lng === "number") {
      return `${(o.lat as number).toFixed(5)}, ${(o.lng as number).toFixed(5)}`;
    }
    return <code className="text-[11px]">{JSON.stringify(v)}</code>;
  }
  if (typeof v === "string" && v.startsWith("data:image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={v} alt="" className="max-h-32 rounded-md border" style={{ borderColor: T.borderSoft }} />;
  }
  return String(v);
}
