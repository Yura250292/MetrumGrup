"use client";

import { useState } from "react";
import { Building2, ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  activeFirmName: string;
  homeFirmId: string;
  homeFirmName: string;
};

/**
 * Показується коли керівник студії (або інший не-SUPER_ADMIN з firmId) перемкнувся
 * у чужу фірму. Пропонує одним кліком повернутися додому.
 */
export function NonHomeFirmBanner({
  activeFirmName,
  homeFirmId,
  homeFirmName,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchHome() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/firm/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId: homeFirmId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style={{
        backgroundColor: T.warningSoft ?? "#FEF3C7",
        border: `1px solid ${T.warning}55`,
        color: T.textPrimary,
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Building2 size={16} style={{ color: T.warning }} />
        <span className="text-[13px]">
          Ви у <b>{activeFirmName}</b> у режимі лише для перегляду. Фінансування і
          Проекти заблоковані. Поверніться у <b>{homeFirmName}</b>, щоб працювати.
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={switchHome}
        className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[0.97] disabled:opacity-60"
        style={{ backgroundColor: T.accentPrimary, color: "white" }}
      >
        <ArrowRightLeft size={13} /> До {homeFirmName}
      </button>
    </div>
  );
}
