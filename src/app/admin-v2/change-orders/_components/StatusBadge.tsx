import type { ChangeOrderStatus } from "@prisma/client";

const META: Record<ChangeOrderStatus, { label: string; classes: string }> = {
  DRAFT: { label: "Чернетка", classes: "bg-zinc-100 text-zinc-700" },
  PENDING_PM: { label: "Очікує PM", classes: "bg-amber-100 text-amber-800" },
  PENDING_ADMIN: { label: "Очікує SUPER_ADMIN", classes: "bg-amber-100 text-amber-800" },
  PENDING_CLIENT: { label: "Очікує клієнта", classes: "bg-sky-100 text-sky-800" },
  APPROVED: { label: "Затверджено", classes: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Відхилено", classes: "bg-rose-100 text-rose-800" },
  CANCELLED: { label: "Скасовано", classes: "bg-zinc-100 text-zinc-500" },
};

export function COStatusBadge({ status }: { status: ChangeOrderStatus }) {
  const meta = META[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}
