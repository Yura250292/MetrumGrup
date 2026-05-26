"use client";

import { HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useHelp } from "@/contexts/HelpContext";
import { trackHelpEvent } from "@/lib/help/analytics";
import { usePageHelp } from "./usePageHelp";

export function HelpButton() {
  const { open } = useHelp();
  const { pathname, role } = usePageHelp();

  return (
    <button
      onClick={() => {
        trackHelpEvent("help_opened", { route: pathname, role });
        open();
      }}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95"
      style={{ color: T.textSecondary, backgroundColor: T.panelElevated }}
      aria-label="Допомога"
      title="Допомога"
    >
      <HelpCircle size={16} />
    </button>
  );
}
