"use client";

import Image from "next/image";

type Props = {
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: 28,
  md: 28,
  lg: 64,
} as const;

export function AiAvatar({ size = "sm" }: Props) {
  const px = sizes[size];

  return (
    <div className="shrink-0" style={{ width: px, height: px }}>
      <Image
        src="/images/ai-avatar.gif"
        alt="AI Помічник"
        width={px}
        height={px}
        className="rounded-lg"
        style={{ width: px, height: px, objectFit: "cover" }}
        unoptimized
      />
    </div>
  );
}
