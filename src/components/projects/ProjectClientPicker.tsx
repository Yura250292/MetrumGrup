"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Single value юзер передає всередину/назовні. Три варіанти:
 *  - { mode: "counterparty", id, name } — обрано контрагента з книги
 *  - { mode: "freetext", name }         — введено імʼя вручну (без FK)
 *  - null                                — нічого не обрано
 */
export type ProjectClientValue =
  | { mode: "counterparty"; id: string; name: string }
  | { mode: "freetext"; name: string }
  | null;

const FREE_PREFIX = "__free:";

/**
 * Combobox-вибір клієнта проекту. Список заповнюється з
 * /api/admin/financing/counterparties (вже firm-scoped); якщо юзер
 * друкує імʼя якого нема — пропонується створити "як free-text"
 * (зберегти лише імʼя без привʼязки до контрагента, без email/phone).
 */
export function ProjectClientPicker({
  value,
  onChange,
  required,
  disabled,
}: {
  value: ProjectClientValue;
  onChange: (next: ProjectClientValue) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/api/admin/financing/counterparties?take=200",
          { cache: "no-store" },
        );
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const j = await res.json();
        if (cancelled) return;
        const opts: ComboboxOption[] = (j.data ?? []).map(
          (c: { id: string; name: string; type: string }) => ({
            value: c.id,
            label: c.name,
            description:
              c.type === "FOP"
                ? "ФОП"
                : c.type === "INDIVIDUAL"
                  ? "Фіз.особа"
                  : "ТОВ/ЮО",
          }),
        );
        setOptions(opts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Якщо value це free-text або contractor-not-in-list — інʼєктимо
  // синтетичну опцію щоб Combobox міг відобразити її як selected.
  const augmentedOptions = (() => {
    if (!value) return options;
    if (value.mode === "freetext") {
      const synthetic: ComboboxOption = {
        value: FREE_PREFIX + value.name,
        label: value.name,
        description: "Без привʼязки до контрагента",
      };
      return [synthetic, ...options];
    }
    if (value.mode === "counterparty") {
      const present = options.some((o) => o.value === value.id);
      if (!present) {
        const synthetic: ComboboxOption = {
          value: value.id,
          label: value.name,
        };
        return [synthetic, ...options];
      }
    }
    return options;
  })();

  const currentValue: string | null = value
    ? value.mode === "freetext"
      ? FREE_PREFIX + value.name
      : value.id
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        value={currentValue}
        options={augmentedOptions}
        disabled={disabled || loading}
        placeholder={loading ? "Завантаження…" : "Оберіть або введіть імʼя…"}
        searchPlaceholder="Пошук контрагента або введіть імʼя…"
        emptyMessage="Нічого не знайдено"
        required={required}
        onChange={(id, opt) => {
          if (!id) {
            onChange(null);
            return;
          }
          if (id.startsWith(FREE_PREFIX)) {
            onChange({ mode: "freetext", name: id.slice(FREE_PREFIX.length) });
            return;
          }
          onChange({
            mode: "counterparty",
            id,
            name: opt?.label ?? "",
          });
        }}
        onCreate={async (term) => {
          const trimmed = term.trim();
          // Free-text: НЕ створюємо Counterparty. Просто повертаємо синтетичну
          // опцію, яку Combobox селектне; submit-handler потім надішле це як
          // clientName.
          return {
            value: FREE_PREFIX + trimmed,
            label: trimmed,
            description: "Без привʼязки до контрагента",
          };
        }}
      />
      <button
        type="button"
        onClick={() => setShowCreate(true)}
        disabled={disabled}
        className="self-start inline-flex items-center gap-1.5 text-[11px] font-medium transition hover:underline disabled:opacity-50"
        style={{ color: T.accentPrimary }}
      >
        <Plus size={11} /> Створити нового клієнта в книзі
      </button>
      {showCreate && (
        <CreateCounterpartyDialog
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setReloadKey((k) => k + 1);
            onChange({
              mode: "counterparty",
              id: c.id,
              name: c.name,
            });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

type CounterpartyType = "LEGAL" | "INDIVIDUAL" | "FOP";

function CreateCounterpartyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CounterpartyType>("INDIVIDUAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Імʼя обовʼязкове");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/financing/counterparties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Помилка ${res.status}`);
      }
      const j = await res.json();
      const created = j.data ?? j;
      onCreated({ id: created.id, name: created.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка створення");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-3"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-[14px] font-bold"
            style={{ color: T.textPrimary }}
          >
            Новий клієнт у книзі
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1"
            style={{ color: T.textMuted }}
            aria-label="Закрити"
          >
            <X size={14} />
          </button>
        </div>
        <label className="flex flex-col gap-1">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Назва / ПІБ
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            placeholder="ТОВ «Будінвест» або Шиба Ігор"
            className="rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Тип
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CounterpartyType)}
            className="rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          >
            <option value="INDIVIDUAL">Фізична особа</option>
            <option value="FOP">ФОП</option>
            <option value="LEGAL">ТОВ / Юридична особа</option>
          </select>
        </label>
        {error && (
          <div
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}55`,
            }}
          >
            {error}
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {submitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Створити
          </button>
        </div>
      </form>
    </div>
  );
}
