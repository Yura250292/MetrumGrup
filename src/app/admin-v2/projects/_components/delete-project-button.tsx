"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function DeleteProjectButton({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    const confirmed = window.confirm(
      `Видалити проєкт «${projectTitle}»?\n\nЦе незворотна дія — будуть видалені всі повʼязані кошториси, файли, фото, чат і коментарі.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Помилка видалення");
        window.alert(json?.error || "Помилка видалення");
        return;
      }
      router.refresh();
    } catch {
      setError("Немає звʼязку з сервером");
      window.alert("Немає звʼязку з сервером");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      title="Видалити проєкт"
      aria-label={`Видалити проєкт ${projectTitle}`}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-125 disabled:opacity-60"
      style={{
        backgroundColor: T.dangerSoft,
        color: T.danger,
        border: `1px solid ${T.danger}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
