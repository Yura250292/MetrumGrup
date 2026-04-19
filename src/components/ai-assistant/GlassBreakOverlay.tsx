"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { SHARDS, CRACK_LINES } from "./glass-shards";

/**
 * Phases:
 * 1. "intro"    — dark overlay fades in, AI avatar appears (pointing) + stone appears
 * 2. "ready"    — window (шиба) with owner photo appears, stone pulses — waiting for tap
 * 3. "throwing" — stone flies toward window
 * 4. "impact"   — cracks appear, flash, sound
 * 5. "breaking" — shards fly away
 * 6. "done"     — overlay unmounts
 */
type Phase = "intro" | "ready" | "throwing" | "impact" | "breaking" | "done";

type Props = {
  onComplete: () => void;
};

/** Reduce shards on mobile for better performance */
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(window.innerWidth < 768);
  }, []);
  return mobile;
}

export function GlassBreakOverlay({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const completedCount = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMobile = useIsMobile();

  // On mobile use fewer shards for GPU perf
  const activeShards = isMobile ? SHARDS.filter((_, i) => i % 2 === 0) : SHARDS;

  // Preload audio
  useEffect(() => {
    try {
      audioRef.current = new Audio("/sounds/glass-break.mp3");
      audioRef.current.volume = 0.5;
    } catch {
      // Audio not available
    }
  }, []);

  // Intro → ready transition
  useEffect(() => {
    const timer = setTimeout(() => setPhase("ready"), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleThrow = () => {
    if (phase !== "ready") return;
    setPhase("throwing");
  };

  // Throwing → impact → breaking chain
  useEffect(() => {
    if (phase !== "throwing") return;
    const impactTimer = setTimeout(() => {
      setPhase("impact");
      try { audioRef.current?.play(); } catch { /* blocked */ }
    }, 500);
    return () => clearTimeout(impactTimer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "impact") return;
    const breakTimer = setTimeout(() => setPhase("breaking"), 200);
    return () => clearTimeout(breakTimer);
  }, [phase]);

  const handleShardComplete = () => {
    completedCount.current += 1;
    if (completedCount.current >= activeShards.length) {
      setPhase("done");
      onComplete();
    }
  };

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 safe-area-pt safe-area-pb"
      style={{ zIndex: 10000 }}
      aria-hidden="true"
    >
      {/* Dark backdrop */}
      <motion.div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "breaking" ? 0 : 1 }}
        transition={{ duration: phase === "breaking" ? 0.6 : 0.4 }}
      />

      {/* ── AI Avatar (pointing) — bottom left ── */}
      <AnimatePresence>
        {(phase === "intro" || phase === "ready" || phase === "throwing") && (
          <motion.div
            className="absolute bottom-20 md:bottom-8 left-4 md:left-8 z-20"
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <Image
              src="/images/ai-avatar-pointing.gif"
              alt="AI Помічник"
              width={120}
              height={120}
              className="h-16 w-16 md:h-[120px] md:w-[120px] rounded-2xl"
              style={{ objectFit: "cover" }}
              unoptimized
              priority
            />
            {/* Speech bubble */}
            <motion.div
              className="absolute -top-10 md:-top-12 left-14 md:left-24 whitespace-nowrap rounded-xl px-2.5 py-1.5 md:px-3 md:py-2 text-[11px] md:text-[13px] font-medium"
              style={{
                backgroundColor: "rgba(255,255,255,0.95)",
                color: "#1a1a1a",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              {phase === "ready" || phase === "throwing"
                ? "Тисни на камінь! 👆"
                : "Давай розіб'ємо шибу!"}
              <div
                className="absolute -bottom-1.5 left-3 h-2.5 w-2.5 rotate-45"
                style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stone — bottom center, clickable ── */}
      <AnimatePresence>
        {(phase === "intro" || phase === "ready") && (
          <motion.button
            className="absolute z-30 cursor-pointer select-none tap-highlight-none touch-target"
            style={{
              bottom: "25%",
              left: "50%",
              fontSize: 40,
              lineHeight: 1,
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
            }}
            initial={{ x: "-50%", opacity: 0, scale: 0 }}
            animate={{
              x: "-50%",
              opacity: 1,
              scale: phase === "ready" ? [1, 1.15, 1] : 1,
            }}
            exit={{ opacity: 0 }}
            transition={
              phase === "ready"
                ? { scale: { repeat: Infinity, duration: 1.2, ease: "easeInOut" }, opacity: { duration: 0.3 } }
                : { type: "spring", stiffness: 300, damping: 15, delay: 0.3 }
            }
            onClick={handleThrow}
            aria-label="Кинути камінь"
          >
            🪨
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Stone flying toward window ── */}
      {phase === "throwing" && (
        <motion.div
          className="absolute z-30 pointer-events-none"
          style={{
            bottom: "25%",
            left: "50%",
            fontSize: 40,
            lineHeight: 1,
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
          }}
          initial={{ x: "-50%", y: 0, scale: 1, rotate: 0 }}
          animate={{
            x: "-50%",
            y: isMobile ? "-25vh" : "-30vh",
            scale: 0.6,
            rotate: 360,
          }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0.3, 1] }}
        >
          🪨
        </motion.div>
      )}

      {/* ── Window (шиба) with owner photo ── */}
      <AnimatePresence>
        {phase !== "intro" && (
          <motion.div
            className="absolute z-10"
            style={{
              top: isMobile ? "8%" : "10%",
              left: "50%",
              width: isMobile ? "min(260px, 75vw)" : "min(320px, 80vw)",
              height: isMobile ? "min(320px, 45vh)" : "min(400px, 55vh)",
            }}
            initial={{ x: "-50%", opacity: 0, scale: 0.8 }}
            animate={{ x: "-50%", opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {/* Window frame */}
            <div
              className="relative h-full w-full overflow-hidden rounded-lg"
              style={{
                border: isMobile ? "4px solid #8B6F47" : "6px solid #8B6F47",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 2px #A0845C",
                background: "#6B5433",
              }}
            >
              {/* Cross bars */}
              <div className="absolute left-1/2 top-0 bottom-0 w-1 md:w-1.5 -translate-x-1/2 z-[5]" style={{ backgroundColor: "#8B6F47" }} />
              <div className="absolute top-1/2 left-0 right-0 h-1 md:h-1.5 -translate-y-1/2 z-[5]" style={{ backgroundColor: "#8B6F47" }} />

              {/* Owner photo behind glass */}
              {phase !== "breaking" && (
                <div className="absolute inset-0">
                  <Image
                    src="/images/owner-shiba.webp"
                    alt=""
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                  />
                </div>
              )}

              {/* Glass layer (frosted) */}
              {(phase === "ready" || phase === "throwing") && (
                <div
                  className="absolute inset-0 z-[2]"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(200,220,240,0.2) 50%, rgba(255,255,255,0.1) 100%)",
                    backdropFilter: isMobile ? "blur(4px)" : "blur(6px) saturate(1.2)",
                    WebkitBackdropFilter: isMobile ? "blur(4px)" : "blur(6px) saturate(1.2)",
                  }}
                />
              )}

              {/* Glass reflection */}
              {(phase === "ready" || phase === "throwing") && (
                <div
                  className="absolute inset-0 z-[3]"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 35%, rgba(255,255,255,0.08) 60%, transparent 100%)",
                  }}
                />
              )}

              {/* ── IMPACT: cracks + flash ── */}
              {(phase === "impact" || phase === "breaking") && (
                <>
                  <motion.div
                    className="absolute inset-0 z-[6] pointer-events-none"
                    style={{
                      background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.8) 0%, transparent 60%)",
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 0.2 }}
                  />
                  <motion.svg
                    className="absolute inset-0 h-full w-full z-[4] pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.05 }}
                  >
                    {CRACK_LINES.map((line, i) => (
                      <motion.line
                        key={i}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth="0.4"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.06, delay: i * 0.003 }}
                      />
                    ))}
                  </motion.svg>
                </>
              )}

              {/* ── BREAKING: shards fly away ── */}
              {phase === "breaking" && (
                <>
                  {activeShards.map((shard) => (
                    <motion.div
                      key={shard.id}
                      className="absolute inset-0 overflow-hidden z-[3]"
                      style={{
                        clipPath: `polygon(${shard.clipPath})`,
                        transformOrigin: `${shard.cx}% ${shard.cy}%`,
                        willChange: "transform, opacity",
                      }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                      animate={{
                        x: shard.exitX * (isMobile ? 0.5 : 0.7),
                        y: shard.exitY * (isMobile ? 0.5 : 0.7),
                        rotate: shard.exitRotate,
                        opacity: 0,
                        scale: 0.7,
                      }}
                      transition={{
                        duration: isMobile ? 0.5 : 0.6,
                        delay: shard.delay,
                        ease: [0.36, 0, 0.66, -0.56],
                      }}
                      onAnimationComplete={handleShardComplete}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          background: "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(200,220,240,0.3) 50%, rgba(255,255,255,0.15) 100%)",
                        }}
                      />
                      <div className="absolute inset-0 opacity-40">
                        <Image src="/images/owner-shiba.webp" alt="" fill className="object-cover" unoptimized />
                      </div>
                      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 1px rgba(255,255,255,0.6)" }} />
                    </motion.div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
