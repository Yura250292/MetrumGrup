"use client";

import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ExpiryIndicator } from "./expiry-indicator";

type DocType =
  | "LICENSE"
  | "PERMIT"
  | "CERTIFICATE"
  | "INSURANCE"
  | "CONTRACT"
  | "STATUTE"
  | "REGISTRATION"
  | "OTHER";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  LICENSE: "Ліцензія",
  PERMIT: "Дозвіл",
  CERTIFICATE: "Сертифікат",
  INSURANCE: "Страховка",
  CONTRACT: "Договір",
  STATUTE: "Статут",
  REGISTRATION: "Витяг з реєстру",
  OTHER: "Інше",
};

interface DocumentRecord {
  id: string;
  type: DocType;
  title: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  issuedAt: string | null;
  validUntil: string | null;
  uploadedAt: string;
  uploadedBy: { id: string; name: string };
}

export function SrmDocumentsTab({
  counterpartyId,
  canWrite,
}: {
  counterpartyId: string;
  canWrite: boolean;
}) {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/documents`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const j = await res.json();
        setDocs(j.documents ?? []);
      } else {
        setDocs([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterpartyId]);

  async function softDelete(docId: string) {
    if (!confirm("Видалити документ? Файл залишиться в R2, але буде прихований.")) {
      return;
    }
    const res = await fetch(
      `/api/admin/financing/counterparties/${counterpartyId}/documents/${docId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      void loadDocs();
    }
  }

  if (loading && !docs) {
    return (
      <div className="flex items-center gap-2 p-4 text-[13px]" style={{ color: T.textMuted }}>
        <Loader2 size={14} className="animate-spin" /> Завантаження документів…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <DocumentUploader
          counterpartyId={counterpartyId}
          onUploaded={loadDocs}
          uploading={uploading}
          setUploading={setUploading}
          setError={setError}
        />
      )}

      {error && (
        <div className="text-[12px]" style={{ color: T.danger }}>
          {error}
        </div>
      )}

      {(docs?.length ?? 0) === 0 ? (
        <div
          className="rounded-2xl p-6 text-center text-[13px]"
          style={{
            backgroundColor: T.panel,
            border: `1px dashed ${T.borderStrong}`,
            color: T.textMuted,
          }}
        >
          Документи відсутні. {canWrite && "Завантажте ліцензії, страховку та статутні документи."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {docs?.map((d) => (
            <DocumentRow key={d.id} doc={d} canWrite={canWrite} onDelete={() => softDelete(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  canWrite,
  onDelete,
}: {
  doc: DocumentRecord;
  canWrite: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl p-3"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
      >
        <FileText size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-semibold hover:underline"
            style={{ color: T.textPrimary }}
          >
            {doc.title}
            <ExternalLink size={11} style={{ color: T.textMuted }} />
          </a>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] uppercase"
            style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
          >
            {DOC_TYPE_LABELS[doc.type]}
          </span>
          <ExpiryIndicator validUntil={doc.validUntil} />
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: T.textMuted }}>
          {doc.uploadedBy.name} ·{" "}
          {format(new Date(doc.uploadedAt), "d MMM yyyy", { locale: uk })}
          {doc.validUntil &&
            ` · до ${format(new Date(doc.validUntil), "dd.MM.yyyy")}`}
        </div>
      </div>
      {canWrite && (
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5"
          style={{ color: T.danger, backgroundColor: T.dangerSoft }}
          title="Деактивувати"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function DocumentUploader({
  counterpartyId,
  onUploaded,
  uploading,
  setUploading,
  setError,
}: {
  counterpartyId: string;
  onUploaded: () => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [type, setType] = useState<DocType>("LICENSE");
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState("");

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      // 1. Presign.
      const presignRes = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "presign",
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
          }),
        },
      );
      if (!presignRes.ok) {
        const j = await presignRes.json().catch(() => ({}));
        setError(j.error ?? "Не вдалося отримати URL для завантаження");
        return;
      }
      const { uploadUrl, publicUrl } = await presignRes.json();

      // 2. Direct upload в R2.
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        setError("Помилка завантаження у сховище");
        return;
      }

      // 3. Record metadata.
      const recordRes = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "record",
            type,
            title: title.trim() || file.name,
            fileUrl: publicUrl,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            validUntil: validUntil
              ? new Date(validUntil + "T00:00:00Z").toISOString()
              : null,
          }),
        },
      );
      if (!recordRes.ok) {
        const j = await recordRes.json().catch(() => ({}));
        setError(j.error ?? "Не вдалося зберегти метадані");
        return;
      }
      setTitle("");
      setValidUntil("");
      onUploaded();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className="rounded-2xl p-3"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DocType)}
          className="rounded-lg px-2 py-1.5 text-[12px]"
          style={{
            backgroundColor: T.panelSoft,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Назва (опц.)"
          className="rounded-lg px-2 py-1.5 text-[12px]"
          style={{
            backgroundColor: T.panelSoft,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
        />
        <input
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          className="rounded-lg px-2 py-1.5 text-[12px]"
          style={{
            backgroundColor: T.panelSoft,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
        />
        <label
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: "white" }}
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          Завантажити
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
        </label>
      </div>
    </div>
  );
}
