"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { SyncFinanceModal } from "./sync-finance-modal";

export function SyncFinanceButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tap-highlight-none active:scale-[0.97] text-white"
        style={{ backgroundColor: T.violet }}
        title="AI розподілить фінансові записи проекту по етапах"
      >
        <Sparkles size={16} /> AI · Синх. з фінансами
      </button>
      <SyncFinanceModal
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
        onApplied={() => router.refresh()}
      />
    </>
  );
}
