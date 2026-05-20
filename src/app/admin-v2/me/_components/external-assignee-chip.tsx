"use client";

import { UserPlus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Компактний чип для відображення зовнішнього виконавця задачі (підрядник,
 * гість тощо), якого немає у системі як User. Візуально відрізняється від
 * UserAvatar — outline icon замість фото, dashed border.
 */
export function ExternalAssigneeChip({
  name,
  size = 24,
  showName = false,
}: {
  name: string;
  size?: number;
  showName?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      title={`Зовнішній виконавець: ${name}`}
      className={`inline-flex items-center gap-1 ${showName ? "rounded-full px-2 py-0.5" : ""}`}
      style={
        showName
          ? {
              backgroundColor: T.panelElevated,
              border: `1px dashed ${T.borderStrong}`,
              color: T.textSecondary,
            }
          : undefined
      }
    >
      <span
        className="inline-flex items-center justify-center rounded-full font-bold"
        style={{
          width: size,
          height: size,
          backgroundColor: T.panelElevated,
          border: `1px dashed ${T.borderStrong}`,
          color: T.textSecondary,
          fontSize: size > 22 ? 10 : 9,
        }}
      >
        {initials || <UserPlus size={Math.max(10, size - 12)} />}
      </span>
      {showName && (
        <span className="text-[11px] truncate max-w-[120px]" style={{ color: T.textSecondary }}>
          {name}
        </span>
      )}
    </span>
  );
}
