"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import type { RendererProps } from "../types";
import {
  FORM_CATEGORY_LABELS,
  FORM_SUBMISSION_STATUS_LABELS,
} from "@/lib/constants";
import type { FormCategory, FormSubmissionStatus } from "@prisma/client";
import type { FormSchema } from "@/lib/forms/schema";

type Detail = {
  id: string;
  status: FormSubmissionStatus;
  templateVersion: number;
  template: { id: string; name: string; category: FormCategory };
  project: { id: string; title: string } | null;
  task: { id: string; title: string } | null;
  submittedBy: { id: string; name: string };
  submittedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  data: Record<string, unknown>;
  revisionSchema: FormSchema | null;
};

export function FormSubmissionDrawerContent({ id }: RendererProps) {
  const isMobile = useIsMobile();
  const drawer = useDrillDown();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/form-submissions/${id}`);
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setData(j.data ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (data?.template?.name) drawer.setTopBreadcrumb(data.template.name);
  }, [data?.template?.name, drawer]);

  async function act(action: "approve" | "reject") {
    if (!data) return;
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt("Вкажіть причину відхилення:") ?? null;
      if (!note) return;
    }
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/form-submissions/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { reviewNote: note } : {}),
      });
      if (res.ok) {
        const j = await res.json();
        setData((prev) =>
          prev
            ? {
                ...prev,
                status: j.data.status,
                reviewedAt: j.data.reviewedAt,
                reviewNote: j.data.reviewNote,
              }
            : prev,
        );
      }
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading ? (
          <div className="flex items-center justify-center py-12" style={{ color: T.textMuted }}>
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : !data ? (
          <p className="text-sm" style={{ color: T.textMuted }}>
            Не вдалось завантажити форму.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold" style={{ color: T.textPrimary }}>
                {data.template.name}
              </h2>
              <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
                <span>{FORM_CATEGORY_LABELS[data.template.category]}</span>
                <span>·</span>
                <span>v{data.templateVersion}</span>
                <span>·</span>
                <StatusBadge status={data.status} />
              </div>
            </div>
            {data.project && (
              <Link
                label="Проєкт"
                value={data.project.title}
                onClick={() => drawer.open({ type: "project", id: data.project!.id })}
              />
            )}
            {data.task && (
              <Link
                label="Задача"
                value={data.task.title}
                onClick={() => drawer.open({ type: "task", id: data.task!.id })}
              />
            )}
            <Link
              label="Виконроб"
              value={data.submittedBy.name}
              onClick={() => drawer.open({ type: "user", id: data.submittedBy.id })}
            />
            <Meta label="Подано" value={formatDate(data.submittedAt)} />
            <Meta label="Розглянуто" value={formatDate(data.reviewedAt)} />
            {data.reviewNote && (
              <div className="rounded-md border p-2 text-[12px]" style={{ borderColor: T.borderSoft, color: T.textSecondary }}>
                <div className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: T.textMuted }}>
                  Коментар рев'ю
                </div>
                {data.reviewNote}
              </div>
            )}

            {data.revisionSchema ? (
              <div className="mt-2">
                <h3 className="mb-2 text-[11px] uppercase tracking-wide" style={{ color: T.textMuted }}>
                  Дані форми
                </h3>
                <div className="space-y-2 text-[12px]" style={{ color: T.textPrimary }}>
                  {data.revisionSchema.fields.map((f) => {
                    if (f.type === "section") {
                      return (
                        <div key={f.key} className="mt-2 border-b pb-1 text-[12px] font-semibold" style={{ borderColor: T.borderSoft }}>
                          {f.label}
                        </div>
                      );
                    }
                    const v = data.data[f.key];
                    return (
                      <div key={f.key}>
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: T.textMuted }}>
                          {f.label}
                        </div>
                        <div>{renderValue(v)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                Schema-snapshot версії {data.templateVersion} недоступний.
              </p>
            )}

            {data.status === "SUBMITTED" && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => act("approve")}
                  disabled={actionBusy}
                  className="flex-1 rounded-md px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: T.success }}
                >
                  Затвердити
                </button>
                <button
                  onClick={() => act("reject")}
                  disabled={actionBusy}
                  className="flex-1 rounded-md px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: T.danger }}
                >
                  Відхилити
                </button>
              </div>
            )}
          </div>
        )}
      </DrawerBody>
    </DrawerLayout>
  );
}

function StatusBadge({ status }: { status: FormSubmissionStatus }) {
  const color =
    status === "APPROVED"
      ? T.success
      : status === "REJECTED"
        ? T.danger
        : status === "SUBMITTED"
          ? T.accentPrimary
          : T.textMuted;
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {FORM_SUBMISSION_STATUS_LABELS[status]}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="uppercase font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span style={{ color: T.textPrimary }}>{value}</span>
    </div>
  );
}

function Link({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="uppercase font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <button onClick={onClick} className="underline-offset-2 hover:underline" style={{ color: T.accentPrimary }}>
        {value}
      </button>
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Так" : "Ні";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.map(String).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.lat === "number" && typeof o.lng === "number") {
      return `${(o.lat as number).toFixed(5)}, ${(o.lng as number).toFixed(5)}`;
    }
    return JSON.stringify(v);
  }
  if (typeof v === "string" && v.startsWith("data:image/")) return "(зображення)";
  return String(v);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}

export default FormSubmissionDrawerContent;
