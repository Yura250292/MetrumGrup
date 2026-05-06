"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Trash2, ArrowRight } from "lucide-react";

type ShapeKind = "rect" | "subtract";

interface Shape {
  id: string;
  kind: ShapeKind;
  name: string;
  length: string;
  width: string;
}

let counter = 0;
const newShape = (kind: ShapeKind): Shape => {
  counter += 1;
  return {
    id: `s-${Date.now()}-${counter}`,
    kind,
    name: kind === "rect" ? "Прямокутник" : "Виріз",
    length: "",
    width: "",
  };
};

const parseNum = (s: string): number => {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatNum = (n: number, digits = 2): string =>
  n.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: digits });

export function AreaCalculator() {
  const [shapes, setShapes] = useState<Shape[]>([newShape("rect")]);
  const [height, setHeight] = useState("2.7");

  const totals = useMemo(() => {
    let floor = 0;
    let perimeter = 0;
    for (const s of shapes) {
      const l = parseNum(s.length);
      const w = parseNum(s.width);
      const a = l * w;
      if (s.kind === "rect") {
        floor += a;
        perimeter += 2 * (l + w);
      } else {
        floor -= a;
      }
    }
    const h = parseNum(height);
    const walls = perimeter * h;
    const ceiling = Math.max(floor, 0);
    return {
      floor: Math.max(floor, 0),
      perimeter: Math.max(perimeter, 0),
      walls: Math.max(walls, 0),
      ceiling,
    };
  }, [shapes, height]);

  const update = (id: string, patch: Partial<Shape>) => {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const remove = (id: string) => {
    setShapes((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  };

  // Pass area to materials calc
  const materialsHref = `/foreman/tools/materials?floor=${totals.floor.toFixed(2)}&walls=${totals.walls.toFixed(2)}&ceiling=${totals.ceiling.toFixed(2)}`;

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
        <p className="text-sm text-zinc-400 leading-relaxed">
          Введіть розміри прямокутників. Можна додати «виріз» (двері, ніші, вікна) — буде віднято з площі.
        </p>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Висота стелі, м
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="2.7"
            className="mt-1 w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-amber-500/60 focus:outline-none"
          />
        </label>
      </div>

      <div className="space-y-2">
        {shapes.map((s, idx) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`rounded-2xl border ${s.kind === "rect" ? "border-white/10 bg-white/[0.03]" : "border-rose-500/30 bg-rose-500/[0.03]"} backdrop-blur-md p-4 space-y-3`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-mono">#{idx + 1}</span>
                <span
                  className={`text-[10px] font-bold uppercase rounded px-2 py-0.5 ${
                    s.kind === "rect"
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {s.kind === "rect" ? "ДОДАТИ" : "ВІДНЯТИ"}
                </span>
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => update(s.id, { name: e.target.value })}
                  className="bg-transparent text-sm text-zinc-200 px-1 focus:outline-none focus:bg-white/5 rounded"
                />
              </div>
              {shapes.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="text-zinc-500 hover:text-rose-400 transition cursor-pointer p-1"
                  aria-label="Видалити"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Довжина, м
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={s.length}
                  onChange={(e) => update(s.id, { length: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-amber-500/60 focus:outline-none"
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
                  value={s.width}
                  onChange={(e) => update(s.id, { width: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base text-center focus:border-amber-500/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="text-xs text-zinc-500 text-right tabular-nums">
              = {formatNum(parseNum(s.length) * parseNum(s.width))} м²
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setShapes((p) => [...p, newShape("rect")])}
          className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm font-semibold active:scale-95 cursor-pointer transition"
        >
          <Plus size={16} /> Прямокутник
        </button>
        <button
          type="button"
          onClick={() => setShapes((p) => [...p, newShape("subtract")])}
          className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-semibold active:scale-95 cursor-pointer transition"
        >
          <Plus size={16} /> Виріз
        </button>
      </div>

      {/* Results */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 p-4 space-y-2.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
          Результат
        </div>
        <Row label="Підлога" value={`${formatNum(totals.floor)} м²`} highlight />
        <Row label="Стеля" value={`${formatNum(totals.ceiling)} м²`} />
        <Row label="Периметр" value={`${formatNum(totals.perimeter)} м`} />
        <Row label="Стіни (без вирахування дверей/вікон)" value={`${formatNum(totals.walls)} м²`} highlight />
      </div>

      <Link
        href={materialsHref}
        className="flex items-center justify-between gap-3 px-4 py-4 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-violet-500/40 active:scale-[0.99] transition-all cursor-pointer"
      >
        <div>
          <div className="text-sm font-semibold text-white">Розрахувати матеріали</div>
          <div className="text-xs text-zinc-500 mt-0.5">На отримані площі</div>
        </div>
        <ArrowRight size={18} className="text-violet-400" />
      </Link>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-400 truncate">{label}</span>
      <span
        className={`tabular-nums font-${highlight ? "bold text-amber-300 text-base" : "semibold text-zinc-200"}`}
      >
        {value}
      </span>
    </div>
  );
}
