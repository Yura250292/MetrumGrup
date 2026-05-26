"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import type { RendererProps } from "../types";
import { FORM_CATEGORY_LABELS } from "@/lib/constants";
import type { FormCategory } from "@prisma/client";

type Summary = {
  id: string;
  name: string;
  description: string | null;
  category: FormCategory;
  version: number;
  isActive: boolean;
  submissionCount: number;
  revisionCount: number;
  updatedAt: string;
};

export function FormTemplateDrawerContent({ id }: RendererProps) {
  const isMobile = useIsMobile();
  const drawer = useDrillDown();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/form-templates/${id}`);
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        const t = j.data ?? j;
        setData({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          version: t.version,
          isActive: t.isActive,
          submissionCount: t._count?.submissions ?? 0,
          revisionCount: t._count?.revisions ?? 0,
          updatedAt: t.updatedAt,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (data?.name) drawer.setTopBreadcrumb(data.name);
  }, [data?.name, drawer]);

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading ? (
          <div className="flex items-center justify-center py-12" style={{ color: T.textMuted }}>
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : !data ? (
          <p className="text-sm" style={{ color: T.textMuted }}>
            Не вдалось завантажити шаблон.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold" style={{ color: T.textPrimary }}>
                {data.name}
              </h2>
              {data.description ? (
                <p className="mt-2 text-[13px] whitespace-pre-wrap" style={{ color: T.textSecondary }}>
                  {data.description}
                </p>
              ) : null}
            </div>
            <Meta label="Категорія" value={FORM_CATEGORY_LABELS[data.category]} />
            <Meta label="Версія" value={`v${data.version}`} />
            <Meta label="Активна" value={data.isActive ? "Так" : "Ні"} />
            <Meta label="Заповнень" value={String(data.submissionCount)} />
            <Meta label="Версій у історії" value={String(data.revisionCount)} />
            <Meta label="Оновлено" value={formatDate(data.updatedAt)} />
            <p className="mt-4 text-[11px]" style={{ color: T.textMuted }}>
              Builder з палітрою полів і preview — у повній сторінці (кнопка «На сторінку»).
            </p>
          </div>
        )}
      </DrawerBody>
    </DrawerLayout>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="uppercase font-semibold tracking-wide" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span style={{ color: T.textPrimary }}>{value}</span>
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "short", year: "numeric" });
}

export default FormTemplateDrawerContent;
