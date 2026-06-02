"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Activity,
  Calculator,
  Wallet,
  Sparkles,
  ListTodo,
  Image as ImageIcon,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabOverview, type ProjectDetailData } from "./tab-overview";
import { TabTeam } from "./tab-team";
import { TabChat } from "./tab-chat";
import { TabMedia } from "./tab-media";
import { TabActivity } from "./tab-activity";
import { TabEstimates } from "./tab-estimates";
import { TabFinancing } from "./tab-financing";
import { TabAiRender } from "./tab-ai-render";
import { TabTasks } from "./tab-tasks";
import { TabDocuments } from "./tab-documents";

const VISIBLE_TAB_DEFS = [
  { id: "overview", label: "Огляд", icon: LayoutDashboard },
  { id: "team", label: "Команда", icon: Users },
  { id: "chat", label: "Чат", icon: MessageSquare },
  { id: "media", label: "Медіа", icon: ImageIcon },
  { id: "estimates", label: "Кошториси", icon: Calculator },
  { id: "finances", label: "Фінанси", icon: Wallet },
  { id: "documents", label: "Документи", icon: FileText },
  { id: "tasks", label: "Задачі", icon: ListTodo },
] as const;

const OVERFLOW_TAB_DEFS = [
  { id: "activity", label: "Активність", icon: Activity },
  { id: "ai-render", label: "AI Візуалізація", icon: Sparkles },
] as const;

const ALL_TAB_IDS = [
  ...VISIBLE_TAB_DEFS.map((t) => t.id),
  ...OVERFLOW_TAB_DEFS.map((t) => t.id),
] as const;

type TabId = (typeof ALL_TAB_IDS)[number];

/** Старі URL → нові (зворотна сумісність bookmarked-посилань). */
const LEGACY_TAB_REDIRECT: Record<string, { tab: TabId; sub: string }> = {
  files: { tab: "media", sub: "files" },
  photos: { tab: "media", sub: "photos" },
  "change-orders": { tab: "documents", sub: "change-orders" },
  rfis: { tab: "documents", sub: "rfis" },
  kb2: { tab: "documents", sub: "kb2" },
};

export function ProjectTabs({
  activeTab,
  projectId,
  project,
  tasksEnabled = false,
  canViewCost = false,
}: {
  activeTab: string;
  projectId: string;
  project: ProjectDetailData;
  tasksEnabled?: boolean;
  canViewCost?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Legacy redirect: старі `?tab=files` тощо → canonical URL з sub.
  useEffect(() => {
    const legacy = LEGACY_TAB_REDIRECT[activeTab];
    if (legacy) {
      router.replace(
        `${pathname}?tab=${legacy.tab}&sub=${legacy.sub}`,
        { scroll: false },
      );
    }
  }, [activeTab, router, pathname]);

  const visible = tasksEnabled
    ? VISIBLE_TAB_DEFS
    : VISIBLE_TAB_DEFS.filter((t) => t.id !== "tasks");

  const knownIds = new Set<TabId>(ALL_TAB_IDS);
  const current: TabId =
    knownIds.has(activeTab as TabId) ? (activeTab as TabId) : "overview";

  const inOverflow = OVERFLOW_TAB_DEFS.some((t) => t.id === current);

  const switchTab = (tab: TabId) => {
    router.push(`${pathname}?tab=${tab}`, { scroll: false });
    setOverflowOpen(false);
  };

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [current]);

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-6 px-6 md:mx-0 md:px-0 pb-1 md:pb-0 rounded-none md:rounded-2xl md:p-1.5"
        style={{
          backgroundColor: "transparent",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
          maskImage:
            "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
        }}
      >
        <div
          className="flex gap-1 rounded-2xl p-1.5 md:flex-wrap"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {visible.map((tab) => {
            const Icon = tab.icon;
            const active = current === tab.id;
            return (
              <button
                key={tab.id}
                ref={active ? activeRef : undefined}
                onClick={() => switchTab(tab.id)}
                className="flex items-center gap-2 rounded-xl px-4 py-3 md:py-2.5 text-[13px] font-semibold whitespace-nowrap transition snap-start flex-shrink-0 tap-highlight-none active:scale-[0.97]"
                style={{
                  backgroundColor: active ? T.accentPrimarySoft : "transparent",
                  color: active ? T.accentPrimary : T.textSecondary,
                  border: `1px solid ${active ? T.borderAccent : "transparent"}`,
                  minHeight: 44,
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}

          {/* Overflow `⋯ Більше` — Активність + AI Візуалізація */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl px-4 py-3 md:py-2.5 text-[13px] font-semibold whitespace-nowrap transition snap-start flex-shrink-0 tap-highlight-none active:scale-[0.97]"
              style={{
                backgroundColor: inOverflow ? T.accentPrimarySoft : "transparent",
                color: inOverflow ? T.accentPrimary : T.textSecondary,
                border: `1px solid ${inOverflow ? T.borderAccent : "transparent"}`,
                minHeight: 44,
              }}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
            >
              <MoreHorizontal size={14} />
              Більше
            </button>
            {overflowOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setOverflowOpen(false)}
                  aria-hidden
                />
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg shadow-lg"
                  style={{
                    backgroundColor: T.panel,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  {OVERFLOW_TAB_DEFS.map((tab) => {
                    const Icon = tab.icon;
                    const active = current === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="menuitem"
                        onClick={() => switchTab(tab.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:brightness-95"
                        style={{
                          color: active ? T.accentPrimary : T.textPrimary,
                          backgroundColor: active
                            ? T.accentPrimarySoft
                            : "transparent",
                        }}
                      >
                        <Icon size={13} style={{ color: T.textMuted }} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        {current === "overview" && <TabOverview project={project} />}
        {current === "team" && (
          <TabTeam
            manager={project.manager}
            client={project.client}
            clientName={
              project.clientName ??
              project.clientCounterparty?.name ??
              project.client?.name ??
              "—"
            }
            projectId={projectId}
          />
        )}
        {current === "chat" && <TabChat projectId={projectId} />}
        {current === "media" && (
          <TabMedia
            projectId={projectId}
            photoReports={project.photoReports}
            photoReportsCount={project.photoReportsCount}
          />
        )}
        {current === "estimates" && <TabEstimates projectId={projectId} />}
        {current === "finances" && (
          <TabFinancing projectId={projectId} projectTitle={project.title} />
        )}
        {current === "documents" && <TabDocuments projectId={projectId} />}
        {current === "tasks" && tasksEnabled && (
          <TabTasks
            projectId={projectId}
            stages={project.stages.map((s) => ({ id: s.id, stage: s.stage }))}
            canViewCost={canViewCost}
          />
        )}
        {current === "activity" && <TabActivity projectId={projectId} />}
        {current === "ai-render" && <TabAiRender projectId={projectId} />}
      </div>
    </div>
  );
}
