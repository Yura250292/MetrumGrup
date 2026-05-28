"use client";

import { useEffect, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

/**
 * Менеджер проекту: User з логіном АБО Employee штату (можуть НЕ мати User).
 *  - { mode: "user", id, name }     — обрано User-а
 *  - { mode: "employee", name }     — обрано Employee (зберігаємо лише name)
 *  - { mode: "freetext", name }     — введено імʼя текстом (нема в БД)
 *  - null                            — нічого не обрано
 */
export type ProjectManagerValue =
  | { mode: "user"; id: string; name: string }
  | { mode: "employee"; name: string }
  | { mode: "freetext"; name: string }
  | null;

type Candidate = {
  key: string; // "user:<id>" | "employee:<id>"
  id: string;
  name: string;
  source: "user" | "employee";
  description?: string;
};

const FREE_PREFIX = "__free:";

export function ProjectManagerPicker({
  value,
  onChange,
  disabled,
}: {
  value: ProjectManagerValue;
  onChange: (next: ProjectManagerValue) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/projects/manager-candidates", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        const raw: Candidate[] = j.data ?? [];
        setCandidates(raw);
        setOptions(
          raw.map((c) => ({
            value: c.key,
            label: c.name,
            description: c.description,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Синтетична опція для free-text/відсутньої в списку value
  const augmented = (() => {
    if (!value) return options;
    if (value.mode === "freetext") {
      return [
        {
          value: FREE_PREFIX + value.name,
          label: value.name,
          description: "Без облікового запису",
        } as ComboboxOption,
        ...options,
      ];
    }
    return options;
  })();

  const currentKey: string | null = (() => {
    if (!value) return null;
    if (value.mode === "user") return `user:${value.id}`;
    if (value.mode === "employee") {
      // знайдемо за іменем (managerName зберігається без id)
      const found = candidates.find(
        (c) => c.source === "employee" && c.name === value.name,
      );
      return found?.key ?? FREE_PREFIX + value.name;
    }
    return FREE_PREFIX + value.name;
  })();

  return (
    <Combobox
      value={currentKey}
      options={augmented}
      disabled={disabled || loading}
      placeholder={loading ? "Завантаження…" : "Оберіть або введіть імʼя…"}
      searchPlaceholder="Пошук співробітника або введіть імʼя…"
      emptyMessage="Не знайдено"
      onChange={(key) => {
        if (!key) {
          onChange(null);
          return;
        }
        if (key.startsWith(FREE_PREFIX)) {
          onChange({ mode: "freetext", name: key.slice(FREE_PREFIX.length) });
          return;
        }
        const cand = candidates.find((c) => c.key === key);
        if (!cand) {
          onChange(null);
          return;
        }
        if (cand.source === "user") {
          onChange({ mode: "user", id: cand.id, name: cand.name });
        } else {
          onChange({ mode: "employee", name: cand.name });
        }
      }}
      onCreate={(term) => ({
        value: FREE_PREFIX + term.trim(),
        label: term.trim(),
        description: "Без облікового запису",
      })}
    />
  );
}
