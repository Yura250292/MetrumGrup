"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Image as ImageIcon,
  Info,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { FloorPlan, FurnitureItem, RoomClass } from "./_types";
import { InteractivePlanView } from "./_interactive-plan-view";
import { PlanSvg } from "./_plan-svg";
import { Collapsible } from "./_collapsible";
import { ComparisonSlider } from "@/components/ui/comparison-slider";

const CLASS_LABELS: Record<RoomClass, string> = {
  kitchen: "Кухня",
  bedroom: "Спальня",
  bathroom: "Санвузол",
  livingroom: "Вітальня",
  corridor: "Коридор",
  hallway: "Передпокій",
  office: "Кабінет",
  diningroom: "Їдальня",
  balcony: "Балкон",
  storage: "Комора",
  other: "Інше",
};

interface Props {
  plan: FloorPlan;
  onSetFurniture: (
    furniture: FurnitureItem[],
    roomClasses: Record<string, RoomClass>,
  ) => void;
  onRemoveFurniture: (id: string) => void;
  onClearFurniture: () => void;
}

export function Visualize({
  plan,
  onSetFurniture,
  onRemoveFurniture,
  onClearFurniture,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenAt, setLastGenAt] = useState<number | null>(null);

  // Photoreal state
  const [photorealLoading, setPhotorealLoading] = useState(false);
  const [photorealError, setPhotorealError] = useState<string | null>(null);
  const [photoreal, setPhotoreal] = useState<{
    inputUrl: string;
    outputUrl: string;
  } | null>(null);

  const handleFurnish = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/foreman/ai-furnish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms: plan.rooms.map((r) => ({
            id: r.id,
            name: r.name,
            w: r.w,
            h: r.h,
            ceilingHeight: r.ceilingHeight,
          })),
          openings: plan.openings.map((o) => ({
            roomId: o.roomId,
            side: o.side,
            offset: o.offset,
            width: o.width,
            height: o.height,
            type: o.type,
          })),
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 80)}`);
      }
      const json = (await res.json()) as {
        rooms: { roomId: string; classification: RoomClass }[];
        furniture: FurnitureItem[];
      };
      const classes: Record<string, RoomClass> = {};
      for (const r of json.rooms) classes[r.roomId] = r.classification;
      onSetFurniture(json.furniture, classes);
      setLastGenAt(Date.now());
      if (json.furniture.length === 0) {
        setError(
          "AI не зміг розмістити меблі (можливо, кімнати малі або назви нетипові). Спробуйте перейменувати кімнати у звичні «Кухня/Спальня/Санвузол» і повторіть.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  };

  const hasFurniture = plan.furniture.length > 0;
  const totalItems = plan.furniture.length;

  /**
   * Знімок SVG-плану з меблями → PNG base64 → POST /api/foreman/ai-render
   * → fal.ai photoreal model → URL → відображення в ComparisonSlider.
   */
  const handlePhotoreal = async () => {
    setPhotorealLoading(true);
    setPhotorealError(null);
    setPhotoreal(null);
    try {
      // Знімаємо ЧИСТУ snapshot-версію (без grid сітки) — для fal.ai кращий
      // вхід. Інтерактивна канва (зі сіткою) забивала контраст при PNG.
      const svgEl =
        document.querySelector<SVGSVGElement>(
          'svg[data-estimator-plan="snapshot"]',
        ) ??
        document.querySelector<SVGSVGElement>(
          'svg[data-estimator-plan="interactive"]',
        );
      if (!svgEl) throw new Error("Не вдалося знайти SVG плану");

      // Готуємо SVG для рендера в PNG:
      //  1) Клонуємо
      //  2) Виставляємо явні width/height (інакше браузер дає intrinsic
      //     розмір "6×10" з viewBox у метрах і drawImage все спотворює).
      //  3) Тримаємо xmlns для коректного XML
      const vb = svgEl.viewBox.baseVal;
      const aspect = vb && vb.width > 0 ? vb.height / vb.width : 0.75;
      // 2048 — Seedream v4 edit обробляє високу роздільність;
      // більше деталей у вхідному плані = краще збереження структури в 3D.
      const targetW = 2048;
      const targetH = Math.max(512, Math.min(2560, Math.round(targetW * aspect)));

      const cloned = svgEl.cloneNode(true) as SVGSVGElement;
      if (!cloned.getAttribute("xmlns")) {
        cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }
      cloned.setAttribute("width", String(targetW));
      cloned.setAttribute("height", String(targetH));

      const serialized = new XMLSerializer().serializeToString(cloned);
      const svgBlob = new Blob([serialized], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);
      let pngBase64: string;
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas не доступний");

        // SVG plan тепер у light-theme (чорні лінії на білому) — це
        // нативний формат архітектурних креслень, який fal.ai розпізнає.
        // Інверсія більше не потрібна.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const dataUrl = canvas.toDataURL("image/png");
        pngBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      } finally {
        URL.revokeObjectURL(url);
      }

      // Структурований опис плану — допомагає Seedream розуміти семантику
      // кожної кімнати, не покладаючись лише на візуальну інтерпретацію.
      const bb = (() => {
        if (plan.rooms.length === 0) return { w: 0, h: 0 };
        const xs = plan.rooms.flatMap((r) => [r.x, r.x + r.w]);
        const ys = plan.rooms.flatMap((r) => [r.y, r.y + r.h]);
        return {
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        };
      })();
      const minX = Math.min(...plan.rooms.map((r) => r.x));
      const minY = Math.min(...plan.rooms.map((r) => r.y));
      const layout = {
        bbox: bb,
        rooms: plan.rooms.map((r) => {
          const items = plan.furniture
            .filter((f) => f.roomId === r.id)
            .map((f) => f.label)
            .filter(Boolean);
          return {
            name: r.name,
            classification: plan.roomClasses[r.id],
            x: r.x - minX,
            y: r.y - minY,
            w: r.w,
            h: r.h,
            furnitureLabels: items.length > 0 ? items : undefined,
          };
        }),
        openings: plan.openings.map((o) => {
          const room = plan.rooms.find((rr) => rr.id === o.roomId);
          return {
            type: o.type,
            roomName: room?.name,
          };
        }),
      };

      const res = await fetch("/api/foreman/ai-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: pngBase64, layout }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 100)}`);
      }
      const json = (await res.json()) as {
        inputUrl: string;
        outputUrl: string;
      };
      setPhotoreal(json);
    } catch (e) {
      setPhotorealError(
        e instanceof Error ? e.message.slice(0, 160) : "Помилка генерації",
      );
    } finally {
      setPhotorealLoading(false);
    }
  };

  // Counts per room (для блока класифікації)
  const itemsPerRoom = new Map<string, number>();
  for (const f of plan.furniture) {
    itemsPerRoom.set(f.roomId, (itemsPerRoom.get(f.roomId) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      {/* Прихований snapshot SVG (без grid) — для photoreal PNG input. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] top-0 w-[1024px] h-[1024px] pointer-events-none"
      >
        <PlanSvg plan={plan} snapshot className="w-full h-full" />
      </div>

      {hasFurniture && lastGenAt && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>
            AI розмістила <b>{totalItems}</b> меблевих елемент
            {totalItems === 1 ? "" : totalItems < 5 ? "и" : "ів"} на плані. Тап
            по предмету щоб видалити; пінч/drag — зум плану.
          </span>
        </div>
      )}

      <InteractivePlanView
        plan={plan}
        onFurnitureTap={(item) => {
          if (
            typeof window !== "undefined" &&
            !window.confirm(`Видалити «${item.label}» з плану?`)
          ) {
            return;
          }
          onRemoveFurniture(item.id);
        }}
        resetKey={`viz-${plan.rooms.length}-${plan.furniture.length}`}
      />

      {!hasFurniture ? (
        <div className="rounded-2xl bg-violet-500/10 border border-violet-500/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-300" />
            <h3 className="text-sm font-bold text-violet-200">AI меблювання</h3>
          </div>
          <p className="text-xs text-violet-200/80 leading-relaxed">
            AI класифікує кімнати за назвою (Кухня → плита/холодильник/мийка,
            Спальня → ліжко/шафа, Санвузол → унітаз/душ, тощо) і розставить
            типові меблі та техніку по плану. Можна видалити окремі предмети
            тапом або перегенерувати все.
          </p>
          <button
            type="button"
            onClick={handleFurnish}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-violet-500/20 border border-violet-500/50 text-violet-100 text-sm font-semibold active:scale-95 transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? "AI працює…" : "Згенерувати меблі"}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">
                  Меблювання згенеровано
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {totalItems} предмет
                  {totalItems === 1 ? "" : totalItems < 5 ? "и" : "ів"} ·
                  тап по предмету щоб видалити
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleFurnish}
                  disabled={loading}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-violet-500/15 border border-violet-500/40 text-violet-200 text-xs font-semibold active:scale-95 transition disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {loading ? "…" : "Перегенерувати"}
                </button>
                <button
                  type="button"
                  onClick={onClearFurniture}
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 active:scale-95 transition"
                  aria-label="Очистити меблі"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>

          <Collapsible
            title={
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                AI класифікація кімнат
              </span>
            }
            trailing={
              <span className="text-[11px] text-zinc-500">{plan.rooms.length}</span>
            }
          >
            <ul className="divide-y divide-white/5">
              {plan.rooms.map((room) => {
                const cls = plan.roomClasses[room.id];
                const count = itemsPerRoom.get(room.id) ?? 0;
                return (
                  <li
                    key={room.id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <div className="text-sm text-white">{room.name}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {cls ? CLASS_LABELS[cls] : "не визначено"} ·{" "}
                        {count} предмет
                        {count === 1 ? "" : count < 5 ? "и" : "ів"}
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-500 tabular-nums">
                      {room.w}×{room.h} м
                    </div>
                  </li>
                );
              })}
            </ul>
          </Collapsible>

          <Collapsible
            title={
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                Меблі та техніка
              </span>
            }
            trailing={
              <span className="text-[11px] text-zinc-500">{plan.furniture.length}</span>
            }
          >
            <ul className="divide-y divide-white/5">
              {plan.furniture.map((f) => {
                const room = plan.rooms.find((r) => r.id === f.roomId);
                return (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{f.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {room?.name ?? "—"} · {f.w.toFixed(2)}×{f.h.toFixed(2)} м
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveFurniture(f.id)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-zinc-400 active:scale-90 transition"
                      aria-label="Видалити"
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Collapsible>
        </>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs px-3 py-2">
          {error}
        </div>
      )}

      {/* Photoreal 3D rendering section */}
      {hasFurniture && (
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent border border-violet-500/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-violet-300" />
            <h3 className="text-sm font-bold text-violet-200">
              Photoreal 3D рендер
            </h3>
          </div>
          {!photoreal && (
            <>
              <p className="text-xs text-violet-200/80 leading-relaxed">
                Перетворюємо твій 2D-план з меблями у фотореалістичний
                рендер інтер'єру через AI-модель (fal.ai). Займає 30-90 секунд.
                Чернетка — не прив'язана до проєкту; пізніше можна буде
                прикріпити до конкретного.
              </p>
              <button
                type="button"
                onClick={handlePhotoreal}
                disabled={photorealLoading}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-violet-500/20 border border-violet-500/50 text-violet-100 text-sm font-semibold active:scale-95 transition disabled:opacity-50"
              >
                {photorealLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ImageIcon size={16} />
                )}
                {photorealLoading ? "AI рендерить (до 90с)…" : "Згенерувати photoreal"}
              </button>
            </>
          )}
          {photorealError && (
            <div className="text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {photorealError}
            </div>
          )}
          {photoreal && (
            <div className="space-y-3">
              <ComparisonSlider
                inputUrl={photoreal.inputUrl}
                outputUrl={photoreal.outputUrl}
                inputLabel="План"
                outputLabel="Photoreal"
              />
              <div className="flex gap-2">
                <a
                  href={photoreal.outputUrl}
                  download={`photoreal-${Date.now()}.png`}
                  className="flex-1 flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-white/[0.05] border border-white/10 text-zinc-200 text-xs font-semibold active:scale-95 transition"
                >
                  Завантажити
                </a>
                <button
                  type="button"
                  onClick={handlePhotoreal}
                  disabled={photorealLoading}
                  className="flex-1 flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-xs font-semibold active:scale-95 transition disabled:opacity-50"
                >
                  {photorealLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  Перегенерувати
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 text-center">
                Перетягни смужку щоб порівняти план і реалістику. Кнопка
                "Прикріпити до проєкту" з'явиться у наступній ітерації.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 flex gap-2.5">
        <Info size={14} className="text-zinc-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Це 2D-візуалізація меблювання + опційний photoreal 3D-рендер через
          fal.ai. Photoreal — чернетка foreman-а; зберігається в R2 під
          твоїм аккаунтом, не прив'язана до проєкту до окремої дії.
        </p>
      </div>
    </div>
  );
}
