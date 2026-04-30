"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  FolderOpen,
  Camera,
  Activity,
  Calculator,
  Wallet,
  Banknote,
  Sparkles,
  ListTodo,
  FileText,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabOverview, type ProjectDetailData } from "./tab-overview";
import { TabTeam } from "./tab-team";
import { TabChat } from "./tab-chat";
import { TabFiles } from "./tab-files";
import { TabPhotos } from "./tab-photos";
import { TabActivity } from "./tab-activity";
import { TabEstimates } from "./tab-estimates";
import { TabFinancing } from "./tab-financing";
import { TabAiRender } from "./tab-ai-render";
import { TabTasks } from "./tab-tasks";
import { TabKB2 } from "./tab-kb2";

const BASE_TAB_DEFS = [
  { id: "overview", label: "Огляд", icon: LayoutDashboard },
  { id: "team", label: "Команда", icon: Users },
  { id: "chat", label: "Чат", icon: MessageSquare },
  { id: "files", label: "Файли", icon: FolderOpen },
  { id: "photos", label: "Фото", icon: Camera },
  { id: "activity", label: "Активність", icon: Activity },
  { id: "estimates", label: "Кошториси", icon: Calculator },
  { id: "finances", label: "Платежі / Фінанси", icon: Wallet },
  { id: "kb2", label: "Акти КБ-2в", icon: FileText },
  { id: "ai-render", label: "AI Візуалізація", icon: Sparkles },
  { id: "tasks", label: "Задачі", icon: ListTodo },
] as const;

type TabId = (typeof BASE_TAB_DEFS)[number]["id"];

export function ProjectTabs({
  activeTab,
  projectId,
  project,
  tasksEnabled = false,
}: {
  activeTab: string;
  projectId: string;
  project: ProjectDetailData;
  tasksEnabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const TAB_DEFS = tasksEnabled
    ? BASE_TAB_DEFS
    : BASE_TAB_DEFS.filter((t) => t.id !== "tasks");

  const current: TabId =
    (TAB_DEFS.find((t) => t.id === activeTab)?.id as TabId) || "overview";

  const switchTab = (tab: TabId) => {
    router.push(`${pathname}?tab=${tab}`, { scroll: false });
  };

  // Auto-scroll active tab into view
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
      {/* Tab nav */}
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-6 px-6 md:mx-0 md:px-0 pb-1 md:pb-0 rounded-none md:rounded-2xl md:p-1.5"
        style={{
          backgroundColor: "transparent",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
          maskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
        }}
      >
        <div
          className="flex gap-1 rounded-2xl p-1.5 md:flex-wrap"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          {TAB_DEFS.map((tab) => {
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
        </div>
      </div>

      {/* Tab content */}
      <div>
        {current === "overview" && <TabOverview project={project} />}
        {current === "team" && (
          <TabTeam manager={project.manager} client={project.client} projectId={projectId} />
        )}
        {current === "chat" && <TabChat projectId={projectId} />}
        {current === "files" && <TabFiles projectId={projectId} />}
        {current === "photos" && (
          <TabPhotos
            projectId={projectId}
            photoReports={project.photoReports}
            totalCount={project.photoReportsCount}
          />
        )}
        {current === "activity" && <TabActivity projectId={projectId} />}
        {current === "estimates" && <TabEstimates projectId={projectId} />}
        {current === "finances" && (
          // Об'єднано: тут — quadrants (план/факт × дохід/витрата) + tabs
          // Огляд / План-Факт / Табелі / Погодж. / Операції / Скани / Календар / Архів.
          // Все scope-ovано до цього проекту, синхронізовано з розділом Фінансування.
          <TabFinancing projectId={projectId} projectTitle={project.title} />
        )}
        {current === "kb2" && (
          <TabKB2 projectId={projectId} retentionPercentDefault={5} />
        )}
        {current === "ai-render" && <TabAiRender projectId={projectId} />}
        {current === "tasks" && tasksEnabled && (
          <TabTasks
            projectId={projectId}
            stages={project.stages.map((s) => ({ id: s.id, stage: s.stage }))}
          />
        )}
      </div>
    </div>
  );
}
