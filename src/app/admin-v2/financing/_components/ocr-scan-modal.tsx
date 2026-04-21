"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Save,
  Upload,
  Sparkles,
  FileText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { financeCategoriesForType } from "@/lib/constants";
import type { ProjectOption } from "./types";

type FolderTreeOption = { id: string; name: string; depth: number; isSystem?: boolean };

export function OcrScanModal({
  projects,
  scope,
  folderContext,
  onClose,
  onCreated,
}: {
  projects: ProjectOption[];
  scope?: { id: string; title: string };
  folderContext?: { id: string; name: string } | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [category, setCategory] = useState("MATERIALS");
  const [projectId, setProjectId] = useState<string>(scope?.id ?? "");
  const [folderId, setFolderId] = useState<string>(folderContext?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [submitStatus, setSubmitStatus] = useState<"DRAFT" | "PENDING">("PENDING");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [folderTree, setFolderTree] = useState<FolderTreeOption[]>([]);

  const availableCategories = useMemo(
    () => financeCategoriesForType(entryType),
    [entryType],
  );

  useEffect(() => {
    if (category && !availableCategories.some((c) => c.key === category)) {
      setCategory(availableCategories[0]?.key ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCategories]);

  useEffect(() => {
    if (scope) return;
    fetch("/api/admin/folders/tree?domain=FINANCE")
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then(({ folders }) => {
        const result: FolderTreeOption[] = [];
        const walk = (parentId: string | null, depth: number) => {
          for (const f of folders.filter((x: { parentId: string | null }) => x.parentId === parentId)) {
            result.push({ id: f.id, name: f.name, depth, isSystem: f.isSystem });
            walk(f.id, depth + 1);
          }
        };
        walk(null, 0);
        setFolderTree(result);
      })
      .catch(() => {});
  }, [scope]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  async function handleScan(scanFile: File) {
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", scanFile);
      const res = await fetch("/api/admin/financing/ocr", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setOcrText(data.ocrText || "");
      if (data.amount) setAmount(String(data.amount));
      if (data.counterparty) {
        setCounterparty(data.counterparty);
        if (!title) setTitle(data.counterparty.slice(0, 60));
      }
      if (data.dateRaw) {
        const parsed = parseDate(data.dateRaw);
        if (parsed) setOccurredAt(parsed);
      }
    } catch (err: any) {
      setError(err?.message ?? "AI розпізнавання не вдалося");
    } finally {
      setScanning(false);
    }
  }

  function handleFileSelect(f: File) {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(f.type)) {
      setError("Підтримуються JPG, PNG, WebP або PDF");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("Файл завеликий (макс 20 МБ)");
      return;
    }
    setError(null);
    setFile(f);
    handleScan(f);
  }

  async function handleSave() {
    setError(null);

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Сума має бути більшою за 0");
      return;
    }
    if (!title.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    if (!scope && !projectId && !folderId) {
      setError("Виберіть проєкт або папку");
      return;
    }

    setSaving(true);
    try {
      // Create entry
      const payload = {
        type: entryType,
        kind: "FACT",
        amount: amountNum,
        occurredAt: new Date(occurredAt).toISOString(),
        projectId: scope ? scope.id : projectId || null,
        folderId: folderId || null,
        category,
        title: title.trim(),
        description: ocrText || null,
        counterparty: counterparty.trim() || null,
        currency: "UAH",
        status: submitStatus,
      };
      const createRes = await fetch("/api/admin/financing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        throw new Error(j.error || "Помилка створення запису");
      }
      const { data: entry } = await createRes.json();

      // Upload file as attachment
      if (file && entry?.id) {
        const presignRes = await fetch(
          `/api/admin/financing/${entry.id}/attachments/presigned-url`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: [{ name: file.name, type: file.type, size: file.size }],
            }),
          }
        );
        if (presignRes.ok) {
          const { presignedUrls } = await presignRes.json();
          const pu = presignedUrls[0];
          await fetch(pu.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": pu.contentType },
            body: file,
          });
          await fetch(`/api/admin/financing/${entry.id}/attachments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: [
                {
                  r2Key: pu.key,
                  originalName: file.name,
                  mimeType: file.type || "application/octet-stream",
                  size: file.size,
                },
              ],
            }),
          });
        }
      }

      // Set status separately if PENDING (POST creates with DRAFT by default)
      if (submitStatus === "PENDING" && entry?.id) {
        await fetch(`/api/admin/financing/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PENDING" }),
        });
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: T.accentPrimary }} />
            <div>
              <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Scan чек з AI розпізнаванням
              </h3>
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                Завантаж фото або PDF — система розпізнає автоматично
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрити">
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          {/* Upload area */}
          {!file && (
            <label
              className="flex flex-col items-center justify-center gap-2 rounded-2xl px-6 py-12 cursor-pointer transition hover:brightness-105"
              style={{
                backgroundColor: T.panelSoft,
                border: `2px dashed ${T.borderStrong}`,
                color: T.textSecondary,
              }}
            >
              <Upload size={32} style={{ color: T.accentPrimary }} />
              <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
                Перетягніть або клікніть для завантаження
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                JPG, PNG, WebP або PDF · макс 20 МБ
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </label>
          )}

          {/* Preview + scan status */}
          {file && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-auto object-contain max-h-80"
                  />
                ) : (
                  <div className="flex items-center gap-2 p-4" style={{ color: T.textSecondary }}>
                    <FileText size={18} />
                    <span className="text-[13px] truncate">{file.name}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {scanning ? (
                  <div
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold"
                    style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                  >
                    <Loader2 size={14} className="animate-spin" />
                    AI розпізнає вміст…
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleScan(file)}
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold self-start"
                    style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}`, color: T.textPrimary }}
                  >
                    <RefreshCw size={13} />
                    Розпізнати ще раз
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setOcrText("");
                    setAmount("");
                    setCounterparty("");
                    setTitle("");
                  }}
                  className="text-[11px] font-medium self-start"
                  style={{ color: T.textMuted }}
                >
                  ← Замінити файл
                </button>
              </div>
            </div>
          )}

          {/* OCR result (editable) */}
          {ocrText && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                РОЗПІЗНАНИЙ ТЕКСТ
              </span>
              <textarea
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                rows={8}
                className="w-full rounded-xl px-3.5 py-3 text-[12px] font-mono outline-none resize-y"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                  minHeight: 160,
                }}
              />
            </div>
          )}

          {/* Type toggle — EXPENSE / INCOME */}
          {(file || ocrText) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ТИП ЗАПИСУ *
              </span>
              <div
                className="grid grid-cols-2 gap-1 rounded-xl p-1"
                style={{ backgroundColor: T.panelSoft }}
              >
                <button
                  type="button"
                  onClick={() => setEntryType("EXPENSE")}
                  className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition"
                  style={{
                    backgroundColor: entryType === "EXPENSE" ? T.success : "transparent",
                    color: entryType === "EXPENSE" ? "#fff" : T.textSecondary,
                  }}
                >
                  <TrendingDown size={13} />
                  Факт Витрата
                </button>
                <button
                  type="button"
                  onClick={() => setEntryType("INCOME")}
                  className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition"
                  style={{
                    backgroundColor: entryType === "INCOME" ? T.success : "transparent",
                    color: entryType === "INCOME" ? "#fff" : T.textSecondary,
                  }}
                >
                  <TrendingUp size={13} />
                  Факт Дохід
                </button>
              </div>
            </div>
          )}

          {/* Extracted fields (editable) */}
          {(file || ocrText) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Сума (грн) *">
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>

              <Field label="Дата *">
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>

              <Field label="Назва витрати *">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Напр.: Клей для плитки"
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>

              <Field label="Постачальник">
                <input
                  type="text"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>

              <Field label="Категорія *">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                >
                  {availableCategories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              {!scope && (
                <Field label="Папка / Проєкт *">
                  {folderContext ? (
                    <div
                      className="rounded-xl px-3.5 py-3 text-sm"
                      style={{
                        backgroundColor: T.accentPrimarySoft,
                        border: `1px solid ${T.accentPrimary}40`,
                        color: T.accentPrimary,
                      }}
                    >
                      📁 {folderContext.name}
                    </div>
                  ) : (
                    <select
                      value={folderId || projectId || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith("folder:")) {
                          setFolderId(v.replace("folder:", ""));
                          setProjectId("");
                        } else if (v.startsWith("project:")) {
                          setProjectId(v.replace("project:", ""));
                          setFolderId("");
                        } else {
                          setFolderId("");
                          setProjectId("");
                        }
                      }}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelSoft,
                        border: `1px solid ${T.borderStrong}`,
                        color: T.textPrimary,
                      }}
                    >
                      <option value="">— Оберіть —</option>
                      {folderTree.filter((f) => f.isSystem).length > 0 && (
                        <optgroup label="Блоки">
                          {folderTree
                            .filter((f) => f.isSystem)
                            .map((f) => (
                              <option key={f.id} value={`folder:${f.id}`}>
                                🏢 {"— ".repeat(f.depth) + f.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {folderTree.filter((f) => !f.isSystem).length > 0 && (
                        <optgroup label="Папки (проєкти)">
                          {folderTree
                            .filter((f) => !f.isSystem)
                            .map((f) => (
                              <option key={f.id} value={`folder:${f.id}`}>
                                📁 {"— ".repeat(f.depth) + f.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {projects.length > 0 && (
                        <optgroup label="Проєкти (окремо)">
                          {projects.map((p) => (
                            <option key={p.id} value={`project:${p.id}`}>
                              {p.title}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                </Field>
              )}
            </div>
          )}

          {error && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          {(file || ocrText) && (
            <div
              className="flex items-center justify-between gap-2 border-t pt-4"
              style={{ borderColor: T.borderSoft }}
            >
              <label className="flex items-center gap-2 text-[12px]" style={{ color: T.textSecondary }}>
                <input
                  type="checkbox"
                  checked={submitStatus === "PENDING"}
                  onChange={(e) => setSubmitStatus(e.target.checked ? "PENDING" : "DRAFT")}
                />
                Одразу надіслати на погодження
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium"
                  style={{ color: T.textSecondary }}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || scanning}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Зберегти
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function parseDate(raw: string): string | null {
  // "20.04.2026" or "20/04/2026" or "20-04-2026"
  const m = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = "20" + year;
  return `${year}-${month}-${day}`;
}
