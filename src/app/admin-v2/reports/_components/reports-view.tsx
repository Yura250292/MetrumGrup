"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Loader2,
  Receipt,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

type Project = { id: string; title: string };
type Counterparty = { id: string; name: string };
type Employee = { id: string; fullName: string };

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

  async function download(format: "xlsx" | "pdf") {
    if (tpl.key === "custom") {
      // Custom = redirect to /financing where the user does it manually.
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
            <>
              <button
                onClick={() => download("xlsx")}
                disabled={downloading !== null}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: T.panelSoft,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderStrong}`,
                }}
              >
                {downloading === "xlsx" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={13} style={{ color: "#16A34A" }} />
                )}
                Excel
              </button>
              <button
                onClick={() => download("pdf")}
                disabled={downloading !== null}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
              >
                {downloading === "pdf" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileText size={13} />
                )}
                Завантажити PDF
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-[11px]" style={{ color: T.textMuted }}>
        Звіти включають усі не-архівні операції за період. Архівні — окремо у вкладці «Архів».
        Для дуже великих звітів (понад 500 рядків) PDF показує перші 500; повний список — Excel.
      </div>
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
