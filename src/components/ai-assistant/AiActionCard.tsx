"use client";

import { useState } from "react";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ActionData = {
  action: string;
  label: string;
  summary: string;
  params: Record<string, unknown>;
};

const ACTION_ICONS: Record<string, string> = {
  create_task: "Створити завдання",
  update_task: "Оновити завдання",
  assign_task: "Призначити виконавця",
  create_project: "Створити проєкт",
  update_project_stage: "Оновити етап",
  add_team_member: "Додати учасника",
  schedule_payment: "Запланувати платіж",
  mark_payment_paid: "Відмітити оплату",
  record_expense: "Записати витрату",
  send_notification: "Надіслати сповіщення",
  add_comment: "Додати коментар",
};

export function AiActionCard({
  actionJson,
  onConfirm,
}: {
  actionJson: string;
  onConfirm: (message: string) => void;
}) {
  const [status, setStatus] = useState<"pending" | "confirmed" | "declined">("pending");

  let data: ActionData;
  try {
    data = JSON.parse(actionJson);
  } catch {
    return null;
  }

  const actionLabel = ACTION_ICONS[data.action] || data.label || data.action;

  if (status === "confirmed") {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 my-2"
        style={{ backgroundColor: T.successSoft, border: `1px solid ${T.success}30` }}
      >
        <Check className="h-4 w-4" style={{ color: T.success }} />
        <span className="text-xs font-medium" style={{ color: T.success }}>
          Підтверджено: {actionLabel}
        </span>
      </div>
    );
  }

  if (status === "declined") {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 my-2"
        style={{ backgroundColor: T.dangerSoft, border: `1px solid ${T.danger}30` }}
      >
        <X className="h-4 w-4" style={{ color: T.danger }} />
        <span className="text-xs font-medium" style={{ color: T.danger }}>
          Скасовано
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-3.5 my-2"
      style={{
        backgroundColor: T.warningSoft,
        border: `1px solid ${T.warning}30`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4" style={{ color: T.warning }} />
        <span className="text-xs font-semibold" style={{ color: T.textPrimary }}>
          {actionLabel}
        </span>
      </div>

      {/* Summary */}
      <p className="text-[12px] mb-3 leading-relaxed" style={{ color: T.textSecondary }}>
        {data.summary}
      </p>

      {/* Params preview */}
      <div className="mb-3 rounded-lg p-2" style={{ backgroundColor: T.panelSoft }}>
        {Object.entries(data.params).map(([key, val]) => (
          <div key={key} className="flex justify-between text-[11px] py-0.5">
            <span style={{ color: T.textMuted }}>{key}</span>
            <span className="font-medium truncate ml-2 max-w-[180px]" style={{ color: T.textPrimary }}>
              {String(val)}
            </span>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setStatus("confirmed");
            onConfirm(`Підтверджую: ${data.action} — ${data.summary}`);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white active:scale-95 tap-highlight-none"
          style={{ background: `linear-gradient(135deg, ${T.success}, #059669)` }}
        >
          <Check className="h-3.5 w-3.5" />
          Підтвердити
        </button>
        <button
          onClick={() => {
            setStatus("declined");
            onConfirm("Скасовую цю дію");
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium active:scale-95 tap-highlight-none"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary, border: `1px solid ${T.borderSoft}` }}
        >
          <X className="h-3.5 w-3.5" />
          Скасувати
        </button>
      </div>
    </div>
  );
}

/**
 * Parse ```action blocks from content.
 */
export function parseActionBlocks(content: string): Array<{ type: "text" | "action"; content: string }> {
  const parts: Array<{ type: "text" | "action"; content: string }> = [];
  const regex = /```action\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "action", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}
