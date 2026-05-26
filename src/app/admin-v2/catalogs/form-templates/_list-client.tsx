"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Copy, ToggleLeft, ToggleRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  FORM_CATEGORY_LABELS,
} from "@/lib/constants";
import type { FormCategory } from "@prisma/client";

type Row = {
  id: string;
  name: string;
  description: string | null;
  category: FormCategory;
  version: number;
  isActive: boolean;
  firmId: string | null;
  createdBy: { id: string; name: string };
  submissionCount: number;
  revisionCount: number;
  updatedAt: string;
};

const CATEGORIES: FormCategory[] = [
  "DAILY_REPORT",
  "SAFETY",
  "QUALITY",
  "ACCEPTANCE",
  "KB2V",
  "KB3",
  "CUSTOM",
];

export function FormTemplatesListClient({ templates }: { templates: Row[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | FormCategory>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = templates
    .filter((t) => filter === "all" || t.category === filter)
    .filter((t) => showInactive || t.isActive);

  async function createTemplate() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/form-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Нова форма",
          category: "CUSTOM",
          schema: { fields: [{ key: "title", type: "text", label: "Заголовок", required: true }] },
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        router.push(`/admin-v2/catalogs/form-templates/${data.id}`);
      } else {
        alert(data.error ?? "Не вдалося створити шаблон");
      }
    } finally {
      setCreating(false);
    }
  }

  async function duplicate(id: string) {
    const res = await fetch(`/api/admin/form-templates/${id}/duplicate`, {
      method: "POST",
    });
    if (res.ok) router.refresh();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/form-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    router.refresh();
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: T.textPrimary }}>
            Шаблони форм
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: T.textMuted }}>
            Конструктор форм для виконробів (КБ-2в, ТБ, рапорти, інспекції).
          </p>
        </div>
        <button
          onClick={createTemplate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary, color: "white" }}
        >
          <Plus size={16} />
          Створити шаблон
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className="rounded-md px-3 py-1 text-[12px]"
          style={{
            backgroundColor: filter === "all" ? T.accentPrimary : T.panelElevated,
            color: filter === "all" ? "white" : T.textMuted,
          }}
        >
          Усі
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className="rounded-md px-3 py-1 text-[12px]"
            style={{
              backgroundColor: filter === c ? T.accentPrimary : T.panelElevated,
              color: filter === c ? "white" : T.textMuted,
            }}
          >
            {FORM_CATEGORY_LABELS[c]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
          <input
            id="show-inactive"
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <label htmlFor="show-inactive">Показувати неактивні</label>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
      >
        <table className="w-full text-left text-[13px]">
          <thead style={{ color: T.textMuted }}>
            <tr className="border-b" style={{ borderColor: T.borderSoft }}>
              <th className="px-4 py-2 font-medium">Назва</th>
              <th className="px-4 py-2 font-medium">Категорія</th>
              <th className="px-4 py-2 font-medium">Версія</th>
              <th className="px-4 py-2 font-medium">Заповнень</th>
              <th className="px-4 py-2 font-medium">Оновлено</th>
              <th className="px-4 py-2 font-medium">Активна</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center" style={{ color: T.textMuted }}>
                  Поки немає шаблонів. Натисніть «Створити шаблон» вище.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="border-b transition hover:bg-white/[0.03]"
                style={{ borderColor: T.borderSoft, color: T.textPrimary }}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin-v2/catalogs/form-templates/${t.id}`}
                    className="inline-flex items-center gap-2 hover:underline"
                  >
                    <FileText size={14} style={{ color: T.textMuted }} />
                    <span className="font-medium">{t.name}</span>
                  </Link>
                  {t.description && (
                    <div className="mt-0.5 text-[12px]" style={{ color: T.textMuted }}>
                      {t.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3" style={{ color: T.textMuted }}>
                  {FORM_CATEGORY_LABELS[t.category]}
                </td>
                <td className="px-4 py-3 tabular-nums" style={{ color: T.textMuted }}>
                  v{t.version}
                </td>
                <td className="px-4 py-3 tabular-nums" style={{ color: T.textMuted }}>
                  {t.submissionCount}
                </td>
                <td className="px-4 py-3 tabular-nums" style={{ color: T.textMuted }}>
                  {new Date(t.updatedAt).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(t.id, t.isActive)}
                    className="inline-flex items-center gap-1 text-[12px]"
                    style={{ color: t.isActive ? T.success : T.textMuted }}
                  >
                    {t.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    {t.isActive ? "Так" : "Ні"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => duplicate(t.id)}
                    title="Дублювати"
                    className="inline-flex items-center gap-1 text-[12px]"
                    style={{ color: T.textMuted }}
                  >
                    <Copy size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
