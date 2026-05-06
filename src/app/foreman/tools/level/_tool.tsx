"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone } from "lucide-react";

type Mode = "level" | "ruler";

interface OrientationState {
  beta: number; // front-back tilt (-180..180), 0 = flat face up
  gamma: number; // left-right tilt (-90..90), 0 = flat
}

const PIXELS_PER_CM_DEFAULT = 96 / 2.54; // ~37.79 px/cm at default DPI; will be re-measured if calibrated

export function LevelTool() {
  const [mode, setMode] = useState<Mode>("level");
  const [orient, setOrient] = useState<OrientationState>({ beta: 0, gamma: 0 });
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "unsupported">(
    "unknown",
  );
  const [pxPerCm, setPxPerCm] = useState<number>(() => {
    if (typeof window === "undefined") return PIXELS_PER_CM_DEFAULT;
    const saved = window.localStorage.getItem("foreman:ruler-cal");
    return saved ? parseFloat(saved) || PIXELS_PER_CM_DEFAULT : PIXELS_PER_CM_DEFAULT;
  });
  const [showCal, setShowCal] = useState(false);
  const [calLengthCm, setCalLengthCm] = useState("8.56"); // size of credit card

  // Auto-calibrate on mount using physical screen size if available via screen.width / window.devicePixelRatio
  useEffect(() => {
    if (typeof window === "undefined") return;
    // best-effort: most modern phones report screen.width in CSS pixels and devicePixelRatio
    // — actual physical size requires manual calibration.
    // We just use stored or default.
  }, []);

  // Subscribe to deviceorientation
  useEffect(() => {
    if (mode !== "level") return;
    if (typeof window === "undefined") return;

    let active = true;
    const handler = (e: DeviceOrientationEvent) => {
      if (!active) return;
      setOrient({
        beta: e.beta ?? 0,
        gamma: e.gamma ?? 0,
      });
    };

    const start = async () => {
      const W = window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
      };
      const RPE = W.DeviceOrientationEvent;
      if (!("DeviceOrientationEvent" in window)) {
        setPermission("unsupported");
        return;
      }
      // iOS 13+: must request permission via user gesture. We already had a tap to enter this page,
      // but Safari may still require a fresh gesture. Try anyway — fall back to button.
      if (RPE && typeof RPE.requestPermission === "function") {
        try {
          const result = await RPE.requestPermission();
          if (result === "granted") {
            window.addEventListener("deviceorientation", handler);
            setPermission("granted");
          } else {
            setPermission("denied");
          }
        } catch {
          setPermission("denied");
        }
      } else {
        // Android / desktop — no permission needed
        window.addEventListener("deviceorientation", handler);
        setPermission("granted");
      }
    };
    void start();

    return () => {
      active = false;
      window.removeEventListener("deviceorientation", handler);
    };
  }, [mode]);

  const requestPermission = async () => {
    const W = window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
    };
    const RPE = W.DeviceOrientationEvent;
    if (RPE && typeof RPE.requestPermission === "function") {
      try {
        const result = await RPE.requestPermission();
        setPermission(result === "granted" ? "granted" : "denied");
        if (result === "granted") {
          window.addEventListener("deviceorientation", (e) =>
            setOrient({ beta: e.beta ?? 0, gamma: e.gamma ?? 0 }),
          );
        }
      } catch {
        setPermission("denied");
      }
    }
  };

  return (
    <div className="space-y-3 pb-8">
      {/* Mode tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
        <button
          type="button"
          onClick={() => setMode("level")}
          className={`min-h-[44px] rounded-xl text-sm font-semibold transition cursor-pointer ${
            mode === "level"
              ? "bg-amber-500 text-zinc-950 shadow-lg"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Рівень
        </button>
        <button
          type="button"
          onClick={() => setMode("ruler")}
          className={`min-h-[44px] rounded-xl text-sm font-semibold transition cursor-pointer ${
            mode === "ruler"
              ? "bg-amber-500 text-zinc-950 shadow-lg"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Лінійка
        </button>
      </div>

      {mode === "level" ? (
        <LevelView orient={orient} permission={permission} onRequest={requestPermission} />
      ) : (
        <RulerView
          pxPerCm={pxPerCm}
          showCal={showCal}
          setShowCal={setShowCal}
          calLengthCm={calLengthCm}
          setCalLengthCm={setCalLengthCm}
          onCalibrate={(value) => {
            setPxPerCm(value);
            window.localStorage.setItem("foreman:ruler-cal", String(value));
            setShowCal(false);
          }}
        />
      )}
    </div>
  );
}

function LevelView({
  orient,
  permission,
  onRequest,
}: {
  orient: OrientationState;
  permission: string;
  onRequest: () => void;
}) {
  // Bubble position based on tilt (beta = front/back, gamma = left/right)
  // Clamp to ±20° for full bubble travel
  const MAX = 20;
  const x = Math.max(-1, Math.min(1, orient.gamma / MAX));
  const y = Math.max(-1, Math.min(1, orient.beta / MAX));
  const isFlat = Math.abs(orient.gamma) < 0.5 && Math.abs(orient.beta) < 0.5;
  const tilt = Math.sqrt(orient.beta ** 2 + orient.gamma ** 2);

  return (
    <>
      {permission === "denied" && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-200">
          Доступ до руху пристрою заборонено. Дозволь у налаштуваннях Safari або переконайся
          що сайт відкрито через HTTPS.
        </div>
      )}
      {permission === "unsupported" && (
        <div className="rounded-xl bg-zinc-800/50 border border-white/10 p-4 text-sm text-zinc-300">
          Ця функція потребує мобільного пристрою з акселерометром.
        </div>
      )}
      {permission === "unknown" && (
        <button
          type="button"
          onClick={onRequest}
          className="w-full min-h-[56px] rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 font-semibold cursor-pointer active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <Smartphone size={18} /> Дозволити доступ до акселерометра
        </button>
      )}

      {/* Big bubble level circle */}
      <div className="relative aspect-square w-full max-w-[340px] mx-auto rounded-full bg-gradient-to-br from-zinc-900 via-zinc-900/80 to-zinc-950 border-2 border-amber-500/30 shadow-[0_0_40px_-8px_rgba(245,166,35,0.4),inset_0_2px_8px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* center crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-px bg-amber-500/15" />
          <div className="absolute h-full w-px bg-amber-500/15" />
          <div className="absolute w-24 h-24 rounded-full border-2 border-amber-500/40" />
          <div className="absolute w-2 h-2 rounded-full bg-amber-400/80" />
        </div>

        {/* the bubble */}
        <motion.div
          className="absolute top-1/2 left-1/2 w-12 h-12 -mt-6 -ml-6 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 shadow-[0_4px_20px_rgba(245,166,35,0.7),inset_0_-2px_4px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.6)]"
          animate={{
            x: x * 110,
            y: y * 110,
          }}
          transition={{ type: "spring", damping: 20, stiffness: 180 }}
        />

        {/* status */}
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <div className={`text-[11px] uppercase tracking-[0.2em] font-bold ${isFlat ? "text-emerald-400" : "text-zinc-500"}`}>
            {isFlat ? "● Рівно" : "Не рівно"}
          </div>
        </div>
      </div>

      {/* angles */}
      <div className="grid grid-cols-2 gap-3">
        <AngleCard label="Нахил вліво/вправо" value={orient.gamma} />
        <AngleCard label="Нахил вперед/назад" value={orient.beta} />
      </div>
      <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-center">
        <div className="text-[10px] uppercase tracking-wider text-amber-300/80 font-bold">
          Сумарний нахил
        </div>
        <div className="text-3xl font-black text-amber-200 tabular-nums mt-1">
          {tilt.toFixed(1)}°
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 text-center px-4 leading-relaxed">
        Поклади телефон на поверхню задньою кришкою донизу. Бульбашка у центрі = поверхня
        ідеально рівна. Точність ±0.5° — для приблизної перевірки. Для точних робіт
        використовуй професійний рівень.
      </p>
    </>
  );
}

function AngleCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
      <div className="text-xl font-bold text-zinc-100 tabular-nums mt-0.5">
        {value > 0 ? "+" : ""}
        {value.toFixed(1)}°
      </div>
    </div>
  );
}

function RulerView({
  pxPerCm,
  showCal,
  setShowCal,
  calLengthCm,
  setCalLengthCm,
  onCalibrate,
}: {
  pxPerCm: number;
  showCal: boolean;
  setShowCal: (b: boolean) => void;
  calLengthCm: string;
  setCalLengthCm: (s: string) => void;
  onCalibrate: (px: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeightPx, setContainerHeightPx] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (containerRef.current) setContainerHeightPx(containerRef.current.offsetHeight);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const totalCm = containerHeightPx / pxPerCm;
  const ticks: { cm: number; major: boolean; label?: string }[] = [];
  const maxCm = Math.floor(totalCm * 10) / 10;
  for (let mm = 0; mm <= maxCm * 10; mm += 1) {
    const cm = mm / 10;
    const isMajor = mm % 10 === 0;
    const isMid = mm % 5 === 0 && !isMajor;
    if (isMajor || isMid || mm % 1 === 0) {
      ticks.push({
        cm,
        major: isMajor,
        label: isMajor ? String(mm / 10) : undefined,
      });
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-zinc-500 leading-relaxed">
          Прикладай телефон до предмета. Калібровано: <span className="text-amber-300 font-mono">{pxPerCm.toFixed(1)}</span> px/см.
        </div>
        <button
          type="button"
          onClick={() => setShowCal(!showCal)}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 text-zinc-300 cursor-pointer active:scale-95 transition"
        >
          Калібрувати
        </button>
      </div>

      {showCal && (
        <div className="rounded-xl bg-white/[0.03] border border-amber-500/30 p-4 space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Приклади до екрана предмет з відомою довжиною (банкнота 100 грн = 13.3 см, банківська
            картка = 8.56 см, монета 1 грн = 2.6 см) уздовж лінійки. Зміни значення нижче поки
            мітки не співпадуть з краями.
          </p>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Довжина еталона, см
            </span>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={calLengthCm}
              onChange={(e) => setCalLengthCm(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white text-sm focus:border-amber-500/60 focus:outline-none"
            />
          </label>
          <p className="text-[11px] text-zinc-400">
            Поточна лінійка показує цей предмет як приблизно{" "}
            <span className="font-mono text-amber-300">
              {parseFloat(calLengthCm) > 0
                ? (parseFloat(calLengthCm) * pxPerCm).toFixed(0)
                : "—"}
              px
            </span>
            . Якщо предмет насправді коротший — збільш px/см, якщо довший — зменш.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[-2, -0.5, +0.5, +2].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => onCalibrate(Math.max(20, pxPerCm + delta))}
                className="px-2 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-xs text-zinc-200 cursor-pointer active:scale-95 hover:border-amber-500/40 transition"
              >
                {delta > 0 ? "+" : ""}
                {delta} px/см
              </button>
            ))}
            <button
              type="button"
              onClick={() => onCalibrate(PIXELS_PER_CM_DEFAULT)}
              className="px-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 cursor-pointer col-span-3 active:scale-95 transition"
            >
              Скинути на за замовчуванням
            </button>
          </div>
        </div>
      )}

      {/* Ruler itself */}
      <div
        ref={containerRef}
        className="relative h-[60vh] rounded-2xl bg-gradient-to-b from-amber-50 via-amber-100 to-amber-50 overflow-hidden shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] border-2 border-amber-200"
      >
        {/* Tick marks on left edge */}
        <div className="absolute inset-y-0 left-0 w-full">
          {ticks.map((t, idx) => (
            <div
              key={idx}
              className="absolute left-0 flex items-center"
              style={{ top: `${t.cm * pxPerCm}px`, height: 0 }}
            >
              <div
                className={`bg-zinc-900 ${t.major ? "h-[2px] w-12" : "h-[1px] w-6"}`}
                style={{
                  width: t.major ? 56 : t.cm * 10 % 5 === 0 ? 36 : 18,
                }}
              />
              {t.label !== undefined && (
                <span className="ml-2 text-xs font-bold text-zinc-900 tabular-nums select-none">
                  {t.label}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* unit label */}
        <div className="absolute bottom-3 right-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700">
          см
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 text-center px-4 leading-relaxed">
        Видимий діапазон: ~{totalCm.toFixed(1)} см. Точність обмежена розміром та DPI екрана —
        для точних вимірів калібруй за відомим предметом.
      </div>
    </>
  );
}
