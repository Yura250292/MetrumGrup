"use client";

import { useEffect, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import type { MaterialRow, StageNode } from "./types";

type Props = {
  projectId: string;
  projectSlug: string;
  stage: StageNode;
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Використано: { bg: T.successSoft, fg: T.success },
  Частково: { bg: T.warningSoft, fg: T.warning },
  Заплановано: { bg: T.panelElevated, fg: T.textMuted },
};

export function StageMaterialsPanel({ projectId, projectSlug, stage }: Props) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/admin/projects/${projectId}/stages/${stage.id}/materials`,
      { cache: "no-store" },
    )
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
  }, [projectId, stage.id]);

  // Reset loading state when stage changes — between fetches show spinner.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
  }, [stage.id]);

  const totalPlan = rows.reduce((a, r) => a + r.planSum, 0);
  const totalFact = rows.reduce((a, r) => a + r.factSum, 0);
  const totalDev = totalFact - totalPlan;

  const stageName = stage.customName ?? stage.stage ?? "Етап";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: T.panel,
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: `1px solid ${T.borderSoft}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            background: T.accentPrimarySoft,
            color: T.accentPrimary,
            padding: "2px 7px",
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          {projectSlug.toUpperCase()}
        </span>
        <Package size={14} color={T.textMuted} />
        <span style={{ fontWeight: 700, fontSize: 13, color: T.textPrimary }}>
          {stageName}
        </span>
        <span style={{ fontSize: 11, color: T.textMuted, marginLeft: "auto" }}>
          Матеріали ({rows.length})
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div
            style={{
              padding: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: T.textMuted,
            }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span style={{ fontSize: 12 }}>Завантаження...</span>
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: 30,
              textAlign: "center",
              color: T.textMuted,
              fontSize: 12,
            }}
          >
            Матеріали для цього етапу не знайдено.
            <br />
            <span style={{ fontSize: 11 }}>
              Додайте позиції в кошторис або привʼяжіть етап до секції кошторису.
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
                  { l: "Матеріал", a: "left" },
                  { l: "Постачальник", a: "left" },
                  { l: "Статус", a: "left" },
                  { l: "Од.", a: "left" },
                  { l: "К-сть П", a: "right" },
                  { l: "К-сть Ф", a: "right" },
                  { l: "Ціна П", a: "right" },
                  { l: "Сума П", a: "right" },
                  { l: "Сума Ф", a: "right" },
                  { l: "Відхил.", a: "right" },
                ].map((h) => (
                  <th
                    key={h.l}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: T.textMuted,
                      padding: "6px 10px",
                      textAlign: h.a as "left" | "right",
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
                        padding: "6px 10px",
                        fontWeight: 500,
                        color: T.textPrimary,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.name}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
                        fontSize: 11,
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.supplier ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <span
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 500,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.unit}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
                        textAlign: "right",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.planQty.toLocaleString("uk-UA")}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
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
                        padding: "6px 10px",
                        textAlign: "right",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {formatCurrency(r.planPrice)}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
                        textAlign: "right",
                        color: T.textMuted,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {formatCurrency(r.planSum)}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
                        textAlign: "right",
                        color: T.textPrimary,
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {r.factSum > 0 ? formatCurrency(r.factSum) : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 10px",
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
            <tfoot>
              <tr style={{ background: T.panelSoft, fontWeight: 700 }}>
                <td
                  colSpan={7}
                  style={{
                    padding: "6px 10px",
                    color: T.textPrimary,
                    borderTop: `1px solid ${T.borderStrong}`,
                  }}
                >
                  Разом
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    textAlign: "right",
                    color: T.textPrimary,
                    borderTop: `1px solid ${T.borderStrong}`,
                  }}
                >
                  {formatCurrency(totalPlan)}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
                    textAlign: "right",
                    color: T.textPrimary,
                    borderTop: `1px solid ${T.borderStrong}`,
                  }}
                >
                  {formatCurrency(totalFact)}
                </td>
                <td
                  style={{
                    padding: "6px 10px",
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
          </table>
        )}
      </div>
    </div>
  );
}
