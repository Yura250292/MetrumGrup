"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeOrderStatus, Role } from "@prisma/client";
import { ACTION_RBAC, TRANSITIONS, type COAction } from "@/lib/change-orders/state-machine";

type Props = {
  coId: string;
  status: ChangeOrderStatus;
  role: Role;
  onUpdated?: () => void;
};

const LABEL: Record<COAction, string> = {
  submit: "Подати на затвердження",
  approve_pm: "Затвердити (PM)",
  approve_admin: "Затвердити (Admin)",
  approve_client: "Затвердити від клієнта",
  reject: "Відхилити",
  cancel: "Скасувати",
};

const STYLE: Record<COAction, string> = {
  submit: "bg-sky-600 text-white hover:bg-sky-700",
  approve_pm: "bg-emerald-600 text-white hover:bg-emerald-700",
  approve_admin: "bg-emerald-600 text-white hover:bg-emerald-700",
  approve_client: "bg-emerald-600 text-white hover:bg-emerald-700",
  reject: "bg-rose-600 text-white hover:bg-rose-700",
  cancel: "bg-zinc-500 text-white hover:bg-zinc-600",
};

export function TransitionBar({ coId, status, role, onUpdated }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<COAction | null>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const available = (Object.keys(TRANSITIONS[status] ?? {}) as COAction[])
    .filter((action) => ACTION_RBAC[action].includes(role));

  async function call(action: COAction, comment?: string): Promise<void> {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/change-orders/${coId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Помилка: ${json.error ?? res.statusText}`);
        return;
      }
      onUpdated?.();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {available.length === 0 && (
        <span className="text-sm text-zinc-500">Дій не доступно для цього статусу</span>
      )}
      {available.map((action) => (
        <button
          key={action}
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (action === "reject") {
              setRejectModal(true);
            } else if (action === "cancel") {
              if (!confirm("Скасувати дод. угоду?")) return;
              call(action);
            } else {
              call(action);
            }
          }}
          className={`px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 ${STYLE[action]}`}
        >
          {busy === action ? "..." : LABEL[action]}
        </button>
      ))}

      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[440px] space-y-3">
            <h3 className="font-semibold">Причина відхилення</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-24 px-2 py-1.5 rounded border border-zinc-300 text-sm"
              placeholder="Що не так?"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModal(false)}
                className="px-3 py-1.5 text-sm rounded border border-zinc-300"
              >
                Відмінити
              </button>
              <button
                type="button"
                onClick={async () => {
                  setRejectModal(false);
                  await call("reject", rejectReason.trim() || undefined);
                  setRejectReason("");
                }}
                className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white"
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
