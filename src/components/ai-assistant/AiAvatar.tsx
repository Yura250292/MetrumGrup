"use client";

import Image from "next/image";

export type AiMood = "idle" | "thinking" | "typing" | "wave" | "thumbsup" | "building" | "pointing";

const MOOD_GIFS: Record<AiMood, string> = {
  idle: "/images/ai-avatar.gif",
  thinking: "/images/ai-avatar-thinking.gif",
  typing: "/images/ai-avatar-typing.gif",
  wave: "/images/ai-avatar-wave.gif",
  thumbsup: "/images/ai-avatar-thumbsup.gif",
  building: "/images/ai-avatar-building.gif",
  pointing: "/images/ai-avatar-pointing.gif",
};

type Props = {
  size?: "sm" | "md" | "lg";
  mood?: AiMood;
};

// mobile → desktop
const responsiveClasses = {
  sm: "h-7 w-7 md:h-[52px] md:w-[52px]",
  md: "h-7 w-7 md:h-[52px] md:w-[52px]",
  lg: "h-16 w-16 md:h-[120px] md:w-[120px]",
} as const;

export function AiAvatar({ size = "sm", mood = "idle" }: Props) {
  return (
    <div className={`shrink-0 ${responsiveClasses[size]}`}>
      <Image
        src={MOOD_GIFS[mood]}
        alt="AI Помічник"
        width={240}
        height={240}
        className={`rounded-lg ${responsiveClasses[size]}`}
        style={{ objectFit: "cover" }}
        unoptimized
      />
    </div>
  );
}
