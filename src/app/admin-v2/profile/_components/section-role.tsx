"use client";

import { Shield, Check } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "../_lib/constants";
import type { ProfileData } from "../_lib/types";

type Props = { profile: ProfileData };

export function SectionRole({ profile }: Props) {
  const permissions = ROLE_PERMISSIONS[profile.role] || [];

  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.emeraldSoft }}
        >
          <Shield size={16} style={{ color: T.emerald }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Роль і повноваження
        </h3>
      </div>

      {/* Role badge */}
      <div className="mb-4">
        <span
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: T.textMuted }}
        >
          Системна роль
        </span>
        <div className="mt-1.5">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            {ROLE_LABELS[profile.role] || profile.role}
          </span>
        </div>
      </div>

      {/* Project roles */}
      {profile.projectRoles.length > 0 && (
        <div className="mb-4">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Ролі в проєктах
          </span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {profile.projectRoles.map((pr) => (
              <span
                key={pr.projectId}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]"
                style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
              >
                <span className="font-medium" style={{ color: T.textPrimary }}>
                  {pr.projectTitle}
                </span>
                — {pr.role}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Teams */}
      {profile.teams.length > 0 && (
        <div className="mb-4">
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: T.textMuted }}
          >
            Команди
          </span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {profile.teams.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
                style={{ backgroundColor: T.panelElevated, color: T.textPrimary }}
              >
                {t.name}
                {t.departmentName && (
                  <span className="ml-1" style={{ color: T.textMuted }}>
                    ({t.departmentName})
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Permissions */}
      <div>
        <span
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: T.textMuted }}
        >
          Ключові дозволи
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {permissions.map((perm) => (
            <div
              key={perm}
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: T.successSoft }}
            >
              <Check size={14} style={{ color: T.success }} />
              <span className="text-[13px]" style={{ color: T.textPrimary }}>
                {perm}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] mt-4" style={{ color: T.textMuted }}>
        Для зміни ролі або дозволів зверніться до адміністратора
      </p>
    </section>
  );
}
