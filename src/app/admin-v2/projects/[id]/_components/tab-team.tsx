"use client";

import { User, Mail, Phone } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DARK_VARS } from "@/app/admin-v2/_lib/dark-overrides";
import { ProjectTeamSection } from "@/components/projects/ProjectTeamSection";

type Person = { id: string; name: string; email: string; phone: string | null };

export function TabTeam({
  client,
  projectId,
}: {
  manager: Person | null;
  client: Person;
  projectId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Real ProjectMember management */}
      <div className="admin-light" style={DARK_VARS}>
        <ProjectTeamSection projectId={projectId} />
      </div>

      {/* Client (external viewer — not a project member) */}
      <div
        className="flex flex-col gap-3 rounded-2xl p-5"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          КЛІЄНТ ПРОЄКТУ (зовнішній viewer)
        </span>
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.successSoft }}
          >
            <User size={22} style={{ color: T.success }} />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
              {client.name}
            </span>
            <div className="flex flex-col gap-1 text-[12px]" style={{ color: T.textSecondary }}>
              {client.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={12} /> {client.email}
                </span>
              )}
              {client.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={12} /> {client.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
