"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import type { RendererProps } from "../types";
import type { ChangeOrderStatus, Role } from "@prisma/client";
import { COStatusBadge } from "@/app/admin-v2/change-orders/_components/StatusBadge";
import { CostImpactBadge } from "@/components/CostImpactBadge";
import { TransitionBar } from "@/app/admin-v2/change-orders/_components/TransitionBar";
import {
  HistoryPanel,
  type Transition,
} from "@/app/admin-v2/change-orders/_components/HistoryPanel";

type CODetail = {
  id: string;
  number: string;
  status: ChangeOrderStatus;
  type: string;
  title: string;
  description: string;
  reasonFromClient: string | null;
  costImpact: number | null;
  scheduleImpactDays: number;
  pdfUrl: string | null;
  project: { id: string; title: string };
  requestedBy: { id: string; name: string | null };
  items: Array<{
    id: string;
    description: string;
    unit: string;
    qty: number;
    unitPrice: number | null;
    totalPrice: number | null;
    costCode: { code: string; name: string };
  }>;
  transitions: Transition[];
};

export function ChangeOrderDrawerContent({ id }: RendererProps) {
  const drawer = useDrillDown();
  const isMobile = useIsMobile();
  const [data, setData] = useState<CODetail | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    setLoading(true);
    const [coRes, sessionRes] = await Promise.all([
      fetch(`/api/admin/change-orders/${id}`),
      fetch("/api/auth/session"),
    ]);
    if (coRes.ok) {
      const json = (await coRes.json()) as CODetail;
      setData(json);
      drawer.setTopBreadcrumb(json.number);
    }
    if (sessionRes.ok) {
      const sj = (await sessionRes.json()) as { user?: { role?: Role } };
      setRole(sj.user?.role ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 p-6">
            <Loader2 className="animate-spin" size={16} /> Завантаження…
          </div>
        )}
        {!loading && !data && (
          <div className="p-6 text-zinc-500">Не знайдено.</div>
        )}
        {data && (
          <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <COStatusBadge status={data.status} />
              <CostImpactBadge amount={data.costImpact} />
              {data.scheduleImpactDays !== 0 && (
                <span className="text-xs text-zinc-500">
                  термін: {data.scheduleImpactDays > 0 ? "+" : ""}
                  {data.scheduleImpactDays} днів
                </span>
              )}
              {data.pdfUrl && (
                <a
                  href={data.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-sm text-sky-700 hover:underline"
                >
                  📄 PDF
                </a>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() =>
                  drawer.open({ type: "project", id: data.project.id })
                }
                className="text-sm text-zinc-700 hover:underline"
              >
                {data.project.title}
              </button>
              {" · "}
              <button
                type="button"
                onClick={() =>
                  drawer.open({ type: "user", id: data.requestedBy.id })
                }
                className="text-sm text-zinc-700 hover:underline"
              >
                {data.requestedBy.name ?? "—"}
              </button>
            </div>

            {role && (
              <TransitionBar
                coId={data.id}
                status={data.status}
                role={role}
                onUpdated={load}
              />
            )}

            <section>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {data.description}
              </p>
              {data.reasonFromClient && (
                <div className="mt-3 p-3 rounded-lg bg-sky-50 border border-sky-100">
                  <div className="text-xs text-sky-700 mb-1">
                    Обґрунтування замовника
                  </div>
                  <p className="text-sm text-sky-900 italic">
                    {data.reasonFromClient}
                  </p>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                Позиції ({data.items.length})
              </h3>
              <ul className="space-y-1.5">
                {data.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex justify-between items-center text-sm border-b border-zinc-100 pb-1.5"
                  >
                    <div>
                      <span className="text-zinc-400 mr-2 font-mono text-xs">
                        {it.costCode.code}
                      </span>
                      {it.description}
                      <span className="text-zinc-400 text-xs ml-2">
                        · {it.qty} {it.unit}
                      </span>
                    </div>
                    <span className="text-sm tabular-nums">
                      {it.totalPrice === null
                        ? "***"
                        : new Intl.NumberFormat("uk-UA", {
                            minimumFractionDigits: 2,
                          }).format(it.totalPrice)}{" "}
                      ₴
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                Історія
              </h3>
              <HistoryPanel transitions={data.transitions} />
            </section>
          </div>
        )}
      </DrawerBody>
    </DrawerLayout>
  );
}
