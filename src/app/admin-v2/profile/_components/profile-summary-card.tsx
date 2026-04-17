"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ROLE_LABELS } from "../_lib/constants";
import type { ProfileData } from "../_lib/types";

export function ProfileSummaryCard({ profile }: { profile: ProfileData }) {
  const completeness = profile.profileCompleteness;
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.name;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {profile.avatar ? (
          <img
            src={profile.avatar}
            alt={displayName}
            className="h-16 w-16 rounded-full object-cover"
            style={{ border: "2px solid " + T.borderSoft }}
          />
        ) : (
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold"
            style={{
              background: "linear-gradient(135deg, " + T.accentPrimary + ", " + T.accentSecondary + ")",
              color: "#FFFFFF",
            }}
          >
            {(profile.firstName || profile.name || "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-bold truncate" style={{ color: T.textPrimary }}>
          {displayName}
        </h2>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {profile.jobTitle && (
            <span className="text-[13px]" style={{ color: T.textSecondary }}>
              {profile.jobTitle}
            </span>
          )}
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
            }}
          >
            {ROLE_LABELS[profile.role] || profile.role}
          </span>
        </div>
        {profile.bio && (
          <p className="text-[13px] mt-1 line-clamp-1" style={{ color: T.textMuted }}>
            {profile.bio}
          </p>
        )}
      </div>

      {/* Completeness */}
      <div className="flex-shrink-0 w-full sm:w-auto">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
            Профіль
          </span>
          <span
            className="text-[12px] font-bold"
            style={{ color: completeness === 100 ? T.success : T.accentPrimary }}
          >
            {completeness}%
          </span>
        </div>
        <div
          className="h-2 rounded-full mt-1 overflow-hidden"
          style={{ backgroundColor: T.panelElevated, width: 120 }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: completeness + "%",
              background: completeness === 100
                ? T.success
                : "linear-gradient(90deg, " + T.accentPrimary + ", " + T.accentSecondary + ")",
            }}
          />
        </div>
      </div>
    </div>
  );
}
