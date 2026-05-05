"use client";

import { useEffect, useState } from "react";
import { Loader2, Package, Plus, Trash2, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

const UNIT_OPTIONS = ["шт", "м", "м²", "м³", "кг", "т", "л", "пог.м"];

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
  onClose: () => void;
  /** Сховати X-кнопку (для fullscreen split-view, де панель завжди видима). */
  hideClose?: boolean;
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Використано: { bg: "rgba(34,197,94,0.15)", fg: T.success },
  Частково: { bg: "rgba(234,179,8,0.15)", fg: T.warning },
  Заплановано: { bg: T.panelElevated, fg: T.textMuted },
};

/**
 * Презентаційний body матеріалів етапу. Без позиціонування — батьківський
 * wrapper (`StageMaterialsPopup` для floating mobile або `StageMaterialsEmbedded`
 * для pinned desktop) задає layout. Fetch виконується при mount + зміні stageId.
 */
function StageMaterialsBody({
  projectId,
  stageId,
  stageName,
  onClose,
  hideClose,
}: Props) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    unit: "шт",
    planQty: "",
    planPrice: "",
    supplier: "",
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
  }, [projectId, stageId, reloadKey]);

  // Reset form коли змінюється етап
  useEffect(() => {
    setAdding(false);
    setForm({ name: "", unit: "шт", planQty: "", planPrice: "", supplier: "" });
  }, [stageId]);

  async function submitAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/stages/${stageId}/materials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            unit: form.unit,
            planQty: Number(form.planQty || 0),
            planPrice: Number(form.planPrice || 0),
            supplier: form.supplier.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Не вдалось додати матеріал");
        return;
      }
      setAdding(false);
      setForm({ name: "", unit: "шт", planQty: "", planPrice: "", supplier: "" });
      setReloadKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Видалити матеріал з етапу?")) return;
    const res = await fetch(
      `/api/admin/projects/${projectId}/stages/${stageId}/materials/${id}`,
      { method: "DELETE" },
    );
    if (res.ok) setReloadKey((k) => k + 1);
  }

  const totalPlan = rows.reduce((a, r) => a + r.planSum, 0);
  const totalFact = rows.reduce((a, r) => a + r.factSum, 0);
  const totalDev = totalFact - totalPlan;

  return (
    <div
      role="region"
      aria-label="Матеріали етапу"
      style={{
        background: T.panel,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        width: "100%",
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
          onClick={() => setAdding((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 5,
            background: adding ? T.panel : T.accentPrimary,
            border: adding ? `1px solid ${T.borderSoft}` : "none",
            color: adding ? T.textMuted : "#fff",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={12} />
          {adding ? "Скасувати" : "Додати матеріал"}
        </button>
        {!hideClose && (
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
        )}
      </div>

      {adding && (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: `1px solid ${T.borderSoft}`,
            background: T.panelSoft,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            fontSize: 12,
          }}
        >
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Назва матеріалу"
            autoFocus
            style={{
              flex: 1,
              padding: "5px 8px",
              borderRadius: 4,
              border: `1px solid ${T.borderSoft}`,
              background: T.panel,
              color: T.textPrimary,
              fontSize: 12,
              outline: "none",
            }}
          />
          <input
            type="text"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            placeholder="Постачальник"
            style={{
              width: 130,
              padding: "5px 8px",
              borderRadius: 4,
              border: `1px solid ${T.borderSoft}`,
              background: T.panel,
              color: T.textPrimary,
              fontSize: 12,
              outline: "none",
            }}
          />
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            style={{
              width: 70,
              padding: "5px 6px",
              borderRadius: 4,
              border: `1px solid ${T.borderSoft}`,
              background: T.panel,
              color: T.textPrimary,
              fontSize: 12,
              outline: "none",
            }}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={form.planQty}
            onChange={(e) => setForm({ ...form, planQty: e.target.value })}
            placeholder="К-сть"
            min={0}
            step="0.001"
            style={{
              width: 80,
              padding: "5px 8px",
              borderRadius: 4,
              border: `1px solid ${T.borderSoft}`,
              background: T.panel,
              color: T.textPrimary,
              fontSize: 12,
              outline: "none",
              textAlign: "right",
            }}
          />
          <input
            type="number"
            value={form.planPrice}
            onChange={(e) => setForm({ ...form, planPrice: e.target.value })}
            placeholder="Ціна"
            min={0}
            step="0.01"
            style={{
              width: 100,
              padding: "5px 8px",
              borderRadius: 4,
              border: `1px solid ${T.borderSoft}`,
              background: T.panel,
              color: T.textPrimary,
              fontSize: 12,
              outline: "none",
              textAlign: "right",
            }}
          />
          <button
            type="button"
            onClick={submitAdd}
            disabled={saving || !form.name.trim()}
            style={{
              padding: "5px 12px",
              borderRadius: 4,
              background: T.success,
              border: "none",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              cursor: saving || !form.name.trim() ? "not-allowed" : "pointer",
              opacity: saving || !form.name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "..." : "Зберегти"}
          </button>
        </div>
      )}

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
                  { l: "", a: "right" as const },
                ].map((h, i) => (
                  <th
                    key={h.l + i}
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
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        borderBottom: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => deleteItem(r.id)}
                        title="Видалити з етапу"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: T.textMuted,
                          cursor: "pointer",
                          padding: 2,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
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
                  <td
                    style={{
                      borderTop: `1px solid ${T.borderStrong}`,
                    }}
                  />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * Floating-режим (mobile fallback): фіксований унизу viewport.
 * Mount керує батько (зазвичай `{selected && !materialsHidden && <Popup />}`).
 */
export function StageMaterialsPopup(props: Props) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 260,
        zIndex: 40,
        boxShadow: "0 -8px 24px rgba(0,0,0,0.25)",
        borderTop: `1px solid ${T.borderStrong}`,
      }}
    >
      <StageMaterialsBody {...props} />
    </div>
  );
}

/**
 * Embedded-режим: pinned панель усередині батьківського layout.
 * Висота керується батьком (h-full + max-h обмеження).
 */
export function StageMaterialsEmbedded({
  className,
  style,
  ...props
}: Props & { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`overflow-hidden rounded-xl shadow-sm ${className ?? ""}`}
      style={{
        border: `1px solid ${T.borderSoft}`,
        ...style,
      }}
    >
      <StageMaterialsBody {...props} />
    </div>
  );
}
