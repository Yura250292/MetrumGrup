"use client";

import { Save, X, Folder, Check, Loader2 } from "lucide-react";
import { T } from "./tokens";
import { formatUAH } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";

export function SaveDialog({ controller }: { controller: AiEstimateController }) {
  const projectsList = controller.projects;
  const selectedProject = projectsList.find((p) => p.id === controller.selectedProjectId);
  const totalAmount = controller.estimate?.summary?.totalBeforeDiscount ?? 0;
  const sectionCount = controller.estimate?.sections.length ?? 0;
  const itemCount = controller.estimate?.sections.reduce((sum, s) => sum + s.items.length, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-8"
      style={{ backgroundColor: "rgba(7, 10, 17, 0.85)" }}
      onClick={controller.closeSave}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <header className="flex items-center justify-between gap-4 px-7 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Save size={20} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Зберегти кошторис
              </h2>
              <span className="text-xs" style={{ color: T.textMuted }}>
                Прикріпити до проєкту
              </span>
            </div>
          </div>
          <button
            onClick={controller.closeSave}
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.panelElevated }}
          >
            <X size={16} style={{ color: T.textSecondary }} />
          </button>
        </header>

        <div className="flex flex-col gap-4.5 px-7 pt-2 pb-6" style={{ gap: 18 }}>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ПРОЄКТ
            </span>
            {projectsList.length === 0 ? (
              <div
                className="rounded-xl p-3.5 text-xs"
                style={{ backgroundColor: T.panelSoft, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
              >
                Список проєктів завантажується або порожній
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto">
                {projectsList.map((project) => {
                  const active = project.id === controller.selectedProjectId;
                  return (
                    <button
                      key={project.id}
                      onClick={() => controller.setSelectedProjectId(project.id)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left"
                      style={{
                        backgroundColor: active ? T.panelSoft : T.panelElevated,
                        border: `1px solid ${active ? T.borderAccent : T.borderSoft}`,
                      }}
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ backgroundColor: T.accentPrimarySoft }}
                      >
                        <Folder size={16} style={{ color: T.accentPrimary }} />
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5">
                        <div className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                          {project.title}
                        </div>
                        {project.client?.name && (
                          <div className="text-[11px]" style={{ color: T.textMuted }}>
                            {project.client.name}
                          </div>
                        )}
                      </div>
                      {active && <Check size={16} style={{ color: T.accentPrimary }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className="flex flex-col gap-3 rounded-xl p-[18px]"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
          >
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
              ВИ ЗБЕРІГАЄТЕ
            </span>
            <Row label="Загальна сума" value={formatUAH(totalAmount)} />
            <Row label="Секцій / позицій" value={`${sectionCount} / ${itemCount}`} />
            {controller.verificationResult?.overallScore != null && (
              <Row
                label="Бал верифікації"
                value={`${Math.round(controller.verificationResult.overallScore)} / 100`}
                valueColor={T.success}
              />
            )}
          </div>

          {controller.error && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
            >
              {controller.error}
            </div>
          )}
        </div>

        <footer
          className="flex items-center justify-end gap-2.5 border-t px-7 py-[18px]"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <button
            onClick={controller.closeSave}
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            onClick={controller.saveEstimate}
            disabled={controller.saving || !controller.selectedProjectId}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {controller.saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {controller.saving ? "Збереження…" : "Зберегти у проєкт"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]" style={{ color: T.textSecondary }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: valueColor ?? T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}
