"use client";

type Props = {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
};

const sizes = {
  sm: { box: 28, svg: 28 },
  md: { box: 28, svg: 28 },
  lg: { box: 56, svg: 56 },
} as const;

export function AiAvatar({ size = "sm", animate = true }: Props) {
  const { box, svg } = sizes[size];
  const id = `ai-avatar-${size}`;

  return (
    <div
      className="relative shrink-0"
      style={{ width: box, height: box }}
    >
      {animate && (
        <style>{`
          @keyframes ai-breathe {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.04); }
          }
          @keyframes ai-eye-glow {
            0%, 100% { opacity: 0.85; }
            50% { opacity: 1; }
          }
          @keyframes ai-antenna-pulse {
            0%, 100% { opacity: 0.5; r: 2; }
            50% { opacity: 1; r: 3; }
          }
          @keyframes ai-antenna-pulse-lg {
            0%, 100% { opacity: 0.5; r: 2.5; }
            50% { opacity: 1; r: 4; }
          }
          .ai-avatar-breathe {
            animation: ai-breathe 3s ease-in-out infinite;
          }
          .ai-avatar-eye-glow {
            animation: ai-eye-glow 2.5s ease-in-out infinite;
          }
          .ai-avatar-antenna {
            animation: ai-antenna-pulse 2s ease-in-out infinite;
          }
          .ai-avatar-antenna-lg {
            animation: ai-antenna-pulse-lg 2s ease-in-out infinite;
          }
        `}</style>
      )}
      <svg
        width={svg}
        height={svg}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={animate ? "ai-avatar-breathe" : ""}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={`${id}-helmet`} x1="10" y1="6" x2="46" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F59E0B" />
            <stop offset="1" stopColor="#EA580C" />
          </linearGradient>
          <linearGradient id={`${id}-face`} x1="12" y1="20" x2="44" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E2E8F0" />
            <stop offset="1" stopColor="#CBD5E1" />
          </linearGradient>
          <linearGradient id={`${id}-eye`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#3B5BFF" />
            <stop offset="1" stopColor="#7C5CFF" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Face — rounded rectangle */}
        <rect
          x="10"
          y="20"
          width="36"
          height="30"
          rx="10"
          fill={`url(#${id}-face)`}
          stroke="#94A3B8"
          strokeWidth="1.2"
        />

        {/* Chin detail */}
        <rect
          x="20"
          y="42"
          width="16"
          height="3"
          rx="1.5"
          fill="#94A3B8"
          opacity="0.4"
        />

        {/* Helmet — construction hard hat */}
        <path
          d="M8 24C8 24 8 14 28 10C48 14 48 24 48 24H8Z"
          fill={`url(#${id}-helmet)`}
          stroke="#D97706"
          strokeWidth="1"
        />

        {/* Helmet brim */}
        <rect
          x="6"
          y="22"
          width="44"
          height="5"
          rx="2.5"
          fill={`url(#${id}-helmet)`}
          stroke="#D97706"
          strokeWidth="0.8"
        />

        {/* Helmet center stripe */}
        <path
          d="M28 10V24"
          stroke="#FDE68A"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Helmet cross stripe */}
        <path
          d="M16 18H40"
          stroke="#FDE68A"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Eye left — glowing screen */}
        <rect
          x="16"
          y="29"
          width="9"
          height="7"
          rx="2"
          fill={`url(#${id}-eye)`}
          className={animate ? "ai-avatar-eye-glow" : ""}
        />
        {/* Eye left glow */}
        <rect
          x="16"
          y="29"
          width="9"
          height="7"
          rx="2"
          fill={`url(#${id}-eye)`}
          filter={`url(#${id}-glow)`}
          opacity="0.4"
        />
        {/* Eye left highlight */}
        <rect
          x="18"
          y="30.5"
          width="3"
          height="2"
          rx="1"
          fill="white"
          opacity="0.7"
        />

        {/* Eye right — glowing screen */}
        <rect
          x="31"
          y="29"
          width="9"
          height="7"
          rx="2"
          fill={`url(#${id}-eye)`}
          className={animate ? "ai-avatar-eye-glow" : ""}
          style={animate ? { animationDelay: "0.3s" } : undefined}
        />
        {/* Eye right glow */}
        <rect
          x="31"
          y="29"
          width="9"
          height="7"
          rx="2"
          fill={`url(#${id}-eye)`}
          filter={`url(#${id}-glow)`}
          opacity="0.4"
        />
        {/* Eye right highlight */}
        <rect
          x="33"
          y="30.5"
          width="3"
          height="2"
          rx="1"
          fill="white"
          opacity="0.7"
        />

        {/* Mouth — friendly smile */}
        <path
          d="M22 39C22 39 25 42 28 42C31 42 34 39 34 39"
          stroke="#64748B"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Ear bolts */}
        <circle cx="9" cy="33" r="2.5" fill="#94A3B8" stroke="#64748B" strokeWidth="0.8" />
        <circle cx="47" cy="33" r="2.5" fill="#94A3B8" stroke="#64748B" strokeWidth="0.8" />

        {/* Antenna base */}
        <rect
          x="26"
          y="6"
          width="4"
          height="5"
          rx="2"
          fill="#94A3B8"
        />

        {/* Antenna signal dot */}
        <circle
          cx="28"
          cy="4"
          r={size === "lg" ? 2.5 : 2}
          fill="#3B5BFF"
          className={animate ? (size === "lg" ? "ai-avatar-antenna-lg" : "ai-avatar-antenna") : ""}
        />
      </svg>
    </div>
  );
}
