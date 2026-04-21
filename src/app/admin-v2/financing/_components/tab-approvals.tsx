"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Check,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  FileText,
  Paperclip,
  Calendar,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { FinanceEntryDTO } from "./types";

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return "щойно";
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} год тому`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} дн тому`;
  return formatDateShort(dateStr);
}

export function TabApprovals({
  entries,
  loading,
  error,
  onEdit,
  onRefresh,
}: {
  entries: FinanceEntryDTO[];
  loading: boolean;
  error: string | null;
  onEdit: (e: FinanceEntryDTO) => void;
  onRefresh: () => void;
}) {
  const pendingEntries = useMemo(() => {
    return entries
      .filter((e) => e.status === "PENDING" && !e.isArchived)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-20 text-sm"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <AlertCircle size={32} style={{ color: T.danger }} />
        <span className="text-[14px]" style={{ color: T.danger }}>{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 rounded-2xl p-4"
        style={{ backgroundColor: T.warningSoft, border: `1px solid ${T.warning}30` }}
      >
        <div className="flex items-center gap-2">
          <Clock size={18} style={{ color: T.warning }} />
          <div>
            <div className="text-[14px] font-bold" style={{ color: T.warning }}>
              Чеки на погодженні
            </div>
            <div className="text-[11px]" style={{ color: T.textSecondary }}>
              Після підтвердження запис потрапить у Факт витрати/доходи
            </div>
          </div>
        </div>
        <div className="text-[24px] font-bold" style={{ color: T.warning }}>
          {pendingEntries.length}
        </div>
      </div>

      {pendingEntries.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 py-20 text-center rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
        >
          <Check size={32} style={{ color: T.success }} />
          <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Все погоджено
          </span>
          <span className="text-[12px]">Немає чеків, які очікують погодження</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {pendingEntries.map((entry) => (
            <ApprovalCard
              key={entry.id}
              entry={entry}
              onEdit={() => onEdit(entry)}
              onChanged={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  entry,
  onEdit,
  onChanged,
}: {
  entry: FinanceEntryDTO;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<"approve" | "reject" | "remind" | null>(null);

  async function patchStatus(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/financing/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${res.status}`);
    }
  }

  async function handleApprove() {
    setPending("approve");
    try {
      await patchStatus({ status: "PAID" });
      onChanged();
    } catch (err: any) {
      alert(err?.message ?? "Помилка погодження");
    } finally {
      setPending(null);
    }
  }

  async function handleReject() {
    if (!confirm("Відхилити цей чек? Він повернеться у чернетки.")) return;
    setPending("reject");
    try {
      await patchStatus({ status: "DRAFT" });
      onChanged();
    } catch (err: any) {
      alert(err?.message ?? "Помилка відхилення");
    } finally {
      setPending(null);
    }
  }

  async function handleRemind() {
    setPending("remind");
    try {
      await patchStatus({ remindInMinutes: 60 });
      alert("⏰ Нагадаю через 1 годину");
      onChanged();
    } catch (err: any) {
      alert(err?.message ?? "Помилка встановлення нагадування");
    } finally {
      setPending(null);
    }
  }

  const amount = Number(entry.amount);
  const isIncome = entry.type === "INCOME";
  const amountColor = isIncome ? T.success : T.danger;
  const hasReminder = entry.remindAt != null;
  const busy = pending !== null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,auto] gap-4 p-4 items-start">
        {/* Left — type icon */}
        <div
          className="flex items-center justify-center rounded-xl h-12 w-12 flex-shrink-0"
          style={{
            backgroundColor: isIncome ? T.successSoft : T.dangerSoft,
            color: amountColor,
          }}
        >
          {isIncome ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
        </div>

        {/* Center — content */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                className="text-[15px] font-bold truncate cursor-pointer hover:underline"
                style={{ color: T.textPrimary }}
                onClick={onEdit}
              >
                {entry.title}
              </span>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: T.textMuted }}>
                <span className="inline-flex items-center gap-1">
                  <Calendar size={10} />
                  {formatDateShort(entry.occurredAt)}
                </span>
                {entry.createdBy && (
                  <>
                    <span>·</span>
                    <span>від {entry.createdBy.name}</span>
                  </>
                )}
                <span>·</span>
                <span>{formatRelativeTime(entry.createdAt)}</span>
                {entry.attachments.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Paperclip size={10} /> {entry.attachments.length}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="text-[18px] font-bold whitespace-nowrap" style={{ color: amountColor }}>
              {isIncome ? "+" : "−"}
              {formatCurrency(amount)}
            </span>
          </div>

          {entry.counterparty && (
            <div className="text-[12px]" style={{ color: T.textSecondary }}>
              🏢 {entry.counterparty}
            </div>
          )}

          {entry.project && (
            <div className="text-[11px]" style={{ color: T.textMuted }}>
              📁 {entry.project.title}
            </div>
          )}

          {entry.description && (
            <div
              className="text-[11px] line-clamp-3 whitespace-pre-line mt-1 p-2 rounded"
              style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
            >
              {entry.description}
            </div>
          )}

          {hasReminder && (
            <div
              className="inline-flex items-center gap-1 self-start rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: T.warningSoft, color: T.warning }}
            >
              <Clock size={10} /> Нагадування активне
            </div>
          )}
        </div>

        {/* Right — actions */}
        <div className="flex md:flex-col gap-2 flex-shrink-0">
          <button
            onClick={handleApprove}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50 flex-1 md:flex-none min-w-[140px]"
            style={{ backgroundColor: T.success }}
          >
            {pending === "approve" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Підтвердити
          </button>
          <button
            onClick={handleRemind}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold transition hover:brightness-110 disabled:opacity-50 flex-1 md:flex-none min-w-[140px]"
            style={{ backgroundColor: T.warningSoft, color: T.warning, border: `1px solid ${T.warning}` }}
          >
            {pending === "remind" ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
            За 1 годину
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold transition hover:brightness-110 disabled:opacity-50 flex-1 md:flex-none min-w-[140px]"
            style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
          >
            {pending === "reject" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            Відхилити
          </button>
          <button
            onClick={onEdit}
            disabled={busy}
            className="flex items-center justify-center gap-1 text-[10px] font-semibold self-center"
            style={{ color: T.accentPrimary }}
          >
            Деталі <ExternalLink size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
