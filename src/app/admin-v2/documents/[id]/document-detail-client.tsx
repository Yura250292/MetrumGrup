"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText, RefreshCw, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DocumentConfidenceBadge } from "@/components/document-confidence-badge";
import {
  DocumentDetail,
  DocumentDetailResponse,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../_components/types";
import { DocumentLinkCascade } from "../_components/document-link-cascade";

export function DocumentDetailClient({
  documentId,
  canLink,
  variant = "page",
}: {
  documentId: string;
  canLink: boolean;
  variant?: "page" | "drawer";
}) {
  const [data, setData] = useState<DocumentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/documents/${documentId}`);
      if (!r.ok) return;
      const json = (await r.json()) as DocumentDetailResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [documentId]);

  useEffect(() => {
    if (!data || data.document.status !== "PROCESSING") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: T.textMuted }}>
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const doc = data.document;
  const isImage = doc.mimeType.startsWith("image/");
  const extracted = (doc.extractedData ?? {}) as Record<string, unknown>;

  async function markReviewed() {
    setReviewing(true);
    try {
      await fetch(`/api/admin/documents/${documentId}/review`, { method: "POST" });
      await load();
    } finally {
      setReviewing(false);
    }
  }

  async function reprocess() {
    setReprocessing(true);
    try {
      await fetch(`/api/admin/documents/${documentId}/reprocess`, { method: "POST" });
      await load();
    } finally {
      setReprocessing(false);
    }
  }

  return (
    <div className={variant === "drawer" ? "flex h-full flex-col" : "grid h-full grid-cols-1 md:grid-cols-2"}>
      {variant === "page" ? (
        <div
          className="flex h-full items-center justify-center overflow-hidden border-r"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelSoft }}
        >
          {data.signedUrl ? (
            isImage ? (
              <img
                src={data.signedUrl}
                alt={doc.originalFileName}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <iframe
                src={data.signedUrl}
                title={doc.originalFileName}
                className="h-full w-full"
              />
            )
          ) : (
            <div className="flex items-center gap-2" style={{ color: T.textMuted }}>
              <FileText size={20} />
              <span>Файл недоступний</span>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex h-full flex-col overflow-y-auto">
        <div
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b p-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold" style={{ color: T.textPrimary }}>
              {doc.originalFileName}
            </h2>
            <p className="text-xs" style={{ color: T.textMuted }}>
              {TYPE_LABELS[doc.type]} · {STATUS_LABELS[doc.status]}
            </p>
          </div>
          <DocumentConfidenceBadge value={doc.confidence == null ? null : Number(doc.confidence)} />
        </div>

        {variant === "drawer" && data.signedUrl ? (
          <a
            href={data.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-4 mt-3 inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: T.accentPrimary }}
          >
            Відкрити файл у новій вкладці →
          </a>
        ) : null}

        {doc.errorMessage ? (
          <div
            className="m-4 rounded-lg p-3 text-xs"
            style={{ background: T.dangerSoft, color: T.danger }}
          >
            {doc.errorMessage}
          </div>
        ) : null}

        <section className="flex flex-col gap-3 p-4">
          <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Розпізнані дані
          </h3>
          <Field label="Контрагент" value={asString(extracted, "counterparty.name")} />
          <Field label="ЄДРПОУ" value={asString(extracted, "counterparty.edrpou")} />
          <Field label="IBAN" value={asString(extracted, "counterparty.iban")} />
          <Field label="Номер документа" value={asString(extracted, "documentNumber")} />
          <Field label="Дата" value={asString(extracted, "documentDate")} />
          <Field label="Сума" value={formatAmount(extracted, "amountTotal", "currency")} />
          <Field label="ПДВ" value={formatAmount(extracted, "amountVat", "currency")} />
          <Field
            label="Auto-link Counterparty"
            value={asString(extracted, "autoLink.counterpartyName")}
          />
          <Field
            label="Auto-link Project"
            value={asString(extracted, "autoLink.projectTitle")}
          />
        </section>

        <section className="flex flex-wrap items-center gap-2 p-4">
          {doc.status === "PARSED" ? (
            <button
              type="button"
              onClick={markReviewed}
              disabled={reviewing}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: T.accentPrimary, color: "white", opacity: reviewing ? 0.7 : 1 }}
            >
              {reviewing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              Підтвердити (REVIEWED)
            </button>
          ) : null}
          {doc.status !== "LINKED" && doc.status !== "ARCHIVED" ? (
            <button
              type="button"
              onClick={reprocess}
              disabled={reprocessing}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{
                background: T.panelSoft,
                color: T.textSecondary,
                border: `1px solid ${T.borderSoft}`,
                opacity: reprocessing ? 0.7 : 1,
              }}
            >
              <RefreshCw size={14} className={reprocessing ? "animate-spin" : ""} />
              Reprocess
            </button>
          ) : null}
        </section>

        {canLink && (doc.status === "PARSED" || doc.status === "REVIEWED") ? (
          <DocumentLinkCascade
            documentId={documentId}
            extractedData={extracted}
            onLinked={load}
          />
        ) : null}

        <section className="p-4">
          <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            AI історія
          </h3>
          {doc.extractionLogs.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: T.textMuted }}>
              Поки що немає записів.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-xs" style={{ color: T.textSecondary }}>
              {doc.extractionLogs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-2">
                  <span style={{ color: log.success ? T.success : T.danger }}>
                    {log.success ? "✓" : "✗"}
                  </span>
                  <span>{log.model}</span>
                  <span>·</span>
                  <span>{log.durationMs} ms</span>
                  <span>·</span>
                  <span>{new Date(log.createdAt).toLocaleString("uk-UA")}</span>
                  {log.errorMessage ? <span style={{ color: T.danger }}> — {log.errorMessage}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span
        className="uppercase font-semibold tracking-wide text-[11px]"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <span className="col-span-2" style={{ color: value ? T.textPrimary : T.textMuted }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function asString(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[p];
  }
  if (current == null) return null;
  return String(current);
}

function formatAmount(
  obj: Record<string, unknown>,
  amountPath: string,
  currencyPath: string,
): string | null {
  const amount = asString(obj, amountPath);
  if (!amount) return null;
  const currency = asString(obj, currencyPath) ?? "UAH";
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return `${n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
