"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function ReviewActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject") {
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt("Причина відхилення:");
      if (!note) return;
    } else {
      note = window.prompt("Коментар (необов'язково):") || null;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/form-submissions/${submissionId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { reviewNote: note } : {}),
      });
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => null);
        alert(data?.message ?? "Помилка");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
    >
      <div className="mb-2 text-[12px] font-medium" style={{ color: T.textPrimary }}>
        Дія
      </div>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => act("approve")}
          className="flex-1 rounded-md px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: T.success }}
        >
          Затвердити
        </button>
        <button
          disabled={busy}
          onClick={() => act("reject")}
          className="flex-1 rounded-md px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: T.danger }}
        >
          Відхилити
        </button>
      </div>
    </div>
  );
}
