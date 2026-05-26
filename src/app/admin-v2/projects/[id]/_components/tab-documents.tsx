"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FileSignature, FileText, HelpCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabChangeOrders } from "./tab-change-orders";
import { TabRfis } from "./tab-rfis";
import { TabKB2 } from "./tab-kb2";

type SubTab = "change-orders" | "rfis" | "kb2";

/**
 * Об'єднана таба «Документи»: внутрішній segmented switch
 * Дод. угоди | RFI | Акти КБ-2в. Persisted у URL як `?tab=documents&sub=...`.
 */
export function TabDocuments({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const subRaw = sp.get("sub");
  const sub: SubTab =
    subRaw === "rfis" || subRaw === "kb2" ? subRaw : "change-orders";

  const setSub = (next: SubTab) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "documents");
    params.set("sub", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="inline-flex w-fit items-center rounded-lg p-0.5"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <SubButton
          active={sub === "change-orders"}
          icon={<FileSignature size={13} />}
          label="Дод. угоди"
          onClick={() => setSub("change-orders")}
        />
        <SubButton
          active={sub === "rfis"}
          icon={<HelpCircle size={13} />}
          label="RFI"
          onClick={() => setSub("rfis")}
        />
        <SubButton
          active={sub === "kb2"}
          icon={<FileText size={13} />}
          label="Акти КБ-2в"
          onClick={() => setSub("kb2")}
        />
      </div>

      {sub === "change-orders" && <TabChangeOrders projectId={projectId} />}
      {sub === "rfis" && <TabRfis projectId={projectId} />}
      {sub === "kb2" && <TabKB2 projectId={projectId} retentionPercentDefault={5} />}
    </div>
  );
}

function SubButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition"
      style={{
        backgroundColor: active ? T.panel : "transparent",
        color: active ? T.accentPrimary : T.textMuted,
        boxShadow: active ? `0 1px 2px ${T.borderSoft}` : undefined,
        fontWeight: active ? 600 : 500,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
