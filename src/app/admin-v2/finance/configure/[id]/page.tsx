"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Save,
  ArrowLeft,
  Calculator,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Item = {
  id: string;
  description: string;
  amount: number;
};

type EstimateData = {
  id: string;
  number: string;
  taxationType: string | null;
  profitMarginOverall: number | null;
  logisticsCost: number | null;
  items: Item[];
};

type ItemMargin = {
  useCustom: boolean;
  percent: number;
};

export default function AdminV2FinanceConfigurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxationType, setTaxationType] = useState("VAT");
  const [globalMargin, setGlobalMargin] = useState(25);
  const [logisticsCost, setLogisticsCost] = useState(0);
  const [itemMargins, setItemMargins] = useState<Record<string, ItemMargin>>({});

  useEffect(() => {
    fetch(`/api/admin/estimates/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setEstimate(d.data);
        if (d.data.taxationType) setTaxationType(d.data.taxationType);
        if (d.data.profitMarginOverall) setGlobalMargin(Number(d.data.profitMarginOverall));
        if (d.data.logisticsCost) setLogisticsCost(Number(d.data.logisticsCost));
      })
      .catch(() => setError("Не вдалось завантажити кошторис"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const itemMarginsArray = Object.entries(itemMargins).map(
        ([itemId, margin]) => ({
          itemId,
          useCustomMargin: margin.useCustom,
          customMarginPercent: margin.useCustom ? margin.percent : undefined,
        })
      );
      const res = await fetch(`/api/admin/estimates/${id}/finance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxationType,
          globalMarginPercent: globalMargin,
          logisticsCost,
          itemMargins: itemMarginsArray,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Помилка збереження");
      }
      router.push("/admin-v2/finance");
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-16 text-sm"
        style={{
          backgroundColor: T.panel,
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/admin-v2/finance"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
        >
          <ArrowLeft size={14} /> До списку
        </Link>
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <AlertCircle size={32} style={{ color: T.danger }} />
          <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Кошторис не знайдено
          </span>
        </div>
      </div>
    );
  }

  // Calculations
  const subtotal = estimate.items.reduce((s, item) => {
    const margin = itemMargins[item.id] || { useCustom: false, percent: globalMargin };
    const marginPercent = margin.useCustom ? margin.percent : globalMargin;
    return s + Number(item.amount) * (1 + marginPercent / 100);
  }, 0);
  const taxRate = taxationType === "VAT" ? 20 : taxationType === "FOP" ? 6 : 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const finalAmount = subtotal + taxAmount + logisticsCost;

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <Link
        href="/admin-v2/finance"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-[0.97]"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> До фінансового огляду
      </Link>

      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ФІНАНСОВЕ НАЛАШТУВАННЯ
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Кошторис {estimate.number}
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            Налаштуйте рентабельність по позиціях, податки та логістику
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </section>

      {error && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-4"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Parameters */}
      <div
        className="flex flex-col gap-5 rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Параметри
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Тип оподаткування">
            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "VAT", "FOP"] as const).map((t) => {
                const active = taxationType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaxationType(t)}
                    className="rounded-xl px-3 py-2.5 text-[11px] font-bold"
                    style={{
                      backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
                      color: active ? T.accentPrimary : T.textSecondary,
                      border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
                    }}
                  >
                    {t === "CASH" ? "Готівка 0%" : t === "VAT" ? "ПДВ 20%" : "ФОП 6%"}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={`Рентабельність: ${globalMargin}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={globalMargin}
              onChange={(e) => setGlobalMargin(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: T.accentPrimary }}
            />
          </Field>
          <Field label="Логістика, ₴">
            <input
              type="number"
              min="0"
              value={logisticsCost}
              onChange={(e) => setLogisticsCost(Number(e.target.value))}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
              }}
            />
          </Field>
        </div>
      </div>

      {/* Items */}
      <div
        className="flex flex-col gap-4 rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Позиції ({estimate.items.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ backgroundColor: T.panelSoft }}>
                <Th align="left">№</Th>
                <Th align="left">НАЙМЕНУВАННЯ</Th>
                <Th align="right">БАЗОВА СУМА</Th>
                <Th align="center">ІНДИВ. РЕНТАБ.</Th>
                <Th align="right">З РЕНТАБ.</Th>
              </tr>
            </thead>
            <tbody>
              {estimate.items.map((item, idx) => {
                const margin = itemMargins[item.id] || {
                  useCustom: false,
                  percent: globalMargin,
                };
                const marginPercent = margin.useCustom ? margin.percent : globalMargin;
                const priceWithMargin = Number(item.amount) * (1 + marginPercent / 100);
                return (
                  <tr
                    key={item.id}
                    style={{
                      backgroundColor: idx % 2 === 1 ? T.panelSoft : "transparent",
                      borderTop: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <td className="px-4 py-3.5 text-[12px]" style={{ color: T.textMuted }}>
                      {idx + 1}
                    </td>
                    <td
                      className="px-4 py-3.5 text-[13px] truncate max-w-md"
                      style={{ color: T.textPrimary }}
                    >
                      {item.description}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right text-[12px]"
                      style={{ color: T.textSecondary }}
                    >
                      {formatCurrency(Number(item.amount))}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="checkbox"
                          checked={margin.useCustom}
                          onChange={(e) =>
                            setItemMargins({
                              ...itemMargins,
                              [item.id]: {
                                useCustom: e.target.checked,
                                percent: globalMargin,
                              },
                            })
                          }
                          style={{ accentColor: T.accentPrimary }}
                        />
                        {margin.useCustom && (
                          <input
                            type="number"
                            value={margin.percent}
                            onChange={(e) =>
                              setItemMargins({
                                ...itemMargins,
                                [item.id]: {
                                  useCustom: true,
                                  percent: Number(e.target.value),
                                },
                              })
                            }
                            className="w-16 rounded-md px-2 py-1 text-[11px] outline-none"
                            style={{
                              backgroundColor: T.panel,
                              border: `1px solid ${T.borderAccent}`,
                              color: T.textPrimary,
                            }}
                          />
                        )}
                        {margin.useCustom && (
                          <span className="text-[10px]" style={{ color: T.textMuted }}>
                            %
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-4 py-3.5 text-right text-[13px] font-bold"
                      style={{ color: T.success }}
                    >
                      {formatCurrency(priceWithMargin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div
        className="flex flex-col gap-3 rounded-2xl p-6"
        style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderAccent}` }}
      >
        <div className="flex items-center gap-3 mb-2">
          <Calculator size={20} style={{ color: T.accentPrimary }} />
          <h2 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Підсумки
          </h2>
        </div>
        <Row label="Підсумок з рентабельністю" value={formatCurrency(subtotal)} />
        <Row label={`Податок (${taxRate}%)`} value={formatCurrency(taxAmount)} accent={T.warning} />
        <Row label="Логістика" value={formatCurrency(logisticsCost)} accent={T.accentPrimary} />
        <div className="h-px w-full" style={{ backgroundColor: T.borderSoft }} />
        <Row label="Фінальна сума" value={formatCurrency(finalAmount)} large bold />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Row({
  label,
  value,
  accent = T.textPrimary,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${large ? "text-[15px]" : "text-[13px]"} ${bold ? "font-bold" : ""}`}
        style={{ color: T.textSecondary }}
      >
        {label}
      </span>
      <span
        className={`${large ? "text-2xl" : "text-[14px]"} ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}
