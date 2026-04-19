"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { BreadcrumbItem } from "@/hooks/useFolders";

type Props = {
  breadcrumbs: BreadcrumbItem[];
  basePath: string;
  rootLabel?: string;
};

export function FolderBreadcrumb({
  breadcrumbs,
  basePath,
  rootLabel = "Усі",
}: Props) {
  return (
    <nav className="flex items-center gap-1 text-[12px] flex-wrap">
      <Link
        href={basePath}
        className="flex items-center gap-1 font-medium transition-colors hover:opacity-80"
        style={{
          color: breadcrumbs.length > 0 ? T.accentPrimary : T.textPrimary,
        }}
      >
        <Home size={12} />
        {rootLabel}
      </Link>
      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1;
        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight size={12} style={{ color: T.textMuted }} />
            {isLast ? (
              <span className="font-semibold" style={{ color: T.textPrimary }}>
                {crumb.name}
              </span>
            ) : (
              <Link
                href={`${basePath}?folderId=${crumb.id}`}
                className="font-medium transition-colors hover:opacity-80"
                style={{ color: T.accentPrimary }}
              >
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
