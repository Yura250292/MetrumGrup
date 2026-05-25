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

type ProjectSummary = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Заглушка для drill-down. Повна сторінка проєкту лишається у
 * /admin-v2/projects/[id] — drawer показує мінімум + посилання на повну сторінку
 * через "↗ На сторінку" у DrawerHeader (надається registry.pageHref).
 */
export function ProjectDrawerContent({ id }: RendererProps) {
  const isMobile = useIsMobile();
  const drawer = useDrillDown();
  const [data, setData] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/projects/${id}`);
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        const p = j.data ?? j;
        setData({
          id: p.id,
          title: p.title ?? p.name ?? "—",
          description: p.description ?? null,
          stage: p.stage ?? null,
          status: p.status ?? null,
          startDate: p.startDate ?? null,
          endDate: p.endDate ?? null,
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
    if (data?.title) drawer.setTopBreadcrumb(data.title);
  }, [data?.title, drawer]);

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading ? (
          <div
            className="flex items-center justify-center py-12"
            style={{ color: T.textMuted }}
          >
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : !data ? (
          <p className="text-sm" style={{ color: T.textMuted }}>
            Не вдалось завантажити проєкт.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className="text-xl font-bold"
                style={{ color: T.textPrimary }}
              >
                {data.title}
              </h2>
              {data.description ? (
                <p
                  className="mt-2 text-[13px] whitespace-pre-wrap"
                  style={{ color: T.textSecondary }}
                >
                  {data.description}
                </p>
              ) : null}
            </div>
            <Meta label="Стадія" value={data.stage} />
            <Meta label="Статус" value={data.status} />
            <Meta label="Початок" value={formatDate(data.startDate)} />
            <Meta label="Завершення" value={formatDate(data.endDate)} />
            <p
              className="mt-4 text-[11px]"
              style={{ color: T.textMuted }}
            >
              Розширений вигляд проєкту з усіма табами — у повній сторінці
              (кнопка «На сторінку» у заголовку).
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
      <span
        className="uppercase font-semibold tracking-wide"
        style={{ color: T.textMuted }}
      >
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
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default ProjectDrawerContent;
