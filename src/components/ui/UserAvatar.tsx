"use client";

import { useUserProfile } from "@/contexts/UserProfileContext";

type Props = {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  gradient?: string;
  /** User id — when provided, clicking the avatar opens the public profile modal */
  userId?: string | null;
  /** Explicitly disable click-to-open even if userId is provided */
  nonInteractive?: boolean;
};

export function UserAvatar({
  src,
  name,
  size = 36,
  className = "",
  gradient = "linear-gradient(135deg, #3B5BFF, #7C5CFF)",
  userId,
  nonInteractive,
}: Props) {
  const { openProfile } = useUserProfile();
  const initial = (name || "?").charAt(0).toUpperCase();
  const fontSize = Math.max(size * 0.38, 10);
  const clickable = Boolean(userId) && !nonInteractive;

  const inner = src ? (
    <img
      src={src}
      alt={name || ""}
      className={"rounded-full object-cover flex-shrink-0 " + className}
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className={"flex items-center justify-center rounded-full flex-shrink-0 font-semibold text-white " + className}
      style={{ width: size, height: size, background: gradient, fontSize }}
    >
      {initial}
    </div>
  );

  if (!clickable) return inner;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (userId) openProfile(userId);
      }}
      className="rounded-full flex-shrink-0 transition hover:ring-2 hover:ring-offset-1 hover:brightness-95"
      style={{ width: size, height: size }}
      title={name ? "Профіль: " + name : "Профіль"}
    >
      {inner}
    </button>
  );
}
