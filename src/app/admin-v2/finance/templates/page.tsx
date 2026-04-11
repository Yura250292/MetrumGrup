"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  X,
  FileText,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Template = {
  id: string;
  name: string;
  taxationType: string;
  globalMarginPercent: number;
  logisticsCost: number;
};

const TAX_LABELS: Record<string, string> = {
  VAT: "ТОВ ПДВ 20%",
  FOP: "ФОП 6%",
  CASH: "Готівка",
};

export default function AdminV2FinanceTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    taxationType: "VAT",
    globalMarginPercent: 25,
    logisticsCost: 0,
  });
  const [error, setError] = useState<string | null>(null);

  function loadTemplates() {
    setLoading(true);
    fetch("/api/admin/financial-templates")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.data || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Не вдалось завантажити шаблони");
        setLoading(false);
      });
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/financial-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Помилка створення");
      setShowModal(false);
      setFormData({ name: "", taxationType: "VAT", globalMarginPercent: 25, logisticsCost: 0 });
      loadTemplates();
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ФІНАНСИ
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Шаблони фінансових налаштувань
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            Створюйте шаблони для швидкого застосування податків і рентабельності
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Створити
        </button>
      </section>

      {/* List */}
      <section
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-12 text-sm"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText size={32} style={{ color: T.textMuted }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Шаблонів немає
            </span>
            <span className="text-[12px]" style={{ color: T.textMuted }}>
              Створіть перший шаблон щоб швидко застосовувати налаштування
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {templates.map((t, i) => (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 px-6 py-4"
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                }}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <FileText size={18} style={{ color: T.accentPrimary }} />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span
                      className="text-[14px] font-bold truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {t.name}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className="rounded-full px-2 py-0.5 font-bold"
                        style={{
                          backgroundColor: T.accentPrimarySoft,
                          color: T.accentPrimary,
                        }}
                      >
                        {TAX_LABELS[t.taxationType] || t.taxationType}
                      </span>
                      <span style={{ color: T.textMuted }}>
                        Рентабельність:{" "}
                        <span style={{ color: T.success }} className="font-semibold">
                          {Number(t.globalMarginPercent)}%
                        </span>
                      </span>
                      <span style={{ color: T.textMuted }}>
                        Логістика:{" "}
                        <span style={{ color: T.textSecondary }} className="font-semibold">
                          {formatCurrency(Number(t.logisticsCost))}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(7, 10, 17, 0.92)" }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[520px] flex-col gap-5 rounded-3xl p-6"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                Новий шаблон
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X size={16} style={{ color: T.textMuted }} />
              </button>
            </div>

            <Field label="Назва" required>
              <input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="напр. ТОВ з ПДВ 25%"
                required
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>

            <Field label="Тип оподаткування">
              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "VAT", "FOP"] as const).map((t) => {
                  const active = formData.taxationType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData({ ...formData, taxationType: t })}
                      className="flex flex-col items-start gap-0.5 rounded-xl p-3 text-left"
                      style={{
                        backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
                        border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
                      }}
                    >
                      <span
                        className="text-[12px] font-bold"
                        style={{ color: active ? T.accentPrimary : T.textPrimary }}
                      >
                        {t === "CASH" ? "Готівка" : t === "VAT" ? "ТОВ ПДВ" : "ФОП"}
                      </span>
                      <span className="text-[10px]" style={{ color: T.textMuted }}>
                        {t === "CASH" ? "0%" : t === "VAT" ? "20%" : "6%"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={`Рентабельність: ${formData.globalMarginPercent}%`}>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.globalMarginPercent}
                onChange={(e) =>
                  setFormData({ ...formData, globalMarginPercent: Number(e.target.value) })
                }
                className="w-full"
                style={{ accentColor: T.accentPrimary }}
              />
            </Field>

            <Field label="Логістика, ₴">
              <input
                type="number"
                value={formData.logisticsCost}
                onChange={(e) =>
                  setFormData({ ...formData, logisticsCost: Number(e.target.value) })
                }
                min="0"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </Field>

            {error && (
              <div
                className="flex items-start gap-2 rounded-xl p-3"
                style={{
                  backgroundColor: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.danger}`,
                }}
              >
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span className="text-xs">{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl px-4 py-3 text-sm font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Створити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
        {required && (
          <span className="ml-1" style={{ color: T.danger }}>
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
