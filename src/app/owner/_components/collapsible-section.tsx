"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface Props {
  title: string;
  caption?: string;
  href?: string;
  hrefLabel?: string;
  /** Default open state. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  caption,
  href,
  hrefLabel = "Усі",
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1 gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="group flex items-center gap-1.5 cursor-pointer flex-1 min-w-0 active:scale-[0.99] transition"
          aria-expanded={open}
        >
          <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold group-hover:text-zinc-300 transition">
            {title}
          </h2>
          {/* Animated chevron — rotates + glows when open */}
          <motion.span
            animate={{
              rotate: open ? 180 : 0,
              color: open ? "rgb(167 139 250)" : "rgb(113 113 122)",
              filter: open ? "drop-shadow(0 0 6px rgba(167,139,250,0.6))" : "none",
            }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex"
          >
            <ChevronDown size={14} strokeWidth={2.4} />
          </motion.span>
          {caption && <span className="text-[10px] text-zinc-600 ml-1">{caption}</span>}
        </button>
        {href && (
          <Link
            href={href}
            className="text-[11px] text-zinc-400 hover:text-white transition shrink-0"
          >
            {hrefLabel} →
          </Link>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.2, ease: "easeOut" },
            }}
            style={{ overflow: "hidden" }}
          >
            <motion.div
              initial={{ y: -8 }}
              animate={{ y: 0 }}
              exit={{ y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
