"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { SHARDS, CRACK_LINES } from "./glass-shards";

type Props = {
  onComplete: () => void;
};

export function GlassBreakOverlay({ onComplete }: Props) {
  const [phase, setPhase] = useState<"glass" | "cracking" | "breaking" | "done">("glass");
  const completedCount = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Preload audio
  useEffect(() => {
    try {
      audioRef.current = new Audio("/sounds/glass-break.mp3");
      audioRef.current.volume = 0.4;
    } catch {
      // Audio not available
    }
  }, []);

  // Animation timeline
  useEffect(() => {
    // Wait for panel slide-in (400ms), then show cracks
    const crackTimer = setTimeout(() => setPhase("cracking"), 400);
    // Start breaking after cracks appear (100ms later)
    const breakTimer = setTimeout(() => {
      setPhase("breaking");
      // Play sound
      try {
        audioRef.current?.play();
      } catch {
        // Autoplay blocked — ignore
      }
    }, 500);

    return () => {
      clearTimeout(crackTimer);
      clearTimeout(breakTimer);
    };
  }, []);

  const handleShardComplete = () => {
    completedCount.current += 1;
    if (completedCount.current >= SHARDS.length) {
      setPhase("done");
      onComplete();
    }
  };

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[440px]"
      style={{ zIndex: 10000 }}
      aria-hidden="true"
    >
      <AnimatePresence>
        {/* Each shard is a separate div with the same layered background, clipped differently */}
        {SHARDS.map((shard) => (
          <motion.div
            key={shard.id}
            className="absolute inset-0 overflow-hidden"
            style={{
              clipPath: `polygon(${shard.clipPath})`,
              transformOrigin: `${shard.cx}% ${shard.cy}%`,
              willChange: "transform, opacity",
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
            animate={
              phase === "breaking"
                ? {
                    x: shard.exitX,
                    y: shard.exitY,
                    rotate: shard.exitRotate,
                    opacity: 0,
                    scale: 0.8,
                  }
                : phase === "cracking"
                  ? { scale: [1, 1.005, 1] }
                  : {}
            }
            transition={
              phase === "breaking"
                ? {
                    duration: 0.7,
                    delay: shard.delay,
                    ease: [0.36, 0, 0.66, -0.56],
                  }
                : { duration: 0.1 }
            }
            onAnimationComplete={() => {
              if (phase === "breaking") handleShardComplete();
            }}
          >
            {/* Layer 1: Frosted glass */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(200,220,240,0.25) 50%, rgba(255,255,255,0.15) 100%)",
                backdropFilter: "blur(12px) saturate(1.3)",
                WebkitBackdropFilter: "blur(12px) saturate(1.3)",
              }}
            />

            {/* Layer 2: Owner photo (subtle, behind glass) */}
            <div className="absolute inset-0 flex items-center justify-center opacity-25">
              <Image
                src="/images/owner-shiba.webp"
                alt=""
                fill
                className="object-cover"
                priority
                unoptimized
              />
            </div>

            {/* Layer 3: Glass reflection / highlight */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, transparent 40%, rgba(255,255,255,0.1) 60%, transparent 100%)",
              }}
            />

            {/* Layer 4: Subtle border on each shard */}
            <div
              className="absolute inset-0"
              style={{
                boxShadow: "inset 0 0 1px rgba(255,255,255,0.6)",
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Crack lines — visible during "cracking" and "breaking" phases */}
      {(phase === "cracking" || phase === "breaking") && (
        <motion.svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
        >
          {CRACK_LINES.map((line, i) => (
            <motion.line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="0.25"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: 0.08,
                delay: i * 0.004,
              }}
            />
          ))}
        </motion.svg>
      )}

      {/* Impact flash — brief white flash at centre on crack */}
      {phase === "cracking" && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.4) 0%, transparent 60%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.15 }}
        />
      )}
    </div>
  );
}
