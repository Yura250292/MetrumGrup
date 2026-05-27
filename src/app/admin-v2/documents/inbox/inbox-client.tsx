"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UploadCloud, AlertCircle, Inbox, Mail } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useDrillDown } from "@/components/drawer/use-drill-down";
import { DocumentConfidenceBadge } from "@/components/document-confidence-badge";
import { EmptyState } from "@/components/shared/states/EmptyState";
import {
  DocumentListItem,
  DocumentListResponse,
  STATUS_LABELS,
  TYPE_LABELS,
  SOURCE_LABELS,
} from "../_components/types";
import type { IncomingDocumentStatus } from "@prisma/client";

const STATUS_TABS: Array<{ value: IncomingDocumentStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Усі" },
  { value: "PROCESSING", label: "Обробка" },
  { value: "PARSED", label: "Перевірити" },
  { value: "REVIEWED", label: "Перевірено" },
  { value: "LINKED", label: "Привʼязано" },
  { value: "FAILED", label: "Помилки" },
  { value: "ARCHIVED", label: "Архів" },
];

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif";

export function InboxClient() {
  const [activeTab, setActiveTab] = useState<IncomingDocumentStatus | "ALL">("ALL");
  const [items, setItems] = useState<DocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawer = useDrillDown();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/admin/documents", window.location.origin);
      if (activeTab !== "ALL") url.searchParams.set("status", activeTab);
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error("Не вдалось завантажити список");
      const data = (await r.json()) as DocumentListResponse;
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Опитування PROCESSING — щоб бачити перехід у PARSED без перезавантаження.
  useEffect(() => {
    const hasProcessing = items.some((i) => i.status === "PROCESSING");
    if (!hasProcessing) return;
    const t = setInterval(fetchList, 3000);
    return () => clearInterval(t);
  }, [items, fetchList]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "INVOICE");
        const r = await fetch("/api/admin/documents/upload", {
          method: "POST",
          body: fd,
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          setUploadError(err.error ?? `Помилка завантаження ${file.name}`);
        }
      }
      await fetchList();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold" style={{ color: T.textPrimary }}>
          Документи / Inbox
        </h1>
        <p className="text-sm" style={{ color: T.textSecondary }}>
          AI обробляє вхідні рахунки, договори, акти. Поточний MVP: повна підтримка INVOICE.
        </p>
      </header>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className="rounded-2xl border-2 border-dashed p-6 transition-colors"
        style={{
          borderColor: dragActive ? T.accentPrimary : T.borderSoft,
          backgroundColor: dragActive ? T.accentPrimarySoft : T.panelSoft,
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <UploadCloud size={32} style={{ color: T.accentPrimary }} />
          <div>
            <p className="font-semibold" style={{ color: T.textPrimary }}>
              Перетягни PDF / фото або натисни щоб обрати
            </p>
            <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
              Підтримуються PDF та зображення до 25 MB. AI визначить поля автоматично.
            </p>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            style={{
              background: T.accentPrimary,
              color: "white",
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
            {uploading ? "Завантаження…" : "Обрати файли"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {uploadError ? (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: T.dangerSoft, color: T.danger }}
          >
            <AlertCircle size={14} />
            <span>{uploadError}</span>
          </div>
        ) : null}
      </div>

      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
        style={{
          borderColor: T.borderSoft,
          backgroundColor: T.panel,
          color: T.textSecondary,
        }}
      >
        <Mail size={14} />
        <span>
          Email inbox (docs@metrum.ua) — у наступній фазі. Поки що використовуй ручний upload.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: activeTab === tab.value ? T.accentPrimary : T.panel,
              color: activeTab === tab.value ? "white" : T.textSecondary,
              border: `1px solid ${activeTab === tab.value ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl border"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12" style={{ color: T.textMuted }}>
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Inbox size={22} />}
              title={
                activeTab === "ALL"
                  ? "Інбокс порожній"
                  : "У цій категорії документів немає"
              }
              description="Завантажте PDF чи фото — AI визначить поля і запропонує привʼязати документ до фінансового запису."
              action={{
                label: "Завантажити документ",
                onClick: () => fileInputRef.current?.click(),
              }}
              secondaryAction={
                activeTab !== "ALL"
                  ? { label: "Показати всі", onClick: () => setActiveTab("ALL") }
                  : undefined
              }
            />
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: T.borderSoft }}>
            {items.map((doc) => (
              <li
                key={doc.id}
                className="cursor-pointer p-4 transition-colors hover:bg-black/[0.02]"
                onClick={() =>
                  drawer.open({ type: "incomingDocument", id: doc.id })
                }
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {doc.originalFileName}
                    </p>
                    <div
                      className="mt-1 flex flex-wrap items-center gap-2 text-xs"
                      style={{ color: T.textMuted }}
                    >
                      <span>{TYPE_LABELS[doc.type]}</span>
                      <span>·</span>
                      <span>{SOURCE_LABELS[doc.source]}</span>
                      <span>·</span>
                      <span>{new Date(doc.uploadedAt).toLocaleString("uk-UA")}</span>
                      <span>·</span>
                      <span>{Math.round(doc.fileSizeBytes / 1024)} KB</span>
                    </div>
                    {doc.errorMessage ? (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: T.danger }}
                      >
                        {doc.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <DocumentConfidenceBadge value={doc.confidence == null ? null : Number(doc.confidence)} />
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={statusBadgeStyle(doc.status)}
                    >
                      {STATUS_LABELS[doc.status]}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs" style={{ color: T.textMuted }}>
        Всього: {total}
      </p>
    </div>
  );
}

function statusBadgeStyle(status: IncomingDocumentStatus): React.CSSProperties {
  switch (status) {
    case "PROCESSING":
      return { background: T.indigoSoft, color: T.indigo };
    case "PARSED":
      return { background: T.amberSoft, color: T.amber };
    case "REVIEWED":
      return { background: T.skySoft, color: T.sky };
    case "LINKED":
      return { background: T.successSoft, color: T.success };
    case "FAILED":
      return { background: T.dangerSoft, color: T.danger };
    case "ARCHIVED":
    default:
      return { background: T.panelSoft, color: T.textMuted };
  }
}
