import { AlertTriangle } from "lucide-react";

const IS_STAGING = process.env.NEXT_PUBLIC_IS_STAGING === "true";

const REPEATS = 12;
const ITEM = "ТЕСТОВА ВЕРСІЯ — ДАНІ НЕ ПОТРАПЛЯЮТЬ У ПРОД";

export function StagingBanner() {
  if (!IS_STAGING) return null;

  const items = Array.from({ length: REPEATS }, (_, i) => i);

  return (
    <div className="sticky top-0 z-[9999] w-full overflow-hidden border-b border-amber-300 bg-amber-400 text-amber-950 dark:border-amber-700 dark:bg-amber-500 dark:text-amber-950">
      <div className="flex animate-staging-marquee whitespace-nowrap py-1.5 text-[11px] font-bold tracking-wider">
        {items.map((i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-2">
            <AlertTriangle size={12} />
            {ITEM}
          </span>
        ))}
        {items.map((i) => (
          <span key={`dup-${i}`} className="mx-6 inline-flex items-center gap-2" aria-hidden>
            <AlertTriangle size={12} />
            {ITEM}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes staging-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-staging-marquee {
          animation: staging-marquee 45s linear infinite;
          width: max-content;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-staging-marquee { animation: none; }
        }
      `}</style>
    </div>
  );
}
