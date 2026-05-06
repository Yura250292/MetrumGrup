"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Building2 } from "lucide-react";
import { resolveOwnerBrand, FirmLogo } from "./firm-brand";

interface FirmOption {
  id: string;
  label: string;
}

const OPTIONS: FirmOption[] = [
  { id: "metrum-group", label: "Metrum Group" },
  { id: "metrum-studio", label: "Metrum Studio" },
  { id: "__all__", label: "Усі фірми" },
];

interface Props {
  activeFirmId: string | null;
}

export function OwnerFirmSwitcher({ activeFirmId }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const brand = resolveOwnerBrand(activeFirmId);

  const switchTo = async (firmId: string) => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/firm/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  const activeKey = activeFirmId === null ? "__all__" : activeFirmId;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="flex items-center gap-2 px-2 py-1 -ml-2 rounded-xl hover:bg-white/[0.04] active:scale-95 transition cursor-pointer"
        aria-label="Перемкнути фірму"
        aria-expanded={open}
      >
        <FirmLogo brand={brand} size="md" />
        <ChevronDown
          size={14}
          className="text-zinc-500 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Закрити"
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute z-40 left-0 top-full mt-2 min-w-[220px] rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-white/5">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                  Перемкнути фірму
                </span>
              </div>
              <ul className="py-1">
                {OPTIONS.map((opt) => {
                  const isActive = opt.id === activeKey;
                  return (
                    <li key={opt.id}>
                      <button
                        type="button"
                        onClick={() => switchTo(opt.id)}
                        disabled={pending || isActive}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition cursor-pointer disabled:cursor-default"
                      >
                        <Building2 size={14} className="text-zinc-500 shrink-0" />
                        <span
                          className={`flex-1 text-left text-sm ${isActive ? "text-white font-semibold" : "text-zinc-300"}`}
                        >
                          {opt.label}
                        </span>
                        {isActive && <Check size={14} className="text-emerald-400" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
