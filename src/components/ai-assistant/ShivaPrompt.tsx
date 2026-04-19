"use client";

import { motion } from "framer-motion";
import Image from "next/image";

type Props = {
  onYes: () => void;
  onNo: () => void;
};

export function ShivaPrompt({ onYes, onNo }: Props) {
  return (
    <div
      className="fixed inset-0 safe-area-pt safe-area-pb"
      style={{ zIndex: 10000 }}
      aria-hidden="true"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        onClick={onNo}
      />

      {/* Card — centered, mobile-optimized */}
      <motion.div
        className="absolute left-1/2 top-1/2 w-[min(320px,88vw)] rounded-2xl p-5 md:p-6 text-center"
        style={{
          backgroundColor: "rgba(255,255,255,0.97)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          transform: "translate(-50%, -50%)",
        }}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
      >
        {/* AI Avatar */}
        <motion.div
          className="mx-auto mb-3"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
        >
          <Image
            src="/images/ai-avatar-wave.gif"
            alt="AI Помічник"
            width={120}
            height={120}
            className="mx-auto h-16 w-16 md:h-20 md:w-20 rounded-2xl"
            style={{ objectFit: "cover" }}
            unoptimized
            priority
          />
        </motion.div>

        {/* Question */}
        <motion.h3
          className="text-base md:text-lg font-bold mb-1.5"
          style={{ color: "#1a1a1a" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Хочеш розбити шибу? 🪨
        </motion.h3>

        <motion.p
          className="text-[12px] md:text-[13px] mb-4"
          style={{ color: "#666" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Перед тим як відкрити чат — маленька традиція
        </motion.p>

        {/* Buttons — stacked on very small screens */}
        <motion.div
          className="flex gap-2.5 justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <button
            onClick={onNo}
            className="flex-1 rounded-xl px-4 py-3 text-[13px] md:text-[14px] font-medium transition-all active:scale-95 tap-highlight-none touch-target"
            style={{
              backgroundColor: "#F1F5F9",
              color: "#64748B",
              border: "1px solid #E2E8F0",
            }}
          >
            Ні, чат
          </button>
          <button
            onClick={onYes}
            className="flex-1 rounded-xl px-4 py-3 text-[13px] md:text-[14px] font-semibold transition-all active:scale-95 tap-highlight-none touch-target"
            style={{
              background: "linear-gradient(135deg, #FF8400, #FF6B00)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(255,132,0,0.3)",
            }}
          >
            Так! 💪
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
