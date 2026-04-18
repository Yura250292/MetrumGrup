"use client";

type Props = {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
};

const sizes = {
  sm: 28,
  md: 28,
  lg: 64,
} as const;

export function AiAvatar({ size = "sm", animate = true }: Props) {
  const px = sizes[size];
  const uid = `ai-av-${size}`;

  return (
    <div className="relative shrink-0" style={{ width: px, height: px }}>
      {animate && (
        <style>{`
          @keyframes av-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-1.5px); }
          }
          @keyframes av-eye-shine {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
          }
          @keyframes av-pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.3); }
          }
          @keyframes av-visor-scan {
            0%, 100% { opacity: 0.08; }
            50% { opacity: 0.2; }
          }
          .av-float { animation: av-float 3.5s ease-in-out infinite; }
          .av-eye { animation: av-eye-shine 2.8s ease-in-out infinite; }
          .av-eye-d { animation: av-eye-shine 2.8s ease-in-out infinite 0.4s; }
          .av-pulse { animation: av-pulse 2s ease-in-out infinite; }
          .av-scan { animation: av-visor-scan 3s ease-in-out infinite; }
        `}</style>
      )}
      <svg
        width={px}
        height={px}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={animate ? "av-float" : ""}
        style={{ display: "block" }}
      >
        <defs>
          {/* Helmet gradients */}
          <linearGradient id={`${uid}-hm`} x1="20" y1="8" x2="80" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBBF24" />
            <stop offset="0.5" stopColor="#F59E0B" />
            <stop offset="1" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id={`${uid}-hm-sh`} x1="50" y1="20" x2="50" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#92400E" stopOpacity="0" />
            <stop offset="1" stopColor="#92400E" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id={`${uid}-hm-hi`} x1="30" y1="12" x2="55" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.5" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Face gradients */}
          <linearGradient id={`${uid}-face`} x1="22" y1="38" x2="78" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F1F5F9" />
            <stop offset="0.4" stopColor="#E2E8F0" />
            <stop offset="1" stopColor="#CBD5E1" />
          </linearGradient>
          <linearGradient id={`${uid}-face-sh`} x1="50" y1="40" x2="50" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#64748B" stopOpacity="0" />
            <stop offset="1" stopColor="#64748B" stopOpacity="0.15" />
          </linearGradient>

          {/* Eye / visor gradient */}
          <linearGradient id={`${uid}-visor`} x1="26" y1="52" x2="74" y2="68" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1E3A8A" />
            <stop offset="0.5" stopColor="#2563EB" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id={`${uid}-eye-l`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#60A5FA" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id={`${uid}-eye-r`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#818CF8" />
            <stop offset="1" stopColor="#6366F1" />
          </linearGradient>

          {/* Antenna glow */}
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop stopColor="#3B82F6" stopOpacity="0.8" />
            <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>

          {/* Filters */}
          <filter id={`${uid}-shadow`} x="-10%" y="-5%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1E293B" floodOpacity="0.15" />
          </filter>
          <filter id={`${uid}-inner`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
            <feOffset dx="0" dy="1" />
            <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feFlood floodColor="#1E293B" floodOpacity="0.12" />
            <feComposite in2="SourceGraphic" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${uid}-eyeglow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
          </filter>

          <clipPath id={`${uid}-face-clip`}>
            <rect x="22" y="40" width="56" height="48" rx="14" />
          </clipPath>
        </defs>

        {/* === Drop shadow layer === */}
        <ellipse cx="50" cy="95" rx="24" ry="3" fill="#1E293B" opacity="0.08" />

        {/* === FACE (head) === */}
        <rect
          x="22" y="40" width="56" height="48" rx="14"
          fill={`url(#${uid}-face)`}
          filter={`url(#${uid}-shadow)`}
        />
        {/* Face shading overlay */}
        <rect
          x="22" y="40" width="56" height="48" rx="14"
          fill={`url(#${uid}-face-sh)`}
        />
        {/* Face border */}
        <rect
          x="22" y="40" width="56" height="48" rx="14"
          fill="none"
          stroke="#94A3B8"
          strokeWidth="1"
          opacity="0.5"
        />

        {/* Side panels / cheek plates */}
        <rect x="24" y="56" width="6" height="16" rx="3" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="0.6" opacity="0.6" />
        <rect x="70" y="56" width="6" height="16" rx="3" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="0.6" opacity="0.6" />

        {/* Ear connectors */}
        <circle cx="20" cy="60" r="4" fill="#94A3B8" />
        <circle cx="20" cy="60" r="2.5" fill="#CBD5E1" stroke="#64748B" strokeWidth="0.5" />
        <circle cx="20" cy="60" r="1" fill="#64748B" />
        <circle cx="80" cy="60" r="4" fill="#94A3B8" />
        <circle cx="80" cy="60" r="2.5" fill="#CBD5E1" stroke="#64748B" strokeWidth="0.5" />
        <circle cx="80" cy="60" r="1" fill="#64748B" />

        {/* === VISOR / Eye panel === */}
        <rect
          x="28" y="52" width="44" height="18" rx="6"
          fill={`url(#${uid}-visor)`}
          filter={`url(#${uid}-inner)`}
        />
        {/* Visor reflection */}
        <rect
          x="28" y="52" width="44" height="9" rx="6"
          fill="white"
          opacity="0.08"
          className={animate ? "av-scan" : ""}
        />
        {/* Visor border */}
        <rect
          x="28" y="52" width="44" height="18" rx="6"
          fill="none"
          stroke="#1E3A8A"
          strokeWidth="0.8"
          opacity="0.4"
        />

        {/* Eye LEFT — glowing circle */}
        <circle
          cx="40" cy="61" r="5"
          fill={`url(#${uid}-eye-l)`}
          className={animate ? "av-eye" : ""}
        />
        <circle cx="40" cy="61" r="5" fill={`url(#${uid}-eye-l)`} filter={`url(#${uid}-eyeglow)`} opacity="0.5" />
        {/* Pupil */}
        <circle cx="40" cy="61" r="2" fill="white" opacity="0.9" />
        <circle cx="41.5" cy="59.5" r="1" fill="white" opacity="0.6" />

        {/* Eye RIGHT — glowing circle */}
        <circle
          cx="60" cy="61" r="5"
          fill={`url(#${uid}-eye-r)`}
          className={animate ? "av-eye-d" : ""}
        />
        <circle cx="60" cy="61" r="5" fill={`url(#${uid}-eye-r)`} filter={`url(#${uid}-eyeglow)`} opacity="0.5" />
        {/* Pupil */}
        <circle cx="60" cy="61" r="2" fill="white" opacity="0.9" />
        <circle cx="61.5" cy="59.5" r="1" fill="white" opacity="0.6" />

        {/* === MOUTH area === */}
        {/* Mouth plate */}
        <rect x="36" y="74" width="28" height="8" rx="4" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="0.6" />
        {/* Mouth grid lines */}
        <line x1="42" y1="74.5" x2="42" y2="81.5" stroke="#94A3B8" strokeWidth="0.4" opacity="0.5" />
        <line x1="50" y1="74.5" x2="50" y2="81.5" stroke="#94A3B8" strokeWidth="0.4" opacity="0.5" />
        <line x1="58" y1="74.5" x2="58" y2="81.5" stroke="#94A3B8" strokeWidth="0.4" opacity="0.5" />
        {/* Mouth glow — speaker indicator */}
        <rect x="38" y="76" width="24" height="4" rx="2" fill="#3B82F6" opacity="0.15" />

        {/* === HELMET === */}
        {/* Helmet main shape */}
        <path
          d="M14 44 C14 44 14 18 50 12 C86 18 86 44 86 44 L14 44Z"
          fill={`url(#${uid}-hm)`}
          filter={`url(#${uid}-shadow)`}
        />
        {/* Helmet shading */}
        <path
          d="M14 44 C14 44 14 18 50 12 C86 18 86 44 86 44 L14 44Z"
          fill={`url(#${uid}-hm-sh)`}
        />
        {/* Helmet highlight */}
        <path
          d="M28 40 C28 40 30 22 50 16 C58 18 64 22 68 28"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.25"
        />

        {/* Helmet brim */}
        <rect x="10" y="40" width="80" height="7" rx="3.5" fill={`url(#${uid}-hm)`} />
        <rect x="10" y="40" width="80" height="3.5" rx="2" fill="white" opacity="0.12" />
        <rect x="10" y="40" width="80" height="7" rx="3.5" fill="none" stroke="#B45309" strokeWidth="0.6" opacity="0.4" />

        {/* Helmet center ridge */}
        <path d="M50 12 V42" stroke="#FDE68A" strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
        <path d="M50 14 V40" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />

        {/* Helmet cross ridges */}
        <path d="M26 30 H74" stroke="#FDE68A" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        <path d="M20 36 H80" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />

        {/* Helmet Metrum-style logo area */}
        <rect x="40" y="26" width="20" height="10" rx="3" fill="#B45309" opacity="0.25" />
        <text x="50" y="34" textAnchor="middle" fontSize="7" fontWeight="700" fill="#FEF3C7" opacity="0.8" fontFamily="system-ui">M</text>

        {/* === ANTENNA === */}
        {/* Antenna rod */}
        <rect x="48" y="4" width="4" height="10" rx="2" fill="#94A3B8" />
        <rect x="49" y="5" width="1.5" height="8" rx="0.75" fill="white" opacity="0.2" />

        {/* Antenna glow ring */}
        <circle cx="50" cy="4" r="6" fill={`url(#${uid}-glow)`} className={animate ? "av-pulse" : ""} opacity="0.5" />
        {/* Antenna tip */}
        <circle cx="50" cy="4" r="3" fill="#3B82F6" className={animate ? "av-pulse" : ""} />
        <circle cx="50" cy="4" r="1.5" fill="#93C5FD" />
        <circle cx="51" cy="3" r="0.7" fill="white" opacity="0.7" />

        {/* === Neck / chin detail === */}
        <rect x="40" y="86" width="20" height="4" rx="2" fill="#94A3B8" opacity="0.4" />
        <rect x="44" y="88" width="12" height="3" rx="1.5" fill="#64748B" opacity="0.2" />
      </svg>
    </div>
  );
}
