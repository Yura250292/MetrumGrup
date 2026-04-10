"use client";

import { ReactNode } from "react";
import { Check, ArrowLeft, ArrowRight, X } from "lucide-react";
import { T } from "./tokens";
import type { AiEstimateController } from "../_lib/use-controller";
import type { ObjectType, WorkScope } from "@/lib/wizard-types";

const STEPS = [
  { id: 0, label: "Тип і масштаб проєкту" },
  { id: 1, label: "Геометрія та площі" },
  { id: 2, label: "Матеріали та оздоблення" },
  { id: 3, label: "Інженерні системи" },
  { id: 4, label: "Підсумок" },
];

const OBJECT_TYPES: { value: ObjectType; label: string }[] = [
  { value: "house", label: "Будинок" },
  { value: "townhouse", label: "Таунхаус" },
  { value: "apartment", label: "Квартира" },
  { value: "office", label: "Офіс" },
  { value: "commercial", label: "Комерція" },
];

const WORK_SCOPES: { value: WorkScope; label: string }[] = [
  { value: "foundation_only", label: "Фундамент" },
  { value: "foundation_walls", label: "Фундамент + стіни" },
  { value: "foundation_walls_roof", label: "Фундамент + стіни + дах" },
  { value: "full_cycle", label: "Повний цикл" },
  { value: "renovation", label: "Реновація" },
];

export function WizardModal({ controller }: { controller: AiEstimateController }) {
  const data = controller.wizardData;
  const step = controller.wizardStep;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const goNext = () => {
    if (isLast) {
      controller.completeWizard();
      return;
    }
    controller.setWizardStep(step + 1);
  };
  const goPrev = () => {
    if (isFirst) return;
    controller.setWizardStep(step - 1);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-12"
      style={{ backgroundColor: "rgba(7, 10, 17, 0.92)" }}
      onClick={controller.closeWizard}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[920px] w-full max-w-[1240px] overflow-hidden rounded-3xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        {/* Rail */}
        <aside
          className="flex w-[280px] flex-col gap-6 border-r p-8"
          style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
              ГІД ПРОЄКТУ
            </span>
            <span className="text-[22px] font-bold" style={{ color: T.textPrimary }}>
              Майстер проєкту
            </span>
            <span className="text-xs leading-relaxed" style={{ color: T.textMuted }}>
              {STEPS.length} кроків · підвищує точність ~30%
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {STEPS.map((s) => {
              const state: "done" | "active" | "pending" =
                s.id < step ? "done" : s.id === step ? "active" : "pending";
              return <Step key={s.id} n={s.id + 1} title={s.label} state={state} />;
            })}
          </div>
          <button
            onClick={controller.closeWizard}
            className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
          >
            <X size={14} /> Закрити майстер
          </button>
        </aside>

        {/* Center */}
        <section className="flex flex-1 flex-col gap-7 overflow-y-auto p-12">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
              КРОК {step + 1} З {STEPS.length}
            </span>
            <h2 className="text-3xl font-bold" style={{ color: T.textPrimary }}>
              {STEPS[step].label}
            </h2>
          </div>

          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Field label="Тип обʼєкта">
                <Grid>
                  {OBJECT_TYPES.map((o) => (
                    <Choice
                      key={o.value}
                      label={o.label}
                      active={data.objectType === o.value}
                      onClick={() => controller.updateWizardData({ objectType: o.value })}
                    />
                  ))}
                </Grid>
              </Field>
              <Field label="Обсяг робіт">
                <Grid>
                  {WORK_SCOPES.map((w) => (
                    <Choice
                      key={w.value}
                      label={w.label}
                      active={data.workScope === w.value}
                      onClick={() => controller.updateWizardData({ workScope: w.value })}
                    />
                  ))}
                </Grid>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <Field label="Загальна площа, м²" className="flex-1">
                  <TextInput
                    value={data.totalArea}
                    onChange={(v) => controller.updateWizardData({ totalArea: v })}
                    placeholder="напр. 320"
                  />
                </Field>
                <Field label="Кількість поверхів" className="flex-1">
                  <TextInput
                    value={String(data.floors ?? 1)}
                    onChange={(v) => controller.updateWizardData({ floors: Number(v) || 1 })}
                    placeholder="1"
                  />
                </Field>
                <Field label="Висота стелі, м" className="flex-1">
                  <TextInput
                    value={String(data.ceilingHeight ?? "2.7")}
                    onChange={(v) => controller.updateWizardData({ ceilingHeight: v })}
                    placeholder="2.7"
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <Field label="Матеріал стін">
                <TextInput
                  value={data.finishing?.walls?.material ?? ""}
                  onChange={(v) =>
                    controller.updateWizardData((prev) => ({
                      ...prev,
                      finishing: {
                        ...prev.finishing,
                        walls: { ...(prev.finishing?.walls ?? {}), material: v as any },
                      },
                    }))
                  }
                  placeholder="напр. фарба, штукатурка, ламінат"
                />
              </Field>
              <Field label="Тип стелі">
                <TextInput
                  value={data.finishing?.ceiling?.type ?? ""}
                  onChange={(v) =>
                    controller.updateWizardData((prev) => ({
                      ...prev,
                      finishing: {
                        ...prev.finishing,
                        ceiling: { ...(prev.finishing?.ceiling ?? {}), type: v as any },
                      },
                    }))
                  }
                  placeholder="фарба, гіпсокартон, натяжна"
                />
              </Field>
              <Field label="Рівень оздоблення">
                <Grid>
                  {(["economy", "standard", "premium"] as const).map((q) => (
                    <Choice
                      key={q}
                      label={q === "economy" ? "Економ" : q === "standard" ? "Стандарт" : "Преміум"}
                      active={data.finishing?.walls?.qualityLevel === q}
                      onClick={() =>
                        controller.updateWizardData((prev) => ({
                          ...prev,
                          finishing: {
                            ...prev.finishing,
                            walls: { ...(prev.finishing?.walls ?? {}), qualityLevel: q },
                          },
                        }))
                      }
                    />
                  ))}
                </Grid>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <Field label="Тип опалення">
                <Grid>
                  {(["none", "gas", "electric", "heat_pump", "solid_fuel"] as const).map((h) => (
                    <Choice
                      key={h}
                      label={
                        h === "none"
                          ? "Немає"
                          : h === "gas"
                            ? "Газ"
                            : h === "electric"
                              ? "Електро"
                              : h === "heat_pump"
                                ? "Тепловий насос"
                                : "Тверде паливо"
                      }
                      active={data.utilities?.heating?.type === h}
                      onClick={() =>
                        controller.updateWizardData((prev) => ({
                          ...prev,
                          utilities: {
                            ...prev.utilities,
                            heating: { ...(prev.utilities?.heating ?? {}), type: h as any },
                          },
                        }))
                      }
                    />
                  ))}
                </Grid>
              </Field>
              <Field label="Електрика">
                <div className="flex flex-col gap-2">
                  <Toggle
                    label="Однофазна (250В)"
                    active={data.utilities?.electrical?.power === "single_phase"}
                    onClick={() =>
                      controller.updateWizardData((prev) => ({
                        ...prev,
                        utilities: {
                          ...prev.utilities,
                          electrical: {
                            ...(prev.utilities?.electrical ?? {}),
                            power: "single_phase",
                          },
                        },
                      }))
                    }
                  />
                  <Toggle
                    label="Трифазна (380В)"
                    active={data.utilities?.electrical?.power === "three_phase"}
                    onClick={() =>
                      controller.updateWizardData((prev) => ({
                        ...prev,
                        utilities: {
                          ...prev.utilities,
                          electrical: {
                            ...(prev.utilities?.electrical ?? {}),
                            power: "three_phase",
                          },
                        },
                      }))
                    }
                  />
                </div>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <Field label="Особливі вимоги">
                <textarea
                  value={(data as any).specialRequirements ?? ""}
                  onChange={(e) =>
                    controller.updateWizardData({
                      specialRequirements: e.target.value,
                    } as any)
                  }
                  placeholder="Опишіть особливі вимоги, обмеження, ризики проєкту…"
                  rows={6}
                  className="resize-none rounded-xl px-4 py-3.5 text-[13px] leading-relaxed outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: T.successSoft, border: `1px solid ${T.success}` }}
              >
                <div className="text-[13px] font-semibold" style={{ color: T.success }}>
                  Готово до завершення
                </div>
                <div className="mt-1 text-[11px]" style={{ color: T.textSecondary }}>
                  Натисніть «Завершити», щоб зберегти налаштування майстра. Дані будуть надіслані в AI разом з файлами
                  при наступній генерації.
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-auto flex items-center justify-between pt-2">
            <button
              onClick={controller.closeWizard}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium"
              style={{ color: T.textMuted }}
            >
              <X size={14} /> Пропустити
            </button>
            <div className="flex items-center gap-2.5">
              <button
                onClick={goPrev}
                disabled={isFirst}
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textSecondary,
                  border: `1px solid ${T.borderStrong}`,
                }}
              >
                <ArrowLeft size={14} /> Назад
              </button>
              <button
                onClick={goNext}
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-bold text-white"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {isLast ? "Завершити" : "Продовжити"} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  state,
}: {
  n: number;
  title: string;
  state: "done" | "active" | "pending";
}) {
  const isActive = state === "active";
  const isDone = state === "done";

  let dotBg: string = T.panelElevated;
  let dotBorder: string = T.borderStrong;
  let dotContent: ReactNode = (
    <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700 }}>{n}</span>
  );

  if (isDone) {
    dotBg = T.success;
    dotBorder = T.success;
    dotContent = <Check size={14} color="#FFFFFF" />;
  } else if (isActive) {
    dotBg = T.accentPrimary;
    dotBorder = T.accentPrimary;
    dotContent = <span style={{ color: "#FFFFFF", fontSize: 11, fontWeight: 700 }}>{n}</span>;
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-3"
      style={{
        backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
        border: isActive ? `1px solid ${T.accentPrimary}` : "1px solid transparent",
      }}
    >
      <div
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: dotBg, border: `1px solid ${dotBorder}` }}
      >
        {dotContent}
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className="text-xs font-semibold"
          style={{ color: state === "pending" ? T.textSecondary : T.textPrimary }}
        >
          {title}
        </span>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      {children}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Choice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl px-4 py-2.5 text-[13px] font-medium"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panelElevated,
        color: active ? T.accentPrimary : T.textPrimary,
        border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
      }}
    >
      {label}
    </button>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panelElevated,
        border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
      }}
    >
      <span className="text-[13px] font-medium" style={{ color: T.textPrimary }}>
        {label}
      </span>
      {active && <Check size={14} style={{ color: T.accentPrimary }} />}
    </button>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-xl px-4 py-3 text-sm outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
  );
}
