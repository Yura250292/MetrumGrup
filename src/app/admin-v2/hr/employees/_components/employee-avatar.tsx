"use client";

// Кружечок-аватар співробітника: фото (якщо є) або ініціали Прізвище+Імʼя.

const AVATAR_COLORS = [
  "#2563eb",
  "#0891b2",
  "#059669",
  "#65a30d",
  "#d97706",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#4f46e5",
];

/** Ініціали: перша літера прізвища + перша літера імені. */
export function getInitials(
  fullName: string,
  lastName?: string | null,
  firstName?: string | null,
): string {
  const last = (lastName ?? "").trim();
  const first = (firstName ?? "").trim();
  if (last || first) {
    return `${last.charAt(0)}${first.charAt(0)}`.toUpperCase() || "?";
  }
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

/** Детермінований колір за іменем — один і той самий для одного співробітника. */
function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function EmployeeAvatar({
  fullName,
  lastName,
  firstName,
  avatarUrl,
  size = 28,
  dimmed = false,
}: {
  fullName: string;
  lastName?: string | null;
  firstName?: string | null;
  avatarUrl?: string | null;
  size?: number;
  dimmed?: boolean;
}) {
  const initials = getInitials(fullName, lastName, firstName);
  const bg = colorFor(fullName || initials);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        backgroundColor: avatarUrl ? "transparent" : bg,
        opacity: dimmed ? 0.55 : 1,
      }}
      title={fullName}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={fullName}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}
