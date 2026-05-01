"use client";

import {
  CheckCircle2,
  Camera,
  FileCheck,
  MessageCircle,
  MessageSquare,
  Users,
  ListTree,
} from "lucide-react";
import type { FeedKind } from "@/hooks/useFeed";

const ICON_CONFIG: Record<
  FeedKind,
  { Icon: typeof CheckCircle2; gradient: string }
> = {
  completion_act: {
    Icon: CheckCircle2,
    gradient: "from-emerald-500 to-green-500",
  },
  photo_report: {
    Icon: Camera,
    gradient: "from-orange-500 to-amber-500",
  },
  estimate_approved: {
    Icon: FileCheck,
    gradient: "from-purple-500 to-violet-500",
  },
  comment: {
    Icon: MessageCircle,
    gradient: "from-blue-500 to-cyan-500",
  },
  chat_message: {
    Icon: MessageSquare,
    gradient: "from-pink-500 to-rose-500",
  },
  member_change: {
    Icon: Users,
    gradient: "from-indigo-500 to-blue-500",
  },
  stage_change: {
    Icon: ListTree,
    gradient: "from-amber-500 to-orange-500",
  },
};

export function FeedIcon({ kind, size = "md" }: { kind: FeedKind; size?: "sm" | "md" }) {
  const config = ICON_CONFIG[kind];
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconDim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div
      className={`${dim} flex-shrink-0 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white shadow-sm`}
    >
      <config.Icon className={iconDim} />
    </div>
  );
}
