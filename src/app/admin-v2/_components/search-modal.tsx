"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderKanban, Users, ListTodo, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type SearchResults = {
  projects: { id: string; title: string; client: { name: string | null } | null }[];
  clients: { id: string; name: string | null; email: string | null }[];
  tasks: { id: string; title: string; project: { id: string; title: string } }[];
};

const EMPTY: SearchResults = { projects: [], clients: [], tasks: [] };

export function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  // Animation: `mounted` mirrors `open`, but `visible` toggles 1 frame later
  // so the CSS transitions actually run on first paint.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount/unmount + animation lifecycle
  useEffect(() => {
    if (open) {
      setMounted(true);
      // double-rAF to guarantee initial styles paint before transition
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 180);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQ("");
      setResults(EMPTY);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setResults(await res.json());
      } catch {
        // ignored
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [q, open]);

  if (!mounted) return null;

  const total =
    results.projects.length + results.clients.length + results.tasks.length;
  const showEmpty = q.trim().length >= 2 && !loading && total === 0;

  function go(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] sm:pt-[10vh] px-3 sm:px-4 transition-[backdrop-filter,background-color] duration-[420ms]"
      style={{
        backgroundColor: visible ? "rgba(15,23,42,0.55)" : "rgba(15,23,42,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(8px)" : "blur(0px)",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] rounded-2xl overflow-hidden flex flex-col transition-all duration-[460ms] max-h-[85vh] sm:max-h-[70vh]"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          boxShadow: "var(--shadow-2)",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(-22px) scale(0.95)",
          transformOrigin: "top center",
          filter: visible ? "blur(0px)" : "blur(4px)",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4"
          style={{
            borderBottom: `1px solid ${T.borderSoft}`,
            height: 56,
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" style={{ color: T.textMuted }} />
          ) : (
            <Search size={16} style={{ color: T.textMuted }} />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук проєктів, клієнтів, задач…"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: T.textPrimary }}
          />
          <kbd
            className="font-mono text-[11px] px-1.5 py-px rounded"
            style={{
              backgroundColor: T.panelElevated,
              border: `1px solid ${T.borderSoft}`,
              color: T.textMuted,
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {q.trim().length < 2 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: T.textMuted }}>
              Введіть мінімум 2 символи для пошуку
            </div>
          )}

          {showEmpty && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: T.textMuted }}>
              Нічого не знайдено за «{q}»
            </div>
          )}

          {results.projects.length > 0 && (
            <SearchGroup label="Проєкти" icon={FolderKanban}>
              {results.projects.map((p) => (
                <SearchRow
                  key={p.id}
                  title={p.title}
                  sub={p.client?.name ?? ""}
                  onClick={() => go(`/admin-v2/projects/${p.id}`)}
                />
              ))}
            </SearchGroup>
          )}

          {results.clients.length > 0 && (
            <SearchGroup label="Клієнти" icon={Users}>
              {results.clients.map((c) => (
                <SearchRow
                  key={c.id}
                  title={c.name ?? c.email ?? "—"}
                  sub={c.email ?? ""}
                  onClick={() => go(`/admin-v2/clients`)}
                />
              ))}
            </SearchGroup>
          )}

          {results.tasks.length > 0 && (
            <SearchGroup label="Задачі" icon={ListTodo}>
              {results.tasks.map((t) => (
                <SearchRow
                  key={t.id}
                  title={t.title}
                  sub={t.project.title}
                  onClick={() => go(`/admin-v2/projects/${t.project.id}?tab=tasks`)}
                />
              ))}
            </SearchGroup>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchGroup({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div
        className="flex items-center gap-1.5 px-4 py-1.5 text-[10.5px] font-semibold uppercase"
        style={{ color: T.textMuted, letterSpacing: "0.08em" }}
      >
        <Icon size={11} />
        {label}
      </div>
      {children}
    </div>
  );
}

function SearchRow({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors hover:bg-[var(--t-panel-soft)]"
    >
      <span className="text-[13px] font-medium" style={{ color: T.textPrimary }}>
        {title}
      </span>
      {sub && (
        <span className="text-[11.5px]" style={{ color: T.textMuted }}>
          {sub}
        </span>
      )}
    </button>
  );
}
