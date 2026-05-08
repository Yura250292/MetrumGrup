"use client";

import { useEffect, useRef, useState } from "react";

export type SupplierOption = {
  id: string;
  name: string;
  edrpou: string | null;
};

interface Props {
  /** Якщо item уже привʼязаний до Counterparty — id передається. */
  value: string | null;
  /** Сирий AI-guess коли value=null (UI підсвічує chip "AI запропонував"). */
  guess: string | null;
  /** Підказка для UX — коли був повний match від AI, не треба питати "вибрати?". */
  preselectedName?: string | null;
  onChange: (next: { counterpartyId: string | null; supplierGuess: string | null }) => void;
}

export function SupplierPicker({ value, guess, preselectedName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(preselectedName ?? null);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Якщо counterpartyId передано без name (наприклад, при mount після parse) —
  // підвантажимо name одноразово з search-endpoint-у.
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

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        params.set("take", "20");
        const res = await fetch(`/api/foreman/counterparties?${params}`, {
          cache: "no-store",
        });
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

  // Compact summary state.
  if (!open) {
    if (value) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="flex-1 min-w-0 truncate text-xs text-emerald-300 bg-emerald-500/10 rounded px-2 py-1.5">
            ✓ {resolvedName ?? "Постачальник"}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[10px] text-zinc-400 hover:text-white px-2 py-1.5 rounded bg-zinc-800"
          >
            Змінити
          </button>
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-rose-400 px-2 py-1.5 rounded bg-rose-500/10"
            title="Прибрати"
          >
            ✕
          </button>
        </div>
      );
    }
    if (guess) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="flex-1 min-w-0 truncate text-xs text-amber-300 bg-amber-500/10 rounded px-2 py-1.5">
            🤖 AI: {guess}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch(guess);
              setOpen(true);
            }}
            className="text-[10px] text-emerald-300 px-2 py-1.5 rounded bg-emerald-500/15"
          >
            Вибрати/створити
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-xs text-zinc-400 bg-zinc-800/60 rounded px-3 py-2 active:bg-zinc-700 transition"
      >
        + Постачальник (опційно для матеріалу)
      </button>
    );
  }

  // Search panel.
  const exact = results.find(
    (r) => r.name.trim().toLowerCase() === search.trim().toLowerCase(),
  );
  const showCreateOption = search.trim().length >= 2 && !exact && !loading;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Будхата, Епіцентр…"
          className="flex-1 px-2 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-white text-sm focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
          className="text-[10px] text-zinc-500 px-2 py-1.5 rounded"
        >
          Закрити
        </button>
      </div>
      <div className="max-h-44 overflow-y-auto -mx-1 px-1 space-y-1">
        {loading && (
          <div className="text-[11px] text-zinc-500 px-2 py-1">Шукаємо…</div>
        )}
        {!loading && results.length === 0 && search.trim() === "" && (
          <div className="text-[11px] text-zinc-500 px-2 py-1">
            Почніть вводити назву постачальника.
          </div>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => pick(r)}
            className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded text-xs bg-zinc-900 active:bg-emerald-500/15"
          >
            <span className="truncate text-white">{r.name}</span>
            {r.edrpou && (
              <span className="text-[10px] text-zinc-500 tabular-nums">
                {r.edrpou}
              </span>
            )}
          </button>
        ))}
        {showCreateOption && (
          <button
            type="button"
            onClick={() => createNew(search)}
            disabled={creating}
            className="w-full text-left px-2 py-1.5 rounded text-xs bg-emerald-500/10 text-emerald-300 active:bg-emerald-500/25 disabled:opacity-60"
          >
            {creating
              ? "Створення…"
              : `+ Створити нового: «${search.trim()}»`}
          </button>
        )}
      </div>
    </div>
  );
}
