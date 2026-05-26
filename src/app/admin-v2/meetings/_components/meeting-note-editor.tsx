"use client";

import { useState } from "react";
import { FileText, Eye, Pencil } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MeetingMarkdown } from "./markdown";

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
          Зміст наради
          <span style={{ color: T.danger, marginLeft: 2 }}>*</span>
          <span
            className="ml-1 text-xs font-normal"
            style={{ color: T.textMuted }}
          >
            (обовʼязково — це і є нарада)
          </span>
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
              <MeetingMarkdown>{value}</MeetingMarkdown>
            ) : (
              <span style={{ color: T.textMuted }}>Текст порожній</span>
            )}
          </div>
        )}
        <p
          className="mt-2 flex items-center gap-1.5 text-xs"
          style={{ color: T.textMuted }}
        >
          <FileText size={12} style={{ color: T.textMuted }} />
          {chars > 0 ? `${chars} символів · ` : ""}
          Підтримується Markdown — заголовки, списки, таблиці, форматування.
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
