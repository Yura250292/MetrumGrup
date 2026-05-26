"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { RatingStars } from "./rating-stars";
import {
  ComplianceBadge,
  CounterpartyTaxStatusLabel,
} from "./compliance-badge";
import { ExpiryIndicator } from "./expiry-indicator";

interface CompareItem {
  id: string;
  name: string;
  type: string;
  roles: string[];
  edrpou: string | null;
  legalForm: string | null;
  taxStatus: CounterpartyTaxStatusLabel;
  taxStatusCheckedAt: string | null;
  avgRating: number | null;
  totalReviews: number;
  totalProjects: number;
  specializations: string[];
  licenseNumber: string | null;
  licenseValidUntil: string | null;
  defaultPaymentTermsDays: number | null;
  preferredPaymentMethod: string | null;
  totalInvoiced: number;
  invoiceCount: number;
  totalPaid: number;
  documentCount: number;
}

export function CounterpartyCompareView({ ids }: { ids: string[] }) {
  const [items, setItems] = useState<CompareItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length < 2) {
      setError("Потрібно мінімум 2 контрагенти для порівняння");
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/admin/financing/counterparties/compare?ids=${ids.join(",")}`,
        { cache: "no-store" },
      );
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return;
      }
      setItems(j.items);
    })();
  }, [ids]);

  if (error) {
    return (
      <div
        className="rounded-2xl px-4 py-3 text-[13px]"
        style={{
          backgroundColor: T.dangerSoft,
          color: T.danger,
          border: `1px solid ${T.danger}40`,
        }}
      >
        {error}
      </div>
    );
  }

  if (!items) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
        style={{ backgroundColor: T.panel, color: T.textMuted }}
      >
        <Loader2 size={14} className="animate-spin" /> Завантаження…
      </div>
    );
  }

  const ROWS: Array<{
    label: string;
    render: (i: CompareItem) => React.ReactNode;
  }> = [
    {
      label: "Тип / форма",
      render: (i) => `${i.type}${i.legalForm ? " · " + i.legalForm : ""}`,
    },
    { label: "ЄДРПОУ", render: (i) => i.edrpou ?? "—" },
    { label: "Ролі", render: (i) => i.roles.join(", ") || "—" },
    {
      label: "Спеціалізації",
      render: (i) => (i.specializations.length ? i.specializations.join(", ") : "—"),
    },
    {
      label: "Рейтинг",
      render: (i) =>
        i.avgRating != null ? (
          <span>
            <RatingStars value={i.avgRating} showValue />
            <span className="ml-1 text-[10px]" style={{ color: T.textMuted }}>
              ({i.totalReviews} відг.)
            </span>
          </span>
        ) : (
          "—"
        ),
    },
    { label: "Проєктів", render: (i) => i.totalProjects },
    {
      label: "Статус",
      render: (i) => <ComplianceBadge status={i.taxStatus} />,
    },
    {
      label: "Ліцензія",
      render: (i) =>
        i.licenseNumber ? (
          <span>
            {i.licenseNumber}
            <span className="ml-2 inline-block align-middle">
              <ExpiryIndicator validUntil={i.licenseValidUntil} />
            </span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      label: "Терміни оплати",
      render: (i) =>
        i.defaultPaymentTermsDays
          ? `${i.defaultPaymentTermsDays} дн.`
          : "—",
    },
    {
      label: "Метод оплати",
      render: (i) => i.preferredPaymentMethod ?? "—",
    },
    {
      label: "Усього виставлено",
      render: (i) => formatCurrency(i.totalInvoiced),
    },
    {
      label: "Сплачено",
      render: (i) => formatCurrency(i.totalPaid),
    },
    { label: "Документів", render: (i) => i.documentCount },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin-v2/counterparties"
          className="flex items-center gap-1.5 text-[12px] hover:underline"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft size={14} />
          До списку контрагентів
        </Link>
      </div>

      <div
        className="overflow-x-auto rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ backgroundColor: T.panelSoft }}>
              <th
                className="px-3 py-2 text-left text-[11px] uppercase tracking-wide"
                style={{ color: T.textSecondary }}
              >
                Поле
              </th>
              {items.map((i) => (
                <th
                  key={i.id}
                  className="px-3 py-2 text-left text-[13px] font-semibold"
                  style={{ color: T.textPrimary }}
                >
                  <Link
                    href={`/admin-v2/counterparties/${i.id}`}
                    className="hover:underline"
                  >
                    {i.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td
                  className="px-3 py-2 align-top text-[11px] uppercase tracking-wide"
                  style={{
                    color: T.textSecondary,
                    borderTop: `1px solid ${T.borderSoft}`,
                  }}
                >
                  {row.label}
                </td>
                {items.map((i) => (
                  <td
                    key={i.id}
                    className="px-3 py-2 align-top"
                    style={{
                      color: T.textPrimary,
                      borderTop: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    {row.render(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
