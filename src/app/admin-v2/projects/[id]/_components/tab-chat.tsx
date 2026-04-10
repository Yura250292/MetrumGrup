"use client";

import Link from "next/link";
import { MessageSquare, ExternalLink } from "lucide-react";
import { OpenProjectChatButton } from "@/components/chat/OpenProjectChatButton";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function TabChat({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex flex-col items-center gap-4 rounded-2xl p-12 text-center"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <MessageSquare size={32} style={{ color: T.accentPrimary }} />
        </div>
        <div className="flex flex-col gap-1 max-w-md">
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Чат проєкту
          </h3>
          <p className="text-[12px] leading-relaxed" style={{ color: T.textMuted }}>
            Спілкування команди по поточному проєкту. Натисніть, щоб відкрити чат — він також
            доступний з основної сторінки чатів.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <OpenProjectChatButton projectId={projectId} />
          <Link
            href="/admin/chat"
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textSecondary,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            Усі чати <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      <div
        className="rounded-2xl p-4 text-[11px] leading-relaxed"
        style={{ backgroundColor: T.warningSoft, color: T.warning, border: `1px solid ${T.warning}` }}
      >
        <strong>Roadmap:</strong> після впровадження ProjectMember чат стане частиною Workspace —
        учасники чату автоматично синхронізуватимуться з командою проєкту.
      </div>
    </div>
  );
}
