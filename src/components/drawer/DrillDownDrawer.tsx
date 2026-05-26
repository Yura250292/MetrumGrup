"use client";

import { Suspense, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MOTION_EASING } from "@/lib/motion";
import { useDrillDown } from "./use-drill-down";
import { useIsMobile } from "./hooks/use-is-mobile";
import { useDrawerWidth } from "./hooks/use-drawer-width";
import { useDrawerKeyboard } from "./hooks/use-drawer-keyboard";
import { getRegistryEntry, type RegistryEntry } from "./registry";
import type { DrawerStackItem, RendererProps } from "./types";

const EDGE_SWIPE_THRESHOLD = 40;

// Спека Task 00: 300ms cubic-bezier(0.32, 0.72, 0, 1) iOS-like spring.
// Тримаємо локально, бо глобальний MOTION_DURATION.base = 0.4s — інтенційний
// bump 2026-04-27 (motion system), не хочемо регресити інші поверхні.
const DRAWER_DURATION = 0.3;
const DRAWER_EXIT_DURATION = 0.24;
const DRAWER_EASING: [number, number, number, number] = [0.32, 0.72, 0, 1];

// Stack depth visual: попередній рівень scale + opacity (Notion-style).
const PREV_STACK_SCALE = 0.97;
const PREV_STACK_OPACITY = 0.6;

function UnknownTypeFallback({ id }: RendererProps) {
  return (
    <div className="p-6">
      <h3
        className="mb-2 text-sm font-bold"
        style={{ color: T.textPrimary }}
      >
        Тип ще не зареєстровано
      </h3>
      <p className="text-[12px]" style={{ color: T.textMuted }}>
        Id: <code>{id}</code>. Drawer renderer для цього типу буде доданий у
        відповідному roadmap-task&apos;у.
      </p>
    </div>
  );
}

function RendererSkeleton() {
  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ color: T.textMuted }}
    >
      <Loader2 className="animate-spin" size={20} />
    </div>
  );
}

export function DrillDownDrawer() {
  const drawer = useDrillDown();
  const isMobile = useIsMobile();
  const { width, startDrag } = useDrawerWidth();
  const reduceMotion = useReducedMotion();

  const stack = drawer.stack;
  const top: DrawerStackItem | undefined = stack[stack.length - 1];
  const prev: DrawerStackItem | undefined =
    stack.length >= 2 ? stack[stack.length - 2] : undefined;
  const isOpen = !!top;

  const onHistoryBack = useCallback(() => {
    if (typeof window !== "undefined") window.history.back();
  }, []);
  const onHistoryForward = useCallback(() => {
    if (typeof window !== "undefined") window.history.forward();
  }, []);

  useDrawerKeyboard({
    enabled: isOpen,
    onBack: () => drawer.back(),
    onHistoryBack,
    onHistoryForward,
  });

  // Edge-swipe right (mobile) — back/close
  const touchStartXRef = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartXRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile) return;
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX == null) return;
    const endX = e.changedTouches[0].clientX;
    if (endX - startX > EDGE_SWIPE_THRESHOLD && startX < 60) {
      drawer.back();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && top ? (
        <DrawerShell
          key="drawer-shell"
          top={top}
          prev={prev}
          stackSize={stack.length}
          isMobile={isMobile}
          width={width}
          startDrag={startDrag}
          reduceMotion={!!reduceMotion}
          onBackdropClick={() => (isMobile ? drawer.closeAll() : drawer.back())}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />
      ) : null}
    </AnimatePresence>
  );
}

function DrawerShell({
  top,
  prev,
  stackSize,
  isMobile,
  width,
  startDrag,
  reduceMotion,
  onBackdropClick,
  onTouchStart,
  onTouchEnd,
}: {
  top: DrawerStackItem;
  prev: DrawerStackItem | undefined;
  stackSize: number;
  isMobile: boolean;
  width: number;
  startDrag: (e: React.MouseEvent) => void;
  reduceMotion: boolean;
  onBackdropClick: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}) {
  const entry: RegistryEntry | undefined = getRegistryEntry(top.type);
  const Renderer = entry?.Renderer ?? UnknownTypeFallback;

  const prevEntry: RegistryEntry | undefined = prev
    ? getRegistryEntry(prev.type)
    : undefined;
  const PrevRenderer = prevEntry?.Renderer;

  // Motion variants — switch by viewport. Reduced motion → opacity only.
  const panelVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : isMobile
      ? {
          hidden: { y: "100%" },
          visible: {
            y: 0,
            transition: {
              duration: DRAWER_DURATION,
              ease: DRAWER_EASING,
            },
          },
          exit: {
            y: "100%",
            transition: {
              duration: DRAWER_EXIT_DURATION,
              ease: MOTION_EASING.inOut,
            },
          },
        }
      : {
          hidden: { x: "100%" },
          visible: {
            x: 0,
            transition: {
              duration: DRAWER_DURATION,
              ease: DRAWER_EASING,
            },
          },
          exit: {
            x: "100%",
            transition: {
              duration: DRAWER_EXIT_DURATION,
              ease: MOTION_EASING.inOut,
            },
          },
        };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 0.18, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };

  // Variants для попереднього drawer'a у стеку (під верхнім).
  // Notion-style: масштабується/тьмяніє, щоб відчувалася глибина.
  const prevPanelVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: PREV_STACK_OPACITY,
          transition: { duration: 0.15 },
        },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        hidden: { opacity: 0, scale: 1 },
        visible: {
          opacity: PREV_STACK_OPACITY,
          scale: PREV_STACK_SCALE,
          transition: { duration: DRAWER_DURATION, ease: DRAWER_EASING },
        },
        exit: {
          opacity: 0,
          scale: 1,
          transition: { duration: DRAWER_EXIT_DURATION, ease: MOTION_EASING.inOut },
        },
      };

  return (
    <>
      {/* Backdrop — Notion-light: фон не блюриться, легка вуаль */}
      <motion.div
        className="fixed inset-0 z-40 bg-black"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onBackdropClick}
        aria-hidden="true"
      />

      {/* Previous stack item — рендериться під верхнім, scale + opacity. */}
      {prev && PrevRenderer ? (
        <motion.aside
          aria-hidden="true"
          className={
            isMobile
              ? "fixed inset-0 z-40 flex flex-col"
              : "fixed right-0 top-0 bottom-0 z-40 flex flex-col"
          }
          style={
            isMobile
              ? {
                  backgroundColor: T.panel,
                  color: T.textPrimary,
                  pointerEvents: "none",
                  transformOrigin: "center center",
                }
              : {
                  width,
                  maxWidth: "100vw",
                  backgroundColor: T.panel,
                  color: T.textPrimary,
                  borderLeft: `1px solid ${T.borderStrong}`,
                  boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
                  pointerEvents: "none",
                  transformOrigin: "left center",
                }
          }
          variants={prevPanelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-drawer-prev-stack="true"
        >
          <Suspense fallback={<RendererSkeleton />}>
            <PrevRenderer key={`${prev.type}:${prev.id}`} id={prev.id} />
          </Suspense>
        </motion.aside>
      ) : null}

      {/* Panel */}
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={
          top.breadcrumbLabel || entry?.defaultBreadcrumb || "Деталі"
        }
        className={
          isMobile
            ? "fixed inset-0 z-50 flex flex-col"
            : "fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        }
        style={
          isMobile
            ? {
                backgroundColor: T.panel,
                color: T.textPrimary,
              }
            : {
                width,
                maxWidth: "100vw",
                backgroundColor: T.panel,
                color: T.textPrimary,
                borderLeft: `1px solid ${T.borderStrong}`,
                boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
              }
        }
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        data-drawer-stack-size={stackSize}
      >
        {!isMobile && (
          <div
            onMouseDown={startDrag}
            className="absolute left-0 top-0 bottom-0 z-30 w-1.5 cursor-ew-resize hover:bg-blue-500/40 transition"
            style={{ backgroundColor: "transparent" }}
            title="Перетягніть, щоб змінити ширину"
            aria-label="Змінити ширину панелі"
          />
        )}
        <Suspense fallback={<RendererSkeleton />}>
          {/* `key` гарантує перемонтування renderer'а при зміні top entity */}
          <Renderer key={`${top.type}:${top.id}`} id={top.id} />
        </Suspense>
      </motion.aside>
    </>
  );
}
