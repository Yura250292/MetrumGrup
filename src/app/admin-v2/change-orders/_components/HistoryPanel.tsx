"use client";

import type { ChangeOrderStatus } from "@prisma/client";
import { COStatusBadge } from "./StatusBadge";

export type Transition = {
  id: string;
  fromStatus: ChangeOrderStatus;
  toStatus: ChangeOrderStatus;
  actor: { id: string; name: string | null } | null;
  comment: string | null;
  createdAt: string | Date;
};

function fmt(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(date);
}

export function HistoryPanel({ transitions }: { transitions: Transition[] }) {
  if (transitions.length === 0) {
    return (
      <div className="text-sm text-zinc-500">Поки історії немає.</div>
    );
  }
  return (
    <ol className="space-y-3">
      {transitions.map((t) => (
        <li
          key={t.id}
          className="flex gap-3 items-start p-3 rounded-lg border border-zinc-200 bg-white"
        >
          <div className="flex items-center gap-2 flex-1">
            <COStatusBadge status={t.fromStatus} />
            <span className="text-zinc-400">→</span>
            <COStatusBadge status={t.toStatus} />
          </div>
          <div className="text-right text-xs text-zinc-500">
            <div>{fmt(t.createdAt)}</div>
            <div>{t.actor?.name ?? "—"}</div>
            {t.comment && (
              <div className="mt-1 text-zinc-700 italic">«{t.comment}»</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
