"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown, FolderKanban, LayoutGrid, List, Search, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type ProjectOption = { id: string; title: string };

export function EstimatesListControls({
  projects,
  view,
  initialQ,
  selectedProjectId,
}: {
  projects: ProjectOption[];
  view: "list" | "grid";
  initialQ: string;
  selectedProjectId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [, startTransition] = useTransition();

  function update(params: Record<string, string | null>) {
    const next = new URLSearchParams(sp?.toString() ?? "");
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    update({ q: q.trim() || null });
  }

  function clearSearch() {
    setQ("");
    update({ q: null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 flex-1">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px] max-w-md"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={14} style={{ color: T.textMuted }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук за номером, назвою або проєктом…"
          className="bg-transparent border-0 outline-none flex-1 text-[13px] min-w-0"
          style={{ color: T.textPrimary }}
        />
        {q && (
          <button
            type="button"
            onClick={clearSearch}
            className="opacity-60 hover:opacity-100"
            aria-label="Очистити пошук"
          >
            <X size={12} style={{ color: T.textMuted }} />
          </button>
        )}
        <kbd
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textMuted,
          }}
        >
          ⏎
        </kbd>
      </form>

      <label className="relative inline-flex items-center">
        <FolderKanban
          size={14}
          className="absolute left-2.5 pointer-events-none"
          style={{ color: T.textMuted }}
        />
        <select
          value={selectedProjectId ?? ""}
          onChange={(e) => update({ project: e.target.value || null })}
          className="appearance-none rounded-lg pl-8 pr-7 py-1.5 text-[12px] font-semibold cursor-pointer max-w-[200px]"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        >
          <option value="">Усі проєкти</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="absolute right-2 pointer-events-none"
          style={{ color: T.textMuted }}
        />
      </label>

      <div
        className="inline-flex items-center rounded-lg p-0.5"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        <button
          type="button"
          onClick={() => update({ view: view === "list" ? null : "list" })}
          className="inline-flex items-center justify-center rounded-md px-2.5 py-1"
          aria-pressed={view === "list"}
          aria-label="Список"
          style={{
            backgroundColor: view === "list" ? T.panel : "transparent",
            border: view === "list" ? `1px solid ${T.borderSoft}` : "1px solid transparent",
          }}
        >
          <List size={14} style={{ color: view === "list" ? T.accentPrimary : T.textMuted }} />
        </button>
        <button
          type="button"
          onClick={() => update({ view: "grid" })}
          className="inline-flex items-center justify-center rounded-md px-2.5 py-1"
          aria-pressed={view === "grid"}
          aria-label="Картки"
          style={{
            backgroundColor: view === "grid" ? T.panel : "transparent",
            border: view === "grid" ? `1px solid ${T.borderSoft}` : "1px solid transparent",
          }}
        >
          <LayoutGrid size={14} style={{ color: view === "grid" ? T.accentPrimary : T.textMuted }} />
        </button>
      </div>
    </div>
  );
}
