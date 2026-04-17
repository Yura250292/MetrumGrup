"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProfileData, ProductivityPrefs } from "../_lib/types";
import { DEFAULT_PRODUCTIVITY_PREFS, WEEKDAY_OPTIONS } from "../_lib/constants";
import { SaveBar } from "./save-bar";

type Props = {
  profile: ProfileData;
  onSave: (data: Record<string, unknown>) => Promise<void>;
};

export function SectionProductivity({ profile, onSave }: Props) {
  const [prefs, setPrefs] = useState<ProductivityPrefs>(
    (profile.productivityPrefsJson as ProductivityPrefs) || DEFAULT_PRODUCTIVITY_PREFS
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initial = (profile.productivityPrefsJson as ProductivityPrefs) || DEFAULT_PRODUCTIVITY_PREFS;
  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave({ productivityPrefsJson: prefs });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrefs(initial);
    setError(null);
  };

  const toggleDay = (day: number) => {
    const days = prefs.workingDays.includes(day)
      ? prefs.workingDays.filter((d) => d !== day)
      : [...prefs.workingDays, day];
    setPrefs((p) => ({ ...p, workingDays: days }));
  };

  const toggleBool = (key: keyof ProductivityPrefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.violetSoft }}
        >
          <Clock size={16} style={{ color: T.violet }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Час і продуктивність
        </h3>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.successSoft, color: T.success }}
        >
          Збережено
        </div>
      )}

      {/* Working days */}
      <div className="mb-5">
        <span
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: T.textMuted }}
        >
          Робочі дні
        </span>
        <div className="flex gap-2 mt-2">
          {WEEKDAY_OPTIONS.map((d) => {
            const active = prefs.workingDays.includes(d.value);
            return (
              <button
                key={d.value}
                onClick={() => toggleDay(d.value)}
                className="h-9 w-9 rounded-lg text-[12px] font-semibold transition"
                style={{
                  backgroundColor: active ? T.accentPrimary : T.panelElevated,
                  color: active ? "#FFFFFF" : T.textSecondary,
                  border: "1px solid " + (active ? T.accentPrimary : T.borderSoft),
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Work hours and daily norm */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.textMuted }}>
            Початок робочого дня
          </span>
          <input
            type="time"
            value={prefs.workStartTime}
            onChange={(e) => setPrefs((p) => ({ ...p, workStartTime: e.target.value }))}
            className="rounded-xl px-3.5 py-3 text-[14px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: "1px solid " + T.borderStrong,
              color: T.textPrimary,
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.textMuted }}>
            Кінець робочого дня
          </span>
          <input
            type="time"
            value={prefs.workEndTime}
            onChange={(e) => setPrefs((p) => ({ ...p, workEndTime: e.target.value }))}
            className="rounded-xl px-3.5 py-3 text-[14px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: "1px solid " + T.borderStrong,
              color: T.textPrimary,
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.textMuted }}>
            Денна норма годин
          </span>
          <input
            type="number"
            min={1}
            max={24}
            value={prefs.dailyHourNorm}
            onChange={(e) => setPrefs((p) => ({ ...p, dailyHourNorm: Number(e.target.value) }))}
            className="rounded-xl px-3.5 py-3 text-[14px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: "1px solid " + T.borderStrong,
              color: T.textPrimary,
            }}
          />
        </label>
      </div>

      {/* Timer settings */}
      <div className="mb-3">
        <span
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: T.textMuted }}
        >
          Налаштування таймера
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <Toggle
          label="Автозупинка попереднього таймера"
          checked={prefs.timerAutoStop}
          onChange={() => toggleBool("timerAutoStop")}
        />
        <Toggle
          label="Нагадувати, якщо таймер працює довго"
          checked={prefs.timerLongRunningReminder}
          onChange={() => toggleBool("timerLongRunningReminder")}
        />
        <Toggle
          label="Підтвердження перед зупинкою таймера"
          checked={prefs.timerConfirmStop}
          onChange={() => toggleBool("timerConfirmStop")}
        />
        <Toggle
          label="Показувати час у моїх задачах"
          checked={prefs.showTimeInMyTasks}
          onChange={() => toggleBool("showTimeInMyTasks")}
        />
        <Toggle
          label="Нагадати, якщо сьогодні немає жодного time log"
          checked={prefs.remindNoTimeLog}
          onChange={() => toggleBool("remindNoTimeLog")}
        />
        <Toggle
          label="Нагадати в кінці дня закрити незавершений таймер"
          checked={prefs.remindEndOfDay}
          onChange={() => toggleBool("remindEndOfDay")}
        />
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} onReset={handleReset} />
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="flex items-center justify-between rounded-xl px-4 py-3 transition"
      style={{ backgroundColor: T.panelSoft }}
    >
      <span className="text-[13px]" style={{ color: T.textPrimary }}>
        {label}
      </span>
      <span
        className="inline-flex h-5 w-9 items-center rounded-full transition-colors"
        style={{
          backgroundColor: checked ? T.accentPrimary : T.borderStrong,
        }}
      >
        <span
          className="h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
          style={{
            transform: checked ? "translateX(18px)" : "translateX(2px)",
          }}
        />
      </span>
    </button>
  );
}
