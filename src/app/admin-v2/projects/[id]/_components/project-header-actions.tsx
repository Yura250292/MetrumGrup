"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Camera,
  ChevronDown,
  FlaskConical,
  Link2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { SyncFinanceModal } from "./sync-finance-modal";
import { LinkFinanceFolderModal } from "./link-finance-folder-button";

/**
 * Компактна шапка дій проєкту: 1 primary (📷 Додати фото) + overflow-меню
 * `⋯ Дії` зі решта дій (AI Синх, Прив'язати папку, Тестовий toggle, Звіти).
 * Замінює стопку з 5 однакових за вагою кнопок у поточній page.tsx.
 */
export function ProjectHeaderActions({
  projectId,
  isTestProject: initialIsTest,
  tasksEnabled,
}: {
  projectId: string;
  isTestProject: boolean;
  tasksEnabled: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [isTest, setIsTest] = useState(initialIsTest);
  const [togglingTest, setTogglingTest] = useState(false);
  const [, startTransition] = useTransition();

  async function toggleTest() {
    const next = !isTest;
    setTogglingTest(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTestProject: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setIsTest(next);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("Не вдалось оновити", err);
      alert("Не вдалось оновити статус тестового проєкту");
    } finally {
      setTogglingTest(false);
      setMenuOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link
        href={`/admin-v2/projects/${projectId}/photos/new`}
        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textPrimary,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <Camera size={16} /> Додати фото
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderStrong}`,
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          Дії <ChevronDown size={14} />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div
              role="menu"
              className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-lg shadow-lg"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <MenuItem
                icon={<Sparkles size={14} style={{ color: T.violet }} />}
                label="AI · Синх. з фінансами"
                onClick={() => {
                  setSyncOpen(true);
                  setMenuOpen(false);
                }}
              />
              <MenuItem
                icon={<Link2 size={14} style={{ color: T.accentPrimary }} />}
                label="Прив'язати папку"
                onClick={() => {
                  setLinkOpen(true);
                  setMenuOpen(false);
                }}
              />
              {tasksEnabled && (
                <MenuItem
                  asLink
                  href={`/admin-v2/projects/${projectId}/reports`}
                  icon={<BarChart3 size={14} style={{ color: T.textMuted }} />}
                  label="Звіти"
                  onClick={() => setMenuOpen(false)}
                />
              )}
              <div
                style={{
                  height: 1,
                  backgroundColor: T.borderSoft,
                  margin: "2px 0",
                }}
              />
              <MenuItem
                icon={
                  togglingTest ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FlaskConical
                      size={14}
                      style={{ color: isTest ? T.warning : T.textMuted }}
                    />
                  )
                }
                label={isTest ? "Зняти позначку «Тестовий»" : "Позначити як тестовий"}
                onClick={() => void toggleTest()}
                disabled={togglingTest}
              />
            </div>
          </>
        )}
      </div>

      <SyncFinanceModal
        projectId={projectId}
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onApplied={() => router.refresh()}
      />
      <LinkFinanceFolderModal
        projectId={projectId}
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  asLink,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  asLink?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <span style={{ color: T.textMuted }}>{icon}</span>
      <span>{label}</span>
    </>
  );
  const className =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:brightness-95 disabled:opacity-50";
  const style = { color: T.textPrimary, backgroundColor: "transparent" };

  if (asLink && href) {
    return (
      <Link href={href} className={className} style={style} onClick={onClick} role="menuitem">
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={style}
    >
      {inner}
    </button>
  );
}
