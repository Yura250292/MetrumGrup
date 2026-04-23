"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function TestProjectToggle({
  projectId,
  initial,
}: {
  projectId: string;
  initial: boolean;
}) {
  const [isTest, setIsTest] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    const next = !isTest;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTestProject: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setIsTest(next);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("Не вдалось оновити", err);
      alert("Не вдалось оновити статус тестового проєкту");
    } finally {
      setSaving(false);
    }
  }

  const bg = isTest ? T.warningSoft : T.panelElevated;
  const fg = isTest ? T.warning : T.textPrimary;
  const border = isTest ? T.warning : T.borderStrong;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      title={
        isTest
          ? "Проєкт позначено тестовим. Клік — зняти позначку."
          : "Позначити як тестовий (не буде враховуватись у KPI/аналітиці)"
      }
      className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tap-highlight-none active:scale-[0.97] disabled:opacity-60"
      style={{
        backgroundColor: bg,
        color: fg,
        border: `1px solid ${border}`,
      }}
    >
      {saving ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
      {isTest ? "Тестовий ✓" : "Тестовий"}
    </button>
  );
}
