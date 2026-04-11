"use client";

import Link from "next/link";
import { MessageSquare, ExternalLink, Users } from "lucide-react";
import { OpenProjectChatButton } from "@/components/chat/OpenProjectChatButton";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DARK_VARS } from "@/app/admin-v2/_lib/dark-overrides";

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
            Спілкування команди по поточному проєкту. Учасники чату автоматично
            синхронізуються з командою проєкту через ProjectMember.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <div className="admin-dark" style={DARK_VARS}>
            <OpenProjectChatButton projectId={projectId} />
          </div>
          <Link
            href="/admin-v2/chat"
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

      {/* Hint about team sync */}
      <div
        className="flex items-start gap-3 rounded-2xl p-4"
        style={{
          backgroundColor: T.accentPrimarySoft,
          border: `1px solid ${T.accentPrimary}`,
        }}
      >
        <Users size={16} style={{ color: T.accentPrimary }} className="mt-0.5 flex-shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-bold" style={{ color: T.accentPrimary }}>
            Команда чату = команда проєкту
          </span>
          <span className="text-[11px] leading-relaxed" style={{ color: T.textSecondary }}>
            Управляйте складом учасників у вкладці &laquo;Команда&raquo; — зміни
            автоматично відображаються в чаті.
          </span>
        </div>
      </div>
    </div>
  );
}
