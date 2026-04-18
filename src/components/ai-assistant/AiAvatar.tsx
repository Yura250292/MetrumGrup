"use client";

import Image from "next/image";

export type AiMood = "idle" | "thinking" | "typing" | "wave" | "thumbsup" | "building";

const MOOD_GIFS: Record<AiMood, string> = {
  idle: "/images/ai-avatar.gif",
  thinking: "/images/ai-avatar-thinking.gif",
  typing: "/images/ai-avatar-typing.gif",
  wave: "/images/ai-avatar-wave.gif",
  thumbsup: "/images/ai-avatar-thumbsup.gif",
  building: "/images/ai-avatar-building.gif",
};

type Props = {
  size?: "sm" | "md" | "lg";
  mood?: AiMood;
};

const sizes = {
  sm: 28,
  md: 28,
  lg: 64,
} as const;

export function AiAvatar({ size = "sm", mood = "idle" }: Props) {
  const px = sizes[size];

  return (
    <div className="shrink-0" style={{ width: px, height: px }}>
      <Image
        src={MOOD_GIFS[mood]}
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
