"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Eye, Pencil, Sparkles } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

// Компактний набір markdown-стилів для прев'ю нотатки.
const MD = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...p} className="mt-3 mb-2 text-lg font-bold" style={{ color: T.textPrimary }} />
  ),
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...p} className="mt-3 mb-1.5 text-base font-bold" style={{ color: T.textPrimary }} />
  ),
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...p} className="mt-2 mb-1 text-sm font-bold" style={{ color: T.textPrimary }} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...p} className="my-1.5 leading-relaxed" />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul {...p} className="my-1.5 list-disc space-y-0.5 pl-5" />
  ),
  ol: (p: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol {...p} className="my-1.5 list-decimal space-y-0.5 pl-5" />
  ),
  strong: (p: React.HTMLAttributes<HTMLElement>) => (
    <strong {...p} style={{ color: T.textPrimary, fontWeight: 700 }} />
  ),
  a: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...p} target="_blank" rel="noreferrer noopener" className="underline" style={{ color: T.accentPrimary }} />
  ),
  blockquote: (p: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      {...p}
      className="my-2 pl-3 italic"
      style={{ borderLeft: `3px solid ${T.borderStrong}`, color: T.textSecondary }}
    />
  ),
  code: (p: React.HTMLAttributes<HTMLElement>) => (
    <code
      {...p}
      className="rounded px-1 py-0.5 text-[12px]"
      style={{ background: T.panel, color: T.textPrimary, fontFamily: "ui-monospace, Menlo, monospace" }}
    />
  ),
  hr: () => <hr className="my-3 border-0" style={{ borderTop: `1px solid ${T.borderSoft}` }} />,
};

const PLACEHOLDER = `Запишіть нараду текстом. Підтримується Markdown.

## Учасники
- Олег, Сергій

## Обговорили
- Бюджет на травень
- Графік постачань

## Рішення
- Затвердили постачальника цегли

## Задачі
- Сергій: підготувати рахунок до п'ятниці`;

export function MeetingNoteEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const chars = value.trim().length;

  return (
    <div
      className="rounded-xl"
      style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: T.borderSoft }}
      >
        <div
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: T.textPrimary }}
        >
          <FileText size={16} style={{ color: T.accentPrimary }} />
          Текст наради
        </div>
        <div
          className="flex gap-0.5 rounded-lg p-0.5"
          style={{ background: T.panelElevated }}
        >
          <ToggleBtn
            active={tab === "write"}
            onClick={() => setTab("write")}
            icon={<Pencil size={13} />}
            label="Текст"
          />
          <ToggleBtn
            active={tab === "preview"}
            onClick={() => setTab("preview")}
            icon={<Eye size={13} />}
            label="Перегляд"
            disabled={!value.trim()}
          />
        </div>
      </div>

      <div className="p-4">
        {tab === "write" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={14}
            placeholder={PLACEHOLDER}
            className="w-full resize-y rounded-lg p-3 text-sm leading-relaxed outline-none"
            style={{
              background: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
              minHeight: 300,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
        ) : (
          <div
            className="rounded-lg p-3 text-sm leading-relaxed"
            style={{
              background: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              minHeight: 300,
              color: T.textPrimary,
            }}
          >
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                {value}
              </ReactMarkdown>
            ) : (
              <span style={{ color: T.textMuted }}>Текст порожній</span>
            )}
          </div>
        )}
        <p
          className="mt-2 flex items-center gap-1.5 text-xs"
          style={{ color: T.textMuted }}
        >
          <Sparkles size={12} style={{ color: T.accentPrimary }} />
          {chars > 0 ? `${chars} символів · ` : ""}
          AI зробить структурований підсумок із цього тексту. Оригінал
          збережеться без змін.
        </p>
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40"
      style={{
        background: active ? T.panel : "transparent",
        color: active ? T.accentPrimary : T.textSecondary,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
