"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Check,
  Clock,
  Circle,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  EyeOff,
  Eye,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { STAGE_ORDER, stageDisplayName } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type StageData = {
  id?: string;
  stage: ProjectStage | null;
  customName: string;
  isHidden: boolean;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  notes: string;
  startDate: string;
  endDate: string;
};

const STATUS_COLORS: Record<
  StageData["status"],
  { bg: string; fg: string; icon: typeof Check }
> = {
  COMPLETED: { bg: T.successSoft, fg: T.success, icon: Check },
  IN_PROGRESS: { bg: T.accentPrimarySoft, fg: T.accentPrimary, icon: Clock },
  PENDING: { bg: T.panelElevated, fg: T.textMuted, icon: Circle },
};

const STATUS_LABELS: Record<StageData["status"], string> = {
  PENDING: "Очікує",
  IN_PROGRESS: "В процесі",
  COMPLETED: "Завершено",
};

export default function AdminV2ProjectStagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [stages, setStages] = useState<StageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProjectTitle(data.title);
        if (data.stages?.length > 0) {
          setStages(
            data.stages.map((s: Record<string, any>) => ({
              id: s.id,
              stage: s.stage ?? null,
              customName: s.customName ?? "",
              isHidden: Boolean(s.isHidden),
              status: s.status,
              progress: Number(s.progress),
              notes: s.notes || "",
              startDate: s.startDate ? String(s.startDate).split("T")[0] : "",
              endDate: s.endDate ? String(s.endDate).split("T")[0] : "",
            })),
          );
        } else {
          setStages(
            STAGE_ORDER.map((stage) => ({
              stage,
              customName: "",
              isHidden: false,
              status: "PENDING" as const,
              progress: 0,
              notes: "",
              startDate: "",
              endDate: "",
            })),
          );
        }
      })
      .catch(() => setError("Не вдалось завантажити проєкт"))
      .finally(() => setLoading(false));
  }, [id]);

  function updateStage(index: number, updates: Partial<StageData>) {
    setStages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      if (updates.status === "COMPLETED") next[index].progress = 100;
      else if (updates.status === "PENDING") next[index].progress = 0;
      return next;
    });
  }

  function moveStage(index: number, direction: -1 | 1) {
    setStages((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addCustomStage() {
    setStages((prev) => [
      ...prev,
      {
        stage: null,
        customName: "Новий етап",
        isHidden: false,
        status: "PENDING",
        progress: 0,
        notes: "",
        startDate: "",
        endDate: "",
      },
    ]);
  }

  function removeStage(index: number) {
    const stage = stages[index];
    const label = displayLabel(stage) || "цей етап";
    if (!confirm(`Видалити "${label}"?\n\nЯкщо до нього прив'язані задачі — етап буде прихований, а не видалений.`))
      return;
    setStages((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleHidden(index: number) {
    updateStage(index, { isHidden: !stages[index].isHidden });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = stages.map((s) => ({
        id: s.id,
        stage: s.stage,
        customName: s.customName.trim() || null,
        isHidden: s.isHidden,
        status: s.status,
        progress: s.progress,
        notes: s.notes || null,
        startDate: s.startDate || null,
        endDate: s.endDate || null,
      }));
      const res = await fetch(`/api/admin/projects/${id}/stages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: payload }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Помилка збереження");
      }
      router.push(`/admin-v2/projects/${id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Помилка збереження");
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

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Link
        href={`/admin-v2/projects/${id}`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-[0.97]"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> {projectTitle || "Назад"}
      </Link>

      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            ЕТАПИ ВИКОНАННЯ
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Управління етапами
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            Перейменуйте, сховайте зайве або додайте власні етапи під проєкт
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
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

      {/* Stages list */}
      <div className="flex flex-col gap-3">
        {stages.map((stage, index) => {
          const colors = STATUS_COLORS[stage.status];
          const Icon = colors.icon;
          const label = displayLabel(stage);
          return (
            <div
              key={stage.id ?? `new-${index}`}
              className="flex flex-col gap-4 rounded-2xl p-5"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
                opacity: stage.isHidden ? 0.55 : 1,
              }}
            >
              {/* Header: reorder | icon | name input | status | actions */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <button
                    onClick={() => moveStage(index, -1)}
                    disabled={index === 0}
                    className="flex h-5 w-5 items-center justify-center rounded disabled:opacity-30"
                    style={{ color: T.textMuted }}
                    aria-label="Перемістити вгору"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => moveStage(index, 1)}
                    disabled={index === stages.length - 1}
                    className="flex h-5 w-5 items-center justify-center rounded disabled:opacity-30"
                    style={{ color: T.textMuted }}
                    aria-label="Перемістити вниз"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: colors.bg }}
                >
                  <Icon size={18} style={{ color: colors.fg }} />
                </div>
                <input
                  type="text"
                  value={stage.customName}
                  onChange={(e) =>
                    updateStage(index, { customName: e.target.value })
                  }
                  placeholder={stage.stage ? stageDisplayName({ stage: stage.stage, customName: null }) : "Назва етапу"}
                  className="flex-1 min-w-[160px] rounded-xl px-3 py-2 text-base font-bold outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
                <select
                  value={stage.status}
                  onChange={(e) =>
                    updateStage(index, {
                      status: e.target.value as StageData["status"],
                    })
                  }
                  className="rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.fg,
                    border: `1px solid ${colors.fg}`,
                  }}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => toggleHidden(index)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition hover:brightness-[0.95]"
                    style={{
                      backgroundColor: T.panelSoft,
                      color: stage.isHidden ? T.warning : T.textMuted,
                      border: `1px solid ${T.borderStrong}`,
                    }}
                    title={stage.isHidden ? "Показати" : "Сховати"}
                  >
                    {stage.isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    <span className="hidden sm:inline">
                      {stage.isHidden ? "Показати" : "Сховати"}
                    </span>
                  </button>
                  <button
                    onClick={() => removeStage(index)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-[0.95]"
                    style={{
                      backgroundColor: T.dangerSoft,
                      color: T.danger,
                    }}
                    title="Видалити"
                    aria-label="Видалити етап"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {stage.stage && !stage.customName && (
                <div className="text-[11px]" style={{ color: T.textMuted }}>
                  Стандартна назва: <strong>{label}</strong>
                </div>
              )}

              {stage.status === "IN_PROGRESS" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[11px] font-semibold tracking-wide"
                      style={{ color: T.textMuted }}
                    >
                      ПРОГРЕС
                    </span>
                    <span
                      className="text-[12px] font-bold"
                      style={{ color: T.accentPrimary }}
                    >
                      {stage.progress}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={stage.progress}
                    onChange={(e) =>
                      updateStage(index, {
                        progress: parseInt(e.target.value),
                      })
                    }
                    className="w-full"
                    style={{ accentColor: T.accentPrimary }}
                  />
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: T.panelSoft }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${stage.progress}%`,
                        backgroundColor: T.accentPrimary,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Початок">
                  <input
                    type="date"
                    value={stage.startDate}
                    onChange={(e) =>
                      updateStage(index, { startDate: e.target.value })
                    }
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                      colorScheme: "dark",
                    }}
                  />
                </Field>
                <Field label="Завершення">
                  <input
                    type="date"
                    value={stage.endDate}
                    onChange={(e) =>
                      updateStage(index, { endDate: e.target.value })
                    }
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                      colorScheme: "dark",
                    }}
                  />
                </Field>
              </div>

              <Field label="Примітки">
                <textarea
                  value={stage.notes}
                  onChange={(e) =>
                    updateStage(index, { notes: e.target.value })
                  }
                  rows={2}
                  placeholder="Деталі по етапу…"
                  className="w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
              </Field>
            </div>
          );
        })}

        <button
          onClick={addCustomStage}
          className="flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold transition hover:brightness-[0.97]"
          style={{
            backgroundColor: T.panelSoft,
            color: T.accentPrimary,
            border: `1px dashed ${T.borderStrong}`,
          }}
        >
          <Plus size={15} /> Додати етап
        </button>
      </div>
    </div>
  );
}

function displayLabel(s: Pick<StageData, "stage" | "customName">) {
  return stageDisplayName({ stage: s.stage, customName: s.customName || null });
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
