"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Save,
  Smile,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { financeCategoriesForType } from "@/lib/constants";

export type TemplateDraft = {
  name: string;
  defaultAmount: string;
  type: "EXPENSE" | "INCOME";
  category: string;
  counterparty: string;
  description: string;
  emoji: string;
};

type EmojiGroup = { label: string; emojis: string[] };

const EMOJI_GROUPS: EmojiGroup[] = [
  { label: "Гроші", emojis: ["💰", "💸", "💳", "🏦", "💵", "💴", "💶", "💷", "🪙", "📊", "📈", "📉"] },
  { label: "Офіс", emojis: ["🏢", "🏠", "🏗️", "🏪", "🏬", "🏛️", "🏭", "🏤", "📦", "📁", "📋", "🗂️"] },
  { label: "Обʼєкт", emojis: ["🔧", "🔨", "🪛", "🪚", "🪓", "🧱", "🪜", "🚧", "⚒️", "🛠️", "⚙️", "🪤"] },
  { label: "Транспорт", emojis: ["🚗", "🚙", "🚐", "🚚", "🚛", "🛻", "⛽", "🛢️", "🚜", "🚧", "🅿️", "🚦"] },
  { label: "Команда", emojis: ["👥", "👷", "👨‍💼", "👩‍💼", "🧑‍🔧", "🧑‍🏭", "🤝", "💼", "📞", "💬", "✉️", "📧"] },
  { label: "Побут", emojis: ["☕", "🍪", "🍕", "🥪", "🧻", "💡", "🔌", "📱", "💻", "🖥️", "🖨️", "🪑"] },
  { label: "Інше", emojis: ["🎯", "⭐", "🔥", "⚡", "🎁", "🎉", "📌", "🔔", "📅", "⏰", "✅", "📝"] },
];

const ALL_EMOJI = EMOJI_GROUPS.flatMap((g) => g.emojis);

export function TemplateFormModal({
  open,
  editing,
  draft,
  saving,
  error,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  editing: boolean;
  draft: TemplateDraft;
  saving: boolean;
  error: string | null;
  onChange: (next: TemplateDraft) => void;
  onClose: () => void;
  onSave: () => Promise<boolean> | boolean;
  onDelete?: () => void;
}) {
  const reduce = useReducedMotion();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset success badge when modal toggles
  useEffect(() => {
    if (!open) setShowSuccess(false);
  }, [open]);

  // Esc to close + initial focus
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 100);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(t);
    };
  }, [open, onClose]);

  const availableCategories = useMemo(
    () => financeCategoriesForType(draft.type),
    [draft.type]
  );
  const tint = draft.type === "EXPENSE" ? T.danger : T.success;

  const numericAmount = Number(draft.defaultAmount);
  const previewAmount = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : 0;

  function update<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  async function handleSave() {
    const ok = await onSave();
    if (ok) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1100);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => {
            if (e.target === overlayRef.current) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
              boxShadow: T.shadow2,
              maxHeight: "92vh",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between gap-3 px-6 py-4 border-b"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: T.panelElevated,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <motion.div
                  initial={false}
                  animate={{ backgroundColor: tint + "1a", color: tint }}
                  transition={{ duration: 0.25 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                >
                  {draft.type === "EXPENSE" ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                </motion.div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold truncate" style={{ color: T.textPrimary }}>
                    {editing ? "Редагувати шаблон" : "Новий шаблон"}
                  </h3>
                  <p className="text-[10.5px]" style={{ color: T.textMuted }}>
                    Запис одним кліком — заповніть один раз
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-black/10"
                style={{ color: T.textMuted }}
                aria-label="Закрити"
              >
                <X size={16} />
              </button>
            </div>

            {/* Live preview */}
            <div className="px-6 pt-4 pb-2">
              <div
                className="rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors"
                style={{
                  backgroundColor: draft.type === "EXPENSE"
                    ? "rgba(220,38,38,0.06)"
                    : "rgba(22,163,74,0.07)",
                  border: `1px solid ${tint}33`,
                }}
              >
                <span className="text-[26px] leading-none w-9 text-center flex-shrink-0">
                  {draft.emoji || (draft.type === "INCOME" ? "💰" : "💸")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate" style={{ color: T.textPrimary }}>
                    {draft.name.trim() || "Назва шаблону"}
                  </div>
                  <div className="text-[10.5px] truncate" style={{ color: T.textMuted }}>
                    {draft.type === "EXPENSE" ? "Витрата" : "Дохід"}
                    {draft.counterparty.trim() && ` · ${draft.counterparty.trim()}`}
                  </div>
                </div>
                <motion.div
                  key={previewAmount}
                  initial={reduce ? false : { scale: 0.85, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-[16px] font-bold tabular-nums flex-shrink-0"
                  style={{ color: tint }}
                >
                  {draft.type === "EXPENSE" ? "−" : "+"}
                  {formatCurrency(previewAmount)}
                </motion.div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-4">
              {/* Type segmented control with sliding indicator */}
              <SegmentedControl
                value={draft.type}
                onChange={(t) => onChange({ ...draft, type: t, category: "" })}
              />

              {/* Name + emoji */}
              <Field label="Назва шаблону">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((s) => !s)}
                    className="relative w-12 h-12 rounded-xl flex items-center justify-center text-[22px] transition hover:brightness-110"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                    }}
                    aria-label="Обрати емодзі"
                    title="Обрати емодзі"
                  >
                    {draft.emoji || <Smile size={18} style={{ color: T.textMuted }} />}
                  </button>
                  <input
                    ref={firstFieldRef}
                    type="text"
                    value={draft.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Чай, Оренда, Зарплата менеджера…"
                    className="flex-1 rounded-xl px-3.5 text-[13.5px] outline-none transition"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                </div>
                <AnimatePresence initial={false}>
                  {emojiOpen && (
                    <motion.div
                      key="emoji-picker"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="mt-2 rounded-xl p-2 flex flex-col gap-2"
                        style={{
                          backgroundColor: T.panelSoft,
                          border: `1px solid ${T.borderSoft}`,
                        }}
                      >
                        {EMOJI_GROUPS.map((group) => (
                          <div key={group.label}>
                            <div className="text-[9.5px] font-bold tracking-wider mb-1 px-1" style={{ color: T.textMuted }}>
                              {group.label.toUpperCase()}
                            </div>
                            <div className="grid grid-cols-12 gap-1">
                              {group.emojis.map((emo) => {
                                const active = draft.emoji === emo;
                                return (
                                  <motion.button
                                    key={emo}
                                    type="button"
                                    whileHover={reduce ? {} : { scale: 1.18 }}
                                    whileTap={reduce ? {} : { scale: 0.94 }}
                                    onClick={() => {
                                      update("emoji", emo);
                                      setEmojiOpen(false);
                                    }}
                                    className="aspect-square rounded-lg text-[16px] flex items-center justify-center transition"
                                    style={{
                                      backgroundColor: active ? T.accentPrimary + "22" : "transparent",
                                      border: `1px solid ${active ? T.accentPrimary : "transparent"}`,
                                    }}
                                  >
                                    {emo}
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {!emojiOpen && draft.emoji === "" && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ALL_EMOJI.slice(0, 12).map((emo) => (
                      <motion.button
                        key={emo}
                        type="button"
                        whileTap={reduce ? {} : { scale: 0.92 }}
                        onClick={() => update("emoji", emo)}
                        className="w-7 h-7 rounded-lg text-[14px] flex items-center justify-center transition hover:brightness-110"
                        style={{
                          backgroundColor: T.panelSoft,
                          border: `1px solid ${T.borderSoft}`,
                        }}
                      >
                        {emo}
                      </motion.button>
                    ))}
                  </div>
                )}
              </Field>

              {/* Amount */}
              <Field label="Сума за замовчуванням">
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={draft.defaultAmount}
                    onChange={(e) => update("defaultAmount", e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-xl px-3.5 py-3 pr-12 text-[18px] font-bold tabular-nums outline-none transition"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: tint,
                    }}
                  />
                  <span
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-bold pointer-events-none"
                    style={{ color: T.textMuted }}
                  >
                    ₴
                  </span>
                </div>
                {previewAmount > 0 && (
                  <span className="text-[10.5px] mt-0.5" style={{ color: T.textMuted }}>
                    {formatCurrency(previewAmount)} — буде підставлено при створенні запису
                  </span>
                )}
              </Field>

              {/* Category */}
              <Field label="Категорія">
                <div className="relative">
                  <select
                    value={draft.category}
                    onChange={(e) => update("category", e.target.value)}
                    className="w-full appearance-none rounded-xl px-3.5 py-3 pr-10 text-[13.5px] outline-none transition cursor-pointer"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: draft.category ? T.textPrimary : T.textMuted,
                    }}
                  >
                    <option value="">— Оберіть категорію —</option>
                    {availableCategories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: T.textMuted }}
                  />
                </div>
              </Field>

              {/* Counterparty */}
              <Field label="Контрагент" hint="опційно — постачальник, орендодавець, працівник">
                <input
                  type="text"
                  value={draft.counterparty}
                  onChange={(e) => update("counterparty", e.target.value)}
                  placeholder="Епіцентр, ТзОВ Альфа, Іван Петренко…"
                  className="w-full rounded-xl px-3.5 py-3 text-[13.5px] outline-none transition"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    key="err"
                    initial={{ opacity: 0, height: 0, x: -6 }}
                    animate={{ opacity: 1, height: "auto", x: [0, -4, 4, -2, 2, 0] }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-lg px-3.5 py-2 text-[11.5px] font-medium"
                    style={{
                      backgroundColor: T.dangerSoft,
                      color: T.danger,
                      border: `1px solid ${T.danger}55`,
                    }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-2 px-6 py-4 border-t"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: T.panelElevated,
              }}
            >
              {editing && onDelete ? (
                <motion.button
                  whileTap={reduce ? {} : { scale: 0.96 }}
                  onClick={onDelete}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition"
                  style={{
                    backgroundColor: T.dangerSoft,
                    color: T.danger,
                    border: `1px solid ${T.danger}55`,
                  }}
                >
                  <Trash2 size={12} /> Видалити
                </motion.button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:brightness-110"
                  style={{ color: T.textSecondary }}
                >
                  Скасувати
                </button>
                <motion.button
                  whileTap={reduce || saving ? {} : { scale: 0.97 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-60 transition"
                  style={{
                    backgroundColor: showSuccess ? T.success : T.accentPrimary,
                    boxShadow: showSuccess ? `0 0 0 4px ${T.success}33` : "none",
                  }}
                >
                  {saving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : showSuccess ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <Save size={13} />
                  )}
                  {showSuccess ? "Збережено" : "Зберегти"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[10.5px] font-bold tracking-wider uppercase"
          style={{ color: T.textMuted }}
        >
          {label}
        </span>
        {hint && (
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
}: {
  value: "EXPENSE" | "INCOME";
  onChange: (v: "EXPENSE" | "INCOME") => void;
}) {
  const reduce = useReducedMotion();
  const options: Array<{ key: "EXPENSE" | "INCOME"; label: string; icon: typeof TrendingDown; color: string }> = [
    { key: "EXPENSE", label: "Витрата", icon: TrendingDown, color: T.danger },
    { key: "INCOME", label: "Дохід", icon: TrendingUp, color: T.success },
  ];

  return (
    <div
      className="relative grid grid-cols-2 gap-1 rounded-2xl p-1"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className="relative z-10 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold transition-colors"
            style={{
              color: active ? "#fff" : T.textSecondary,
            }}
          >
            {active && (
              <motion.span
                layoutId="seg-active"
                className="absolute inset-0 rounded-xl -z-10"
                style={{ backgroundColor: opt.color, boxShadow: `0 4px 14px ${opt.color}55` }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", damping: 22, stiffness: 320 }
                }
              />
            )}
            <Icon size={13} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
