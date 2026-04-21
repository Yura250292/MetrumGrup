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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = confirm(
      `Видалити проєкт "${projectTitle}"?\n\nЦю дію не можна скасувати. Буде безповоротно видалено: кошториси, платежі, файли, завдання, учасники та історію.`,
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалося видалити проєкт");
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Помилка видалення";
      setError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title={error ?? "Видалити проєкт"}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold disabled:opacity-60"
      style={{ backgroundColor: T.dangerSoft, color: T.danger }}
    >
      {loading ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <Trash2 size={11} />
      )}
      Видалити
    </button>
  );
}
