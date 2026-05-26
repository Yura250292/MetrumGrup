"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Play, ArrowRight, X, ChevronDown } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);

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

  const handleDismiss = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!help.intro) return;
    dismissIntro(help.intro.dismissKey, help.intro.version);
    setDismissed(true);
    trackHelpEvent("help_intro_dismissed", { route: pathname, role });
  };

  if (!expanded) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={() => setExpanded(true)}
          aria-label={`Дізнатись що це за розділ — ${help.title}`}
          title="Що це за розділ"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px 4px 8px",
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 600,
            color: T.accentPrimary,
            backgroundColor: T.accentPrimarySoft,
            border: `1px solid ${T.borderSoft}`,
            cursor: "pointer",
            lineHeight: 1.2,
          }}
        >
          <HelpCircle size={13} />
          Що це за розділ?
          <ChevronDown size={11} style={{ opacity: 0.7 }} />
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Більше не показувати"
          title="Більше не показувати"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 999,
            color: T.textMuted,
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            opacity: 0.6,
          }}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <section
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 14,
        background: `linear-gradient(135deg, ${T.accentPrimary}0d, ${T.accentSecondary}14)`,
        border: `1px solid ${T.borderSoft}`,
      }}
      aria-label="Огляд розділу"
    >
      <button
        onClick={() => setExpanded(false)}
        aria-label="Згорнути"
        title="Згорнути"
        style={{
          position: "absolute",
          right: 8,
          top: 8,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 6,
          color: T.textMuted,
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <X size={13} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 28 }}>
        <HelpCircle size={14} style={{ color: T.accentPrimary }} />
        <h2
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 700,
            color: T.textPrimary,
          }}
        >
          {help.title}
        </h2>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: T.textSecondary,
          paddingRight: 28,
        }}
      >
        {help.summary}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {firstTour && (
          <button
            onClick={() => startTour(firstTour, { route: pathname, role })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 600,
              color: "#fff",
              backgroundColor: T.accentPrimary,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Play size={11} /> Тур
          </button>
        )}
        <button
          onClick={() => {
            trackHelpEvent("help_opened", { route: pathname, role });
            openDrawer();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 600,
            color: T.textPrimary,
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
            cursor: "pointer",
          }}
        >
          Детальніше <ArrowRight size={11} />
        </button>
        <button
          onClick={handleDismiss}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 500,
            color: T.textMuted,
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.textDecoration = "none";
          }}
        >
          Більше не показувати
        </button>
      </div>
    </section>
  );
}
