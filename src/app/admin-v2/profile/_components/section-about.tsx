"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProfileData } from "../_lib/types";
import { SaveBar } from "./save-bar";

type Props = {
  profile: ProfileData;
  onSave: (data: Record<string, unknown>) => Promise<unknown>;
};

export function SectionAbout({ profile, onSave }: Props) {
  const [bio, setBio] = useState(profile.bio || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dirty = bio !== (profile.bio || "");

  const handleSave = async () => {
    if (bio.length > 1000) {
      setError("Максимум 1000 символів");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSave({ bio: bio || null });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setBio(profile.bio || "");
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
          style={{ backgroundColor: T.indigoSoft }}
        >
          <FileText size={16} style={{ color: T.indigo }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Про мене
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

      <label className="flex flex-col gap-1.5">
        <span
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: T.textMuted }}
        >
          Короткий опис / Bio
        </span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Розкажіть коротко про свою роль, зону відповідальності або спеціалізацію..."
          className="rounded-xl px-3.5 py-3 text-[14px] outline-none resize-none"
          style={{
            backgroundColor: T.panelSoft,
            border: "1px solid " + T.borderStrong,
            color: T.textPrimary,
          }}
        />
        <span className="text-[11px] text-right" style={{ color: T.textMuted }}>
          {bio.length} / 1000
        </span>
      </label>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} onReset={handleReset} />
    </section>
  );
}
