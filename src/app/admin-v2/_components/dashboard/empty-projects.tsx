import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function EmptyProjects() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl p-8 text-center"
      style={{ backgroundColor: T.panelElevated }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FolderKanban size={24} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
        Немає проєктів
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Створіть перший проєкт, щоб почати роботу
      </span>
      <Link
        href="/admin-v2/projects/new"
        className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
        style={{ backgroundColor: T.accentPrimary }}
      >
        <Plus size={16} /> Створити проєкт
      </Link>
    </div>
  );
}
