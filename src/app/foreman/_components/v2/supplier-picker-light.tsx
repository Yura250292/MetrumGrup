"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, Sparkles, Search } from "lucide-react";

export type SupplierOption = {
  id: string;
  name: string;
  edrpou: string | null;
};

interface Props {
  value: string | null;
  guess: string | null;
  preselectedName?: string | null;
  onChange: (next: { counterpartyId: string | null; supplierGuess: string | null }) => void;
}

export function SupplierPickerLight({ value, guess, preselectedName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(preselectedName ?? null);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!value || resolvedName) return;
    let abort = false;
    fetch(`/api/foreman/counterparties?q=&take=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (abort) return;
        const found = (j.data as SupplierOption[]).find((c) => c.id === value);
        if (found) setResolvedName(found.name);
      })
      .catch(() => {});
    return () => {
      abort = true;
    };
  }, [value, resolvedName]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        params.set("take", "20");
        const res = await fetch(`/api/foreman/counterparties?${params}`, { cache: "no-store" });
        const j = await res.json();
        setResults(j.data ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [search, open]);

  function pick(option: SupplierOption) {
    onChange({ counterpartyId: option.id, supplierGuess: null });
    setResolvedName(option.name);
    setOpen(false);
    setSearch("");
  }

  function clear() {
    onChange({ counterpartyId: null, supplierGuess: guess ?? null });
    setResolvedName(null);
  }

  async function createNew(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/foreman/counterparties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Не вдалось створити");
        return;
      }
      pick(j.data as SupplierOption);
    } finally {
      setCreating(false);
    }
  }

  if (!open) {
    if (value) {
      return (
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 bg-emerald-50 rounded-md px-2 py-1.5">
            <Check size={12} strokeWidth={3} />
            <span className="truncate">{resolvedName ?? "Постачальник"}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[11px] font-semibold text-slate-600 px-2 py-1.5 rounded-md bg-slate-100"
          >
            Змінити
          </button>
          <button
            type="button"
            onClick={clear}
            className="flex items-center justify-center w-7 h-7 rounded-md bg-rose-50 text-rose-600"
            aria-label="Прибрати постачальника"
          >
            <X size={12} />
          </button>
        </div>
      );
    }
    if (guess) {
      return (
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] text-amber-800 bg-amber-100 rounded-md px-2 py-1.5">
            <Sparkles size={12} className="text-amber-600 shrink-0" />
            <span className="truncate">AI: {guess}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch(guess);
              setOpen(true);
            }}
            className="text-[11px] font-semibold text-emerald-700 px-2.5 py-1.5 rounded-md bg-emerald-50"
          >
            Вибрати
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 text-[12px] text-slate-500 font-medium bg-slate-100 rounded-md px-3 py-2 active:bg-slate-200 transition"
      >
        <Search size={12} />
        Постачальник (опційно)
      </button>
    );
  }

  const exact = results.find(
    (r) => r.name.trim().toLowerCase() === search.trim().toLowerCase(),
  );
  const showCreateOption = search.trim().length >= 2 && !exact && !loading;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Будхата, Епіцентр…"
          className="flex-1 px-2 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
          className="text-[11px] text-slate-500 px-2 py-1.5 rounded font-semibold"
        >
          Закрити
        </button>
      </div>
      <div className="max-h-44 overflow-y-auto -mx-1 px-1 space-y-1">
        {loading && (
          <div className="text-[11px] text-slate-500 px-2 py-1">Шукаємо…</div>
        )}
        {!loading && results.length === 0 && search.trim() === "" && (
          <div className="text-[11px] text-slate-500 px-2 py-1">
            Почніть вводити назву постачальника.
          </div>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => pick(r)}
            className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md text-[13px] bg-slate-50 active:bg-emerald-50 transition"
          >
            <span className="truncate text-slate-900">{r.name}</span>
            {r.edrpou && (
              <span className="text-[10px] text-slate-500 tabular-nums">{r.edrpou}</span>
            )}
          </button>
        ))}
        {showCreateOption && (
          <button
            type="button"
            onClick={() => createNew(search)}
            disabled={creating}
            className="w-full text-left px-2 py-1.5 rounded-md text-[13px] bg-emerald-50 text-emerald-700 font-semibold active:bg-emerald-100 disabled:opacity-60"
          >
            {creating ? "Створення…" : `+ Створити нового: «${search.trim()}»`}
          </button>
        )}
      </div>
    </div>
  );
}
