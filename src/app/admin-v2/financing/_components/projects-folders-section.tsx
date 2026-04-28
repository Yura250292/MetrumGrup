"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Folder, Search, Star, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FolderCard } from "@/components/folders/FolderCard";
import { Collapsible } from "@/components/ui/Collapsible";
import type { FolderItem } from "@/hooks/useFolders";

const STARRED_KEY = "financing-starred-folders";
const COLLAPSED_KEY = "financing-projects-section-collapsed";

/** localStorage-backed set of starred folder IDs (per-device). */
function useStarredFolders() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STARRED_KEY);
      if (raw) setIds(new Set(JSON.parse(raw)));
    } catch {}
    setLoaded(true);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STARRED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  return { starred: ids, toggle, loaded };
}

export function ProjectsFoldersSection({
  folders,
  basePath,
  onRename,
  onDelete,
  onMove,
  bypassLocks,
}: {
  folders: FolderItem[];
  basePath: string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove?: (id: string) => void;
  bypassLocks?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const { starred, toggle } = useStarredFolders();

  // Persist collapse state across navigations (per-device)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw === "1") setOpen(false);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, open ? "0" : "1");
    } catch {}
  }, [open]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q))
      : folders;
    return [...filtered].sort((a, b) => {
      const aStar = starred.has(a.id) ? 1 : 0;
      const bStar = starred.has(b.id) ? 1 : 0;
      if (aStar !== bStar) return bStar - aStar;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [folders, search, starred]);

  const starredCount = useMemo(
    () => folders.filter((f) => starred.has(f.id)).length,
    [folders, starred],
  );

  if (folders.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      {/* Header — tap to collapse/expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:brightness-[0.97]"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <Folder size={14} />
          </span>
          <span className="text-[13px] sm:text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Проєкти
          </span>
          <span
            className="text-[11px] font-semibold rounded-full px-2 py-0.5"
            style={{ backgroundColor: T.panel, color: T.textMuted }}
          >
            {folders.length}
          </span>
          {starredCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${T.amber}1a`, color: T.amber }}
            >
              <Star size={10} fill={T.amber} stroke={T.amber} />
              {starredCount}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className="flex-shrink-0 transition-transform"
          style={{
            color: T.textMuted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      <Collapsible open={open} duration={320}>
        <div className="flex flex-col gap-3 pt-1">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: T.textMuted }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук проєкта…"
              className="w-full rounded-xl pl-9 pr-9 py-2 text-[13px] outline-none transition focus:ring-2"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${search ? T.accentPrimary : T.borderSoft}`,
                color: T.textPrimary,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center hover:bg-[var(--t-panel-soft)] transition"
                title="Очистити"
                type="button"
              >
                <X size={12} style={{ color: T.textMuted }} />
              </button>
            )}
          </div>

          {/* Grid */}
          {sorted.length > 0 ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {sorted.map((f) => (
                <StarrableFolderCard
                  key={f.id}
                  folder={f}
                  href={`${basePath}?folderId=${f.id}`}
                  onRename={onRename}
                  onDelete={onDelete}
                  onMove={onMove}
                  bypassLocks={bypassLocks}
                  starred={starred.has(f.id)}
                  onToggleStar={() => toggle(f.id)}
                />
              ))}
            </div>
          ) : (
            <div
              className="rounded-xl px-4 py-8 text-center text-[12px]"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textMuted,
                border: `1px dashed ${T.borderSoft}`,
              }}
            >
              Нічого не знайдено за «{search}»
            </div>
          )}
        </div>
      </Collapsible>
    </section>
  );
}

/**
 * FolderCard with an overlaid star toggle. Uses absolute positioning so
 * the underlying FolderCard component stays untouched (compatible with
 * parallel-chat folder work).
 */
function StarrableFolderCard({
  folder,
  href,
  onRename,
  onDelete,
  onMove,
  bypassLocks,
  starred,
  onToggleStar,
}: {
  folder: FolderItem;
  href: string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove?: (id: string) => void;
  bypassLocks?: boolean;
  starred: boolean;
  onToggleStar: () => void;
}) {
  return (
    <div className="relative">
      <FolderCard
        folder={folder}
        href={href}
        showFinanceIndicators
        onRename={onRename}
        onDelete={onDelete}
        onMove={onMove}
        bypassLocks={bypassLocks}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleStar();
        }}
        title={starred ? "Прибрати з улюблених" : "В улюблені"}
        aria-pressed={starred}
        className={`absolute top-2 left-2 z-10 h-7 w-7 rounded-lg flex items-center justify-center transition ${
          starred ? "opacity-100" : "opacity-60 hover:opacity-100"
        }`}
        style={{
          backgroundColor: starred ? `${T.amber}1f` : T.panelElevated,
          border: `1px solid ${starred ? T.amber : T.borderSoft}`,
        }}
      >
        <Star
          size={13}
          fill={starred ? T.amber : "none"}
          stroke={starred ? T.amber : T.textMuted}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}
