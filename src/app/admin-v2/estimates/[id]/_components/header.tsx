"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  Plus,
  Mail,
  Calculator,
  Send,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useCreateConversation } from "@/hooks/useChat";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { EstimateController } from "../_lib/use-controller";

export function EstimateHeader({
  controller,
  isFinancier,
}: {
  controller: EstimateController;
  isFinancier: boolean;
}) {
  const e = controller.estimate!;
  const isApproved = e.status === "APPROVED";
  const isDraft = e.status === "DRAFT";

  return (
    <header className="flex flex-col gap-4">
      <Link
        href="/admin-v2/estimates"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-125"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> До списку кошторисів
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            КОШТОРИС {e.number}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-2xl md:text-3xl font-bold tracking-tight"
              style={{ color: T.textPrimary }}
            >
              {e.title}
            </h1>
            <StatusBadge status={e.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: T.textMuted }}>
            {e.project?.title && (
              <>
                <span>Проєкт: <span style={{ color: T.textSecondary }}>{e.project.title}</span></span>
                <span>·</span>
              </>
            )}
            {e.project?.client?.name && (
              <>
                <span>Клієнт: <span style={{ color: T.textSecondary }}>{e.project.client.name}</span></span>
                <span>·</span>
              </>
            )}
            <span>Створено: {formatDate(e.createdAt)}</span>
            {e.createdBy?.name && (
              <>
                <span>·</span>
                <span>{e.createdBy.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <ActionBtn
            icon={controller.exporting === "pdf" ? Loader2 : FileDown}
            label="PDF"
            onClick={() => controller.exportEstimate("pdf")}
            disabled={controller.exporting !== null}
            spinning={controller.exporting === "pdf"}
          />
          <ActionBtn
            icon={controller.exporting === "excel" ? Loader2 : FileSpreadsheet}
            label="Excel"
            onClick={() => controller.exportEstimate("excel")}
            disabled={controller.exporting !== null}
            spinning={controller.exporting === "excel"}
          />
          <ActionBtn icon={Plus} label="Доповнити" onClick={controller.openSupplement} />
          {isApproved && (
            <ActionBtn
              icon={controller.sendingToClient ? Loader2 : Mail}
              label="Надіслати"
              onClick={controller.sendToClient}
              disabled={controller.sendingToClient}
              spinning={controller.sendingToClient}
            />
          )}
          {isFinancier && (
            <ActionBtn icon={Calculator} label="Фінанси" onClick={controller.openFinance} />
          )}
          {isDraft && (
            <button
              onClick={() => controller.updateStatus("SENT")}
              disabled={controller.updating}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {controller.updating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Надіслати
            </button>
          )}
          <ChatButton estimateId={e.id} />
        </div>
      </div>
    </header>
  );
}

function ChatButton({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const createConversation = useCreateConversation();
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const conv = await createConversation.mutateAsync({
        type: "ESTIMATE",
        estimateId,
      });
      router.push(`/admin-v2/chat/${conv.id}`);
    } catch (err) {
      console.error("Failed to open estimate chat:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={busy || createConversation.isPending}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      style={{
        backgroundColor: T.panelElevated,
        color: T.textSecondary,
        border: `1px solid ${T.borderStrong}`,
      }}
    >
      {busy || createConversation.isPending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <MessageSquare size={14} />
      )}
      Чат
    </button>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      style={{
        backgroundColor: T.panelElevated,
        color: T.textSecondary,
        border: `1px solid ${T.borderStrong}`,
      }}
    >
      <Icon size={14} className={spinning ? "animate-spin" : ""} /> {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = ESTIMATE_STATUS_LABELS[status as keyof typeof ESTIMATE_STATUS_LABELS] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    SENT: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    APPROVED: { bg: T.successSoft, fg: T.success },
    REJECTED: { bg: T.dangerSoft, fg: T.danger },
    REVISION: { bg: T.warningSoft, fg: T.warning },
    ENGINEER_REVIEW: { bg: T.warningSoft, fg: T.warning },
    FINANCE_REVIEW: { bg: T.warningSoft, fg: T.warning },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}
