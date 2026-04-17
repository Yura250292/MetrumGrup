"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProfileData } from "../_lib/types";
import {
  TIMEZONES,
  DATE_FORMATS,
  TASK_VIEW_OPTIONS,
  LANDING_PAGE_OPTIONS,
} from "../_lib/constants";
import { SaveBar } from "./save-bar";

type Props = {
  profile: ProfileData;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
};

export function SectionWorkSettings({ profile, onSave }: Props) {
  const [form, setForm] = useState({
    timezone: profile.timezone,
    dateFormat: profile.dateFormat,
    weekStartsOn: profile.weekStartsOn,
    defaultTaskView: profile.defaultTaskView,
    defaultLandingPage: profile.defaultLandingPage,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dirty =
    form.timezone !== profile.timezone ||
    form.dateFormat !== profile.dateFormat ||
    form.weekStartsOn !== profile.weekStartsOn ||
    form.defaultTaskView !== profile.defaultTaskView ||
    form.defaultLandingPage !== profile.defaultLandingPage;

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({
      timezone: profile.timezone,
      dateFormat: profile.dateFormat,
      weekStartsOn: profile.weekStartsOn,
      defaultTaskView: profile.defaultTaskView,
      defaultLandingPage: profile.defaultLandingPage,
    });
    setError(null);
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
          style={{ backgroundColor: T.skySoft }}
        >
          <Settings size={16} style={{ color: T.sky }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Робочі налаштування
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectField
          label="Часовий пояс"
          value={form.timezone}
          options={TIMEZONES}
          onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
        />
        <SelectField
          label="Формат дати"
          value={form.dateFormat}
          options={DATE_FORMATS}
          onChange={(v) => setForm((f) => ({ ...f, dateFormat: v }))}
        />
        <SelectField
          label="Перший день тижня"
          value={String(form.weekStartsOn)}
          options={[
            { value: "1", label: "Понеділок" },
            { value: "0", label: "Неділя" },
          ]}
          onChange={(v) => setForm((f) => ({ ...f, weekStartsOn: Number(v) }))}
        />
        <SelectField
          label="Вигляд задач за замовчуванням"
          value={form.defaultTaskView}
          options={TASK_VIEW_OPTIONS}
          onChange={(v) => setForm((f) => ({ ...f, defaultTaskView: v }))}
        />
        <SelectField
          label="Початковий екран після входу"
          value={form.defaultLandingPage}
          options={LANDING_PAGE_OPTIONS}
          onChange={(v) => setForm((f) => ({ ...f, defaultLandingPage: v }))}
        />
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} onReset={handleReset} />
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold tracking-wider uppercase"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl px-3.5 py-3 text-[14px] outline-none appearance-none cursor-pointer"
        style={{
          backgroundColor: T.panelSoft,
          border: "1px solid " + T.borderStrong,
          color: T.textPrimary,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
