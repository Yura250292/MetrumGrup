"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EntryFormValues } from "./entry-form-modal";
import {
  type FinanceEntryDTO,
  type FinanceSummaryDTO,
  type FinancingFilters,
  type QuadrantPreset,
  EMPTY_SUMMARY,
} from "./types";

const DEFAULT_FILTERS: FinancingFilters = {
  projectId: "",
  category: "",
  from: "",
  to: "",
  search: "",
  kind: "",
  type: "",
  subcategory: "",
  responsibleId: "",
  hasAttachments: "",
  archived: false,
};

export function useFinancingData({
  scope,
  overrideArchived,
  folderId,
}: {
  scope?: { id: string; title: string };
  overrideArchived?: boolean;
  folderId?: string | null;
}) {
  const [entries, setEntries] = useState<FinanceEntryDTO[]>([]);
  const [summary, setSummary] = useState<FinanceSummaryDTO>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FinancingFilters>(() => ({
    ...DEFAULT_FILTERS,
    projectId: scope ? scope.id : "",
    archived: overrideArchived ?? false,
  }));

  const [editing, setEditing] = useState<FinanceEntryDTO | null>(null);
  const [createPreset, setCreatePreset] = useState<QuadrantPreset | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();

    // Project filter
    if (scope) {
      p.set("projectId", scope.id);
    } else {
      if (filters.projectId === "__NULL__") p.set("projectId", "null");
      else if (filters.projectId) p.set("projectId", filters.projectId);
    }

    // Kind/Type
    if (filters.kind) p.set("kind", filters.kind);
    if (filters.type) p.set("type", filters.type);

    // Category
    if (filters.category) p.set("category", filters.category);
    if (filters.subcategory) p.set("subcategory", filters.subcategory);

    // Date range
    if (filters.from) p.set("from", new Date(filters.from).toISOString());
    if (filters.to) {
      const d = new Date(filters.to);
      d.setHours(23, 59, 59, 999);
      p.set("to", d.toISOString());
    }

    // Search
    if (filters.search.trim()) p.set("search", filters.search.trim());

    // Responsible
    if (filters.responsibleId) p.set("responsibleId", filters.responsibleId);

    // Has attachments
    if (filters.hasAttachments) p.set("hasAttachments", filters.hasAttachments);

    // Archive
    const archived = overrideArchived ?? filters.archived;
    if (archived) p.set("archived", "true");

    // Folder
    if (folderId) p.set("folderId", folderId);

    return p.toString();
  }, [filters, scope, overrideArchived, folderId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/financing?${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Помилка завантаження");
      const json = await res.json();
      setEntries(json.data || []);
      setSummary(json.summary || EMPTY_SUMMARY);
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/financing/export?${query}`);
      if (!res.ok) throw new Error("Помилка експорту");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financing-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Не вдалося експортувати");
    } finally {
      setExporting(false);
    }
  }

  async function uploadFilesToEntry(entryId: string, files: File[]) {
    const presignRes = await fetch(
      `/api/admin/financing/${entryId}/attachments/presigned-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      }
    );
    if (!presignRes.ok) throw new Error("Не вдалося підготувати upload");
    const { presignedUrls } = await presignRes.json();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pu = presignedUrls[i];
      const putRes = await fetch(pu.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": pu.contentType },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);
    }

    await fetch(`/api/admin/financing/${entryId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: files.map((f, i) => ({
          r2Key: presignedUrls[i].key,
          originalName: f.name,
          mimeType: f.type || "application/octet-stream",
          size: f.size,
        })),
      }),
    });
  }

  async function handleSave(
    values: EntryFormValues,
    andCreateAnother: boolean
  ) {
    const isEdit = !!editing;
    const url = isEdit
      ? `/api/admin/financing/${editing!.id}`
      : `/api/admin/financing`;
    const method = isEdit ? "PATCH" : "POST";

    const payload: Record<string, unknown> = {
      type: values.type,
      kind: values.kind,
      amount: Number(values.amount),
      occurredAt: new Date(values.occurredAt).toISOString(),
      projectId: values.projectId || null,
      category: values.category,
      subcategory: values.subcategory || null,
      title: values.title.trim(),
      description: values.description || null,
      counterparty: values.counterparty || null,
      currency: "UAH",
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Помилка збереження");
    }
    const { data: saved } = await res.json();

    if (values.pendingFiles.length > 0 && saved?.id) {
      await uploadFilesToEntry(saved.id, values.pendingFiles);
    }

    await loadData();

    if (andCreateAnother && !isEdit) {
      setEditing(null);
    } else {
      setCreatePreset(null);
      setEditing(null);
    }
  }

  async function handleArchive(entry: FinanceEntryDTO) {
    if (!confirm(`Архівувати запис «${entry.title}»?`)) return;
    const res = await fetch(`/api/admin/financing/${entry.id}`, {
      method: "DELETE",
    });
    if (res.ok) await loadData();
  }

  const resetFilters = () => {
    setFilters({
      ...DEFAULT_FILTERS,
      projectId: scope ? scope.id : "",
      archived: overrideArchived ?? false,
    });
  };

  const quadrantEntries = useMemo(() => {
    const result: Record<string, FinanceEntryDTO[]> = {
      "PLAN:EXPENSE": [],
      "PLAN:INCOME": [],
      "FACT:EXPENSE": [],
      "FACT:INCOME": [],
    };
    for (const e of entries) {
      const key = `${e.kind}:${e.type}`;
      if (result[key]) result[key].push(e);
    }
    return result;
  }, [entries]);

  return {
    entries,
    summary,
    loading,
    error,
    exporting,
    filters,
    setFilters,
    resetFilters,
    loadData,
    handleSave,
    handleArchive,
    handleExport,
    editing,
    setEditing,
    createPreset,
    setCreatePreset,
    quadrantEntries,
  };
}
