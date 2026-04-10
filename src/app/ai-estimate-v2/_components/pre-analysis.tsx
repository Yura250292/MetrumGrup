"use client";

import {
  FileSearch,
  X,
  TriangleAlert,
  Info,
  CircleCheck,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";
import { T } from "./tokens";
import type { AiEstimateController } from "../_lib/use-controller";

type Finding = {
  tone: "danger" | "warning" | "success";
  title: string;
  source?: string;
  text: string;
};

function buildFindings(data: any): Finding[] {
  const findings: Finding[] = [];
  if (!data) return findings;

  // Try to map known shapes from the analyze endpoint
  const classification = data.classification || {};
  const parsedData = data.parsedData || {};
  const filesAnalyzed: number = data.filesAnalyzed ?? 0;

  if (Array.isArray(classification.contradictions) && classification.contradictions.length > 0) {
    classification.contradictions.forEach((c: any) => {
      findings.push({
        tone: "danger",
        title: typeof c === "string" ? c : c.title || "Знайдено суперечність",
        source: typeof c === "object" ? c.source : undefined,
        text: typeof c === "object" ? c.description || "" : "",
      });
    });
  }

  if (Array.isArray(classification.warnings) && classification.warnings.length > 0) {
    classification.warnings.forEach((w: any) => {
      findings.push({
        tone: "warning",
        title: typeof w === "string" ? w : w.title || "Зауваження",
        source: typeof w === "object" ? w.source : undefined,
        text: typeof w === "object" ? w.description || "" : "",
      });
    });
  }

  if (filesAnalyzed > 0 && findings.length === 0) {
    findings.push({
      tone: "success",
      title: "Документи проаналізовано без критичних зауважень",
      source: `${filesAnalyzed} ${filesAnalyzed === 1 ? "документ" : "документи"}`,
      text: "AI готовий до генерації кошторису з поточним обсягом інформації.",
    });
  }

  // Generic fallback if backend returned a list under .findings
  if (Array.isArray(data.findings)) {
    data.findings.forEach((f: any) => {
      findings.push({
        tone: (f.severity === "critical" ? "danger" : f.severity === "warning" ? "warning" : "success"),
        title: f.title || f.message || "Знахідка",
        source: f.source || f.location,
        text: f.description || "",
      });
    });
  }

  return findings;
}

function summarizeKpi(data: any) {
  if (!data) {
    return {
      docs: { value: "—", hint: "", color: T.textMuted },
      completeness: { value: "—", hint: "", color: T.textMuted },
      contradictions: { value: "—", hint: "", color: T.textMuted },
      readiness: { value: "—", hint: "", color: T.textMuted },
    };
  }

  const docsCount = data.filesAnalyzed ?? data.classification?.filesCount ?? 0;
  const completenessRaw = data.classification?.completeness;
  const completeness =
    typeof completenessRaw === "number"
      ? `${Math.round(completenessRaw * 100)}%`
      : data.classification?.completenessLabel || "—";
  const contradictions =
    (Array.isArray(data.classification?.contradictions) && data.classification.contradictions.length) || 0;

  const readinessLabel =
    contradictions > 0
      ? "Потребує уваги"
      : docsCount > 0
        ? "Висока"
        : "Низька";
  const readinessColor =
    contradictions > 0 ? T.warning : docsCount > 0 ? T.success : T.danger;

  return {
    docs: {
      value: `${docsCount} / ${docsCount}`,
      hint: docsCount > 0 ? "Усі метадані витягнуто" : "Файлів не знайдено",
      color: docsCount > 0 ? T.success : T.danger,
    },
    completeness: {
      value: completeness,
      hint: typeof completenessRaw === "number" && completenessRaw < 0.9 ? "Деякі параметри відсутні" : "Повний опис",
      color: typeof completenessRaw === "number" && completenessRaw < 0.9 ? T.warning : T.success,
    },
    contradictions: {
      value: contradictions > 0 ? `Знайдено ${contradictions}` : "Немає",
      hint: contradictions > 0 ? "Перегляньте список нижче" : "Документи узгоджені",
      color: contradictions > 0 ? T.danger : T.success,
    },
    readiness: {
      value: readinessLabel,
      hint: contradictions > 0 ? "Виправте перед генерацією" : "Безпечно генерувати",
      color: readinessColor,
    },
  };
}

export function PreAnalysisModal({ controller }: { controller: AiEstimateController }) {
  const data = controller.preAnalysisData;
  const kpi = summarizeKpi(data);
  const findings = buildFindings(data);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-12"
      style={{ backgroundColor: "rgba(7, 10, 17, 0.85)" }}
      onClick={controller.closePreAnalysis}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[920px] w-full max-w-[1100px] flex-col overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between gap-4 border-b px-8 py-6"
          style={{ backgroundColor: T.panelElevated, borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <FileSearch size={22} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Звіт пре-аналізу
              </h2>
              <span className="text-xs" style={{ color: T.textMuted }}>
                {data?.filesAnalyzed ?? controller.files.length} документ(ів) ·{" "}
                {data?.totalPages ?? "—"} сторінок
              </span>
            </div>
          </div>
          <button
            onClick={controller.closePreAnalysis}
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderStrong}` }}
          >
            <X size={16} style={{ color: T.textSecondary }} />
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="ДОКУМЕНТИ" value={kpi.docs.value} hint={kpi.docs.hint} hintColor={kpi.docs.color} />
            <SummaryCard
              label="ПОВНОТА"
              value={kpi.completeness.value}
              hint={kpi.completeness.hint}
              hintColor={kpi.completeness.color}
            />
            <SummaryCard
              label="СУПЕРЕЧНОСТІ"
              value={kpi.contradictions.value}
              hint={kpi.contradictions.hint}
              hintColor={kpi.contradictions.color}
            />
            <SummaryCard
              label="AI-ГОТОВНІСТЬ"
              value={kpi.readiness.value}
              valueColor={kpi.readiness.color}
              hint={kpi.readiness.hint}
              hintColor={kpi.readiness.color}
            />
          </div>

          <div className="flex flex-col gap-3.5">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Структуровані висновки
            </h3>
            {findings.length === 0 ? (
              <div
                className="rounded-xl p-4 text-[13px]"
                style={{ backgroundColor: T.panelElevated, color: T.textMuted }}
              >
                Висновків поки немає — обробка може ще тривати або файли проаналізовані без зауважень.
              </div>
            ) : (
              findings.map((f, i) => (
                <Finding
                  key={i}
                  tone={f.tone}
                  title={f.title}
                  source={f.source || ""}
                  text={f.text}
                />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-between gap-4 border-t px-8 py-5"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} style={{ color: T.success }} />
            <span className="text-xs font-medium" style={{ color: T.textSecondary }}>
              Пре-аналіз завершено · можна переходити до генерації
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={controller.closePreAnalysis}
              className="rounded-xl px-4 py-3 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              Закрити
            </button>
            <button
              onClick={controller.generate}
              disabled={controller.isChunkedGenerating}
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {controller.isChunkedGenerating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {controller.isChunkedGenerating ? "Генерація…" : "Перейти до генерації"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  hintColor,
  valueColor,
}: {
  label: string;
  value: string;
  hint: string;
  hintColor: string;
  valueColor?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl p-[18px]"
      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-lg font-bold" style={{ color: valueColor ?? T.textPrimary }}>
        {value}
      </span>
      <span className="text-[11px]" style={{ color: hintColor }}>
        {hint}
      </span>
    </div>
  );
}

function Finding({
  tone,
  title,
  source,
  text,
}: {
  tone: "danger" | "warning" | "success";
  title: string;
  source: string;
  text: string;
}) {
  const Icon = tone === "danger" ? TriangleAlert : tone === "warning" ? Info : CircleCheck;
  const color = tone === "danger" ? T.danger : tone === "warning" ? T.warning : T.success;
  return (
    <div
      className="flex items-start gap-3.5 rounded-xl p-[18px]"
      style={{ backgroundColor: T.panelElevated, borderLeft: `3px solid ${color}` }}
    >
      <Icon size={18} style={{ color }} className="mt-0.5 flex-shrink-0" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
            {title}
          </span>
          {source && (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {source}
            </span>
          )}
        </div>
        {text && (
          <p className="text-xs leading-relaxed" style={{ color: T.textSecondary }}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
