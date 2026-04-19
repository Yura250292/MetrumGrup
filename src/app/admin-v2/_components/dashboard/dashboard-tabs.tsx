"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, useEffect } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Banknote,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const TAB_DEFS = [
  { id: "overview", label: "Огляд", shortLabel: "Огляд", icon: LayoutDashboard },
  { id: "projects", label: "Проєкти", shortLabel: "Проєкти", icon: FolderKanban },
  { id: "team", label: "Команда", shortLabel: "Команда", icon: Users },
  { id: "financing", label: "Фінансування", shortLabel: "Фінанси", icon: Banknote },
] as const;

export type DashboardTabId = (typeof TAB_DEFS)[number]["id"];

export function DashboardTabs({ active }: { active: DashboardTabId }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const switchTab = (tab: DashboardTabId) => {
    if (tab === "financing") {
      router.push("/admin-v2/financing");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [active]);

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto rounded-xl p-1"
      style={{
        backgroundColor: T.panelElevated,
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {TAB_DEFS.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : null}
            onClick={() => switchTab(tab.id)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-4 py-2 text-[11px] sm:text-[13px] font-semibold transition whitespace-nowrap"
            style={{
              backgroundColor: isActive ? T.panel : "transparent",
              color: isActive ? T.accentPrimary : T.textMuted,
              boxShadow: isActive ? `0 1px 3px ${T.borderSoft}` : "none",
            }}
          >
            <Icon size={14} className="flex-shrink-0" />
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
