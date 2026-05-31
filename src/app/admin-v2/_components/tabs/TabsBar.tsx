"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, RotateCcw, Copy as CopyIcon, XSquare } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useTabs } from "./TabsProvider";
import { iconFromKey } from "../../_lib/tabs/icon-map";
import type { Tab } from "../../_lib/tabs/types";

const BAR_HEIGHT = 36;

export function TabsBar() {
  const tabs = useTabs();
  const { state, openTab, closeTab, closeOthers, closeRight, setActiveTab, reloadTab } = tabs;
  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${state.activeTabId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [state.activeTabId]);

  // Global hotkeys: Cmd/Ctrl+W close, Cmd/Ctrl+Tab next, Cmd/Ctrl+T new
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Skip when typing in editable elements (unless it's Cmd+Tab which browser owns anyway)
      const target = e.target as HTMLElement | null;
      const editing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key.toLowerCase() === "w" && !editing) {
        if (state.activeTabId) {
          e.preventDefault();
          closeTab(state.activeTabId);
        }
        return;
      }
      if (e.key.toLowerCase() === "t" && !editing) {
        e.preventDefault();
        openTab("/admin-v2");
        return;
      }
      // Cmd/Ctrl+1..9 — jump to nth tab
      const n = parseInt(e.key, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= 9) {
        const tab = state.tabs[n - 1];
        if (tab) {
          e.preventDefault();
          setActiveTab(tab.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.activeTabId, state.tabs, closeTab, openTab, setActiveTab]);

  // Close context menu on outside click
  useEffect(() => {
    if (!menu) return;
    function onClick() {
      setMenu(null);
    }
    window.addEventListener("click", onClick);
    window.addEventListener("scroll", onClick, true);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onClick, true);
    };
  }, [menu]);

  const onTabMouseDown = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    },
    [closeTab],
  );

  // Раніше було: if (state.tabs.length === 0) return null;
  // Прибираю — якщо state каже 0 (corrupted localStorage чи bug), все одно
  // рендеримо bar з кнопкою "+ Нова вкладка" замість мовчазного null.
  // Це гарантує що користувач завжди бачить bar (на md+ breakpoint).

  return (
    <div
      role="tablist"
      aria-label="Вкладки"
      className="hidden md:flex items-stretch w-full select-none"
      style={{
        height: BAR_HEIGHT,
        backgroundColor: T.panelElevated,
        borderBottom: `1px solid ${T.borderStrong}`,
      }}
    >
      <div
        ref={scrollerRef}
        className="flex items-stretch flex-1 overflow-x-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        {state.tabs.map((tab) => {
          const Icon = iconFromKey(tab.iconKey);
          const isActive = tab.id === state.activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              data-tab-id={tab.id}
              onMouseDown={(e) => onTabMouseDown(e, tab)}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
              title={tab.path}
              className="group relative flex items-center gap-2 px-3 cursor-pointer min-w-[140px] max-w-[220px] transition-colors"
              style={{
                color: isActive ? T.textPrimary : T.textSecondary,
                backgroundColor: isActive ? T.panel : "transparent",
                borderRight: `1px solid ${T.borderSoft}`,
                borderTop: isActive ? `2px solid ${T.accentPrimary}` : `2px solid transparent`,
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <Icon size={14} style={{ color: isActive ? T.accentPrimary : T.textMuted, flexShrink: 0 }} />
              <span className="flex-1 text-[12.5px] truncate">{tab.title}</span>
              <button
                type="button"
                aria-label="Закрити вкладку"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="flex items-center justify-center rounded-md p-0.5 opacity-60 hover:opacity-100 hover:bg-[var(--t-panel-el)] transition-opacity flex-shrink-0"
                style={{ color: T.textMuted }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => openTab("/admin-v2")}
        aria-label="Нова вкладка"
        title="Нова вкладка (Cmd/Ctrl+T)"
        className="flex items-center justify-center px-3 transition-colors hover:bg-[var(--t-panel-el)]"
        style={{ color: T.textMuted, borderLeft: `1px solid ${T.borderSoft}` }}
      >
        <Plus size={16} />
      </button>

      {menu && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[180px] rounded-lg py-1 shadow-lg"
          style={{
            left: menu.x,
            top: menu.y,
            backgroundColor: T.panel,
            border: `1px solid ${T.borderStrong}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <MenuItem
            label="Перезавантажити"
            icon={<RotateCcw size={13} />}
            onClick={() => {
              reloadTab(menu.tabId);
              setMenu(null);
            }}
          />
          <MenuItem
            label="Дублювати"
            icon={<CopyIcon size={13} />}
            onClick={() => {
              const t = state.tabs.find((x) => x.id === menu.tabId);
              if (t) openTab(t.path);
              setMenu(null);
            }}
          />
          <div style={{ borderTop: `1px solid ${T.borderSoft}`, margin: "4px 0" }} />
          <MenuItem
            label="Закрити"
            icon={<X size={13} />}
            onClick={() => {
              closeTab(menu.tabId);
              setMenu(null);
            }}
          />
          <MenuItem
            label="Закрити інші"
            icon={<XSquare size={13} />}
            onClick={() => {
              closeOthers(menu.tabId);
              setMenu(null);
            }}
          />
          <MenuItem
            label="Закрити справа"
            icon={<XSquare size={13} />}
            onClick={() => {
              closeRight(menu.tabId);
              setMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-[12.5px] transition hover:bg-[var(--t-panel-el)]"
      style={{ color: T.textPrimary }}
    >
      <span style={{ color: T.textMuted, display: "inline-flex" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
