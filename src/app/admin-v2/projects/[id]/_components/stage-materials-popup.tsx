"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type MaterialRow = {
  id: string;
  name: string;
  sku: string | null;
  itemType: string | null;
  supplier: string | null;
  unit: string;
  planQty: number;
  factQty: number | null;
  planPrice: number;
  factPrice: number;
  planSum: number;
  factSum: number;
  deviation: number;
  status: string;
};

type Props = {
  projectId: string;
  stageId: string;
  stageName: string;
  open: boolean;
  /** Зсув popup-а праворуч щоб не перекривати drawer (зазвичай width drawer-a). */
  rightOffset?: number;
  onClose: () => void;
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Використано: { bg: "rgba(34,197,94,0.15)", fg: T.success },
  Частково: { bg: "rgba(234,179,8,0.15)", fg: T.warning },
  Заплановано: { bg: T.panelElevated, fg: T.textMuted },
};

/**
 * Slide-up popup закріплений знизу viewport. Показує матеріали етапу
 * (з кошторису через sourceEstimateItem/Section). Ширина — на повну
 * ширину viewport (overlay поверх контенту), висота — фіксована 320px.
 *
 * Open/close стан керується пропсом `open`: коли false — popup захований
 * за межі (translateY 100%), мауреріали не fetch-аться. Коли true —
 * слайд-апaнім ration і fetch.
 */
export function StageMaterialsPopup({
  projectId,
  stageId,
  stageName,
  open,
  rightOffset = 0,
  onClose,
}: Props) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/admin/projects/${projectId}/stages/${stageId}/materials`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data: MaterialRow[] }) => {
        if (!cancelled) {
          setRows(j.data ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, stageId]);

  const totalPlan = rows.reduce((a, r) => a + r.planSum, 0);
  const totalFact = rows.reduce((a, r) => a + r.factSum, 0);
  const totalDev = totalFact - totalPlan;

  return (
    <div
      role="dialog"
      aria-label="Матеріали етапу"
      aria-hidden={!open}
      style={{
        position: "fixed",
        left: 0,
        right: rightOffset,
        bottom: 0,
        height: 220,
        background: T.panel,
        borderTop: `1px solid ${T.borderStrong}`,
        borderRight: rightOffset > 0 ? `1px solid ${T.borderStrong}` : "none",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.25)",
        transform: open ? "translateY(0)" : "translateY(110%)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${T.borderSoft}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          background: T.panelSoft,
        }}
      >
        <Package size={16} style={{ color: T.accentPrimary }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: T.textPrimary }}>
          Матеріали етапу
        </span>
        <span style={{ color: T.textMuted, fontSize: 12 }}>·</span>
        <span
          style={{
            color: T.textSecondary,
            fontSize: 12,
            maxWidth: 360,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {stageName}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.textMuted }}>
          {rows.length} {rows.length === 1 ? "позиція" : "позицій"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 4,
            background: "transparent",
            border: "none",
            color: T.textMuted,
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div
            style={{
              padding: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: T.textMuted,
            }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span style={{ fontSize: 12 }}>Завантаження…</span>
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: T.textMuted,
              fontSize: 12,
            }}
          >
            Не привʼязано до позицій кошторису.
            <br />
            <span style={{ fontSize: 11 }}>
              Імпортуйте кошторис або привʼяжіть етап до секції.
            </span>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                {[
                  { l: "Матеріал", a: "left" as const },
                  { l: "Постачальник", a: "left" as const },
                  { l: "Статус", a: "left" as const },
                  { l: "Од.", a: "left" as const },
                  { l: "К-сть П", a: "right" as const },
                  { l: "К-сть Ф", a: "right" as const },
                  { l: "Ціна П", a: "right" as const },
                  { l: "Сума П", a: "right" as const },
                  { l: "Сума Ф", a: "right" as const },
                  { l: "Відхил.", a: "right" as const },
                ].map((h) => (
                  <th
                    key={h.l}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: T.textMuted,
                      padding: "6px 12px",
                      textAlign: h.a,
                      borderBottom: `1px solid ${T.borderSoft}`,
                      background: T.panel,
                      position: "sticky",
                      top: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h.l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = STATUS_TONE[r.status] ?? STATUS_TONE.Заплановано;
                return (
                  <tr key={r.id}>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontWeight: 500,
                        color: T.textPrimary,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.name}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.supplier ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <span
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontWeight: 500,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.unit}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.planQty.toLocaleString("uk-UA")}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        color: T.textPrimary,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.factQty != null
                        ? r.factQty.toLocaleString("uk-UA", {
                            maximumFractionDigits: 1,
                          })
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {formatCurrency(r.planPrice)}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {formatCurrency(r.planSum)}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        color: T.textPrimary,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.factSum > 0 ? formatCurrency(r.factSum) : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        borderBottom: `1px solid ${T.borderSoft}`,
                        color:
                          r.deviation === 0
                            ? T.textMuted
                            : r.deviation > 0
                              ? T.danger
                              : T.success,
                        fontWeight: 600,
                      }}
                    >
                      {r.factSum === 0
                        ? "—"
                        : (r.deviation > 0 ? "+" : "") +
                          formatCurrency(r.deviation)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: T.panelSoft, fontWeight: 700 }}>
                  <td
                    colSpan={7}
                    style={{
                      padding: "6px 12px",
                      color: T.textPrimary,
                      borderTop: `1px solid ${T.borderStrong}`,
                    }}
                  >
                    Разом
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      color: T.textPrimary,
                      borderTop: `1px solid ${T.borderStrong}`,
                    }}
                  >
                    {formatCurrency(totalPlan)}
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      color: T.textPrimary,
                      borderTop: `1px solid ${T.borderStrong}`,
                    }}
                  >
                    {formatCurrency(totalFact)}
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      borderTop: `1px solid ${T.borderStrong}`,
                      color:
                        totalDev === 0
                          ? T.textMuted
                          : totalDev > 0
                            ? T.danger
                            : T.success,
                    }}
                  >
                    {totalDev === 0
                      ? "—"
                      : (totalDev > 0 ? "+" : "") + formatCurrency(totalDev)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
