import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  gradient,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  accent: string;
  gradient?: string;
  href?: string;
}) {
  const content = (
    <div
      className="flex flex-col gap-1.5 rounded-xl sm:rounded-2xl p-3 sm:p-6 h-full transition"
      style={{
        background: gradient || T.panel,
        border: `1px solid ${accent}20`,
        boxShadow: `0 2px 8px ${accent}12`,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] sm:text-[10px] font-bold tracking-wider"
          style={{ color: T.textSecondary }}
        >
          {label}
        </span>
        <div
          className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: accent + "18", border: `1px solid ${accent}30` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <div
        className="text-xl sm:text-3xl md:text-4xl font-bold mt-1 sm:mt-2 truncate"
        style={{ color: T.textPrimary }}
      >
        {value}
      </div>
      <div
        className="text-[10px] sm:text-xs hidden sm:block truncate"
        style={{ color: T.textSecondary }}
      >
        {sub}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="hover:brightness-[0.97] transition">
        {content}
      </Link>
    );
  }
  return content;
}
