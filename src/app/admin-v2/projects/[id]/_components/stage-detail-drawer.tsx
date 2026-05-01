"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Check, Calendar, User2, Loader2, History, Ruler, ChevronRight } from "lucide-react";
import { stageDisplayName, STAGE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { StageStatus } from "@prisma/client";
import type { StageRow } from "./stage-table";
import type { ResponsibleCandidate } from "./stages-section";
import { QuickExpenseForm } from "./quick-expense-form";
import { CommentThread } from "@/components/collab/CommentThread";

const UNIT_OPTIONS = ["", "шт", "м", "м²", "м³", "кг", "т", "л", "пог.м", "год"];

type StageDetailDrawerProps = {
  projectId: string;
  projectTitle: string;
  stage: StageRow;
  /** Назва батьківського етапу — для повного breadcrumb коли відкритий підетап. */
  parentStageName?: string | null;
  candidates: ResponsibleCandidate[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

type FinanceHistoryEntry = {
  id: string;
  occurredAt: string;
  kind: "PLAN" | "FACT";
  type: "EXPENSE" | "INCOME";
  amount: string | number;
  title: string;
  description: string | null;
  counterparty: string | null;
  category: string;
  createdBy: { id: string; name: string };
};

const STATUS_COLORS: Record<StageStatus, { bg: string; fg: string }> = {
  PENDING: { bg: T.panelElevated, fg: T.textMuted },
  IN_PROGRESS: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  COMPLETED: { bg: T.successSoft, fg: T.success },
};

export function StageDetailDrawer({
  projectId,
  projectTitle,
  stage,
  parentStageName,
  candidates,
  onClose,
  onChanged,
}: StageDetailDrawerProps) {
  const [history, setHistory] = useState<FinanceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  // ESC закриває drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/stages/${stage.id}/finance-entries`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const json = (await res.json()) as { data: FinanceHistoryEntry[] };
        setHistory(json.data ?? []);
      }
    } catch (err) {
      console.error("[stage-drawer] history load failed", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id]);

  async function patchStage(data: Record<string, unknown>, fieldKey: string) {
    setSavingField(fieldKey);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/stages/${stage.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка збереження");
      }
      await onChanged();
    } catch (err) {
      console.error("[stage-drawer] patch failed", err);
      alert(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSavingField(null);
    }
  }

  async function handleClose() {
    if (stage.status === "COMPLETED") {
      onClose();
      return;
    }
    if (!confirm("Закрити цей етап? Він буде позначений як «Завершено» (100%).")) return;
    setClosing(true);
    await patchStage({ status: "COMPLETED", progress: 100 }, "close");
    setClosing(false);
    onClose();
  }

  async function handleQuickAddSubmitted() {
    await Promise.all([loadHistory(), onChanged()]);
  }

  const planExpense = stage.planExpense ?? 0;
  const factExpense = stage.factExpense ?? 0;
  const budget = stage.allocatedBudget ?? 0;
  const planRef = budget > 0 ? budget : planExpense;
  const factPct = planRef > 0 ? Math.min(100, (factExpense / planRef) * 100) : 0;
  const overrun = planRef > 0 && factExpense > planRef;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[420px] flex-col shadow-2xl"
        style={{ backgroundColor: T.panel, borderLeft: `1px solid ${T.borderSoft}` }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="min-w-0 flex-1">
            {/* Breadcrumb: Проєкти › {project} › [{Підетап батько} ›] Етап */}
            <nav
              className="flex flex-wrap items-center gap-1 text-[11px]"
              style={{ color: T.textMuted }}
              aria-label="Шлях"
            >
              <Link
                href="/admin-v2/projects"
                className="transition hover:underline"
                style={{ color: T.textMuted }}
              >
                Проєкти
              </Link>
              <ChevronRight size={11} aria-hidden style={{ opacity: 0.6 }} />
              <Link
                href={`/admin-v2/projects/${projectId}`}
                className="max-w-[160px] truncate transition hover:underline"
                style={{ color: T.textSecondary, fontWeight: 500 }}
                title={projectTitle}
              >
                {projectTitle}
              </Link>
              {parentStageName && (
                <>
                  <ChevronRight size={11} aria-hidden style={{ opacity: 0.6 }} />
                  <span
                    className="max-w-[140px] truncate"
                    style={{ color: T.textSecondary }}
                    title={parentStageName}
                  >
                    {parentStageName}
                  </span>
                </>
              )}
              <ChevronRight size={11} aria-hidden style={{ opacity: 0.6 }} />
              <span style={{ color: T.textMuted }}>Етап</span>
            </nav>
            <h3
              className="mt-1.5 truncate text-[16px] font-bold"
              style={{ color: T.textPrimary }}
            >
              {stageDisplayName(stage)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition hover:brightness-95"
            style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
            aria-label="Закрити"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Properties */}
          <Section title="Параметри">
            <Row label="Статус">
              <select
                value={stage.status}
                onChange={(e) => patchStage({ status: e.target.value }, "status")}
                disabled={savingField === "status"}
                className="rounded px-2 py-1 text-[12px] font-medium"
                style={{
                  backgroundColor: STATUS_COLORS[stage.status].bg,
                  color: STATUS_COLORS[stage.status].fg,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                {(Object.keys(STAGE_STATUS_LABELS) as StageStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STAGE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Відповідальний" icon={<User2 size={12} />}>
              <input
                type="text"
                list="drawer-responsible-list"
                defaultValue={stage.responsibleName ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (stage.responsibleName ?? "")) {
                    patchStage({ responsibleName: v || null }, "responsible");
                  }
                }}
                disabled={savingField === "responsible"}
                placeholder="Імʼя або підрядник"
                className="w-full rounded border px-2 py-1 text-[12px]"
                style={{
                  backgroundColor: T.panel,
                  borderColor: T.borderSoft,
                  color: stage.responsibleName ? T.textPrimary : T.textMuted,
                }}
              />
              <datalist id="drawer-responsible-list">
                {candidates.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </Row>
            <Row label="Початок" icon={<Calendar size={12} />}>
              <DateInput
                value={stage.startDate}
                onChange={(v) => patchStage({ startDate: v }, "startDate")}
                disabled={savingField === "startDate"}
              />
            </Row>
            <Row label="Завершення" icon={<Calendar size={12} />}>
              <DateInput
                value={stage.endDate}
                onChange={(v) => patchStage({ endDate: v }, "endDate")}
                disabled={savingField === "endDate"}
              />
            </Row>
            <Row label="Прогрес">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={stage.progress}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    if (v !== stage.progress) patchStage({ progress: v }, "progress");
                  }}
                  disabled={savingField === "progress"}
                  className="w-16 rounded border px-2 py-1 text-[12px]"
                  style={{
                    backgroundColor: T.panel,
                    borderColor: T.borderSoft,
                    color: T.textPrimary,
                  }}
                />
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  %
                </span>
              </div>
            </Row>
            <Row label="Бюджет">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  defaultValue={stage.allocatedBudget ?? ""}
                  onBlur={(e) => {
                    const raw = e.target.value;
                    const v = raw === "" ? null : Number(raw);
                    if (v !== stage.allocatedBudget) patchStage({ allocatedBudget: v }, "budget");
                  }}
                  disabled={savingField === "budget"}
                  placeholder="0"
                  className="w-28 rounded border px-2 py-1 text-right text-[12px]"
                  style={{
                    backgroundColor: T.panel,
                    borderColor: T.borderSoft,
                    color: T.textPrimary,
                  }}
                />
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  ₴
                </span>
              </div>
            </Row>
          </Section>

          <Section title="План">
            <Row label="Од. виміру" icon={<Ruler size={12} />}>
              <select
                value={stage.unit ?? ""}
                onChange={(e) => patchStage({ unit: e.target.value || null }, "unit")}
                disabled={savingField === "unit"}
                className="rounded border px-2 py-1 text-[12px]"
                style={{
                  backgroundColor: T.panel,
                  borderColor: T.borderSoft,
                  color: stage.unit ? T.textPrimary : T.textMuted,
                }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u || "—"}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Обсяг">
              <NumInput
                value={stage.planVolume}
                disabled={savingField === "planVolume"}
                step="0.001"
                onCommit={(v) => patchStage({ planVolume: v }, "planVolume")}
              />
            </Row>
            <Row label="Вартість за од.">
              <NumInput
                value={stage.planUnitPrice}
                disabled={savingField === "planUnitPrice"}
                suffix="₴"
                onCommit={(v) => patchStage({ planUnitPrice: v }, "planUnitPrice")}
              />
            </Row>
            <Row label="Вартість для замовника">
              <NumInput
                value={stage.planClientUnitPrice}
                disabled={savingField === "planClientUnitPrice"}
                suffix="₴"
                onCommit={(v) =>
                  patchStage({ planClientUnitPrice: v }, "planClientUnitPrice")
                }
              />
            </Row>
            <Row label="Витрати разом">
              <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                {formatCurrency(
                  (stage.planVolume ?? 0) * (stage.planUnitPrice ?? 0),
                )}
              </span>
            </Row>
            <Row label="Надходження">
              <span
                className="text-[12px] font-semibold"
                style={{ color: T.success }}
              >
                {formatCurrency(
                  (stage.planVolume ?? 0) * (stage.planClientUnitPrice ?? 0),
                )}
              </span>
            </Row>
          </Section>

          <Section title="Факт">
            <Row label="Од. виміру" icon={<Ruler size={12} />}>
              <select
                value={stage.factUnit ?? ""}
                onChange={(e) =>
                  patchStage({ factUnit: e.target.value || null }, "factUnit")
                }
                disabled={savingField === "factUnit"}
                className="rounded border px-2 py-1 text-[12px]"
                style={{
                  backgroundColor: T.panel,
                  borderColor: T.borderSoft,
                  color: stage.factUnit ? T.textPrimary : T.textMuted,
                }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u || "як план"}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Обсяг">
              <NumInput
                value={stage.factVolume}
                disabled={savingField === "factVolume"}
                step="0.001"
                onCommit={(v) => patchStage({ factVolume: v }, "factVolume")}
              />
            </Row>
            <Row label="Вартість за од.">
              <NumInput
                value={stage.factUnitPrice}
                disabled={savingField === "factUnitPrice"}
                suffix="₴"
                onCommit={(v) => patchStage({ factUnitPrice: v }, "factUnitPrice")}
              />
            </Row>
            <Row label="Вартість для замовника">
              <NumInput
                value={stage.factClientUnitPrice}
                disabled={savingField === "factClientUnitPrice"}
                suffix="₴"
                onCommit={(v) =>
                  patchStage({ factClientUnitPrice: v }, "factClientUnitPrice")
                }
              />
            </Row>
            <Row label="Витрати разом">
              <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                {formatCurrency(
                  (stage.factVolume ?? 0) * (stage.factUnitPrice ?? 0),
                )}
              </span>
            </Row>
            <Row label="Надходження">
              <span
                className="text-[12px] font-semibold"
                style={{ color: T.success }}
              >
                {formatCurrency(
                  (stage.factVolume ?? 0) * (stage.factClientUnitPrice ?? 0),
                )}
              </span>
            </Row>
          </Section>

          {/* Витрати */}
          <Section title="Витрати">
            <div
              className="rounded-lg p-3"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  Факт / План
                </span>
                <span
                  className="text-[14px] font-bold"
                  style={{ color: overrun ? T.danger : T.textPrimary }}
                >
                  {formatCurrency(factExpense)}{" "}
                  <span style={{ color: T.textMuted, fontWeight: 400 }}>
                    / {planRef > 0 ? formatCurrency(planRef) : "—"}
                  </span>
                </span>
              </div>
              {planRef > 0 && (
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: T.panelElevated }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${factPct}%`,
                      backgroundColor: overrun ? T.danger : T.success,
                      boxShadow: overrun ? `0 0 8px ${T.danger}55` : `0 0 8px ${T.success}55`,
                    }}
                  />
                </div>
              )}
              {overrun && (
                <div className="mt-1.5 text-[11px]" style={{ color: T.danger }}>
                  Перевитрата: {formatCurrency(factExpense - planRef)}
                </div>
              )}
            </div>

            <div className="mt-3">
              <QuickExpenseForm
                projectId={projectId}
                stageId={stage.id}
                onSubmitted={handleQuickAddSubmitted}
              />
            </div>

            <div className="mt-3">
              <div
                className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: T.textSecondary }}
              >
                <History size={12} />
                Історія ({history.length})
              </div>
              {historyLoading ? (
                <div className="flex items-center gap-2 text-[11px]" style={{ color: T.textMuted }}>
                  <Loader2 size={12} className="animate-spin" /> Завантаження…
                </div>
              ) : history.length === 0 ? (
                <div
                  className="rounded border border-dashed p-3 text-center text-[11px]"
                  style={{ borderColor: T.borderSoft, color: T.textMuted }}
                >
                  Поки записів немає. Додайте довезення вище.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-[11px]"
                      style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: T.textPrimary }}>
                          {h.title}
                        </div>
                        <div className="text-[10px]" style={{ color: T.textMuted }}>
                          {formatDate(h.occurredAt)} · {h.createdBy.name}
                          {h.kind === "PLAN" && " · план"}
                        </div>
                      </div>
                      <div
                        className="font-bold"
                        style={{
                          color: h.type === "EXPENSE" ? T.danger : T.success,
                        }}
                      >
                        {h.type === "EXPENSE" ? "−" : "+"}
                        {formatCurrency(Number(h.amount))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {/* Notes — короткий «опис ризиків» зберігається у самій моделі етапу */}
          <Section title="Нотатка">
            <textarea
              defaultValue={stage.notes ?? ""}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (stage.notes ?? "")) patchStage({ notes: v }, "notes");
              }}
              disabled={savingField === "notes"}
              placeholder="Внутрішня нотатка — особливості, ризики, домовленості…"
              rows={3}
              className="w-full rounded border px-2 py-1.5 text-[12px] outline-none"
              style={{
                backgroundColor: T.panel,
                borderColor: T.borderSoft,
                color: T.textPrimary,
              }}
            />
          </Section>

          {/* Дискусія — повноцінний потік коментарів з mention/реакціями */}
          <Section title="Обговорення">
            <CommentThread entityType="STAGE_RECORD" entityId={stage.id} />
          </Section>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-2 border-t px-5 py-3"
          style={{ borderColor: T.borderSoft }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[12px] font-medium transition"
            style={{
              backgroundColor: T.panelSoft,
              color: T.textSecondary,
            }}
          >
            Закрити
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={closing || stage.status === "COMPLETED"}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
            style={{
              backgroundColor: stage.status === "COMPLETED" ? T.successSoft : T.success,
              color: stage.status === "COMPLETED" ? T.success : "white",
            }}
          >
            {closing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {stage.status === "COMPLETED" ? "Завершено" : "Закрити задачу"}
          </button>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div
        className="mb-2 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className="flex items-center gap-1.5 text-[11px]"
        style={{ color: T.textMuted }}
      >
        {icon}
        {label}
      </div>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}

function DateInput({
  value,
  onChange,
  disabled,
}: {
  value: Date | string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const iso = value
    ? typeof value === "string"
      ? value.split("T")[0]
      : new Date(value).toISOString().split("T")[0]
    : "";
  return (
    <input
      type="date"
      defaultValue={iso}
      disabled={disabled}
      onBlur={(e) => {
        const v = e.target.value || null;
        if (v !== iso) onChange(v);
      }}
      className="rounded border px-2 py-1 text-[12px]"
      style={{
        backgroundColor: T.panel,
        borderColor: T.borderSoft,
        color: T.textPrimary,
      }}
    />
  );
}

function NumInput({
  value,
  onCommit,
  disabled,
  suffix,
  step = "1",
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  suffix?: string;
  step?: string;
}) {
  const initial = value ?? "";
  return (
    <div className="flex items-center justify-end gap-2">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        defaultValue={initial}
        disabled={disabled}
        onBlur={(e) => {
          const raw = e.target.value;
          const parsed = raw === "" ? null : Number(raw);
          if (parsed !== (value ?? null)) onCommit(parsed);
        }}
        placeholder="—"
        className="w-28 rounded border px-2 py-1 text-right text-[12px]"
        style={{
          backgroundColor: T.panel,
          borderColor: T.borderSoft,
          color: T.textPrimary,
        }}
      />
      {suffix && (
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          {suffix}
        </span>
      )}
    </div>
  );
}
