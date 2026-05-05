"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectStatus } from "@prisma/client";

type ProjectListItem = {
  id: string;
  title: string;
  slug: string;
  status: ProjectStatus;
  client?: { id: string; name: string } | null;
};

type Props = {
  /** Активний проєкт — буде підсвічений. */
  activeProjectId: string;
  /** Зберігати fullscreen-режим у URL під час навігації між проєктами. */
  preserveFullscreen?: boolean;
  /** Згорнутий режим (тонкий 36px rail з кнопкою expand). */
  collapsed?: boolean;
  /** Toggle згортання — рендериться кнопка у header sidebar-а. */
  onToggleCollapse?: () => void;
};

const STATUS_DOT: Record<ProjectStatus, string> = {
  DRAFT: T.textMuted,
  ACTIVE: T.success,
  ON_HOLD: T.warning,
  COMPLETED: T.accentPrimary,
  CANCELLED: T.danger,
};

/**
 * Лівий сайдбар у fullscreen split-view: компактний список усіх проєктів
 * (firm-scoped через GET /api/admin/projects). Lazy-fetch при mount —
 * монтується лише коли StagesSection переходить у fullscreen.
 */
export function ProjectsSidebar({
  activeProjectId,
  preserveFullscreen,
  collapsed,
  onToggleCollapse,
}: Props) {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((j: { data: ProjectListItem[] }) => {
        if (!cancelled) setProjects(j.data ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (projects ?? []).filter((p) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.client?.name ?? "").toLowerCase().includes(q)
    );
  });

  // Collapsed-режим: тонкий rail тільки з кнопкою expand. Менше 40px,
  // звільняє ~165px горизонталі під таблицю.
  if (collapsed) {
    return (
      <aside
        className="flex h-full flex-col items-center overflow-hidden py-2"
        style={{
          backgroundColor: T.panelSoft,
          borderRight: `1px solid ${T.borderSoft}`,
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Розгорнути список проєктів"
          className="flex h-7 w-7 items-center justify-center rounded transition hover:brightness-95"
          style={{ color: T.textMuted, backgroundColor: T.panel }}
        >
          <PanelLeftOpen size={14} />
        </button>
        <span
          className="mt-3 text-[10px] font-bold uppercase tracking-wider"
          style={{
            color: T.textMuted,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          Проєкти {projects ? `· ${projects.length}` : ""}
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full flex-col overflow-hidden"
      style={{
        backgroundColor: T.panelSoft,
        borderRight: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: T.borderSoft }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          Усі проєкти
        </span>
        {projects && (
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            {projects.length}
          </span>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Згорнути"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded transition hover:brightness-95"
            style={{ color: T.textMuted }}
          >
            <PanelLeftClose size={13} />
          </button>
        )}
      </div>

      <div className="px-3 py-2">
        <div
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <Search size={12} style={{ color: T.textMuted }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Пошук…"
            className="w-full bg-transparent text-[12px] outline-none"
            style={{ color: T.textPrimary }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {error ? (
          <div className="px-3 py-4 text-[11px]" style={{ color: T.danger }}>
            Помилка: {error}
          </div>
        ) : projects === null ? (
          <div
            className="flex items-center gap-2 px-3 py-4 text-[11px]"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={12} className="animate-spin" />
            Завантаження…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-[11px]" style={{ color: T.textMuted }}>
            Немає проєктів
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((p) => {
              const active = p.id === activeProjectId;
              const href = preserveFullscreen
                ? `/admin-v2/projects/${p.id}?tab=overview&fs=1`
                : `/admin-v2/projects/${p.id}?tab=overview`;
              return (
                <li key={p.id}>
                  <Link
                    href={href}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 transition"
                    style={{
                      backgroundColor: active ? T.panel : "transparent",
                      border: active
                        ? `1px solid ${T.accentPrimarySoft}`
                        : "1px solid transparent",
                      color: active ? T.textPrimary : T.textSecondary,
                    }}
                  >
                    <span
                      className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_DOT[p.status] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12px] font-medium"
                        style={{
                          color: active ? T.accentPrimary : T.textPrimary,
                          fontWeight: active ? 600 : 500,
                        }}
                      >
                        {p.title}
                      </span>
                      {p.client?.name && (
                        <span
                          className="block truncate text-[10px]"
                          style={{ color: T.textMuted }}
                        >
                          {p.client.name}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
