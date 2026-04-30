"use client";

import { useEffect, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

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
  }, []);

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
  );
}
