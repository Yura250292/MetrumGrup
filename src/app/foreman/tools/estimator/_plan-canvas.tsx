"use client";

import { useEffect, useMemo, useState } from "react";
import { DoorOpen, Ruler } from "lucide-react";
import { bbox } from "@/lib/foreman/geometry";
import type { Room, Side } from "@/lib/foreman/geometry";
import { parseNum, formatNum } from "@/lib/foreman/format";
import type { FloorPlan } from "./_types";
import { InteractivePlanView } from "./_interactive-plan-view";

interface Props {
  plan: FloorPlan;
  onChangeDefaultCeiling: (value: number) => void;
  onAddFirst: (length: number, width: number, name: string, height: number) => void;
  onPlusClick: (parentId: string, side: Side) => void;
  onRoomTap: (room: Room) => void;
  onWallTap: (roomId: string, side: Side, offset: number) => void;
}

export function PlanCanvas({
  plan,
  onChangeDefaultCeiling,
  onAddFirst,
  onPlusClick,
  onRoomTap,
  onWallTap,
}: Props) {
  const hasRooms = plan.rooms.length > 0;

  // Локальний текстовий стан інпута висоти — щоб можна було друкувати "2."
  // та "2,7". Прямий binding до числа з'їдав крапку: кожна клавіша
  // пере-парситься у число і "2." миттєво ставало "2".
  const [ceilingText, setCeilingText] = useState(() =>
    String(plan.defaultCeilingHeight),
  );
  // Синхронізація лише коли значення приходить ззовні (гідрація чернетки).
  useEffect(() => {
    if (parseNum(ceilingText) !== plan.defaultCeilingHeight) {
      setCeilingText(String(plan.defaultCeilingHeight));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.defaultCeilingHeight]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Висота стелі за замовчуванням, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={ceilingText}
            onChange={(e) => {
              const raw = e.target.value;
              setCeilingText(raw);
              const v = parseNum(raw);
              if (v > 0) onChangeDefaultCeiling(v);
            }}
            onBlur={() => {
              const v = parseNum(ceilingText);
              setCeilingText(
                v > 0 ? String(v) : String(plan.defaultCeilingHeight),
              );
            }}
            className="mt-1 w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-violet-500/60 focus:outline-none"
          />
          <span className="block mt-1 text-[11px] text-zinc-500">
            Можна змінити окремо для кожної кімнати.
          </span>
        </label>
      </div>

      {!hasRooms ? (
        <FirstRoomForm defaultHeight={plan.defaultCeilingHeight} onSubmit={onAddFirst} />
      ) : (
        <PlanWithControls
          plan={plan}
          onPlusClick={onPlusClick}
          onRoomTap={onRoomTap}
          onWallTap={onWallTap}
        />
      )}
    </div>
  );
}

function FirstRoomForm({
  defaultHeight,
  onSubmit,
}: {
  defaultHeight: number;
  onSubmit: (length: number, width: number, name: string, height: number) => void;
}) {
  const [name, setName] = useState("Основна");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const l = parseNum(length);
  const w = parseNum(width);
  const valid = l > 0 && w > 0;

  return (
    <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-violet-300">
        <Ruler size={16} />
        <span className="text-xs uppercase tracking-wider font-bold">Перша кімната</span>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed">
        Введіть розміри першої кімнати — це буде стартовий прямокутник плану.
      </p>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Назва</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Кімната"
          className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-violet-500/60 focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Довжина, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="4"
            className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Ширина, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            placeholder="3"
            className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
          />
        </label>
      </div>

      <div className="text-xs text-zinc-500 text-right tabular-nums">
        = {formatNum(l * w)} м²
      </div>

      <button
        type="button"
        disabled={!valid}
        onClick={() => onSubmit(l, w, name.trim() || "Кімната", defaultHeight)}
        className="w-full min-h-[48px] rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
      >
        Створити план
      </button>
    </div>
  );
}

function PlanWithControls({
  plan,
  onPlusClick,
  onRoomTap,
  onWallTap,
}: {
  plan: FloorPlan;
  onPlusClick: (parentId: string, side: Side) => void;
  onRoomTap: (room: Room) => void;
  onWallTap: (roomId: string, side: Side, offset: number) => void;
}) {
  const [viewMode, setViewMode] = useState<"rooms" | "openings">("rooms");
  const b = useMemo(() => bbox(plan.rooms), [plan.rooms]);
  const totalArea = useMemo(
    () => plan.rooms.reduce((sum, r) => sum + r.w * r.h, 0),
    [plan.rooms],
  );

  const modeToggle = (
    <>
      <button
        type="button"
        onClick={() => setViewMode((m) => (m === "rooms" ? "openings" : "rooms"))}
        className={`flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold border backdrop-blur transition active:scale-95 ${
          viewMode === "openings"
            ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
            : "bg-zinc-900/85 border-white/10 text-zinc-200"
        }`}
        aria-label="Режим прорізів"
        title={
          viewMode === "openings"
            ? "Тап по стіні — додати проріз. Натисни ще раз щоб вийти."
            : "Увімкнути режим додавання прорізів"
        }
      >
        <DoorOpen size={14} />
        {viewMode === "openings" ? "Прорізи: ON" : "Прорізи"}
      </button>
      {viewMode === "openings" && (
        <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-100 backdrop-blur leading-snug max-w-[200px]">
          Тап по стіні → AI визначить найближчу грань і відкриє sheet.
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      <InteractivePlanView
        plan={plan}
        heightClass="h-[360px]"
        onPlusClick={onPlusClick}
        onRoomTap={onRoomTap}
        onWallTap={onWallTap}
        viewMode={viewMode}
        topLeftOverlay={modeToggle}
      />

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Кімнат" value={String(plan.rooms.length)} />
        <Stat label="Загальна підлога" value={`${formatNum(totalArea)} м²`} />
        <Stat label="Розміри" value={`${formatNum(b.w)}×${formatNum(b.h)} м`} />
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed text-center px-2">
        Тап «+» — додати кімнату. Тап по кімнаті — висота, прорізи, видалення.
        Пінч/перетягування — масштаб і огляд.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 px-2 py-2">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
      <div className="text-sm font-semibold text-zinc-100 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
