"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  FolderOpen,
  Camera,
  Activity,
  Calculator,
  Wallet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabOverview, type ProjectDetailData } from "./tab-overview";
import { TabTeam } from "./tab-team";
import { TabChat } from "./tab-chat";
import { TabFiles } from "./tab-files";
import { TabPhotos } from "./tab-photos";
import { TabActivity } from "./tab-activity";
import { TabEstimates } from "./tab-estimates";
import { TabFinances } from "./tab-finances";

const TAB_DEFS = [
  { id: "overview", label: "Огляд", icon: LayoutDashboard },
  { id: "team", label: "Команда", icon: Users },
  { id: "chat", label: "Чат", icon: MessageSquare },
  { id: "files", label: "Файли", icon: FolderOpen },
  { id: "photos", label: "Фото", icon: Camera },
  { id: "activity", label: "Активність", icon: Activity },
  { id: "estimates", label: "Кошториси", icon: Calculator },
  { id: "finances", label: "Фінанси", icon: Wallet },
] as const;

type TabId = (typeof TAB_DEFS)[number]["id"];

export function ProjectTabs({
  activeTab,
  projectId,
  project,
}: {
  activeTab: string;
  projectId: string;
  project: ProjectDetailData;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const current: TabId =
    (TAB_DEFS.find((t) => t.id === activeTab)?.id as TabId) || "overview";

  const switchTab = (tab: TabId) => {
    router.push(`${pathname}?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab nav */}
      <div
        className="flex gap-1 overflow-x-auto rounded-2xl p-1.5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {TAB_DEFS.map((tab) => {
          const Icon = tab.icon;
          const active = current === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition"
              style={{
                backgroundColor: active ? T.accentPrimarySoft : "transparent",
                color: active ? T.accentPrimary : T.textSecondary,
                border: `1px solid ${active ? T.borderAccent : "transparent"}`,
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
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
          <TabFinances
            projectId={projectId}
            totalBudget={project.totalBudget}
            totalPaid={project.totalPaid}
            payments={project.payments}
          />
        )}
      </div>
    </div>
  );
}
