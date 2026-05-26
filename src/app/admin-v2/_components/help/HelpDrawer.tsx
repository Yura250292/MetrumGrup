"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Play, Target, ListChecks, HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useReducedMotion, useMediaQuery } from "@/components/landing/three/hooks/useReducedMotion";
import { useHelp } from "@/contexts/HelpContext";
import { GuidedTour } from "@/components/help/GuidedTour";
import { trackHelpEvent } from "@/lib/help/analytics";
import { usePageHelp } from "./usePageHelp";

const Z_BACKDROP = 9998;
const Z_DRAWER = 9999;

export function HelpDrawer() {
  const { isOpen, close, activeTour, startTour, endTour } = useHelp();
  const { help, pathname, role } = usePageHelp();
  const reduced = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimeout = setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button, [href]")?.focus();
    }, 50);

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      clearTimeout(focusTimeout);
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, close]);

  useEffect(() => {
    setOpenFaq(null);
  }, [pathname]);

  if (!mounted) return null;

  const transition = reduced ? "none" : "transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease-out";

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: reduced ? "none" : "opacity 200ms ease-out",
          zIndex: Z_BACKDROP,
        }}
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Допомога по сторінці"
        aria-hidden={!isOpen}
        style={
          isMobile
            ? {
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: "85vh",
                height: "85vh",
                backgroundColor: T.panel,
                borderTop: `1px solid ${T.borderSoft}`,
                borderRadius: "20px 20px 0 0",
                transform: isOpen ? "translateY(0)" : "translateY(100%)",
                transition,
                zIndex: Z_DRAWER,
                display: "flex",
                flexDirection: "column",
                pointerEvents: isOpen ? "auto" : "none",
                visibility: isOpen ? "visible" : "hidden",
                boxShadow: "0 -20px 60px rgba(0,0,0,0.25)",
              }
            : {
                position: "fixed",
                right: 0,
                top: 0,
                width: 460,
                maxWidth: "100vw",
                height: "100vh",
                backgroundColor: T.panel,
                borderLeft: `1px solid ${T.borderSoft}`,
                transform: isOpen ? "translateX(0)" : "translateX(100%)",
                transition,
                zIndex: Z_DRAWER,
                display: "flex",
                flexDirection: "column",
                pointerEvents: isOpen ? "auto" : "none",
                visibility: isOpen ? "visible" : "hidden",
                boxShadow: "-20px 0 60px rgba(0,0,0,0.18)",
              }
        }
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${T.borderSoft}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HelpCircle size={18} style={{ color: T.accentPrimary, flexShrink: 0 }} />
            <h2
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: T.textPrimary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {help?.title ?? "Допомога"}
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Закрити"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              color: T.textSecondary,
              backgroundColor: T.panelElevated,
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px 20px 24px",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {!help && (
            <p style={{ fontSize: 13, color: T.textSecondary, margin: 0 }}>
              Для цієї сторінки контекстну довідку ще не підготували для вашої ролі.
            </p>
          )}
          {help && (
            <>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: T.textSecondary,
                  margin: 0,
                }}
              >
                {help.summary}
              </p>

              {help.jobsToBeDone.length > 0 && (
                <Section title="Що тут можна зробити" icon={<Target size={14} />}>
                  <ul style={listStyle}>
                    {help.jobsToBeDone.map((j, i) => (
                      <li key={i} style={bulletStyle}>
                        <span style={{ color: T.accentPrimary, marginTop: 6 }}>•</span>
                        <span>{j.text}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {help.firstSteps.length > 0 && (
                <Section title="З чого почати" icon={<ListChecks size={14} />}>
                  <ol style={listStyle}>
                    {help.firstSteps.map((s, i) => (
                      <li key={i} style={bulletStyle}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 16,
                            height: 16,
                            borderRadius: 999,
                            fontSize: 9,
                            fontWeight: 700,
                            backgroundColor: T.accentPrimarySoft,
                            color: T.accentPrimary,
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          {i + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {help.tours && help.tours.length > 0 && (
                <Section title="Запустити тур" icon={<Play size={14} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {help.tours.map((tour) => (
                      <button
                        key={tour.id}
                        onClick={() => startTour(tour, { route: pathname, role })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 12px",
                          borderRadius: 12,
                          backgroundColor: T.panelElevated,
                          border: `1px solid ${T.borderSoft}`,
                          textAlign: "left",
                          cursor: "pointer",
                          width: "100%",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: T.textPrimary,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tour.title}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: T.textMuted,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tour.description}
                          </span>
                        </div>
                        <Play size={14} style={{ color: T.accentPrimary, flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {help.faq.length > 0 && (
                <Section title="Питання й відповіді" icon={<HelpCircle size={14} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {help.faq.map((item, i) => {
                      const expanded = openFaq === i;
                      return (
                        <div
                          key={i}
                          style={{
                            borderRadius: 12,
                            backgroundColor: T.panelElevated,
                            border: `1px solid ${T.borderSoft}`,
                          }}
                        >
                          <button
                            onClick={() => {
                              const nextV = expanded ? null : i;
                              setOpenFaq(nextV);
                              if (nextV !== null) {
                                trackHelpEvent("help_faq_opened", { route: pathname, role });
                              }
                            }}
                            style={{
                              display: "flex",
                              width: "100%",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              padding: "10px 12px",
                              backgroundColor: "transparent",
                              border: "none",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                            aria-expanded={expanded}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary }}>
                              {item.question}
                            </span>
                            <ChevronDown
                              size={14}
                              style={{
                                color: T.textMuted,
                                flexShrink: 0,
                                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                                transition: reduced ? "none" : "transform 200ms",
                              }}
                            />
                          </button>
                          {expanded && (
                            <div
                              style={{
                                padding: "0 12px 12px",
                                fontSize: 12,
                                lineHeight: 1.55,
                                color: T.textSecondary,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {item.answer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {createPortal(drawerContent, document.body)}
      {activeTour &&
        createPortal(
          <GuidedTour
            tour={activeTour}
            onClose={(completed) => endTour(completed, { route: pathname, role })}
          />,
          document.body,
        )}
    </>
  );
}

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const bulletStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "var(--t-text-2)",
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {icon && <span style={{ color: T.accentPrimary }}>{icon}</span>}
        <h3
          style={{
            margin: 0,
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: T.textMuted,
          }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}
