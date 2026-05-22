"use client";

import { useEffect, useRef, useState } from "react";
import {
  acquireWakeLock,
  installWakeLockResumeHandler,
} from "@/lib/foreman/wake-lock";

/** 20 scenario IDs (mirror серверного списку). Клієнт вибирає різний за раз
 *  при кожному "Перегенерувати". */
const SCENARIO_IDS = [
  "modern-minimalist",
  "scandinavian-cozy",
  "industrial-loft",
  "boho-eclectic",
  "japandi",
  "classic-ukrainian",
  "french-parisian",
  "mid-century-modern",
  "maximalist-gallery",
  "smart-tech",
  "family-kids",
  "bachelor-pad",
  "senior-accessible",
  "studio-saver",
  "luxury-upscale",
  "rustic-country",
  "mediterranean",
  "asian-zen",
  "coastal-beach",
  "cottagecore",
];
import {
  Check,
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

/** Стан photoreal-рендера однієї кімнати. */
type RoomRender =
  | { status: "loading" }
  | { status: "done"; inputUrl: string; outputUrl: string }
  | { status: "error"; message: string };

/** Підплан з однієї кімнати — для покімнатного photoreal-рендера. */
function buildRoomSubPlan(plan: FloorPlan, roomId: string): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const roomClasses: Record<string, RoomClass> = {};
  const cls = plan.roomClasses[roomId];
  if (cls) roomClasses[roomId] = cls;
  return {
    ...plan,
    rooms: [room],
    openings: plan.openings.filter((o) => o.roomId === roomId),
    furniture: plan.furniture.filter((f) => f.roomId === roomId),
    roomClasses,
  };
}

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
  const [scenario, setScenario] = useState<{ id: string; name: string } | null>(
    null,
  );
  const lastScenarioIdRef = useRef<string | null>(null);

  // Resume wake-lock коли документ знову видимий
  useEffect(() => installWakeLockResumeHandler(), []);

  // Photoreal state — рендеримо ПОКІМНАТНО, кожна кімната окремою карткою.
  const [photorealRunning, setPhotorealRunning] = useState(false);
  // Кімната, чий прихований SVG зараз рендериться для зняття snapshot.
  const [captureRoomId, setCaptureRoomId] = useState<string | null>(null);
  // Які кімнати позначені галочками для рендера (типово — усі).
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(
    () => new Set(plan.rooms.map((r) => r.id)),
  );
  // Результат рендера по кожній кімнаті: roomId → стан.
  const [photorealResults, setPhotorealResults] = useState<
    Record<string, RoomRender>
  >({});

  const handleFurnish = async () => {
    setLoading(true);
    setError(null);
    const release = await acquireWakeLock();
    try {
      // Обираємо РАНДОМНИЙ сценарій, але уникаємо одразу того самого, що
      // був попереднього разу — щоб користувач бачив варіативність.
      const available = lastScenarioIdRef.current
        ? SCENARIO_IDS.filter((id) => id !== lastScenarioIdRef.current)
        : SCENARIO_IDS;
      const scenarioId = available[Math.floor(Math.random() * available.length)];
      lastScenarioIdRef.current = scenarioId;

      const res = await fetch("/api/foreman/ai-furnish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms: plan.rooms.map((r) => ({
            id: r.id,
            name: r.name,
            x: r.x,
            y: r.y,
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
          scenarioId,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 80)}`);
      }
      const json = (await res.json()) as {
        rooms: { roomId: string; classification: RoomClass }[];
        furniture: FurnitureItem[];
        scenario?: { id: string; name: string };
      };
      const classes: Record<string, RoomClass> = {};
      for (const r of json.rooms) classes[r.roomId] = r.classification;
      onSetFurniture(json.furniture, classes);
      setLastGenAt(Date.now());
      if (json.scenario) {
        setScenario(json.scenario);
        lastScenarioIdRef.current = json.scenario.id;
      }
      if (json.furniture.length === 0) {
        setError(
          "AI не зміг розмістити меблі (можливо, кімнати малі або назви нетипові). Спробуйте перейменувати кімнати у звичні «Кухня/Спальня/Санвузол» і повторіть.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
      await release();
    }
  };

  const hasFurniture = plan.furniture.length > 0;
  const totalItems = plan.furniture.length;

  /**
   * Знімає SVG-підплан ОДНІЄЇ кімнати → PNG → POST /api/foreman/ai-render.
   * captureRoomId керує прихованим SVG, тож у рендер потрапляє ВИКЛЮЧНО ця
   * кімната (buildRoomSubPlan відфільтровує решту).
   */
  const renderOneRoom = async (
    roomId: string,
  ): Promise<{ inputUrl: string; outputUrl: string }> => {
    setCaptureRoomId(roomId);
    // Чекаємо 2 кадри, поки React відрендерить прихований SVG саме цієї
    // кімнати (captureRoomId щойно змінився).
    await new Promise<void>((res) =>
      requestAnimationFrame(() => requestAnimationFrame(() => res())),
    );
    const svgEl = document.querySelector<SVGSVGElement>(
      'svg[data-estimator-plan="snapshot"]',
    );
    if (!svgEl) throw new Error("Не вдалося підготувати план кімнати");

    // Готуємо SVG для рендера в PNG: клон + явні width/height + xmlns.
    const vb = svgEl.viewBox.baseVal;
    const aspect = vb && vb.width > 0 ? vb.height / vb.width : 0.75;
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
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      pngBase64 = canvas
        .toDataURL("image/png")
        .replace(/^data:image\/png;base64,/, "");
    } finally {
      URL.revokeObjectURL(url);
    }

    const res = await fetch("/api/foreman/ai-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: pngBase64 }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 100)}`);
    }
    return (await res.json()) as { inputUrl: string; outputUrl: string };
  };

  /** Рендерить обрані кімнати ПО ЧЕРЗІ; кожна — окрема картка-результат. */
  const runPhotoreal = async (roomIds: string[]) => {
    if (roomIds.length === 0 || photorealRunning) return;
    setPhotorealRunning(true);
    const release = await acquireWakeLock();
    try {
      for (const id of roomIds) {
        if (!plan.rooms.some((r) => r.id === id)) continue;
        setPhotorealResults((p) => ({ ...p, [id]: { status: "loading" } }));
        try {
          const r = await renderOneRoom(id);
          setPhotorealResults((p) => ({
            ...p,
            [id]: { status: "done", inputUrl: r.inputUrl, outputUrl: r.outputUrl },
          }));
        } catch (e) {
          setPhotorealResults((p) => ({
            ...p,
            [id]: {
              status: "error",
              message:
                e instanceof Error
                  ? e.message.slice(0, 140)
                  : "Помилка генерації",
            },
          }));
        }
      }
    } finally {
      setPhotorealRunning(false);
      setCaptureRoomId(null);
      await release();
    }
  };

  // Counts per room (для блока класифікації)
  const itemsPerRoom = new Map<string, number>();
  for (const f of plan.furniture) {
    itemsPerRoom.set(f.roomId, (itemsPerRoom.get(f.roomId) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      {/* Прихований snapshot SVG — рендериться лише ОБРАНА кімната
          (captureRoomId) для photoreal PNG input. */}
      <div
        aria-hidden
        className="absolute -left-[9999px] top-0 w-[1024px] h-[1024px] pointer-events-none"
      >
        {captureRoomId && (
          <PlanSvg
            plan={buildRoomSubPlan(plan, captureRoomId)}
            snapshot
            className="w-full h-full"
          />
        )}
      </div>

      {hasFurniture && lastGenAt && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <div>
              AI розмістила <b>{totalItems}</b> меблевих елемент
              {totalItems === 1 ? "" : totalItems < 5 ? "и" : "ів"} на плані. Тап
              по предмету щоб видалити; пінч/drag — зум плану.
            </div>
            {scenario && (
              <div className="mt-1 text-emerald-100/80">
                Стиль: <b>{scenario.name}</b>. Натисніть «Перегенерувати»
                для іншого з 20 варіантів.
              </div>
            )}
          </div>
        </div>
      )}

      <InteractivePlanView
        plan={plan}
        heightClass="h-[360px]"
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

      {/* Photoreal 3D rendering section — ПОКІМНАТНО, з вибором галочками */}
      {hasFurniture && (
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent border border-violet-500/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-violet-300" />
            <h3 className="text-sm font-bold text-violet-200">
              Photoreal 3D рендер
            </h3>
          </div>
          <p className="text-xs text-violet-200/80 leading-relaxed">
            Признач кімнати галочками — AI відрендерить кожну ОКРЕМО, по черзі
            (fal.ai, ~30-90с на кімнату). Покімнатно — результат точніше
            відповідає плану. Кожна кімната зʼявиться окремою карткою нижче.
          </p>

          {/* Вибір кімнат — кнопки-рядки (надійний тап + чітка підсвітка) */}
          <div className="space-y-1.5">
            {plan.rooms.map((room) => {
              const checked = selectedRoomIds.has(room.id);
              return (
                <button
                  key={room.id}
                  type="button"
                  disabled={photorealRunning}
                  onClick={() =>
                    setSelectedRoomIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(room.id)) next.delete(room.id);
                      else next.add(room.id);
                      return next;
                    })
                  }
                  className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition active:scale-[0.99] disabled:opacity-50 ${
                    checked
                      ? "bg-violet-500/25 border-violet-400/70"
                      : "bg-white/[0.03] border-white/10"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      checked
                        ? "bg-violet-500 border-violet-400"
                        : "border-white/30"
                    }`}
                  >
                    {checked && <Check size={13} className="text-white" />}
                  </span>
                  <span
                    className={`text-sm flex-1 truncate ${
                      checked ? "text-white font-semibold" : "text-zinc-300"
                    }`}
                  >
                    {room.name}
                  </span>
                  <span className="text-[11px] text-zinc-500 tabular-nums">
                    {room.w}×{room.h} м
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <button
              type="button"
              onClick={() =>
                setSelectedRoomIds(new Set(plan.rooms.map((r) => r.id)))
              }
              disabled={photorealRunning}
              className="text-violet-300 underline disabled:opacity-40"
            >
              Обрати всі
            </button>
            <button
              type="button"
              onClick={() => setSelectedRoomIds(new Set())}
              disabled={photorealRunning}
              className="text-zinc-400 underline disabled:opacity-40"
            >
              Зняти всі
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              runPhotoreal(
                plan.rooms
                  .filter((r) => selectedRoomIds.has(r.id))
                  .map((r) => r.id),
              )
            }
            disabled={photorealRunning || selectedRoomIds.size === 0}
            className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-violet-500/20 border border-violet-500/50 text-violet-100 text-sm font-semibold active:scale-95 transition disabled:opacity-50"
          >
            {photorealRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ImageIcon size={16} />
            )}
            {photorealRunning
              ? "AI рендерить…"
              : `Згенерувати 3D (${selectedRoomIds.size})`}
          </button>

          {/* Результати — окрема картка на кожну кімнату */}
          {plan.rooms.map((room) => {
            const r = photorealResults[room.id];
            if (!r) return null;
            return (
              <div
                key={room.id}
                className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-violet-200">
                    {room.name}
                  </span>
                  {r.status !== "loading" && (
                    <button
                      type="button"
                      onClick={() => runPhotoreal([room.id])}
                      disabled={photorealRunning}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/40 text-violet-200 text-[11px] font-semibold active:scale-95 transition disabled:opacity-50"
                    >
                      <Sparkles size={11} />
                      Перегенерувати
                    </button>
                  )}
                </div>
                {r.status === "loading" && (
                  <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-violet-200/80">
                    <Loader2 size={14} className="animate-spin" />
                    Рендериться… (до 90с)
                  </div>
                )}
                {r.status === "error" && (
                  <div className="text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                    {r.message}
                  </div>
                )}
                {r.status === "done" && (
                  <>
                    <ComparisonSlider
                      inputUrl={r.inputUrl}
                      outputUrl={r.outputUrl}
                      inputLabel="План"
                      outputLabel="Photoreal"
                    />
                    <a
                      href={r.outputUrl}
                      download={`photoreal-${room.name}-${Date.now()}.png`}
                      className="flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-white/[0.05] border border-white/10 text-zinc-200 text-xs font-semibold active:scale-95 transition"
                    >
                      Завантажити
                    </a>
                  </>
                )}
              </div>
            );
          })}
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
