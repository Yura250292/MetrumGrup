"use client";

import { useState } from "react";
import { T } from "./_components/tokens";
import { SetupDesktop } from "./_components/setup-desktop";
import { ResultDesktop } from "./_components/result-desktop";
import { WizardFullscreen } from "./_components/wizard";
import { PreAnalysisModal } from "./_components/pre-analysis";
import { RefinePanel } from "./_components/refine-panel";
import { SaveDialog } from "./_components/save-dialog";
import { SupplementPanel } from "./_components/supplement-panel";
import { SetupMobile } from "./_components/setup-mobile";
import { ResultMobile } from "./_components/result-mobile";

type ScreenKey =
  | "setup-desktop"
  | "result-desktop"
  | "wizard"
  | "pre-analysis"
  | "refine"
  | "save"
  | "supplement"
  | "setup-mobile"
  | "result-mobile";

const SCREENS: { key: ScreenKey; label: string }[] = [
  { key: "setup-desktop", label: "Setup · Desktop" },
  { key: "result-desktop", label: "Result · Desktop" },
  { key: "wizard", label: "Майстер" },
  { key: "pre-analysis", label: "Пре-аналіз" },
  { key: "refine", label: "Уточнення" },
  { key: "save", label: "Збереження" },
  { key: "supplement", label: "Доповнення" },
  { key: "setup-mobile", label: "Setup · Mobile" },
  { key: "result-mobile", label: "Result · Mobile" },
];

export default function AiGenerateV2Page() {
  const [active, setActive] = useState<ScreenKey>("setup-desktop");

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#070A11" }}>
      {/* Screen switcher */}
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-6 py-3"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <span className="mr-3 text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          AI ESTIMATE V2 · ПРОТОТИП
        </span>
        {SCREENS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
            style={{
              backgroundColor: active === s.key ? T.accentPrimary : T.panelElevated,
              color: active === s.key ? "#FFFFFF" : T.textSecondary,
              border: `1px solid ${active === s.key ? T.accentPrimary : T.borderStrong}`,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Screen viewport */}
      <div className="flex justify-center overflow-x-auto px-6 py-8">{renderScreen(active)}</div>
    </div>
  );
}

function renderScreen(key: ScreenKey) {
  switch (key) {
    case "setup-desktop":
      return <SetupDesktop />;
    case "result-desktop":
      return <ResultDesktop />;
    case "wizard":
      return <WizardFullscreen />;
    case "pre-analysis":
      return <PreAnalysisModal />;
    case "refine":
      return <RefinePanel />;
    case "save":
      return <SaveDialog />;
    case "supplement":
      return <SupplementPanel />;
    case "setup-mobile":
      return <SetupMobile />;
    case "result-mobile":
      return <ResultMobile />;
  }
}
