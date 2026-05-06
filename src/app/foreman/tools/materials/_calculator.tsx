"use client";

import { useMemo, useState } from "react";

type Unit = "kg" | "l" | "pcs" | "m";
type Surface = "floor" | "walls" | "ceiling" | "custom";

interface MaterialPreset {
  id: string;
  name: string;
  category: string;
  /** Витрата матеріалу на 1 м² (або 1 м для м-розрахунків). */
  consumptionPerSqm: number;
  unit: Unit;
  /** Default surface (floor/walls/ceiling) to apply to. */
  defaultSurface: Surface;
  /** Запас % за замовчуванням. */
  reservePercent: number;
}

const PRESETS: MaterialPreset[] = [
  // Підлога
  { id: "floor-tile", name: "Плитка для підлоги", category: "Підлога", consumptionPerSqm: 1, unit: "pcs", defaultSurface: "floor", reservePercent: 10 },
  { id: "tile-glue", name: "Плитковий клей", category: "Клей", consumptionPerSqm: 4.5, unit: "kg", defaultSurface: "floor", reservePercent: 10 },
  { id: "self-leveling", name: "Нівелірмаса", category: "Підлога", consumptionPerSqm: 15, unit: "kg", defaultSurface: "floor", reservePercent: 5 },
  { id: "screed", name: "Цементна стяжка (на 1 см)", category: "Підлога", consumptionPerSqm: 18, unit: "kg", defaultSurface: "floor", reservePercent: 5 },

  // Стіни
  { id: "wall-tile", name: "Плитка для стін", category: "Стіни", consumptionPerSqm: 1, unit: "pcs", defaultSurface: "walls", reservePercent: 10 },
  { id: "primer", name: "Ґрунтовка глибокого проникнення", category: "Стіни", consumptionPerSqm: 0.15, unit: "l", defaultSurface: "walls", reservePercent: 5 },
  { id: "putty-start", name: "Шпаклівка стартова", category: "Стіни", consumptionPerSqm: 1.2, unit: "kg", defaultSurface: "walls", reservePercent: 10 },
  { id: "putty-finish", name: "Шпаклівка фінішна", category: "Стіни", consumptionPerSqm: 1.0, unit: "kg", defaultSurface: "walls", reservePercent: 10 },
  { id: "plaster-gypsum", name: "Штукатурка гіпсова (на 1 см)", category: "Стіни", consumptionPerSqm: 9, unit: "kg", defaultSurface: "walls", reservePercent: 5 },
  { id: "plaster-cement", name: "Штукатурка цементна (на 1 см)", category: "Стіни", consumptionPerSqm: 16, unit: "kg", defaultSurface: "walls", reservePercent: 5 },
  { id: "paint-water", name: "Фарба водо-емульсійна", category: "Стіни", consumptionPerSqm: 0.18, unit: "l", defaultSurface: "walls", reservePercent: 5 },
  { id: "drywall", name: "Гіпсокартон 1.2×2.5м (3м²)", category: "Стіни", consumptionPerSqm: 1 / 3, unit: "pcs", defaultSurface: "walls", reservePercent: 10 },

  // Стеля
  { id: "ceiling-paint", name: "Фарба для стелі", category: "Стеля", consumptionPerSqm: 0.18, unit: "l", defaultSurface: "ceiling", reservePercent: 5 },
  { id: "ceiling-primer", name: "Ґрунтовка стелі", category: "Стеля", consumptionPerSqm: 0.15, unit: "l", defaultSurface: "ceiling", reservePercent: 5 },
];

const UNIT_LABELS: Record<Unit, string> = { kg: "кг", l: "л", pcs: "шт", m: "м" };
const SURFACE_LABELS: Record<Surface, string> = {
  floor: "Підлога",
  walls: "Стіни",
  ceiling: "Стеля",
  custom: "Вручну",
};

const parseNum = (s: string | undefined): number => {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatNum = (n: number, digits = 2) =>
  n.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: digits });

interface Props {
  prefilledFloor?: string;
  prefilledWalls?: string;
  prefilledCeiling?: string;
}

export function MaterialsCalculator({ prefilledFloor, prefilledWalls, prefilledCeiling }: Props) {
  const [floor, setFloor] = useState(prefilledFloor ?? "");
  const [walls, setWalls] = useState(prefilledWalls ?? "");
  const [ceiling, setCeiling] = useState(prefilledCeiling ?? "");
  const [reservePct, setReservePct] = useState("10");
  const [tileSize, setTileSize] = useState("0.6"); // довжина грані плитки, м (60×60см default)

  const areaFor = (surface: Surface): number => {
    switch (surface) {
      case "floor":
        return parseNum(floor);
      case "walls":
        return parseNum(walls);
      case "ceiling":
        return parseNum(ceiling);
      default:
        return 0;
    }
  };

  const reservedAreas = useMemo(() => {
    const r = 1 + parseNum(reservePct) / 100;
    return {
      floor: parseNum(floor) * r,
      walls: parseNum(walls) * r,
      ceiling: parseNum(ceiling) * r,
    };
  }, [floor, walls, ceiling, reservePct]);

  const grouped = useMemo(() => {
    const cats = new Map<string, MaterialPreset[]>();
    for (const p of PRESETS) {
      if (!cats.has(p.category)) cats.set(p.category, []);
      cats.get(p.category)!.push(p);
    }
    return cats;
  }, []);

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
        <p className="text-sm text-zinc-400 leading-relaxed">
          Введіть площі та запас. Норми витрати — типові для українських будматеріалів.
          Перевір на упаковці конкретного бренду.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Підлога, м²" value={floor} onChange={setFloor} />
          <Field label="Стеля, м²" value={ceiling} onChange={setCeiling} />
          <Field label="Стіни, м²" value={walls} onChange={setWalls} full />
          <Field label="Запас, %" value={reservePct} onChange={setReservePct} />
          <Field label="Грань плитки, м" value={tileSize} onChange={setTileSize} />
        </div>
      </div>

      {Array.from(grouped.entries()).map(([cat, items]) => (
        <section
          key={cat}
          className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 overflow-hidden"
        >
          <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
            {cat}
          </div>
          <ul className="divide-y divide-white/5">
            {items.map((m) => {
              let qty = 0;
              const baseArea = areaFor(m.defaultSurface);
              if (baseArea > 0) {
                if (m.unit === "pcs" && m.id.includes("tile")) {
                  // Плитка — рахуємо за площею грані
                  const tileArea = parseNum(tileSize) ** 2;
                  qty = tileArea > 0 ? Math.ceil((baseArea * (1 + parseNum(reservePct) / 100)) / tileArea) : 0;
                } else if (m.id === "drywall") {
                  // Гіпсокартон 3м² — лист
                  qty = Math.ceil(baseArea * (1 + parseNum(reservePct) / 100) / 3);
                } else {
                  qty = baseArea * (1 + parseNum(reservePct) / 100) * m.consumptionPerSqm;
                }
              }
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{m.name}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      {SURFACE_LABELS[m.defaultSurface]} ·{" "}
                      {m.unit === "pcs" && m.id.includes("tile")
                        ? `плитка ${tileSize}×${tileSize} м`
                        : `${m.consumptionPerSqm} ${UNIT_LABELS[m.unit]}/м²`}
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    {qty > 0 ? (
                      <>
                        <div className="text-base font-bold text-violet-300">
                          {m.unit === "pcs" || m.id === "drywall" ? Math.ceil(qty) : formatNum(qty)}
                          <span className="text-xs text-violet-400/70 ml-1">
                            {UNIT_LABELS[m.unit]}
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="text-[11px] text-zinc-500 leading-relaxed text-center px-2">
        Розрахунок з запасом {reservePct || 0}% від «чистої» площі. Підлога ={" "}
        {formatNum(reservedAreas.floor)} м² · Стіни = {formatNum(reservedAreas.walls)} м² · Стеля ={" "}
        {formatNum(reservedAreas.ceiling)} м².
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9.,]*"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-violet-500/60 focus:outline-none"
      />
    </label>
  );
}
