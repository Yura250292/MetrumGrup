"use client";

import { ReactNode, useMemo } from "react";
import { Check, ArrowLeft, ArrowRight, X } from "lucide-react";
import { T } from "./tokens";
import type { AiEstimateController } from "../_lib/use-controller";
import type { ObjectType, WorkScope, WizardData } from "@/lib/wizard-types";

/* ────────────────────────────────────────────────────────────────────── */
/* Dynamic step planner                                                   */
/* ────────────────────────────────────────────────────────────────────── */

type StepDef = { id: string; label: string };

function buildSteps(objectType: ObjectType, workScope: WorkScope): StepDef[] {
  const base: StepDef[] = [
    { id: "type", label: "Тип проєкту" },
    { id: "geometry", label: "Геометрія" },
  ];

  // Будинок / таунхаус
  if (objectType === "house" || objectType === "townhouse") {
    if (workScope === "renovation") {
      return [
        ...base,
        { id: "house-current", label: "Поточний стан" },
        { id: "engineering", label: "Інженерні системи" },
        { id: "finishing", label: "Чистове оздоблення" },
        { id: "openings", label: "Вікна та двері" },
        { id: "summary", label: "Підсумок" },
      ];
    }
    return [
      ...base,
      { id: "house-current", label: "Поточний стан + демонтаж" },
      { id: "terrain", label: "Ділянка та геологія" },
      { id: "foundation", label: "Фундамент" },
      { id: "walls", label: "Стіни" },
      { id: "roof", label: "Покрівля" },
      { id: "engineering", label: "Інженерні системи" },
      { id: "finishing", label: "Оздоблення" },
      { id: "openings", label: "Вікна та двері" },
      { id: "extras", label: "Гараж / мансарда / підвал" },
      { id: "summary", label: "Підсумок" },
    ];
  }

  // Квартира / офіс
  if (objectType === "apartment" || objectType === "office") {
    return [
      ...base,
      { id: "renovation-current", label: "Поточний стан" },
      { id: "renovation-rooms", label: "Перелік приміщень" },
      { id: "renovation-work", label: "Які роботи потрібні" },
      { id: "engineering", label: "Інженерія" },
      { id: "finishing", label: "Оздоблення" },
      { id: "openings", label: "Вікна та двері" },
      { id: "summary", label: "Підсумок" },
    ];
  }

  // Комерція
  if (objectType === "commercial") {
    return [
      ...base,
      { id: "commercial-purpose", label: "Призначення" },
      { id: "commercial-floor", label: "Підлога" },
      { id: "commercial-special", label: "Спецсистеми" },
      { id: "engineering", label: "Електрика та сантехніка" },
      { id: "finishing", label: "Оздоблення" },
      { id: "openings", label: "Вікна та двері" },
      { id: "summary", label: "Підсумок" },
    ];
  }

  return [...base, { id: "summary", label: "Підсумок" }];
}

/* ────────────────────────────────────────────────────────────────────── */
/* Constants                                                              */
/* ────────────────────────────────────────────────────────────────────── */

const OBJECT_TYPES: { value: ObjectType; label: string }[] = [
  { value: "house", label: "Будинок" },
  { value: "townhouse", label: "Таунхаус" },
  { value: "apartment", label: "Квартира" },
  { value: "office", label: "Офіс" },
  { value: "commercial", label: "Комерція" },
];

const WORK_SCOPES: { value: WorkScope; label: string }[] = [
  { value: "foundation_only", label: "Тільки фундамент" },
  { value: "foundation_walls", label: "Фундамент + стіни" },
  { value: "foundation_walls_roof", label: "Фундамент + стіни + дах" },
  { value: "full_cycle", label: "Повний цикл" },
  { value: "reconstruction", label: "Реконструкція" },
  { value: "renovation", label: "Реновація" },
];

/* ────────────────────────────────────────────────────────────────────── */
/* Modal                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

export function WizardModal({ controller }: { controller: AiEstimateController }) {
  const data = controller.wizardData;
  const set = controller.setNestedWizard;

  const steps = useMemo(
    () => buildSteps(data.objectType, data.workScope),
    [data.objectType, data.workScope]
  );

  const stepIdx = Math.min(controller.wizardStep, steps.length - 1);
  const currentStep = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const isFirst = stepIdx === 0;

  const goNext = () => {
    if (isLast) {
      controller.completeWizard();
      return;
    }
    controller.setWizardStep(stepIdx + 1);
  };
  const goPrev = () => {
    if (isFirst) return;
    controller.setWizardStep(stepIdx - 1);
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
              {steps.length} кроків · підвищує точність ~30%
            </span>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {steps.map((s, i) => {
              const state: "done" | "active" | "pending" =
                i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
              return <Step key={s.id} n={i + 1} title={s.label} state={state} />;
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
              КРОК {stepIdx + 1} З {steps.length}
            </span>
            <h2 className="text-3xl font-bold" style={{ color: T.textPrimary }}>
              {currentStep.label}
            </h2>
          </div>

          <div className="flex flex-1 flex-col gap-5">
            {renderStep(currentStep.id, data, set, controller)}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
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

/* ────────────────────────────────────────────────────────────────────── */
/* Step renderer                                                          */
/* ────────────────────────────────────────────────────────────────────── */

type SetNested = (path: string, value: unknown) => void;

function renderStep(
  id: string,
  data: WizardData,
  set: SetNested,
  controller: AiEstimateController
): ReactNode {
  switch (id) {
    case "type":
      return <TypeStep data={data} set={set} controller={controller} />;
    case "geometry":
      return <GeometryStep data={data} set={set} />;
    case "house-current":
      return <HouseCurrentStep data={data} set={set} />;
    case "terrain":
      return <TerrainStep data={data} set={set} />;
    case "foundation":
      return <FoundationStep data={data} set={set} />;
    case "walls":
      return <WallsStep data={data} set={set} />;
    case "roof":
      return <RoofStep data={data} set={set} />;
    case "extras":
      return <ExtrasStep data={data} set={set} />;
    case "renovation-current":
      return <RenovationCurrentStep data={data} set={set} />;
    case "renovation-rooms":
      return <RenovationRoomsStep data={data} set={set} />;
    case "renovation-work":
      return <RenovationWorkStep data={data} set={set} />;
    case "commercial-purpose":
      return <CommercialPurposeStep data={data} set={set} />;
    case "commercial-floor":
      return <CommercialFloorStep data={data} set={set} />;
    case "commercial-special":
      return <CommercialSpecialStep data={data} set={set} />;
    case "engineering":
      return <EngineeringStep data={data} set={set} />;
    case "finishing":
      return <FinishingStep data={data} set={set} />;
    case "openings":
      return <OpeningsStep data={data} set={set} />;
    case "summary":
      return <SummaryStep data={data} set={set} />;
    default:
      return null;
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Step components                                                        */
/* ────────────────────────────────────────────────────────────────────── */

function TypeStep({ data, set, controller }: { data: WizardData; set: SetNested; controller: AiEstimateController }) {
  return (
    <>
      <Field label="Тип об'єкта">
        <Grid>
          {OBJECT_TYPES.map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              active={data.objectType === o.value}
              onClick={() => {
                controller.updateWizardData({ objectType: o.value });
                // ensure корректний holder
                if (o.value === "house" || o.value === "townhouse") {
                  if (!data.houseData) set("houseData", { currentState: "greenfield", terrain: { soilType: "unknown", groundwaterDepth: "unknown", slope: "flat", needsExcavation: false, needsDrainage: false }, hasBasement: false, hasAttic: false, hasGarage: false });
                }
                if (o.value === "apartment" || o.value === "office") {
                  if (!data.renovationData) set("renovationData", { currentStage: "bare_concrete", existing: { roughPlaster: false, roughFloor: false, finishFloor: false, electricalRoughIn: false, plumbingRoughIn: false, heatingRoughIn: false, windowsInstalled: false, doorsInstalled: false }, workRequired: { demolition: false, roughPlaster: false, roughFloor: false, electrical: false, plumbing: false, heating: false, finishPlaster: false, painting: false, flooring: false, tiling: false, ceiling: "none", windows: false, doors: false }, layoutChange: false, newPartitions: false, rooms: { bedrooms: 0, bathrooms: 0, kitchen: 0, living: 0, other: 0 } });
                }
                if (o.value === "commercial") {
                  if (!data.commercialData) set("commercialData", { purpose: "shop", floor: { type: "standard", antiStatic: false }, fireRating: false, hvac: false, heavyDutyElectrical: false, accessControl: false, surveillance: false });
                }
              }}
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
      <Field label="Бюджетний клас">
        <Grid>
          {(["economy", "standard", "premium", "luxury"] as const).map((b) => (
            <Choice
              key={b}
              label={b === "economy" ? "Економ" : b === "standard" ? "Стандарт" : b === "premium" ? "Преміум" : "Люкс"}
              active={data.budgetRange === b}
              onClick={() => set("budgetRange", b)}
            />
          ))}
        </Grid>
      </Field>
    </>
  );
}

function GeometryStep({ data, set }: { data: WizardData; set: SetNested }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <Field label="Загальна площа, м²" className="flex-1">
          <TextInput value={data.totalArea} onChange={(v) => set("totalArea", v)} placeholder="напр. 320" />
        </Field>
        <Field label="Кількість поверхів" className="flex-1">
          <TextInput value={String(data.floors ?? 1)} onChange={(v) => set("floors", Number(v) || 1)} placeholder="1" />
        </Field>
        <Field label="Висота стелі, м" className="flex-1">
          <TextInput value={String(data.ceilingHeight ?? "2.7")} onChange={(v) => set("ceilingHeight", v)} placeholder="2.7" />
        </Field>
      </div>
    </div>
  );
}

function HouseCurrentStep({ data, set }: { data: WizardData; set: SetNested }) {
  const hd = data.houseData;
  const states: { value: NonNullable<typeof hd>["currentState"]; label: string }[] = [
    { value: "greenfield", label: "Чиста ділянка" },
    { value: "foundation_only", label: "Є фундамент" },
    { value: "shell", label: "Коробка" },
    { value: "rough_utilities", label: "Коробка + комунікації" },
    { value: "existing_building", label: "Існуюча будівля" },
  ];
  return (
    <>
      <Field label="Поточний стан будівлі">
        <Grid>
          {states.map((s) => (
            <Choice
              key={s.value}
              label={s.label}
              active={hd?.currentState === s.value}
              onClick={() => set("houseData.currentState", s.value)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Чи потрібен демонтаж">
        <Switch active={!!hd?.demolitionRequired} onClick={() => set("houseData.demolitionRequired", !hd?.demolitionRequired)} label="Так, потрібно демонтувати існуюче" />
      </Field>
      {hd?.demolitionRequired && (
        <Field label="Опис демонтажу">
          <TextArea
            value={hd?.demolitionDescription ?? ""}
            onChange={(v) => set("houseData.demolitionDescription", v)}
            placeholder="Що саме демонтувати: стара коробка, внутрішні стіни, дах…"
          />
        </Field>
      )}
    </>
  );
}

function TerrainStep({ data, set }: { data: WizardData; set: SetNested }) {
  const t = data.houseData?.terrain;
  return (
    <>
      <Field label="Тип ґрунту">
        <Grid>
          {(["clay", "sand", "rock", "mixed", "unknown"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "clay" ? "Глина" : s === "sand" ? "Пісок" : s === "rock" ? "Скеля" : s === "mixed" ? "Мішаний" : "Невідомо"}
              active={t?.soilType === s}
              onClick={() => set("houseData.terrain.soilType", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Глибина ґрунтових вод">
        <Grid>
          {(["shallow", "medium", "deep", "unknown"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "shallow" ? "Близько (<2м)" : s === "medium" ? "Середньо (2-5м)" : s === "deep" ? "Глибоко (>5м)" : "Невідомо"}
              active={t?.groundwaterDepth === s}
              onClick={() => set("houseData.terrain.groundwaterDepth", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Рельєф ділянки">
        <Grid>
          {(["flat", "slight", "steep"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "flat" ? "Рівний" : s === "slight" ? "Невеликий ухил" : "Крутий ухил"}
              active={t?.slope === s}
              onClick={() => set("houseData.terrain.slope", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Додаткові роботи">
        <div className="flex flex-col gap-2">
          <Switch active={!!t?.needsExcavation} onClick={() => set("houseData.terrain.needsExcavation", !t?.needsExcavation)} label="Потрібні земляні роботи" />
          <Switch active={!!t?.needsDrainage} onClick={() => set("houseData.terrain.needsDrainage", !t?.needsDrainage)} label="Потрібен дренаж" />
        </div>
      </Field>
    </>
  );
}

function FoundationStep({ data, set }: { data: WizardData; set: SetNested }) {
  const f = data.houseData?.foundation;
  return (
    <>
      <Field label="Тип фундаменту">
        <Grid>
          {(["strip", "slab", "pile", "combined"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "strip" ? "Стрічковий" : s === "slab" ? "Плита" : s === "pile" ? "Палевий" : "Комбінований"}
              active={f?.type === s}
              onClick={() => set("houseData.foundation.type", s)}
            />
          ))}
        </Grid>
      </Field>
      <div className="flex gap-4">
        <Field label="Глибина, м" className="flex-1">
          <TextInput value={f?.depth ?? ""} onChange={(v) => set("houseData.foundation.depth", v)} placeholder="1.5" />
        </Field>
        <Field label="Ширина, м" className="flex-1">
          <TextInput value={f?.width ?? ""} onChange={(v) => set("houseData.foundation.width", v)} placeholder="0.4" />
        </Field>
      </div>
      <Field label="Армування">
        <Grid>
          {(["light", "standard", "heavy"] as const).map((s) => (
            <Choice key={s} label={s === "light" ? "Легке" : s === "standard" ? "Стандартне" : "Підсилене"} active={f?.reinforcement === s} onClick={() => set("houseData.foundation.reinforcement", s)} />
          ))}
        </Grid>
      </Field>
      <Field label="Гідроізоляція та утеплення">
        <div className="flex flex-col gap-2">
          <Switch active={!!f?.waterproofing} onClick={() => set("houseData.foundation.waterproofing", !f?.waterproofing)} label="Гідроізоляція" />
          <Switch active={!!f?.insulation} onClick={() => set("houseData.foundation.insulation", !f?.insulation)} label="Утеплення XPS" />
        </div>
      </Field>
      {f?.insulation && (
        <Field label="Товщина утеплення, мм">
          <TextInput value={String(f.insulationThickness ?? 50)} onChange={(v) => set("houseData.foundation.insulationThickness", Number(v) || 50)} />
        </Field>
      )}
    </>
  );
}

function WallsStep({ data, set }: { data: WizardData; set: SetNested }) {
  const w = data.houseData?.walls;
  return (
    <>
      <Field label="Матеріал несучих стін">
        <Grid>
          {(["gasblock", "brick", "wood", "panel", "monolith"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "gasblock" ? "Газоблок" : s === "brick" ? "Цегла" : s === "wood" ? "Дерево" : s === "panel" ? "Панель" : "Моноліт"}
              active={w?.material === s}
              onClick={() => set("houseData.walls.material", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Товщина стін, мм">
        <TextInput value={w?.thickness ?? ""} onChange={(v) => set("houseData.walls.thickness", v)} placeholder="400" />
      </Field>
      <Field label="Утеплення">
        <Switch active={!!w?.insulation} onClick={() => set("houseData.walls.insulation", !w?.insulation)} label="Стіни утеплені ззовні" />
      </Field>
      {w?.insulation && (
        <>
          <Field label="Тип утеплювача">
            <Grid>
              {(["foam", "mineral", "ecowool"] as const).map((s) => (
                <Choice key={s} label={s === "foam" ? "Пінопласт" : s === "mineral" ? "Мінвата" : "Ековата"} active={w?.insulationType === s} onClick={() => set("houseData.walls.insulationType", s)} />
              ))}
            </Grid>
          </Field>
          <Field label="Товщина утеплювача, мм">
            <TextInput value={String(w.insulationThickness ?? 100)} onChange={(v) => set("houseData.walls.insulationThickness", Number(v) || 100)} />
          </Field>
        </>
      )}
      <Field label="Перегородки">
        <Grid>
          {(["gasblock", "brick", "gypsum", "same"] as const).map((s) => (
            <Choice key={s} label={s === "gasblock" ? "Газоблок" : s === "brick" ? "Цегла" : s === "gypsum" ? "Гіпсокартон" : "Як основні"} active={w?.partitionMaterial === s} onClick={() => set("houseData.walls.partitionMaterial", s)} />
          ))}
        </Grid>
      </Field>
      <Field label="Конструкція">
        <Switch active={!!w?.hasLoadBearing} onClick={() => set("houseData.walls.hasLoadBearing", !w?.hasLoadBearing)} label="Є внутрішні несучі стіни" />
      </Field>
    </>
  );
}

function RoofStep({ data, set }: { data: WizardData; set: SetNested }) {
  const r = data.houseData?.roof;
  return (
    <>
      <Field label="Тип даху">
        <Grid>
          {(["pitched", "flat", "mansard", "combined"] as const).map((s) => (
            <Choice key={s} label={s === "pitched" ? "Скатний" : s === "flat" ? "Плоский" : s === "mansard" ? "Мансардний" : "Комбінований"} active={r?.type === s} onClick={() => set("houseData.roof.type", s)} />
          ))}
        </Grid>
      </Field>
      {r?.type !== "flat" && (
        <Field label="Кут нахилу, °">
          <TextInput value={String(r?.pitchAngle ?? 30)} onChange={(v) => set("houseData.roof.pitchAngle", Number(v) || 30)} />
        </Field>
      )}
      <Field label="Покриття">
        <Grid>
          {(["metal_tile", "soft_tile", "profiled_sheet", "ceramic", "slate"] as const).map((s) => (
            <Choice
              key={s}
              label={
                s === "metal_tile" ? "Металочерепиця" : s === "soft_tile" ? "Бітумна черепиця" : s === "profiled_sheet" ? "Профнастил" : s === "ceramic" ? "Керамічна" : "Натуральний шифер"
              }
              active={r?.material === s}
              onClick={() => set("houseData.roof.material", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Утеплення даху">
        <Switch active={!!r?.insulation} onClick={() => set("houseData.roof.insulation", !r?.insulation)} label="Утеплити дах" />
      </Field>
      {r?.insulation && (
        <Field label="Товщина утеплювача, мм">
          <TextInput value={String(r.insulationThickness ?? 150)} onChange={(v) => set("houseData.roof.insulationThickness", Number(v) || 150)} />
        </Field>
      )}
      <Field label="Тип горища">
        <Grid>
          {(["cold", "warm", "living"] as const).map((s) => (
            <Choice key={s} label={s === "cold" ? "Холодне" : s === "warm" ? "Тепле" : "Житлове"} active={r?.attic === s} onClick={() => set("houseData.roof.attic", s)} />
          ))}
        </Grid>
      </Field>
      <Field label="Додатково">
        <div className="flex flex-col gap-2">
          <Switch active={!!r?.gutterSystem} onClick={() => set("houseData.roof.gutterSystem", !r?.gutterSystem)} label="Водостічна система" />
        </div>
      </Field>
      <Field label="Мансардних вікон, шт">
        <TextInput value={String(r?.roofWindows ?? 0)} onChange={(v) => set("houseData.roof.roofWindows", Number(v) || 0)} />
      </Field>
    </>
  );
}

function ExtrasStep({ data, set }: { data: WizardData; set: SetNested }) {
  const hd = data.houseData;
  return (
    <>
      <Field label="Підвал">
        <Switch active={!!hd?.hasBasement} onClick={() => set("houseData.hasBasement", !hd?.hasBasement)} label="Є підвал" />
      </Field>
      {hd?.hasBasement && (
        <Field label="Площа підвалу, м²">
          <TextInput value={hd.basementArea ?? ""} onChange={(v) => set("houseData.basementArea", v)} placeholder="80" />
        </Field>
      )}
      <Field label="Мансарда">
        <Switch active={!!hd?.hasAttic} onClick={() => set("houseData.hasAttic", !hd?.hasAttic)} label="Є житлова мансарда" />
      </Field>
      {hd?.hasAttic && (
        <Field label="Площа мансарди, м²">
          <TextInput value={hd.atticArea ?? ""} onChange={(v) => set("houseData.atticArea", v)} placeholder="60" />
        </Field>
      )}
      <Field label="Гараж">
        <Switch active={!!hd?.hasGarage} onClick={() => set("houseData.hasGarage", !hd?.hasGarage)} label="Є гараж" />
      </Field>
      {hd?.hasGarage && (
        <>
          <Field label="Площа гаража, м²">
            <TextInput value={hd.garageArea ?? ""} onChange={(v) => set("houseData.garageArea", v)} placeholder="30" />
          </Field>
          <Field label="Тип гаража">
            <Grid>
              {(["attached", "detached"] as const).map((s) => (
                <Choice key={s} label={s === "attached" ? "Прибудований" : "Окремостоячий"} active={hd.garageType === s} onClick={() => set("houseData.garageType", s)} />
              ))}
            </Grid>
          </Field>
        </>
      )}
    </>
  );
}

function RenovationCurrentStep({ data, set }: { data: WizardData; set: SetNested }) {
  const rd = data.renovationData;
  const stages: { value: NonNullable<typeof rd>["currentStage"]; label: string }[] = [
    { value: "bare_concrete", label: "Голий бетон" },
    { value: "rough_walls", label: "Чорнова штукатурка є" },
    { value: "rough_floor", label: "Чорнова стяжка є" },
    { value: "utilities_installed", label: "Комунікації встановлені" },
    { value: "ready_for_finish", label: "Готово під чистове" },
  ];
  const existingFields: { key: keyof NonNullable<NonNullable<typeof rd>["existing"]>; label: string }[] = [
    { key: "roughPlaster", label: "Чорнова штукатурка" },
    { key: "roughFloor", label: "Чорнова стяжка" },
    { key: "finishFloor", label: "Чистова підлога" },
    { key: "electricalRoughIn", label: "Електрика прокладена" },
    { key: "plumbingRoughIn", label: "Сантехніка прокладена" },
    { key: "heatingRoughIn", label: "Опалення прокладене" },
    { key: "windowsInstalled", label: "Вікна встановлені" },
    { key: "doorsInstalled", label: "Двері встановлені" },
  ];
  return (
    <>
      <Field label="Поточний етап">
        <Grid>
          {stages.map((s) => (
            <Choice key={s.value} label={s.label} active={rd?.currentStage === s.value} onClick={() => set("renovationData.currentStage", s.value)} />
          ))}
        </Grid>
      </Field>
      <Field label="Що вже зроблено (НЕ повторюватимемо)">
        <div className="grid grid-cols-2 gap-2">
          {existingFields.map((f) => (
            <Switch
              key={f.key}
              active={!!rd?.existing?.[f.key]}
              onClick={() => set(`renovationData.existing.${f.key}`, !rd?.existing?.[f.key])}
              label={f.label}
            />
          ))}
        </div>
      </Field>
    </>
  );
}

function RenovationRoomsStep({ data, set }: { data: WizardData; set: SetNested }) {
  const r = data.renovationData?.rooms;
  const fields: { key: keyof NonNullable<typeof r>; label: string }[] = [
    { key: "bedrooms", label: "Спальні" },
    { key: "bathrooms", label: "Санвузли" },
    { key: "kitchen", label: "Кухня" },
    { key: "living", label: "Вітальня" },
    { key: "other", label: "Інші приміщення" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((f) => (
        <Field key={f.key} label={f.label}>
          <TextInput
            value={String(r?.[f.key] ?? 0)}
            onChange={(v) => set(`renovationData.rooms.${f.key}`, Number(v) || 0)}
            placeholder="0"
          />
        </Field>
      ))}
    </div>
  );
}

function RenovationWorkStep({ data, set }: { data: WizardData; set: SetNested }) {
  const rd = data.renovationData;
  const works: { key: string; label: string }[] = [
    { key: "demolition", label: "Демонтаж" },
    { key: "roughPlaster", label: "Чорнова штукатурка" },
    { key: "roughFloor", label: "Чорнова стяжка" },
    { key: "electrical", label: "Електрика" },
    { key: "plumbing", label: "Сантехніка" },
    { key: "heating", label: "Опалення" },
    { key: "finishPlaster", label: "Фінішна штукатурка" },
    { key: "painting", label: "Фарбування" },
    { key: "flooring", label: "Підлога" },
    { key: "tiling", label: "Плитка" },
    { key: "windows", label: "Вікна" },
    { key: "doors", label: "Двері" },
  ];
  return (
    <>
      <Field label="Які роботи потрібні">
        <div className="grid grid-cols-2 gap-2">
          {works.map((w) => (
            <Switch
              key={w.key}
              active={!!(rd?.workRequired as any)?.[w.key]}
              onClick={() => set(`renovationData.workRequired.${w.key}`, !(rd?.workRequired as any)?.[w.key])}
              label={w.label}
            />
          ))}
        </div>
      </Field>
      <Field label="Тип стелі">
        <Grid>
          {(["paint", "drywall", "suspended", "stretch", "none"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "paint" ? "Фарба" : s === "drywall" ? "Гіпсокартон" : s === "suspended" ? "Підвісна" : s === "stretch" ? "Натяжна" : "Без стелі"}
              active={rd?.workRequired?.ceiling === s}
              onClick={() => set("renovationData.workRequired.ceiling", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Перепланування">
        <div className="flex flex-col gap-2">
          <Switch active={!!rd?.layoutChange} onClick={() => set("renovationData.layoutChange", !rd?.layoutChange)} label="Зміна планування" />
          <Switch active={!!rd?.newPartitions} onClick={() => set("renovationData.newPartitions", !rd?.newPartitions)} label="Нові перегородки" />
        </div>
      </Field>
      {rd?.newPartitions && (
        <Field label="Довжина нових перегородок, м.п.">
          <TextInput value={rd.newPartitionsLength ?? ""} onChange={(v) => set("renovationData.newPartitionsLength", v)} placeholder="20" />
        </Field>
      )}
    </>
  );
}

function CommercialPurposeStep({ data, set }: { data: WizardData; set: SetNested }) {
  const cd = data.commercialData;
  const purposes: { value: NonNullable<typeof cd>["purpose"]; label: string }[] = [
    { value: "shop", label: "Магазин" },
    { value: "restaurant", label: "Ресторан" },
    { value: "warehouse", label: "Склад" },
    { value: "production", label: "Виробництво" },
    { value: "showroom", label: "Шоурум" },
    { value: "other", label: "Інше" },
  ];
  const states: { value: NonNullable<NonNullable<typeof cd>["currentState"]>; label: string }[] = [
    { value: "greenfield", label: "Чиста ділянка" },
    { value: "existing_building", label: "Існуюча будівля (демонтаж)" },
    { value: "existing_renovation", label: "Існуюче приміщення (ремонт)" },
  ];
  return (
    <>
      <Field label="Призначення приміщення">
        <Grid>
          {purposes.map((p) => (
            <Choice key={p.value} label={p.label} active={cd?.purpose === p.value} onClick={() => set("commercialData.purpose", p.value)} />
          ))}
        </Grid>
      </Field>
      <Field label="Поточний стан">
        <Grid>
          {states.map((s) => (
            <Choice key={s.value} label={s.label} active={cd?.currentState === s.value} onClick={() => set("commercialData.currentState", s.value)} />
          ))}
        </Grid>
      </Field>
      <Field label="Демонтаж">
        <Switch active={!!cd?.demolitionRequired} onClick={() => set("commercialData.demolitionRequired", !cd?.demolitionRequired)} label="Потрібен демонтаж існуючого" />
      </Field>
      {cd?.demolitionRequired && (
        <Field label="Опис демонтажу">
          <TextArea value={cd.demolitionDescription ?? ""} onChange={(v) => set("commercialData.demolitionDescription", v)} placeholder="Що демонтувати…" />
        </Field>
      )}
    </>
  );
}

function CommercialFloorStep({ data, set }: { data: WizardData; set: SetNested }) {
  const f = data.commercialData?.floor;
  return (
    <>
      <Field label="Тип підлоги">
        <Grid>
          {(["industrial", "standard"] as const).map((s) => (
            <Choice key={s} label={s === "industrial" ? "Промислова" : "Стандартна"} active={f?.type === s} onClick={() => set("commercialData.floor.type", s)} />
          ))}
        </Grid>
      </Field>
      <Field label="Покриття">
        <Grid>
          {(["epoxy", "polyurethane", "tile", "concrete", "other"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "epoxy" ? "Епоксид" : s === "polyurethane" ? "Поліуретан" : s === "tile" ? "Плитка" : s === "concrete" ? "Бетон" : "Інше"}
              active={f?.coating === s}
              onClick={() => set("commercialData.floor.coating", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Навантаження, кг/м²">
        <TextInput value={String(f?.loadCapacity ?? "")} onChange={(v) => set("commercialData.floor.loadCapacity", Number(v) || 0)} placeholder="500" />
      </Field>
      <Field label="Антистатика">
        <Switch active={!!f?.antiStatic} onClick={() => set("commercialData.floor.antiStatic", !f?.antiStatic)} label="Антистатичне покриття" />
      </Field>
    </>
  );
}

function CommercialSpecialStep({ data, set }: { data: WizardData; set: SetNested }) {
  const cd = data.commercialData;
  return (
    <Field label="Спеціальні системи">
      <div className="flex flex-col gap-2">
        <Switch active={!!cd?.fireRating} onClick={() => set("commercialData.fireRating", !cd?.fireRating)} label="Протипожежна система (спринклери, сповіщення)" />
        <Switch active={!!cd?.hvac} onClick={() => set("commercialData.hvac", !cd?.hvac)} label="Промислова вентиляція" />
        <Switch active={!!cd?.heavyDutyElectrical} onClick={() => set("commercialData.heavyDutyElectrical", !cd?.heavyDutyElectrical)} label="Промислова електрика (3-фази)" />
        <Switch active={!!cd?.accessControl} onClick={() => set("commercialData.accessControl", !cd?.accessControl)} label="Контроль доступу" />
        <Switch active={!!cd?.surveillance} onClick={() => set("commercialData.surveillance", !cd?.surveillance)} label="Відеоспостереження" />
      </div>
    </Field>
  );
}

function EngineeringStep({ data, set }: { data: WizardData; set: SetNested }) {
  const u = data.utilities;
  return (
    <>
      <Field label="Електрика">
        <Grid>
          <Choice label="Однофазна (220В)" active={u?.electrical?.power === "single_phase"} onClick={() => set("utilities.electrical.power", "single_phase")} />
          <Choice label="Трифазна (380В)" active={u?.electrical?.power === "three_phase"} onClick={() => set("utilities.electrical.power", "three_phase")} />
        </Grid>
      </Field>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Потужність, кВт">
          <TextInput value={String(u?.electrical?.capacity ?? "")} onChange={(v) => set("utilities.electrical.capacity", Number(v) || 0)} placeholder="15" />
        </Field>
        <Field label="Розеток">
          <TextInput value={String(u?.electrical?.outlets ?? 0)} onChange={(v) => set("utilities.electrical.outlets", Number(v) || 0)} />
        </Field>
        <Field label="Вимикачів">
          <TextInput value={String(u?.electrical?.switches ?? 0)} onChange={(v) => set("utilities.electrical.switches", Number(v) || 0)} />
        </Field>
        <Field label="Точок освітлення">
          <TextInput value={String(u?.electrical?.lightPoints ?? 0)} onChange={(v) => set("utilities.electrical.lightPoints", Number(v) || 0)} />
        </Field>
      </div>
      <Field label="Підключення">
        <div className="flex flex-col gap-2">
          <Switch active={!!u?.electrical?.outdoorLighting} onClick={() => set("utilities.electrical.outdoorLighting", !u?.electrical?.outdoorLighting)} label="Зовнішнє освітлення" />
          <Switch active={!!u?.electrical?.needsConnection} onClick={() => set("utilities.electrical.needsConnection", !u?.electrical?.needsConnection)} label="Потрібен підвід від мережі" />
          <Switch active={!!u?.electrical?.needsTransformer} onClick={() => set("utilities.electrical.needsTransformer", !u?.electrical?.needsTransformer)} label="Потрібна трансформаторна підстанція" />
        </div>
      </Field>
      {u?.electrical?.needsConnection && (
        <Field label="Відстань до мережі, м">
          <TextInput value={String(u.electrical.connectionDistance ?? "")} onChange={(v) => set("utilities.electrical.connectionDistance", Number(v) || 0)} />
        </Field>
      )}

      <Field label="Опалення">
        <Grid>
          {(["none", "gas", "electric", "heat_pump", "solid_fuel"] as const).map((h) => (
            <Choice
              key={h}
              label={h === "none" ? "Немає" : h === "gas" ? "Газ" : h === "electric" ? "Електро" : h === "heat_pump" ? "Тепловий насос" : "Тверде паливо"}
              active={u?.heating?.type === h}
              onClick={() => set("utilities.heating.type", h)}
            />
          ))}
        </Grid>
      </Field>
      {u?.heating?.type && u.heating.type !== "none" && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Потужність котла, кВт">
            <TextInput value={String(u.heating.boilerPower ?? "")} onChange={(v) => set("utilities.heating.boilerPower", Number(v) || 0)} />
          </Field>
          <Field label="Радіаторів">
            <TextInput value={String(u.heating.radiators ?? 0)} onChange={(v) => set("utilities.heating.radiators", Number(v) || 0)} />
          </Field>
          <Field label="Тепла підлога, м²">
            <TextInput value={u.heating.underfloorArea ?? ""} onChange={(v) => { set("utilities.heating.underfloor", true); set("utilities.heating.underfloorArea", v); }} placeholder="0 = немає" />
          </Field>
        </div>
      )}
      {u?.heating?.type === "gas" && (
        <Field label="Підключення газу">
          <div className="flex flex-col gap-2">
            <Switch active={!!u.heating.needsGasConnection} onClick={() => set("utilities.heating.needsGasConnection", !u.heating.needsGasConnection)} label="Потрібен підвід газу" />
            {u.heating.needsGasConnection && (
              <TextInput value={String(u.heating.gasConnectionDistance ?? "")} onChange={(v) => set("utilities.heating.gasConnectionDistance", Number(v) || 0)} placeholder="Відстань, м" />
            )}
          </div>
        </Field>
      )}

      <Field label="Водопостачання">
        <div className="flex flex-col gap-2">
          <Switch active={!!u?.water?.coldWater} onClick={() => set("utilities.water.coldWater", !u?.water?.coldWater)} label="Холодна вода" />
          <Switch active={!!u?.water?.hotWater} onClick={() => set("utilities.water.hotWater", !u?.water?.hotWater)} label="Гаряча вода" />
        </div>
      </Field>
      <Field label="Джерело води">
        <Grid>
          {(["central", "well", "borehole"] as const).map((s) => (
            <Choice key={s} label={s === "central" ? "Центральне" : s === "well" ? "Колодязь" : "Свердловина"} active={u?.water?.source === s} onClick={() => set("utilities.water.source", s)} />
          ))}
        </Grid>
      </Field>
      {u?.water?.hotWater && (
        <>
          <Field label="Тип бойлера">
            <Grid>
              {(["gas", "electric", "none"] as const).map((s) => (
                <Choice key={s} label={s === "gas" ? "Газовий" : s === "electric" ? "Електричний" : "Немає"} active={u?.water?.boilerType === s} onClick={() => set("utilities.water.boilerType", s)} />
              ))}
            </Grid>
          </Field>
          {u?.water?.boilerType && u.water.boilerType !== "none" && (
            <Field label="Об'єм бойлера, л">
              <TextInput value={String(u.water.boilerVolume ?? 100)} onChange={(v) => set("utilities.water.boilerVolume", Number(v) || 100)} />
            </Field>
          )}
        </>
      )}
      <Field label="Підключення води">
        <div className="flex flex-col gap-2">
          <Switch active={!!u?.water?.needsConnection} onClick={() => set("utilities.water.needsConnection", !u?.water?.needsConnection)} label="Потрібен підвід води" />
          <Switch active={!!u?.water?.needsPump} onClick={() => set("utilities.water.needsPump", !u?.water?.needsPump)} label="Насосна станція" />
        </div>
      </Field>

      <Field label="Каналізація">
        <Grid>
          {(["central", "septic", "treatment"] as const).map((s) => (
            <Choice key={s} label={s === "central" ? "Центральна" : s === "septic" ? "Септик" : "Станція очистки"} active={u?.sewerage?.type === s} onClick={() => set("utilities.sewerage.type", s)} />
          ))}
        </Grid>
      </Field>
      <Field label="Обладнання каналізації">
        <div className="flex flex-col gap-2">
          <Switch active={!!u?.sewerage?.pumpNeeded} onClick={() => set("utilities.sewerage.pumpNeeded", !u?.sewerage?.pumpNeeded)} label="Фекальний насос" />
          <Switch active={!!u?.sewerage?.needsLift} onClick={() => set("utilities.sewerage.needsLift", !u?.sewerage?.needsLift)} label="Підіймальна установка (для підвалу)" />
        </div>
      </Field>

      <Field label="Вентиляція">
        <div className="flex flex-col gap-2">
          <Switch active={!!u?.ventilation?.natural} onClick={() => set("utilities.ventilation.natural", !u?.ventilation?.natural)} label="Природна" />
          <Switch active={!!u?.ventilation?.forced} onClick={() => set("utilities.ventilation.forced", !u?.ventilation?.forced)} label="Примусова" />
          <Switch active={!!u?.ventilation?.recuperation} onClick={() => set("utilities.ventilation.recuperation", !u?.ventilation?.recuperation)} label="Рекуперація" />
        </div>
      </Field>
    </>
  );
}

function FinishingStep({ data, set }: { data: WizardData; set: SetNested }) {
  const f = data.finishing;
  return (
    <>
      <Field label="Матеріал стін">
        <Grid>
          {(["paint", "wallpaper", "tile", "panels", "mixed", "industrial_paint", "concrete_finish"] as const).map((s) => (
            <Choice
              key={s}
              label={s === "paint" ? "Фарба" : s === "wallpaper" ? "Шпалери" : s === "tile" ? "Плитка" : s === "panels" ? "Панелі" : s === "mixed" ? "Мікс" : s === "industrial_paint" ? "Промислова фарба" : "Бетон-декор"}
              active={f?.walls?.material === s}
              onClick={() => set("finishing.walls.material", s)}
            />
          ))}
        </Grid>
      </Field>
      <Field label="Рівень оздоблення">
        <Grid>
          {(["economy", "standard", "premium"] as const).map((q) => (
            <Choice key={q} label={q === "economy" ? "Економ" : q === "standard" ? "Стандарт" : "Преміум"} active={f?.walls?.qualityLevel === q} onClick={() => set("finishing.walls.qualityLevel", q)} />
          ))}
        </Grid>
      </Field>
      {f?.walls?.material === "tile" && (
        <Field label="Площа плитки на стінах, м²">
          <TextInput value={String(f.walls.tileArea ?? "")} onChange={(v) => set("finishing.walls.tileArea", Number(v) || 0)} />
        </Field>
      )}

      <Field label="Підлога — площі за типом, м²">
        <div className="grid grid-cols-3 gap-3">
          {(["tile", "laminate", "parquet", "vinyl", "carpet", "epoxy"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                {k === "tile" ? "ПЛИТКА" : k === "laminate" ? "ЛАМІНАТ" : k === "parquet" ? "ПАРКЕТ" : k === "vinyl" ? "ВІНІЛ" : k === "carpet" ? "КОВРОЛІН" : "ЕПОКСИД"}
              </span>
              <TextInput value={String(f?.flooring?.[k] ?? "")} onChange={(v) => set(`finishing.flooring.${k}`, Number(v) || 0)} placeholder="0" />
            </div>
          ))}
        </div>
      </Field>

      <Field label="Стеля">
        <Grid>
          {(["paint", "drywall", "suspended", "stretch"] as const).map((s) => (
            <Choice key={s} label={s === "paint" ? "Фарба" : s === "drywall" ? "Гіпсокартон" : s === "suspended" ? "Підвісна" : "Натяжна"} active={f?.ceiling?.type === s} onClick={() => set("finishing.ceiling.type", s)} />
          ))}
        </Grid>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Рівнів стелі">
          <Grid>
            {([1, 2, 3] as const).map((n) => (
              <Choice key={n} label={String(n)} active={f?.ceiling?.levels === n} onClick={() => set("finishing.ceiling.levels", n)} />
            ))}
          </Grid>
        </Field>
        <Field label="Освітлення">
          <Grid>
            {(["spots", "chandelier", "led", "mixed"] as const).map((s) => (
              <Choice key={s} label={s === "spots" ? "Точкове" : s === "chandelier" ? "Люстра" : s === "led" ? "LED стрічка" : "Мікс"} active={f?.ceiling?.lighting === s} onClick={() => set("finishing.ceiling.lighting", s)} />
            ))}
          </Grid>
        </Field>
      </div>
    </>
  );
}

function OpeningsStep({ data, set }: { data: WizardData; set: SetNested }) {
  const o = data.openings;
  return (
    <>
      <Field label="Вікна">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>КІЛЬКІСТЬ</span>
            <TextInput value={String(o?.windows?.count ?? 0)} onChange={(v) => set("openings.windows.count", Number(v) || 0)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>ЗАГ. ПЛОЩА, м²</span>
            <TextInput value={String(o?.windows?.totalArea ?? "")} onChange={(v) => set("openings.windows.totalArea", Number(v) || 0)} />
          </div>
        </div>
      </Field>
      <Field label="Тип вікон">
        <Grid>
          {(["plastic", "wood", "aluminum"] as const).map((s) => (
            <Choice key={s} label={s === "plastic" ? "Пластикові" : s === "wood" ? "Дерев'яні" : "Алюмінієві"} active={o?.windows?.type === s} onClick={() => set("openings.windows.type", s)} />
          ))}
        </Grid>
      </Field>
      <Field label="Склопакет">
        <Grid>
          {(["single", "double", "triple"] as const).map((s) => (
            <Choice key={s} label={s === "single" ? "Одинарний" : s === "double" ? "Двокамерний" : "Трикамерний"} active={o?.windows?.glazing === s} onClick={() => set("openings.windows.glazing", s)} />
          ))}
        </Grid>
      </Field>

      <Field label="Двері">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>ВХІДНІ, шт</span>
            <TextInput value={String(o?.doors?.entrance ?? 0)} onChange={(v) => set("openings.doors.entrance", Number(v) || 0)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>МІЖКІМНАТНІ, шт</span>
            <TextInput value={String(o?.doors?.interior ?? 0)} onChange={(v) => set("openings.doors.interior", Number(v) || 0)} />
          </div>
        </div>
      </Field>
      <Field label="Тип дверей">
        <Grid>
          {(["standard", "premium"] as const).map((s) => (
            <Choice key={s} label={s === "standard" ? "Стандарт" : "Преміум"} active={o?.doors?.type === s} onClick={() => set("openings.doors.type", s)} />
          ))}
        </Grid>
      </Field>
    </>
  );
}

function SummaryStep({ data, set }: { data: WizardData; set: SetNested }) {
  return (
    <>
      <Field label="Особливі вимоги">
        <TextArea
          value={data.specialRequirements ?? ""}
          onChange={(v) => set("specialRequirements", v)}
          placeholder="Опишіть особливі вимоги, обмеження, ризики проєкту…"
          rows={6}
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
          Натисніть «Завершити», щоб зберегти налаштування. Усі дані будуть надіслані в AI разом з файлами при наступній генерації — кожне поле впливає на формування кошторису через ProjectFacts → Quantity Engine → Master Agent.
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Reusable UI                                                            */
/* ────────────────────────────────────────────────────────────────────── */

function Step({ n, title, state }: { n: number; title: string; state: "done" | "active" | "pending" }) {
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
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
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

function Switch({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="resize-none rounded-xl px-4 py-3.5 text-[13px] leading-relaxed outline-none"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
      }}
    />
  );
}
