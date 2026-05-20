"use client";

import {
  FileSearch,
  X,
  TriangleAlert,
  Info,
  CircleCheck,
  Sparkles,
  Loader2,
  PenLine,
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

  // Plan: 3-7 ключових зауважень — обрізаємо вихлоп, щоб не перевантажувати.
  return findings.slice(0, 7);
}

function buildSummary(data: any, findings: Finding[]): { text: string; hasBlockers: boolean } {
  const filesAnalyzed: number = data?.filesAnalyzed ?? 0;
  const dangers = findings.filter((f) => f.tone === "danger").length;
  const warnings = findings.filter((f) => f.tone === "warning").length;

  if (filesAnalyzed === 0) {
    return { text: "Файлів для аналізу не знайдено.", hasBlockers: true };
  }
  if (dangers > 0) {
    return {
      text: `Знайдено ${dangers} ${dangers === 1 ? "суперечність" : "суперечностей"} у документах. Радимо виправити перед генерацією.`,
      hasBlockers: true,
    };
  }
  if (warnings > 0) {
    return {
      text: `Документи проаналізовано, є ${warnings} ${warnings === 1 ? "зауваження" : "зауважень"} — можна продовжувати.`,
      hasBlockers: false,
    };
  }
  return {
    text: `Документи проаналізовано без зауважень. Можна генерувати.`,
    hasBlockers: false,
  };
}

export function PreAnalysisModal({ controller }: { controller: AiEstimateController }) {
  const data = controller.preAnalysisData;
  const findings = buildFindings(data);
  const summary = buildSummary(data, findings);

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
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-8">
          {/* Summary */}
          <div
            className="rounded-xl p-5 text-[14px] leading-relaxed"
            style={{
              backgroundColor: summary.hasBlockers ? T.dangerSoft : T.panelElevated,
              border: `1px solid ${summary.hasBlockers ? T.danger : T.borderSoft}`,
              color: summary.hasBlockers ? T.danger : T.textPrimary,
            }}
          >
            {summary.text}
          </div>

          {/* Findings */}
          <div className="flex flex-col gap-3">
            {findings.length === 0 ? (
              <div
                className="rounded-xl p-4 text-[13px]"
                style={{ backgroundColor: T.panelElevated, color: T.textMuted }}
              >
                Зауважень немає.
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
          className="flex items-center justify-end gap-2.5 border-t px-8 py-5"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <button
            onClick={controller.closePreAnalysis}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{
              color: T.textPrimary,
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <PenLine size={16} /> Виправити
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
            {controller.isChunkedGenerating
              ? "Генерація…"
              : summary.hasBlockers
                ? "Все одно згенерувати"
                : "Згенерувати кошторис"}
          </button>
        </footer>
      </div>
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
