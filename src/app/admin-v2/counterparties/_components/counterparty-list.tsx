"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ExcelImportModal } from "@/app/admin-v2/hr/_components/excel-import-modal";

type CounterpartyType = "LEGAL" | "INDIVIDUAL" | "FOP";

type Counterparty = {
  id: string;
  name: string;
  type: CounterpartyType;
  edrpou: string | null;
  iban: string | null;
  vatPayer: boolean;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  type: CounterpartyType;
  edrpou: string;
  taxId: string;
  iban: string;
  vatPayer: boolean;
  phone: string;
  email: string;
  address: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "LEGAL",
  edrpou: "",
  taxId: "",
  iban: "",
  vatPayer: false,
  phone: "",
  email: "",
  address: "",
};

const TYPE_LABELS: Record<CounterpartyType, string> = {
  LEGAL: "ТОВ",
  INDIVIDUAL: "Фіз. особа",
  FOP: "ФОП",
};

const TYPE_COLORS: Record<CounterpartyType, { bg: string; fg: string }> = {
  LEGAL: { bg: T.skySoft, fg: T.sky },
  FOP: { bg: T.amberSoft, fg: T.amber },
  INDIVIDUAL: { bg: T.violetSoft, fg: T.violet },
};

type EditableField =
  | "name"
  | "type"
  | "edrpou"
  | "taxId"
  | "iban"
  | "vatPayer"
  | "phone"
  | "email"
  | "address"
  | "isActive";

export function CounterpartyList({ currentUserRole }: { currentUserRole: string }) {
  const canCreate = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"].includes(currentUserRole);

  const [items, setItems] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | CounterpartyType>("");
  const [showInactive, setShowInactive] = useState(false);

  const [editingCell, setEditingCell] = useState<{ id: string; field: EditableField } | null>(null);
  const [savingCell, setSavingCell] = useState<{ id: string; field: EditableField } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const [creating, setCreating] = useState<FormState | null>(null);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [creatingSaving, setCreatingSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("take", "200");
      if (showInactive) params.set("includeInactive", "true");
      const res = await fetch(`/api/admin/financing/counterparties?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? `HTTP ${res.status}`;
        setLoadError(`Не вдалось завантажити контрагентів: ${msg}`);
        setItems([]);
        return;
      }
      const j = await res.json();
      setItems(j.data ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.edrpou ?? "").toLowerCase().includes(needle) ||
        (c.taxId ?? "").toLowerCase().includes(needle) ||
        (c.iban ?? "").toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, search, typeFilter]);

  function taxLabel(type: CounterpartyType): string {
    return type === "LEGAL" ? "ЄДРПОУ" : "РНОКПП";
  }

  async function patchField(c: Counterparty, field: EditableField, value: unknown) {
    const current = c[field as keyof Counterparty];
    if (current === value) {
      setEditingCell(null);
      return;
    }
    setSavingCell({ id: c.id, field });
    try {
      const res = await fetch(`/api/admin/financing/counterparties/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Помилка збереження");
        return;
      }
      const saved: Counterparty = j.data;
      setItems((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } finally {
      setSavingCell(null);
      setEditingCell(null);
    }
  }

  async function submitCreate() {
    if (!creating) return;
    if (!creating.name.trim()) {
      setCreatingError("Назва обовʼязкова");
      return;
    }
    setCreatingSaving(true);
    setCreatingError(null);
    try {
      const payload = {
        name: creating.name.trim(),
        type: creating.type,
        edrpou: creating.edrpou.trim() || null,
        taxId: creating.taxId.trim() || null,
        iban: creating.iban.trim() || null,
        vatPayer: creating.vatPayer,
        phone: creating.phone.trim() || null,
        email: creating.email.trim() || null,
        address: creating.address.trim() || null,
      };
      const res = await fetch(`/api/admin/financing/counterparties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setCreatingError(j.error ?? "Помилка");
        return;
      }
      const saved: Counterparty = j.data;
      setItems((prev) => [saved, ...prev]);
      setCreating(null);
    } finally {
      setCreatingSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Building2 size={20} style={{ color: T.textPrimary }} />
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Контрагенти
        </h1>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          {filtered.length}
          {filtered.length !== items.length ? ` / ${items.length}` : ""}
        </span>
        <div className="flex-1" />
        {canCreate && (
          <>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{
                backgroundColor: T.panelSoft,
                color: T.accentPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              <Upload size={13} /> Імпорт з Excel
            </button>
            <button
              onClick={() => {
                setCreating((c) => (c ? null : { ...EMPTY_FORM }));
                setCreatingError(null);
              }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              <Plus size={13} /> Новий контрагент
            </button>
          </>
        )}
      </div>

      <ExcelImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Імпорт контрагентів"
        templateUrl="/api/admin/financing/counterparties/template"
        importUrl="/api/admin/financing/counterparties/import"
        previewColumns={[
          { key: "name", label: "Назва" },
          { key: "type", label: "Тип" },
          { key: "taxId", label: "Код" },
          { key: "phone", label: "Телефон" },
          { key: "email", label: "Email" },
          { key: "address", label: "Адреса" },
        ]}
        onImported={() => {
          void load();
        }}
      />

      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: T.textMuted }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук — назва / ЄДРПОУ / IBAN / телефон / email…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["", "LEGAL", "FOP", "INDIVIDUAL"] as const).map((t) => (
            <button
              key={t || "all"}
              onClick={() => setTypeFilter(t)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: typeFilter === t ? T.accentPrimary : T.panelSoft,
                color: typeFilter === t ? "#fff" : T.textSecondary,
                border: `1px solid ${typeFilter === t ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              {t === "" ? "Всі" : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label
          className="flex items-center gap-1.5 text-[12px] cursor-pointer"
          style={{ color: T.textSecondary }}
        >
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Показати деактивованих
        </label>
      </div>

      {loadError && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}40`,
          }}
        >
          ⚠ {loadError}
          <button
            onClick={() => void load()}
            className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: T.danger, color: "#fff" }}
          >
            Спробувати ще
          </button>
        </div>
      )}

      {loading && (
        <div
          className="flex items-center justify-center gap-2 py-12 text-sm"
          style={{ color: T.textMuted }}
        >
          <Loader2 size={16} className="animate-spin" /> Завантажуємо…
        </div>
      )}

      {!loading && (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <table className="w-full text-[13px]" style={{ color: T.textPrimary }}>
            <thead>
              <tr
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              >
                <th className="px-4 py-3 text-left">Назва</th>
                <th className="px-3 py-3 text-left">Тип</th>
                <th className="px-3 py-3 text-left">Код</th>
                <th className="px-3 py-3 text-left">IBAN</th>
                <th className="px-3 py-3 text-center">ПДВ</th>
                <th className="px-3 py-3 text-left">Контакти</th>
                <th className="px-3 py-3 text-left">Адреса</th>
                <th className="px-3 py-3 text-center">Статус</th>
                <th className="px-3 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {creating && (
                <CreateRow
                  form={creating}
                  setForm={setCreating}
                  saving={creatingSaving}
                  error={creatingError}
                  onCancel={() => {
                    setCreating(null);
                    setCreatingError(null);
                  }}
                  onSubmit={submitCreate}
                />
              )}
              {filtered.map((c, idx) => {
                const tc = TYPE_COLORS[c.type];
                const isEditing = (field: EditableField) =>
                  editingCell?.id === c.id && editingCell.field === field;
                const isSaving = (field: EditableField) =>
                  savingCell?.id === c.id && savingCell.field === field;
                const startEdit = (field: EditableField) => {
                  if (!canCreate) return;
                  if (savingCell) return;
                  setEditingCell({ id: c.id, field });
                };
                const cancelEdit = () => setEditingCell(null);
                return (
                  <tr
                    key={c.id}
                    className={`border-t transition ${idx < 20 ? "data-table-row-enter" : ""}`}
                    style={{
                      borderColor: T.borderSoft,
                      opacity: c.isActive ? 1 : 0.55,
                      ...(idx < 20 ? { animationDelay: `${idx * 30}ms` } : {}),
                    }}
                  >
                    {/* Назва */}
                    <td
                      className={`px-4 py-2 ${canCreate ? "cursor-text hover:bg-black/5" : ""}`}
                      onClick={() => startEdit("name")}
                    >
                      {isEditing("name") ? (
                        <CellTextInput
                          initial={c.name}
                          onCommit={(v) => patchField(c, "name", v.trim())}
                          onCancel={cancelEdit}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: T.textPrimary }}>
                            {c.name}
                          </span>
                          {isSaving("name") && (
                            <Loader2 size={12} className="animate-spin" style={{ color: T.textMuted }} />
                          )}
                        </div>
                      )}
                    </td>
                    {/* Тип */}
                    <td
                      className={`px-3 py-2 ${canCreate ? "cursor-pointer hover:bg-black/5" : ""}`}
                      onClick={() => startEdit("type")}
                    >
                      {isEditing("type") ? (
                        <select
                          autoFocus
                          defaultValue={c.type}
                          onChange={(e) => patchField(c, "type", e.target.value as CounterpartyType)}
                          onBlur={(e) => patchField(c, "type", e.target.value as CounterpartyType)}
                          className="rounded-lg px-2 py-1 text-[12px] outline-none"
                          style={{
                            backgroundColor: T.panelSoft,
                            border: `1px solid ${T.borderStrong}`,
                            color: T.textPrimary,
                          }}
                        >
                          <option value="LEGAL">ТОВ / ЮО</option>
                          <option value="FOP">ФОП</option>
                          <option value="INDIVIDUAL">Фіз. особа</option>
                        </select>
                      ) : (
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ backgroundColor: tc.bg, color: tc.fg }}
                        >
                          {TYPE_LABELS[c.type]}
                        </span>
                      )}
                    </td>
                    {/* Код (ЄДРПОУ / РНОКПП) */}
                    <td
                      className={`px-3 py-2 text-[12px] ${canCreate ? "cursor-text hover:bg-black/5" : ""}`}
                      style={{ color: T.textSecondary }}
                      title={taxLabel(c.type)}
                      onClick={() => startEdit("edrpou")}
                    >
                      {isEditing("edrpou") ? (
                        <CellTextInput
                          initial={c.edrpou ?? ""}
                          onCommit={(v) => patchField(c, "edrpou", v.trim() || null)}
                          onCancel={cancelEdit}
                        />
                      ) : (
                        c.edrpou ?? c.taxId ?? "—"
                      )}
                    </td>
                    {/* IBAN */}
                    <td
                      className={`px-3 py-2 text-[11px] ${canCreate ? "cursor-text hover:bg-black/5" : ""}`}
                      style={{ color: T.textSecondary }}
                      onClick={() => startEdit("iban")}
                    >
                      {isEditing("iban") ? (
                        <CellTextInput
                          initial={c.iban ?? ""}
                          placeholder="UA..."
                          onCommit={(v) => patchField(c, "iban", v.trim() || null)}
                          onCancel={cancelEdit}
                        />
                      ) : c.iban ? (
                        <code style={{ color: T.textPrimary }}>{c.iban}</code>
                      ) : (
                        <span style={{ color: T.textMuted }}>—</span>
                      )}
                    </td>
                    {/* ПДВ */}
                    <td
                      className={`px-3 py-2 text-center ${canCreate ? "cursor-pointer hover:bg-black/5" : ""}`}
                      onClick={() => {
                        if (!canCreate || savingCell) return;
                        void patchField(c, "vatPayer", !c.vatPayer);
                      }}
                    >
                      {isSaving("vatPayer") ? (
                        <Loader2 size={12} className="animate-spin inline" style={{ color: T.textMuted }} />
                      ) : c.vatPayer ? (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{ backgroundColor: T.violetSoft, color: T.violet }}
                        >
                          ПДВ
                        </span>
                      ) : (
                        <span style={{ color: T.textMuted }}>—</span>
                      )}
                    </td>
                    {/* Контакти */}
                    <td
                      className="px-3 py-2 text-[12px]"
                      style={{ color: T.textSecondary }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div
                          className={canCreate ? "cursor-text hover:bg-black/5 rounded px-1 -mx-1" : ""}
                          onClick={() => startEdit("phone")}
                        >
                          {isEditing("phone") ? (
                            <CellTextInput
                              initial={c.phone ?? ""}
                              onCommit={(v) => patchField(c, "phone", v.trim() || null)}
                              onCancel={cancelEdit}
                            />
                          ) : c.phone ? (
                            c.phone
                          ) : (
                            <span style={{ color: T.textMuted }}>—</span>
                          )}
                        </div>
                        <div
                          className={canCreate ? "cursor-text hover:bg-black/5 rounded px-1 -mx-1" : ""}
                          onClick={() => startEdit("email")}
                        >
                          {isEditing("email") ? (
                            <CellTextInput
                              type="email"
                              initial={c.email ?? ""}
                              onCommit={(v) => patchField(c, "email", v.trim() || null)}
                              onCancel={cancelEdit}
                            />
                          ) : c.email ? (
                            c.email
                          ) : (
                            <span style={{ color: T.textMuted }}>—</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Адреса */}
                    <td
                      className={`px-3 py-2 text-[12px] ${canCreate ? "cursor-text hover:bg-black/5" : ""}`}
                      style={{ color: T.textSecondary }}
                      onClick={() => startEdit("address")}
                    >
                      {isEditing("address") ? (
                        <CellTextInput
                          initial={c.address ?? ""}
                          onCommit={(v) => patchField(c, "address", v.trim() || null)}
                          onCancel={cancelEdit}
                        />
                      ) : c.address ? (
                        <span className="truncate inline-block max-w-[220px] align-middle">{c.address}</span>
                      ) : (
                        <span style={{ color: T.textMuted }}>—</span>
                      )}
                    </td>
                    {/* Статус */}
                    <td className="px-3 py-2 text-center">
                      {c.isActive ? (
                        <CheckCircle2 size={14} style={{ color: T.success }} className="inline" />
                      ) : (
                        <XCircle size={14} style={{ color: T.textMuted }} className="inline" />
                      )}
                    </td>
                    {/* Дії */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/admin-v2/counterparties/${c.id}`}
                        className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10"
                        title="Відкрити дос'є з історією"
                        aria-label="Дос'є"
                      >
                        <ExternalLink size={13} style={{ color: T.accentPrimary }} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !creating && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: T.textMuted }}>
                    {search.trim() || typeFilter
                      ? "Нічого не знайдено за фільтрами."
                      : "Список порожній. Додайте через кнопку «Новий контрагент» або імпортуйте з Excel."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateRow({
  form,
  setForm,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState | null) => FormState | null) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => (p ? { ...p, [key]: value } : p));

  const inputStyle: React.CSSProperties = {
    backgroundColor: T.panelSoft,
    border: `1px solid ${T.borderStrong}`,
    color: T.textPrimary,
  };

  return (
    <>
      <tr style={{ borderTop: `2px solid ${T.accentPrimary}`, backgroundColor: T.accentPrimarySoft }}>
        <td className="px-4 py-2">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Назва *"
            className="w-full rounded-lg px-2 py-1 text-sm outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={form.type}
            onChange={(e) => set("type", e.target.value as CounterpartyType)}
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          >
            <option value="LEGAL">ТОВ / ЮО</option>
            <option value="FOP">ФОП</option>
            <option value="INDIVIDUAL">Фіз. особа</option>
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            value={form.edrpou}
            onChange={(e) => set("edrpou", e.target.value)}
            placeholder={form.type === "LEGAL" ? "ЄДРПОУ" : "РНОКПП"}
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={form.iban}
            onChange={(e) => set("iban", e.target.value)}
            placeholder="UA..."
            className="w-full rounded-lg px-2 py-1 text-[11px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={form.vatPayer}
            onChange={(e) => set("vatPayer", e.target.checked)}
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="Телефон"
              className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
              style={inputStyle}
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
              style={inputStyle}
            />
          </div>
        </td>
        <td className="px-3 py-2">
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Адреса"
            className="w-full rounded-lg px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
        </td>
        <td className="px-3 py-2 text-center" colSpan={1}>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            Новий
          </span>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
            title="Скасувати"
            aria-label="Скасувати"
          >
            <X size={14} style={{ color: T.textSecondary }} />
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md p-1.5 hover:bg-black/10 disabled:opacity-50"
            title="Зберегти"
            aria-label="Зберегти"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" style={{ color: T.accentPrimary }} />
            ) : (
              <CheckCircle2 size={14} style={{ color: T.success }} />
            )}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td
            colSpan={9}
            className="px-4 py-2 text-[12px]"
            style={{ backgroundColor: T.dangerSoft, color: T.danger }}
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

function CellTextInput({
  initial,
  type = "text",
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  type?: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      type={type}
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="w-full rounded-lg px-2 py-1 text-sm outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
  );
}
