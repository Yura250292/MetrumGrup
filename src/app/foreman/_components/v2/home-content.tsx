"use client";

import { motion } from "framer-motion";
import { HomeHeader } from "./home-header";
import { ActiveProjectCard, type ActiveProjectInfo } from "./active-project-card";
import { TodaySection, type TodaySectionData } from "./today-section";
import { QuickActions } from "./quick-actions";
import { ToolsSection } from "./tools-section";

interface HomeContentProps {
  userName: string;
  pending: number;
  activeProject: ActiveProjectInfo | null;
  today: TodaySectionData;
  hasAnyProject: boolean;
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export function HomeContent({
  userName,
  pending,
  activeProject,
  today,
  hasAnyProject,
}: HomeContentProps) {
  const primaryReportHref = hasAnyProject ? "/foreman/report/folder" : "/foreman/report/folder";

  return (
    <div className="space-y-5">
      <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
        <HomeHeader userName={userName} pending={pending} />
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.32, delay: 0.04 }}>
        <ActiveProjectCard project={activeProject} />
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.32, delay: 0.08 }}>
        <TodaySection data={today} projectId={activeProject?.id ?? null} />
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.32, delay: 0.12 }}>
        <QuickActions primaryHref={primaryReportHref} />
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.32, delay: 0.16 }}>
        <ToolsSection />
      </motion.div>
    </div>
  );
}
