"use client";

import { useEffect, useMemo, useState } from "react";

export type CostCodeOption = {
  id: string;
  code: string;
  name: string;
  defaultCostType?: string | null;
};

type Props = {
  value: string | null;
  onChange: (id: string | null, option: CostCodeOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /// Якщо передано — picker одразу починає завантажувати дерево з API.
  /// Інакше викликаючий компонент має сам передати `options`.
  options?: CostCodeOption[];
};

let cached: CostCodeOption[] | null = null;
async function fetchAll(): Promise<CostCodeOption[]> {
  if (cached) return cached;
  const res = await fetch("/api/admin/financing/cost-codes");
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: CostCodeOption[] };
  cached = json.data ?? [];
  return cached;
}

export function CostCodePicker({
  value,
  onChange,
  placeholder = "Стаття витрат…",
  disabled,
  options: incoming,
}: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CostCodeOption[]>(incoming ?? []);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (incoming) {
        if (!cancelled) setOptions(incoming);
        return;
      }
      try {
        const all = await fetchAll();
        if (!cancelled) setOptions(all);
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incoming]);

  const current = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return options.slice(0, 60);
    return options
      .filter(
        (o) =>
          o.name.toLowerCase().includes(s) || o.code.toLowerCase().includes(s),
      )
      .slice(0, 60);
  }, [options, search]);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2 rounded-md border border-zinc-200 bg-white text-sm text-zinc-900 hover:border-zinc-400 disabled:opacity-60"
      >
        {current ? (
          <span>
            <span className="text-zinc-500 mr-1.5">{current.code}</span>
            {current.name}
          </span>
        ) : (
          <span className="text-zinc-400">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg p-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук…"
              className="flex-1 px-2 py-1 rounded border border-zinc-200 text-sm focus:border-sky-500 focus:outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
                className="text-[10px] text-zinc-500 px-1.5 py-1 rounded hover:bg-zinc-100"
                title="Прибрати"
              >
                ×
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-zinc-500 px-1.5 py-1 rounded hover:bg-zinc-100"
            >
              ✕
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto mt-2 space-y-0.5">
            {filtered.length === 0 && (
              <div className="text-[11px] text-zinc-500 px-2 py-1">
                Нічого не знайдено
              </div>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id, o);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full text-left px-2 py-1 rounded text-sm hover:bg-sky-50"
              >
                <span className="text-zinc-500 mr-1.5">{o.code}</span>
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
