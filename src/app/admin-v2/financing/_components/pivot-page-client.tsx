"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabPivot } from "./tab-pivot";
import type { FinancingFilters } from "./types";

/**
 * Окрема повноекранна сторінка зведеної таблиці (раніше була overlay-модалкою).
 * Чому окрема сторінка, а не модалка:
 *  - bookmarkable URL: можна поділитись прямим лінком на pivot;
 *  - своя сторінка не страждає на scroll-lock конфлікти з html/body;
 *  - природна навігація браузера (Back) повертає до Фінансування.
 */
const EMPTY_FILTERS: FinancingFilters = {
  projectId: "",
  folderId: "",
  category: "",
  costCodeId: "",
  costType: "",
  counterpartyId: "",
  from: "",
  to: "",
  search: "",
  kind: "",
  type: "",
  status: "",
  source: "",
  financeNature: "",
  financeNatures: [],
  subcategory: "",
  responsibleId: "",
  hasAttachments: "",
  archived: false,
};

export function PivotPageClient({
  scope,
}: {
  scope?: { id: string; title: string };
}) {
  const filters: FinancingFilters = scope
    ? { ...EMPTY_FILTERS, projectId: scope.id }
    : EMPTY_FILTERS;

  return (
    <div className="flex flex-col gap-4">
      <header
        className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 sm:px-5"
        style={{ borderColor: T.borderSoft, background: T.panel }}
      >
        <div className="flex flex-col min-w-0">
          <h1
            className="text-lg sm:text-xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Зведена таблиця
          </h1>
          <p className="text-[12px]" style={{ color: T.textMuted }}>
            Фінансовий результат по проєктах, ЗП та адміністративних витратах
            {scope ? ` · ${scope.title}` : ""}
          </p>
        </div>
        <Link
          href="/admin-v2/financing"
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold transition hover:brightness-[0.97]"
          style={{
            borderColor: T.borderSoft,
            color: T.textPrimary,
            background: T.panel,
          }}
        >
          <ArrowLeft size={14} />
          <span>До фінансування</span>
        </Link>
      </header>

      <TabPivot scope={scope} filters={filters} />
    </div>
  );
}
