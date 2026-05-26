"use client";

import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

type Coords = { lat: number; lng: number; accuracy?: number };

export function GpsField({
  value,
  onChange,
}: {
  value: Coords | null;
  onChange: (v: Coords | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function capture() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Геолокація недоступна — введіть вручну");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setBusy(false);
      },
      (err) => {
        setError(err.message || "Не вдалось отримати координати");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.06] p-3">
      {value ? (
        <div className="flex items-center justify-between text-[13px] text-white">
          <div>
            <div className="flex items-center gap-1">
              <MapPin size={14} className="text-emerald-300" />
              <span className="tabular-nums">
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
              </span>
            </div>
            {value.accuracy != null && (
              <div className="text-[11px] text-white/50">
                точність ±{Math.round(value.accuracy)} м
              </div>
            )}
          </div>
          <button
            onClick={() => onChange(null)}
            className="text-[12px] text-white/60 underline-offset-2 hover:underline"
          >
            Очистити
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={capture}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[13px] text-white"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
            Захопити координати
          </button>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Lat"
              type="number"
              step="any"
              onChange={(e) => {
                const lat = parseFloat(e.target.value);
                if (Number.isFinite(lat)) {
                  onChange({ lat, lng: (value as Coords | null)?.lng ?? 0 });
                }
              }}
              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[13px] text-white outline-none"
            />
            <input
              placeholder="Lng"
              type="number"
              step="any"
              onChange={(e) => {
                const lng = parseFloat(e.target.value);
                if (Number.isFinite(lng)) {
                  onChange({ lat: (value as Coords | null)?.lat ?? 0, lng });
                }
              }}
              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[13px] text-white outline-none"
            />
          </div>
          {error && <div className="text-[11px] text-red-300">{error}</div>}
        </div>
      )}
    </div>
  );
}
