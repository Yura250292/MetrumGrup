"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ProjectManagerPicker,
  type ProjectManagerValue,
} from "@/components/projects/ProjectManagerPicker";

type ProjectEditable = {
  id: string;
  title: string;
  code: string | null;
  type: string | null;
  description: string | null;
  address: string | null;
  status: string;
  totalBudget: number;
  startDate: Date | null;
  expectedEndDate: Date | null;
  coverImageUrl: string | null;
  isTestProject: boolean;
  managerId: string | null;
  managerName: string | null;
};

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Чернетка" },
  { value: "ACTIVE", label: "Активний" },
  { value: "ON_HOLD", label: "Призупинено" },
  { value: "COMPLETED", label: "Завершено" },
  { value: "CANCELLED", label: "Скасовано" },
];

const TYPE_PRESETS = [
  "Житло",
  "Комерція",
  "Благоустрій",
  "Інфраструктура",
  "Внутрішнє",
];

export function EditProjectForm({ project }: { project: ProjectEditable }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: project.title,
    code: project.code ?? "",
    type: project.type ?? "",
    description: project.description ?? "",
    address: project.address ?? "",
    status: project.status,
    totalBudget: String(project.totalBudget),
    startDate: toInputDate(project.startDate),
    expectedEndDate: toInputDate(project.expectedEndDate),
    coverImageUrl: project.coverImageUrl ?? "",
    isTestProject: project.isTestProject,
  });
  const [manager, setManager] = useState<ProjectManagerValue>(
    project.managerId
      ? { mode: "user", id: project.managerId, name: project.managerName ?? "" }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const managerFields: Record<string, unknown> = {};
      if (manager === null) {
        managerFields.managerId = null;
      } else if (manager.mode === "user") {
        managerFields.managerId = manager.id;
      } else {
        // employee/free-text → managerName only (легасі-патерн з new-page)
        managerFields.managerId = null;
      }

      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim() || undefined,
          code: form.code.trim() || null,
          type: form.type.trim() || null,
          description: form.description.trim() || null,
          address: form.address.trim() || null,
          status: form.status,
          totalBudget: form.totalBudget ? Number(form.totalBudget) : 0,
          startDate: form.startDate || null,
          expectedEndDate: form.expectedEndDate || null,
          coverImageUrl: form.coverImageUrl.trim() || null,
          isTestProject: form.isTestProject,
          ...managerFields,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка збереження");
      }
      router.push(`/admin-v2/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl p-6"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {error && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-3"
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

      <Field label="Назва" required>
        <input
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          required
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Код">
          <input
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
            placeholder="PRJ-2026-001"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none tabular-nums"
            style={inputStyle}
          />
        </Field>
        <Field label="Тип">
          <input
            list="project-type-list"
            value={form.type}
            onChange={(e) => update("type", e.target.value)}
            placeholder="Житло / Комерція / Благоустрій..."
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={inputStyle}
          />
          <datalist id="project-type-list">
            {TYPE_PRESETS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Опис">
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>

      <Field label="Адреса">
        <input
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="Львів, вул. Орлика 12"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Статус">
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={inputStyle}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Менеджер">
          <ProjectManagerPicker value={manager} onChange={setManager} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Дата початку">
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => update("startDate", e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={inputStyle}
          />
        </Field>
        <Field label="Очікуваний дедлайн">
          <input
            type="date"
            value={form.expectedEndDate}
            onChange={(e) => update("expectedEndDate", e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Бюджет, ₴">
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.totalBudget}
          onChange={(e) => update("totalBudget", e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none tabular-nums"
          style={inputStyle}
        />
      </Field>

      <Field label="URL обкладинки (опційно)">
        <input
          type="url"
          value={form.coverImageUrl}
          onChange={(e) => update("coverImageUrl", e.target.value)}
          placeholder="https://..."
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
        <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>
          Якщо порожньо — використовується перше фото з звіту або градієнт за
          типом проєкту.
        </p>
      </Field>

      <label className="flex items-center gap-2 text-[13px]" style={{ color: T.textSecondary }}>
        <input
          type="checkbox"
          checked={form.isTestProject}
          onChange={(e) => update("isTestProject", e.target.checked)}
        />
        Тестовий проєкт (приховується з KPI, штрихова рамка)
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <Link
          href={`/admin-v2/projects/${project.id}`}
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{ color: T.textSecondary }}
        >
          Скасувати
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {loading ? "Збереження…" : "Зберегти"}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: T.panelSoft,
  border: `1px solid ${T.borderStrong}`,
  color: T.textPrimary,
};

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
      <span
        className="text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
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

function toInputDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
