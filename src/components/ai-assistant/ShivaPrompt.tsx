"use client";

import { motion } from "framer-motion";
import Image from "next/image";

type Props = {
  onYes: () => void;
  onNo: () => void;
};

export function ShivaPrompt({ onYes, onNo }: Props) {
  return (
    <div className="fixed inset-0" style={{ zIndex: 10000 }} aria-hidden="true">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        onClick={onNo}
      />

      {/* Card with AI avatar + question */}
      <motion.div
        className="absolute left-1/2 top-1/2 w-[min(340px,90vw)] rounded-2xl p-6 text-center"
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
          className="mx-auto mb-4"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
        >
          <Image
            src="/images/ai-avatar-wave.gif"
            alt="AI Помічник"
            width={120}
            height={120}
            className="mx-auto h-20 w-20 rounded-2xl"
            style={{ objectFit: "cover" }}
            unoptimized
            priority
          />
        </motion.div>

        {/* Question */}
        <motion.h3
          className="text-lg font-bold mb-2"
          style={{ color: "#1a1a1a" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Хочеш розбити шибу? 🪨
        </motion.h3>

        <motion.p
          className="text-[13px] mb-5"
          style={{ color: "#666" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Перед тим як відкрити чат — маленька традиція
        </motion.p>

        {/* Buttons */}
        <motion.div
          className="flex gap-3 justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <button
            onClick={onNo}
            className="rounded-xl px-6 py-2.5 text-[14px] font-medium transition-all active:scale-95"
            style={{
              backgroundColor: "#F1F5F9",
              color: "#64748B",
              border: "1px solid #E2E8F0",
            }}
          >
            Ні, одразу чат
          </button>
          <button
            onClick={onYes}
            className="rounded-xl px-6 py-2.5 text-[14px] font-semibold transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #FF8400, #FF6B00)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(255,132,0,0.3)",
            }}
          >
            Так, давай! 💪
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
