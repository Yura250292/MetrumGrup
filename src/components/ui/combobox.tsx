"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
  disabled?: boolean;
};

export interface ComboboxProps<O extends ComboboxOption = ComboboxOption> {
  value: string | null | undefined;
  options: O[];
  onChange: (value: string | null, option: O | null) => void;

  /** Called when the user picks the create row. Async-friendly. */
  onCreate?: (search: string) => Promise<O> | O;

  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  /** Fixed height for the dropdown list (default 260px). */
  listMaxHeight?: number;
  /** Optional custom rendering for an option row. */
  renderOption?: (opt: O, ctx: { focused: boolean; selected: boolean }) => ReactNode;
}

function defaultMatch(opt: ComboboxOption, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    opt.label.toLowerCase().includes(needle) ||
    (opt.description?.toLowerCase().includes(needle) ?? false) ||
    opt.value.toLowerCase().includes(needle)
  );
}

export function Combobox<O extends ComboboxOption = ComboboxOption>({
  value,
  options,
  onChange,
  onCreate,
  placeholder = "Оберіть…",
  searchPlaceholder = "Пошук…",
  emptyMessage = "Нічого не знайдено",
  className,
  disabled,
  required,
  allowClear = true,
  listMaxHeight = 260,
  renderOption,
}: ComboboxProps<O>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const [creating, setCreating] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(
    () => options.filter((o) => defaultMatch(o, search)),
    [options, search],
  );

  const showCreate =
    !!onCreate &&
    search.trim().length > 0 &&
    !options.some((o) => o.label.trim().toLowerCase() === search.trim().toLowerCase());

  const totalRows = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    if (focusIdx >= totalRows) setFocusIdx(Math.max(0, totalRows - 1));
  }, [focusIdx, totalRows]);

  // Click outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Focus search input on open.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Scroll focused row into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-idx="${focusIdx}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  function pick(opt: O) {
    onChange(opt.value, opt);
    setSearch("");
    setOpen(false);
  }

  async function runCreate() {
    if (!onCreate) return;
    const term = search.trim();
    if (!term) return;
    try {
      setCreating(true);
      const created = await onCreate(term);
      onChange(created.value, created);
      setSearch("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(totalRows - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showCreate && focusIdx === filtered.length) {
        void runCreate();
      } else {
        const opt = filtered[focusIdx];
        if (opt && !opt.disabled) pick(opt);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left text-sm outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-primary/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${open ? T.borderAccent : T.borderStrong}`,
          color: selected ? T.textPrimary : T.textMuted,
        }}
      >
        <span className="flex-1 truncate">{selected ? selected.label : placeholder}</span>
        <span className="flex shrink-0 items-center gap-1.5 opacity-70 transition group-hover:opacity-100">
          {allowClear && selected && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Очистити"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
              }}
              className="rounded-md p-0.5 hover:bg-black/10"
            >
              <X size={14} />
            </span>
          ) : null}
          <ChevronDown size={16} className={cn("transition", open && "rotate-180")} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl shadow-xl"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderStrong}`,
              boxShadow: T.shadow2,
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: T.borderSoft }}
            >
              <Search size={14} style={{ color: T.textMuted }} />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusIdx(0);
                }}
                onKeyDown={handleKey}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: T.textPrimary }}
              />
              {creating && <Loader2 size={14} className="animate-spin" style={{ color: T.textMuted }} />}
            </div>

            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="overflow-auto py-1"
              style={{ maxHeight: listMaxHeight }}
            >
              {filtered.length === 0 && !showCreate ? (
                <div
                  className="px-3 py-6 text-center text-sm"
                  style={{ color: T.textMuted }}
                >
                  {emptyMessage}
                </div>
              ) : (
                filtered.map((opt, idx) => {
                  const focused = idx === focusIdx;
                  const isSelected = opt.value === value;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      data-idx={idx}
                      onMouseEnter={() => setFocusIdx(idx)}
                      onClick={() => !opt.disabled && pick(opt)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition",
                        opt.disabled && "cursor-not-allowed opacity-50",
                      )}
                      style={{
                        backgroundColor: focused ? T.accentPrimarySoft : "transparent",
                        color: T.textPrimary,
                      }}
                    >
                      {renderOption ? (
                        renderOption(opt, { focused, selected: isSelected })
                      ) : (
                        <>
                          <span className="flex-1 truncate">
                            {opt.label}
                            {opt.description && (
                              <span
                                className="ml-2 text-xs"
                                style={{ color: T.textMuted }}
                              >
                                {opt.description}
                              </span>
                            )}
                          </span>
                          {isSelected && <Check size={14} style={{ color: T.accentPrimary }} />}
                        </>
                      )}
                    </div>
                  );
                })
              )}

              {showCreate && (
                <div
                  role="option"
                  aria-selected={false}
                  data-idx={filtered.length}
                  onMouseEnter={() => setFocusIdx(filtered.length)}
                  onClick={() => void runCreate()}
                  className="flex cursor-pointer items-center gap-2 border-t px-3 py-2 text-sm transition"
                  style={{
                    borderColor: T.borderSoft,
                    backgroundColor:
                      focusIdx === filtered.length ? T.accentPrimarySoft : "transparent",
                    color: T.accentPrimary,
                  }}
                >
                  <Plus size={14} />
                  <span className="flex-1 truncate">
                    Створити «<strong>{search.trim()}</strong>»
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
