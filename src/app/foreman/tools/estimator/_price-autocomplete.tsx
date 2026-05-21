"use client";

import { useEffect, useRef, useState } from "react";
import { parseNum, formatMoney } from "@/lib/foreman/format";

interface Suggestion {
  id: string;
  name: string;
  unit: string | null;
  lastPrice: number | null;
  supplier: string | null;
}

// session cache shared across instances
const cache = new Map<string, Suggestion[]>();

interface Props {
  presetName: string;
  value: number;
  onChange: (value: number) => void;
}

export function PriceAutocomplete({ presetName, value, onChange }: Props) {
  const [text, setText] = useState(value > 0 ? String(value) : "");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // sync external value changes
  useEffect(() => {
    setText(value > 0 ? String(value) : "");
  }, [value]);

  // close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchSuggestions = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const key = q.trim().toLowerCase();
      if (!key) {
        setSuggestions([]);
        return;
      }
      if (cache.has(key)) {
        setSuggestions(cache.get(key)!);
        return;
      }
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/foreman/material-prices?q=${encodeURIComponent(key)}&take=6`,
          { signal: ctrl.signal },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const json = (await res.json()) as { data: Suggestion[] };
        const data = Array.isArray(json.data) ? json.data : [];
        cache.set(key, data);
        setSuggestions(data);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <div ref={wrapRef} className="relative flex-1">
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9.,]*"
        value={text}
        placeholder="Ціна, ₴"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onChange(parseNum(v));
        }}
        onFocus={() => {
          setOpen(true);
          if (suggestions.length === 0) fetchSuggestions(presetName);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") setOpen(false);
        }}
        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-white text-sm focus:border-violet-500/60 focus:outline-none"
      />
      {open && (suggestions.length > 0 || loading) && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-[11px] text-zinc-500">Шукаю…</div>
          )}
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.lastPrice != null) {
                  setText(String(s.lastPrice));
                  onChange(s.lastPrice);
                }
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 border-t border-white/5 first:border-t-0 active:bg-white/10 hover:bg-white/5 transition"
            >
              <div className="text-xs text-white truncate">{s.name}</div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                {s.lastPrice != null && (
                  <span className="text-emerald-300 font-semibold tabular-nums">
                    ₴ {formatMoney(s.lastPrice)}
                    {s.unit ? `/${s.unit}` : ""}
                  </span>
                )}
                {s.supplier && <span className="truncate">{s.supplier}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
