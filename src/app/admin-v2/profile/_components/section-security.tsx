"use client";

import { useState } from "react";
import { Lock, Loader2, Check } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  onChangePassword: (current: string, newPwd: string) => Promise<void>;
};

export function SectionSecurity({ onChangePassword }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!currentPassword) {
      setError("Введіть поточний пароль");
      return;
    }
    if (newPassword.length < 6) {
      setError("Новий пароль повинен містити мінімум 6 символів");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Паролі не збігаються");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onChangePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка зміни пароля");
    } finally {
      setSaving(false);
    }
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
          style={{ backgroundColor: T.roseSoft }}
        >
          <Lock size={16} style={{ color: T.rose }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Безпека
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
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px] flex items-center gap-2"
          style={{ backgroundColor: T.successSoft, color: T.success }}
        >
          <Check size={14} />
          Пароль успішно змінено
        </div>
      )}

      <div className="max-w-md flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Поточний пароль
          </span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="rounded-xl px-3.5 py-3 text-[14px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: "1px solid " + T.borderStrong,
              color: T.textPrimary,
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Новий пароль
          </span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded-xl px-3.5 py-3 text-[14px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: "1px solid " + T.borderStrong,
              color: T.textPrimary,
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Підтвердження нового пароля
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-xl px-3.5 py-3 text-[14px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: "1px solid " + T.borderStrong,
              color: T.textPrimary,
            }}
          />
        </label>

        <button
          onClick={handleSave}
          disabled={saving || !currentPassword || !newPassword}
          className="flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-50 mt-2"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Lock size={14} />
          )}
          {saving ? "Зміна пароля..." : "Змінити пароль"}
        </button>
      </div>
    </section>
  );
}
