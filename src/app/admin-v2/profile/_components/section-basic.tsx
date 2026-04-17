"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProfileData } from "../_lib/types";
import { SaveBar } from "./save-bar";

type Props = {
  profile: ProfileData;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
};

export function SectionBasic({ profile, onSave }: Props) {
  const [form, setForm] = useState({
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    phone: profile.phone || "",
    jobTitle: profile.jobTitle || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dirty =
    form.firstName !== (profile.firstName || "") ||
    form.lastName !== (profile.lastName || "") ||
    form.phone !== (profile.phone || "") ||
    form.jobTitle !== (profile.jobTitle || "");

  const handleSave = async () => {
    if (!form.firstName.trim()) {
      setError("Ім'я обов'язкове");
      return;
    }
    if (!form.lastName.trim()) {
      setError("Прізвище обов'язкове");
      return;
    }
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
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phone: profile.phone || "",
      jobTitle: profile.jobTitle || "",
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
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <User size={16} style={{ color: T.accentPrimary }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Основне
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
        <Field
          label="Ім'я"
          value={form.firstName}
          onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
          required
        />
        <Field
          label="Прізвище"
          value={form.lastName}
          onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
          required
        />
        <Field
          label="Email"
          value={profile.email}
          onChange={() => {}}
          disabled
        />
        <Field
          label="Телефон"
          value={form.phone}
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          type="tel"
        />
        <Field
          label="Посада"
          value={form.jobTitle}
          onChange={(v) => setForm((f) => ({ ...f, jobTitle: v }))}
        />
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} onReset={handleReset} />
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold tracking-wider uppercase"
        style={{ color: T.textMuted }}
      >
        {label}
        {required && <span style={{ color: T.danger }}> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-xl px-3.5 py-3 text-[14px] outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          backgroundColor: disabled ? T.panelElevated : T.panelSoft,
          border: "1px solid " + T.borderStrong,
          color: T.textPrimary,
        }}
      />
    </label>
  );
}
