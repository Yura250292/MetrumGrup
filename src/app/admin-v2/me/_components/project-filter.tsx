"use client";

import { useEffect, useState } from "react";
import { FolderKanban } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ProjectOption = { id: string; title: string };

export function ProjectFilter({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    fetch("/api/admin/me/projects")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) =>
        setProjects(
          (j.data ?? []).map((p: any) => ({ id: p.id, title: p.title }))
        )
      )
      .catch(() => {});
  }, []);

  if (projects.length === 0) return null;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span
        className="flex items-center gap-1 text-[10px] font-bold tracking-wider mr-1"
        style={{ color: T.textMuted }}
      >
        <FolderKanban size={12} />
        ПРОЄКТ
      </span>
      <button
        onClick={() => onChange([])}
        className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
        style={{
          backgroundColor: selectedIds.length === 0 ? T.accentPrimarySoft : "transparent",
          color: selectedIds.length === 0 ? T.accentPrimary : T.textMuted,
          border: `1px solid ${selectedIds.length === 0 ? T.accentPrimary : T.borderSoft}`,
        }}
      >
        Всі
      </button>
      {projects.map((p) => {
        const active = selectedIds.includes(p.id);
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
            style={{
              backgroundColor: active ? T.accentPrimarySoft : "transparent",
              color: active ? T.accentPrimary : T.textMuted,
              border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            {p.title}
          </button>
        );
      })}
    </div>
  );
}
