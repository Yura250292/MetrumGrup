"use client";

import { useEffect, useState } from "react";
import { Sparkles, Play, ArrowRight, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useHelp } from "@/contexts/HelpContext";
import { isIntroDismissed, dismissIntro } from "@/lib/help/storage";
import { trackHelpEvent } from "@/lib/help/analytics";
import { usePageHelp } from "./usePageHelp";

export function PageIntroCard() {
  const { help, pathname, role } = usePageHelp();
  const { open: openDrawer, startTour } = useHelp();
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!help?.intro?.enabled) return;
    setDismissed(isIntroDismissed(help.intro.dismissKey, help.intro.version));
  }, [help?.intro?.enabled, help?.intro?.dismissKey, help?.intro?.version]);

  if (!hydrated) return null;
  if (!help || help.isFallback) return null;
  if (!help.intro?.enabled) return null;
  if (dismissed) return null;

  const firstTour = help.tours?.[0];

  const handleDismiss = () => {
    if (!help.intro) return;
    dismissIntro(help.intro.dismissKey, help.intro.version);
    setDismissed(true);
    trackHelpEvent("help_intro_dismissed", { route: pathname, role });
  };

  return (
    <section
      className="relative flex flex-col gap-3 rounded-2xl px-4 py-4 sm:px-5 sm:py-4"
      style={{
        background: `linear-gradient(135deg, ${T.accentPrimary}0d, ${T.accentSecondary}14)`,
        border: `1px solid ${T.borderSoft}`,
      }}
      aria-label="Огляд розділу"
    >
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 rounded-md p-1 transition hover:brightness-95"
        style={{ color: T.textMuted }}
        aria-label="Більше не показувати"
        title="Більше не показувати"
      >
        <X size={14} />
      </button>

      <div className="flex items-center gap-2">
        <Sparkles size={16} style={{ color: T.accentPrimary }} />
        <h2
          className="text-[14px] font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          {help.title}
        </h2>
      </div>

      <p
        className="text-[12.5px] leading-relaxed pr-6"
        style={{ color: T.textSecondary }}
      >
        {help.summary}
      </p>

      {help.jobsToBeDone.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pr-6">
          {help.jobsToBeDone.slice(0, 4).map((j, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-[11.5px]"
              style={{ color: T.textSecondary }}
            >
              <span style={{ color: T.accentPrimary }}>•</span>
              <span>{j.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {firstTour && (
          <button
            onClick={() => {
              startTour(firstTour, { route: pathname, role });
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition active:scale-95"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <Play size={12} /> Почати тур
          </button>
        )}
        <button
          onClick={() => {
            trackHelpEvent("help_opened", { route: pathname, role });
            openDrawer();
          }}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
          style={{
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          Детальніше <ArrowRight size={12} />
        </button>
        <button
          onClick={handleDismiss}
          className="ml-auto text-[11.5px] font-medium underline-offset-2 hover:underline"
          style={{ color: T.textMuted }}
        >
          Більше не показувати
        </button>
      </div>
    </section>
  );
}
