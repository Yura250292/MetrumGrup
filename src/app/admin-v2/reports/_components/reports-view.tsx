"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { formatCurrencyCompact } from "@/lib/utils";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";

type Project = { id: string; title: string };
type Counterparty = { id: string; name: string };
type Employee = { id: string; fullName: string };

type PreviewEntry = {
  id: string;
  occurredAt: string;
  kind: "PLAN" | "FACT";
  type: "INCOME" | "EXPENSE";
  amount: number | string;
  currency: string;
  category: string;
  title: string;
  counterparty: string | null;
  project: { id: string; title: string } | null;
  status: "DRAFT" | "PENDING" | "APPROVED" | "PAID";
};

type PreviewSummary = {
  plan: { income: { sum: number; count: number }; expense: { sum: number; count: number } };
  fact: { income: { sum: number; count: number }; expense: { sum: number; count: number } };
  balance: number;
  count: number;
};

type Preview = {
  entries: PreviewEntry[];
  summary: PreviewSummary;
  appliedAt: Date;
};

type TemplateKey =
  | "period_overall"
  | "by_project"
  | "salary"
  | "by_counterparty"
  | "office_overhead"
  | "custom";

type Template = {
  key: TemplateKey;
  label: string;
  description: string;
  icon: typeof Banknote;
  needs: { project?: boolean; counterparty?: boolean; employee?: boolean };
  /// Pre-filled filters when this template is selected. {} = no extras.
  defaults: Record<string, string>;
  reportTitleFn: (ctx: {
    projectName?: string;
    counterpartyName?: string;
    from: string;
    to: string;
  }) => string;
};

const TEMPLATES: Template[] = [
  {
    key: "period_overall",
    label: "Загальний звіт за період",
    description:
      "Усі операції за обраний період — план/факт, доходи/витрати, баланс. Найкоротший шлях для бухгалтера/директора.",
    icon: CalendarDays,
    needs: {},
    defaults: {},
    reportTitleFn: ({ from, to }) => `Загальний фінансовий звіт ${from} – ${to}`,
  },
  {
    key: "by_project",
    label: "Звіт по проєкту",
    description:
      "Усі надходження і витрати за конкретним обʼєктом. Видно хто скільки коштує і чи є перевитрата.",
    icon: Briefcase,
    needs: { project: true },
    defaults: {},
    reportTitleFn: ({ projectName, from, to }) =>
      `Звіт по проєкту: ${projectName ?? "—"} (${from} – ${to})`,
  },
  {
    key: "salary",
    label: "Звіт по ЗП",
    description:
      "Усі нарахування ЗП за період (категорія «Зарплата»). Готівка + податки + табелі.",
    icon: Wallet,
    needs: {},
    defaults: { category: "salary" },
    reportTitleFn: ({ from, to }) => `Звіт по ЗП ${from} – ${to}`,
  },
  {
    key: "by_counterparty",
    label: "Звіт по підряднику / постачальнику",
    description:
      "Усі операції з обраним контрагентом за період. Скільки сплатили, скільки заборгували.",
    icon: Building2,
    needs: { counterparty: true },
    defaults: {},
    reportTitleFn: ({ counterpartyName, from, to }) =>
      `Операції з ${counterpartyName ?? "—"} (${from} – ${to})`,
  },
  {
    key: "office_overhead",
    label: "Офісні / накладні витрати",
    description:
      "Витрати по категоріях: оренда, комунальні, адмін, проєктування. Без проєктних витрат.",
    icon: Receipt,
    needs: {},
    defaults: { costType: "OVERHEAD" },
    reportTitleFn: ({ from, to }) => `Офісні / накладні витрати ${from} – ${to}`,
  },
  {
    key: "custom",
    label: "Власний звіт",
    description:
      "Самі виставите фільтри у вкладці «Фінансування» і завантажте через кнопку Експорт. Цей шаблон веде туди.",
    icon: FileText,
    needs: {},
    defaults: {},
    reportTitleFn: ({ from, to }) => `Фінансовий звіт ${from} – ${to}`,
  },
];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

type PresetKey = "this_month" | "last_month" | "this_quarter" | "ytd" | "last_30d";

const PERIOD_PRESETS: { key: PresetKey; label: string; range: () => [Date, Date] }[] = [
  {
    key: "this_month",
    label: "Цей місяць",
    range: () => {
      const now = new Date();
      return [startOfMonth(now), endOfMonth(now)];
    },
  },
  {
    key: "last_month",
    label: "Минулий місяць",
    range: () => {
      const now = new Date();
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [startOfMonth(lm), endOfMonth(lm)];
    },
  },
  {
    key: "this_quarter",
    label: "Цей квартал",
    range: () => {
      const now = new Date();
      return [startOfQuarter(now), endOfQuarter(now)];
    },
  },
  {
    key: "ytd",
    label: "З початку року",
    range: () => {
      const now = new Date();
      return [new Date(now.getFullYear(), 0, 1), now];
    },
  },
  {
    key: "last_30d",
    label: "Останні 30 днів",
    range: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return [from, to];
    },
  },
];

export function ReportsView({
  projects,
  counterparties,
  employees: _employees,
}: {
  projects: Project[];
  counterparties: Counterparty[];
  employees: Employee[];
}) {
  const [tplKey, setTplKey] = useState<TemplateKey>("period_overall");
  const [from, setFrom] = useState(() => isoDay(startOfMonth(new Date())));
  const [to, setTo] = useState(() => isoDay(endOfMonth(new Date())));
  const [projectId, setProjectId] = useState<string | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview state — populated by "Сформувати". Invalidated when any filter changes.
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applying, setApplying] = useState(false);

  // Stamp the inputs that produced the current preview, so we can invalidate
  // it whenever something changes downstream.
  const [previewStamp, setPreviewStamp] = useState<string | null>(null);
  const currentStamp = `${tplKey}|${from}|${to}|${projectId ?? ""}|${counterpartyId ?? ""}`;
  const isStale = preview !== null && previewStamp !== currentStamp;

  const tpl = useMemo(() => TEMPLATES.find((t) => t.key === tplKey)!, [tplKey]);

  const projectOptions: ComboboxOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.title })),
    [projects],
  );
  const counterpartyOptions: ComboboxOption[] = useMemo(
    () => counterparties.map((c) => ({ value: c.id, label: c.name })),
    [counterparties],
  );

  function applyPreset(key: PresetKey) {
    const preset = PERIOD_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const [f, t] = preset.range();
    setFrom(isoDay(f));
    setTo(isoDay(t));
  }

  function buildQuery(): URLSearchParams | null {
    setError(null);
    if (tpl.needs.project && !projectId) {
      setError("Виберіть проєкт для цього шаблону");
      return null;
    }
    if (tpl.needs.counterparty && !counterpartyId) {
      setError("Виберіть контрагента для цього шаблону");
      return null;
    }

    const params = new URLSearchParams();
    params.set("archived", "false");
    if (from) params.set("from", new Date(from).toISOString());
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      params.set("to", d.toISOString());
    }
    for (const [k, v] of Object.entries(tpl.defaults)) {
      params.set(k, v);
    }
    if (tpl.needs.project && projectId) params.set("projectId", projectId);
    if (tpl.needs.counterparty && counterpartyId) params.set("counterpartyId", counterpartyId);

    const projectName = projectId
      ? projects.find((p) => p.id === projectId)?.title
      : undefined;
    const counterpartyName = counterpartyId
      ? counterparties.find((c) => c.id === counterpartyId)?.name
      : undefined;
    const title = tpl.reportTitleFn({
      projectName,
      counterpartyName,
      from,
      to,
    });
    params.set("title", title);

    return params;
  }

  async function applyPreview() {
    if (tpl.key === "custom") {
      window.location.href = "/admin-v2/financing";
      return;
    }
    const params = buildQuery();
    if (!params) return;

    setApplying(true);
    setPreview(null);
    try {
      // Reuse the standard list endpoint — same filters that the export uses,
      // returns {data, summary}. No extra server work needed.
      const res = await fetch(`/api/admin/financing?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Помилка завантаження звіту");
      }
      const json = await res.json();
      setPreview({
        entries: json.data ?? [],
        summary: json.summary,
        appliedAt: new Date(),
      });
      setPreviewStamp(currentStamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setApplying(false);
    }
  }

  async function download(format: "xlsx" | "pdf") {
    if (tpl.key === "custom") {
      window.location.href = "/admin-v2/financing";
      return;
    }
    const params = buildQuery();
    if (!params) return;
    params.set("format", format);

    setDownloading(format);
    try {
      const res = await fetch(`/api/admin/financing/export?${params}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Помилка експорту");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = (params.get("title") ?? "report").replace(/[/\\?*:|"<>]/g, "_");
      a.download = `${safeTitle}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <FileText size={22} style={{ color: T.textPrimary }} />
        <h1 className="text-2xl font-bold" style={{ color: T.textPrimary }}>
          Звіти
        </h1>
        <span className="text-[12px]" style={{ color: T.textMuted }}>
          оберіть шаблон → задайте період → завантажте PDF або Excel
        </span>
      </div>

      {/* Templates grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const active = tplKey === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTplKey(t.key)}
              className="flex flex-col gap-1.5 rounded-2xl px-4 py-3.5 text-left transition"
              style={{
                backgroundColor: active ? T.accentPrimarySoft : T.panel,
                border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
              }}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} style={{ color: active ? T.accentPrimary : T.textSecondary }} />
                <span
                  className="text-[13px] font-bold"
                  style={{ color: active ? T.accentPrimary : T.textPrimary }}
                >
                  {t.label}
                </span>
              </div>
              <p className="text-[11.5px] leading-snug" style={{ color: T.textMuted }}>
                {t.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Configurator */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Період
          </span>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textSecondary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="З">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
                colorScheme: "dark",
              }}
            />
          </Field>
          <Field label="По">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
                colorScheme: "dark",
              }}
            />
          </Field>

          {tpl.needs.project && (
            <Field label="Проєкт" required>
              <Combobox
                value={projectId}
                options={projectOptions}
                onChange={(id) => setProjectId(id)}
                placeholder="Оберіть проєкт…"
                searchPlaceholder="Пошук проєкту…"
                emptyMessage="Проєктів нема"
              />
            </Field>
          )}

          {tpl.needs.counterparty && (
            <Field label="Контрагент" required>
              <Combobox
                value={counterpartyId}
                options={counterpartyOptions}
                onChange={(id) => setCounterpartyId(id)}
                placeholder="Оберіть контрагента…"
                searchPlaceholder="Пошук…"
                emptyMessage="Контрагентів нема"
              />
            </Field>
          )}
        </div>

        {/* Preview of what's going to be in the report */}
        <div
          className="mt-4 rounded-xl px-3 py-2.5 text-[12px]"
          style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
        >
          <strong style={{ color: T.textPrimary }}>{tpl.label}</strong>
          {" · "}
          <span>
            {format(new Date(from), "d MMM", { locale: uk })} –{" "}
            {format(new Date(to), "d MMM yyyy", { locale: uk })}
          </span>
          {Object.entries(tpl.defaults).length > 0 && (
            <span>
              {" · "}
              {Object.entries(tpl.defaults)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </span>
          )}
        </div>

        {error && (
          <div
            className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}40`,
            }}
          >
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {tpl.key === "custom" ? (
            <button
              onClick={() => download("xlsx")}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              Перейти у Фінансування →
            </button>
          ) : (
            <button
              onClick={applyPreview}
              disabled={applying}
              className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[12.5px] font-bold disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              {applying ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {preview ? "Сформувати знову" : "Сформувати звіт"}
            </button>
          )}
        </div>
      </div>

      {/* Preview block — appears after Apply succeeds */}
      {preview && tpl.key !== "custom" && (
        <PreviewBlock
          preview={preview}
          isStale={isStale}
          downloading={downloading}
          onDownload={download}
          tplLabel={tpl.label}
          from={from}
          to={to}
        />
      )}

      <div className="text-[11px]" style={{ color: T.textMuted }}>
        Звіти включають усі не-архівні операції за період. Архівні — окремо у вкладці «Архів».
        Для дуже великих звітів (понад 500 рядків) PDF показує перші 500; повний список — Excel.
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<PreviewEntry["status"], string> = {
  DRAFT: "Чернетка",
  PENDING: "На погодж.",
  APPROVED: "Підтв.",
  PAID: "Оплачено",
};

function PreviewBlock({
  preview,
  isStale,
  downloading,
  onDownload,
  tplLabel,
  from,
  to,
}: {
  preview: Preview;
  isStale: boolean;
  downloading: "xlsx" | "pdf" | null;
  onDownload: (f: "xlsx" | "pdf") => void;
  tplLabel: string;
  from: string;
  to: string;
}) {
  const { entries, summary } = preview;
  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const factBalance = summary.fact.income.sum - summary.fact.expense.sum;

  const previewRows = entries.slice(0, 50);

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${isStale ? T.warning + "60" : T.borderStrong}`,
      }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: T.borderSoft }}>
        <CheckCircle2 size={16} style={{ color: T.success }} />
        <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Результат
        </span>
        <span className="text-[12px]" style={{ color: T.textMuted }}>
          · {tplLabel} · {format(new Date(from), "d MMM", { locale: uk })} –{" "}
          {format(new Date(to), "d MMM yyyy", { locale: uk })} ·{" "}
          {summary.count} записів
        </span>
        {isStale && (
          <span
            className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ backgroundColor: T.warningSoft, color: T.warning }}
          >
            ⚠ Фільтри змінено — натисніть «Сформувати знову»
          </span>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          label="План — доходи"
          value={summary.plan.income.sum}
          count={summary.plan.income.count}
          tone="muted"
          icon={<TrendingUp size={11} />}
        />
        <Kpi
          label="План — витрати"
          value={summary.plan.expense.sum}
          count={summary.plan.expense.count}
          tone="muted"
          icon={<TrendingDown size={11} />}
        />
        <Kpi
          label="Факт — доходи"
          value={summary.fact.income.sum}
          count={summary.fact.income.count}
          tone="good"
          icon={<TrendingUp size={11} />}
        />
        <Kpi
          label="Факт — витрати"
          value={summary.fact.expense.sum}
          count={summary.fact.expense.count}
          tone="bad"
          icon={<TrendingDown size={11} />}
        />
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BalanceRow label="Плановий баланс" value={planBalance} />
        <BalanceRow label="Фактичний баланс" value={factBalance} bold />
      </div>

      {/* Operations preview */}
      {entries.length === 0 ? (
        <div
          className="rounded-xl px-4 py-6 text-center text-sm"
          style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
        >
          За цими фільтрами немає жодної операції.
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              Перегляд операцій ({previewRows.length} з {entries.length})
            </span>
            {entries.length > previewRows.length && (
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                Повний список — у Excel або PDF
              </span>
            )}
          </div>
          <div
            className="overflow-x-auto rounded-xl"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              maxHeight: 420,
            }}
          >
            <table className="w-full text-[12.5px]" style={{ color: T.textPrimary }}>
              <thead>
                <tr
                  className="text-[10px] font-bold uppercase tracking-wider sticky top-0"
                  style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
                >
                  <th className="px-3 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">Вид</th>
                  <th className="px-2 py-2 text-left">Тип</th>
                  <th className="px-2 py-2 text-left">Категорія</th>
                  <th className="px-2 py-2 text-left">Назва</th>
                  <th className="px-2 py-2 text-left">Контрагент</th>
                  <th className="px-2 py-2 text-left">Проєкт</th>
                  <th className="px-2 py-2 text-right">Сума</th>
                  <th className="px-2 py-2 text-center">Статус</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((e) => (
                  <tr key={e.id} className="border-t" style={{ borderColor: T.borderSoft }}>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {format(new Date(e.occurredAt), "d MMM yy", { locale: uk })}
                    </td>
                    <td
                      className="px-2 py-1.5 text-[11px]"
                      style={{ color: e.kind === "PLAN" ? T.warning : T.success }}
                    >
                      {e.kind === "PLAN" ? "План" : "Факт"}
                    </td>
                    <td
                      className="px-2 py-1.5 text-[11px]"
                      style={{ color: e.type === "INCOME" ? T.success : T.warning }}
                    >
                      {e.type === "INCOME" ? "Дохід" : "Витр"}
                    </td>
                    <td className="px-2 py-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                      {FINANCE_CATEGORY_LABELS[e.category] ?? e.category}
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-[220px]" title={e.title}>
                      {e.title}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] truncate max-w-[160px]" style={{ color: T.textSecondary }}>
                      {e.counterparty ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] truncate max-w-[160px]" style={{ color: T.textSecondary }}>
                      {e.project?.title ?? "—"}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right tabular-nums font-semibold"
                      style={{ color: e.type === "INCOME" ? T.success : T.warning }}
                    >
                      {e.type === "INCOME" ? "+" : "−"}
                      {formatCurrencyCompact(Number(e.amount))}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[10px]">{STATUS_LABELS[e.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Export buttons — at the bottom, AFTER preview */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3" style={{ borderColor: T.borderSoft }}>
        <span className="text-[11px] mr-auto" style={{ color: T.textMuted }}>
          Завантажити цей звіт як файл:
        </span>
        <button
          onClick={() => onDownload("xlsx")}
          disabled={downloading !== null || isStale}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold disabled:opacity-50"
          style={{
            backgroundColor: T.panelSoft,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
          title={isStale ? "Спершу натисніть «Сформувати знову»" : ""}
        >
          {downloading === "xlsx" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <FileSpreadsheet size={13} style={{ color: "#16A34A" }} />
          )}
          Excel
        </button>
        <button
          onClick={() => onDownload("pdf")}
          disabled={downloading !== null || isStale}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          title={isStale ? "Спершу натисніть «Сформувати знову»" : ""}
        >
          {downloading === "pdf" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <FileText size={13} />
          )}
          PDF
        </button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  count,
  tone,
  icon,
}: {
  label: string;
  value: number;
  count: number;
  tone?: "good" | "bad" | "muted";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "good"
      ? T.success
      : tone === "bad"
      ? T.danger
      : tone === "muted"
      ? T.textSecondary
      : T.textPrimary;
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-base font-bold tabular-nums" style={{ color }}>
        {formatCurrencyCompact(value)}
      </div>
      <div className="text-[10px]" style={{ color: T.textMuted }}>
        {count} записів
      </div>
    </div>
  );
}

function BalanceRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between rounded-xl px-3 py-2"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[12px]" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          color: value < 0 ? T.danger : value > 0 ? T.success : T.textMuted,
          fontWeight: bold ? 700 : 600,
          fontSize: bold ? 16 : 14,
        }}
      >
        {value >= 0 ? "+" : ""}
        {formatCurrencyCompact(value)}
      </span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.textMuted }}>
        {label}
        {required && <span style={{ color: T.danger }}> *</span>}
      </span>
      {children}
    </label>
  );
}
