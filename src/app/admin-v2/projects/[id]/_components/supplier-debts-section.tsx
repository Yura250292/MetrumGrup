"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight, Loader2, Wallet } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { SupplierPaymentModal } from "@/app/admin-v2/counterparties/_components/supplier-payment-modal";

const PAY_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);

type EntryRow = {
  id: string;
  occurredAt: string;
  title: string;
  amount: number;
  paidAmount: number;
  outstanding: number;
};

type Debt = {
  counterpartyId: string;
  counterpartyName: string;
  outstanding: number;
  entries: EntryRow[];
  materials: Array<{ name: string; count: number; outstanding: number }>;
};

type Data = { debts: Debt[]; totalOutstanding: number };

/**
 * Phase 4: блок "Борги перед постачальниками" на картці проєкту.
 * Live-завантаження з /api/admin/projects/[id]/supplier-debts. Дані FIFO-only:
 * показуємо тільки несплачені факти цього проєкту, по постачальниках з drill-down
 * по матеріалах.
 */
export function SupplierDebtsSection({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const { data: session } = useSession();
  const canPay = PAY_ROLES.has(session?.user?.role ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [payment, setPayment] = useState<{
    counterpartyId: string;
    counterpartyName: string;
    outstanding: number;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/supplier-debts`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-6 text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        <Loader2 size={14} className="animate-spin" /> Завантажуємо борги…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          backgroundColor: T.dangerSoft,
          border: `1px solid ${T.danger}40`,
          color: T.danger,
        }}
      >
        {error}
      </div>
    );
  }

  // No-debt: повністю приховуємо блок. Раніше показували «Без боргу» —
  // інформативно нуль, але займало ~48px вертикалі без користі для зону
  // шапки. Якщо борг з'являється — рендеримо повний блок (нижче).
  if (!data || data.debts.length === 0) {
    return null;
  }

  const totalColor = data.totalOutstanding > 0 ? T.danger : T.success;

  return (
    <div
      className="rounded-2xl"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${data.totalOutstanding > 0 ? `${T.danger}30` : T.borderSoft}`,
      }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-2">
          <Wallet size={16} style={{ color: totalColor }} />
          <span
            className="text-[10.5px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Борги перед постачальниками
          </span>
        </div>
        <div
          className="text-base font-bold tabular-nums"
          style={{ color: totalColor }}
        >
          {formatCurrency(data.totalOutstanding)}
        </div>
      </div>
      <div className="px-2 py-2 flex flex-col gap-1">
        {data.debts.map((d) => {
          const isOpen = expanded.has(d.counterpartyId);
          return (
            <div
              key={d.counterpartyId}
              className="rounded-xl"
              style={{ backgroundColor: T.panelSoft }}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => toggle(d.counterpartyId)}
                  className="text-left flex items-center gap-2 flex-1 min-w-0"
                >
                  {isOpen ? (
                    <ChevronDown size={14} style={{ color: T.textMuted }} />
                  ) : (
                    <ChevronRight size={14} style={{ color: T.textMuted }} />
                  )}
                  <Link
                    href={`/admin-v2/counterparties/${d.counterpartyId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium truncate hover:underline"
                    style={{ color: T.textPrimary }}
                  >
                    {d.counterpartyName}
                  </Link>
                  <span className="text-[11px]" style={{ color: T.textMuted }}>
                    {d.entries.length} {d.entries.length === 1 ? "запис" : "записів"}
                  </span>
                </button>
                <span
                  className="tabular-nums font-semibold"
                  style={{ color: T.danger }}
                >
                  {formatCurrency(d.outstanding)}
                </span>
                {canPay && (
                  <button
                    onClick={() =>
                      setPayment({
                        counterpartyId: d.counterpartyId,
                        counterpartyName: d.counterpartyName,
                        outstanding: d.outstanding,
                      })
                    }
                    className="rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: T.accentPrimarySoft,
                      color: T.accentPrimary,
                    }}
                  >
                    Оплатити
                  </button>
                )}
              </div>
              {isOpen && (
                <div
                  className="px-3 pb-3 pt-1 text-[12px]"
                  style={{ color: T.textSecondary }}
                >
                  {d.materials.length > 0 && (
                    <div className="mb-2">
                      <div
                        className="text-[10px] font-bold uppercase tracking-wider mb-1"
                        style={{ color: T.textMuted }}
                      >
                        Матеріали
                      </div>
                      <div className="grid gap-1">
                        {d.materials.map((m) => (
                          <div
                            key={m.name}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate flex-1">{m.name}</span>
                            <span style={{ color: T.textMuted }}>×{m.count}</span>
                            <span
                              className="tabular-nums font-semibold whitespace-nowrap"
                              style={{ color: T.danger }}
                            >
                              {formatCurrency(m.outstanding)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: T.textMuted }}
                    >
                      Окремі факти
                    </div>
                    <div className="grid gap-1">
                      {d.entries.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate flex-1">{e.title}</span>
                          <span style={{ color: T.textMuted }}>
                            {new Date(e.occurredAt).toLocaleDateString("uk-UA")}
                          </span>
                          <span
                            className="tabular-nums whitespace-nowrap"
                            style={{ color: T.danger }}
                          >
                            {formatCurrency(e.outstanding)}
                          </span>
                          {e.paidAmount > 0 && (
                            <span
                              className="text-[10px] tabular-nums whitespace-nowrap"
                              style={{ color: T.success }}
                              title={`Оплачено: ${formatCurrency(e.paidAmount)}`}
                            >
                              −{formatCurrency(e.paidAmount)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {payment && (
        <SupplierPaymentModal
          open={true}
          counterpartyId={payment.counterpartyId}
          counterpartyName={payment.counterpartyName}
          projectId={projectId}
          projectTitle={projectTitle}
          outstandingHint={payment.outstanding}
          onClose={() => setPayment(null)}
          onCreated={async () => {
            setPayment(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
