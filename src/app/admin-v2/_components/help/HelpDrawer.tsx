"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronDown, Play, Target, ListChecks, HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useReducedMotion, useMediaQuery } from "@/components/landing/three/hooks/useReducedMotion";
import { useHelp } from "@/contexts/HelpContext";
import { GuidedTour } from "@/components/help/GuidedTour";
import { trackHelpEvent } from "@/lib/help/analytics";
import { usePageHelp } from "./usePageHelp";

export function HelpDrawer() {
  const { isOpen, close, activeTour, startTour, endTour } = useHelp();
  const { help, pathname, role } = usePageHelp();
  const reduced = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Keyboard: ESC closes, Tab cycles focus inside panel.
  useEffect(() => {
    if (!isOpen) return;
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
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Reset FAQ accordion when route changes.
  useEffect(() => {
    setOpenFaq(null);
  }, [pathname]);

  if (!mounted) return null;

  const drawerContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Допомога по сторінці"
            className={
              isMobile
                ? "fixed bottom-0 left-0 right-0 z-[61] flex flex-col"
                : "fixed right-0 top-0 z-[61] flex h-screen flex-col"
            }
            style={
              isMobile
                ? {
                    maxHeight: "85vh",
                    backgroundColor: T.panel,
                    borderTop: `1px solid ${T.borderSoft}`,
                    borderRadius: "20px 20px 0 0",
                  }
                : {
                    width: 420,
                    backgroundColor: T.panel,
                    borderLeft: `1px solid ${T.borderSoft}`,
                  }
            }
            initial={isMobile ? { y: "100%" } : { x: "100%" }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: "100%" } : { x: "100%" }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", damping: 32, stiffness: 240, mass: 0.8 }
            }
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: `1px solid ${T.borderSoft}` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <HelpCircle size={18} style={{ color: T.accentPrimary, flexShrink: 0 }} />
                <h2
                  className="truncate text-[15px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {help?.title ?? "Допомога"}
                </h2>
              </div>
              <button
                onClick={close}
                className="rounded-lg p-1.5 transition hover:brightness-95"
                style={{ color: T.textSecondary, backgroundColor: T.panelElevated }}
                aria-label="Закрити"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!help && (
                <p className="text-[13px]" style={{ color: T.textSecondary }}>
                  Для цієї сторінки контекстну довідку ще не підготували для вашої ролі.
                </p>
              )}
              {help && (
                <>
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: T.textSecondary }}
                  >
                    {help.summary}
                  </p>

                  {help.jobsToBeDone.length > 0 && (
                    <Section title="Що тут можна зробити" icon={<Target size={14} />}>
                      <ul className="flex flex-col gap-1.5">
                        {help.jobsToBeDone.map((j, i) => (
                          <li
                            key={i}
                            className="text-[12.5px] leading-snug flex items-start gap-2"
                            style={{ color: T.textSecondary }}
                          >
                            <span style={{ color: T.accentPrimary, marginTop: 6 }}>•</span>
                            <span>{j.text}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {help.firstSteps.length > 0 && (
                    <Section title="З чого почати" icon={<ListChecks size={14} />}>
                      <ol className="flex flex-col gap-1.5">
                        {help.firstSteps.map((s, i) => (
                          <li
                            key={i}
                            className="text-[12.5px] leading-snug flex items-start gap-2"
                            style={{ color: T.textSecondary }}
                          >
                            <span
                              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0"
                              style={{
                                backgroundColor: T.accentPrimarySoft,
                                color: T.accentPrimary,
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
                      <div className="flex flex-col gap-2">
                        {help.tours.map((tour) => (
                          <button
                            key={tour.id}
                            onClick={() => {
                              startTour(tour, { route: pathname, role });
                            }}
                            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:brightness-95"
                            style={{
                              backgroundColor: T.panelElevated,
                              border: `1px solid ${T.borderSoft}`,
                            }}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span
                                className="text-[12.5px] font-semibold truncate"
                                style={{ color: T.textPrimary }}
                              >
                                {tour.title}
                              </span>
                              <span
                                className="text-[11px] truncate"
                                style={{ color: T.textMuted }}
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
                      <div className="flex flex-col gap-1.5">
                        {help.faq.map((item, i) => {
                          const isOpen = openFaq === i;
                          return (
                            <div
                              key={i}
                              className="rounded-xl"
                              style={{
                                backgroundColor: T.panelElevated,
                                border: `1px solid ${T.borderSoft}`,
                              }}
                            >
                              <button
                                onClick={() => {
                                  const next = isOpen ? null : i;
                                  setOpenFaq(next);
                                  if (next !== null) {
                                    trackHelpEvent("help_faq_opened", { route: pathname, role });
                                  }
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                              >
                                <span
                                  className="text-[12.5px] font-semibold"
                                  style={{ color: T.textPrimary }}
                                >
                                  {item.question}
                                </span>
                                <ChevronDown
                                  size={14}
                                  style={{
                                    color: T.textMuted,
                                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                    transition: reduced ? "none" : "transform 200ms",
                                  }}
                                />
                              </button>
                              {isOpen && (
                                <div
                                  className="px-3 pb-3 text-[12px] leading-relaxed"
                                  style={{ color: T.textSecondary }}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
    <section className="mt-5">
      <div className="mb-2 flex items-center gap-1.5">
        {icon && <span style={{ color: T.accentPrimary }}>{icon}</span>}
        <h3
          className="text-[10.5px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}
