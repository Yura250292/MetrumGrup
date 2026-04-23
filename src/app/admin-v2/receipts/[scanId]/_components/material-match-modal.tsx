"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Plus, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { LineItemView } from "./review-board";

interface SearchResult {
  materialId: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  basePrice: number;
  score: number;
}

interface NewMaterialPayload {
  name: string;
  sku: string;
  category: string;
  unit: string;
  basePrice: number;
}

interface Props {
  item: LineItemView;
  onClose: () => void;
  onPickExisting: (materialId: string) => Promise<void>;
  onCreateNew: (data: NewMaterialPayload) => Promise<void>;
}

export function MaterialMatchModal({ item, onClose, onPickExisting, onCreateNew }: Props) {
  const [tab, setTab] = useState<"search" | "create">("search");
  const [query, setQuery] = useState(item.rawName);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create-new form state
  const [newName, setNewName] = useState(item.rawName);
  const [newSku, setNewSku] = useState(item.proposedSku ?? "");
  const [newCategory, setNewCategory] = useState(item.proposedCategory ?? "Інше");
  const [newUnit, setNewUnit] = useState(item.rawUnit ?? "шт");
  const [newPrice, setNewPrice] = useState<number>(item.unitPrice);

  useEffect(() => {
    if (tab !== "search") return;
    const handle = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      const res = await fetch(`/api/admin/materials/search?q=${encodeURIComponent(query)}&topN=10`);
      const json = await res.json();
      setSearching(false);
      if (res.ok) setResults(json.data ?? []);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, tab]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПРИВ&apos;ЯЗКА ПОЗИЦІЇ
            </span>
            <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
              {item.rawName}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ color: T.textMuted }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1.5">
          {(["search", "create"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{
                backgroundColor: tab === t ? T.accentPrimarySoft : "transparent",
                color: tab === t ? T.accentPrimary : T.textSecondary,
                border: `1px solid ${tab === t ? T.accentPrimary + "33" : T.borderSoft}`,
              }}
            >
              {t === "search" ? "Знайти існуючий" : "Створити новий"}
            </button>
          ))}
        </div>

        {tab === "search" ? (
          <>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <Search size={16} style={{ color: T.textMuted }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Назва, SKU, категорія…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: T.textPrimary }}
              />
              {searching && <Loader2 size={14} className="animate-spin" style={{ color: T.textMuted }} />}
            </div>

            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.materialId}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onPickExisting(r.materialId);
                    setBusy(false);
                  }}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span style={{ color: T.textPrimary }}>{r.name}</span>
                    <span className="text-xs" style={{ color: T.textMuted }}>
                      {r.sku} · {r.category} · {r.unit} · {Number(r.basePrice).toFixed(2)} ₴
                    </span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: T.textMuted }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                </button>
              ))}
              {!searching && query.trim() && results.length === 0 && (
                <div className="rounded-xl px-3 py-6 text-center text-sm" style={{ color: T.textMuted }}>
                  Нічого не знайдено. Спробуйте іншу назву або створіть новий матеріал.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Назва">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU">
                <input
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
                />
              </Field>
              <Field label="Категорія">
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
                />
              </Field>
              <Field label="Од.виміру">
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
                />
              </Field>
              <Field label="Базова ціна, ₴">
                <input
                  type="number"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}`, color: T.textPrimary }}
                />
              </Field>
            </div>
            <button
              type="button"
              disabled={busy || !newName || !newSku || !newCategory || !newUnit}
              onClick={async () => {
                setBusy(true);
                await onCreateNew({
                  name: newName.trim(),
                  sku: newSku.trim(),
                  category: newCategory.trim(),
                  unit: newUnit.trim(),
                  basePrice: newPrice,
                });
                setBusy(false);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "white" }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Створити матеріал та прив&apos;язати
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: T.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}
