"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  FolderPlus,
  Info,
  Link2,
  Loader2,
  Sparkles,
  Users,
  AlertCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ProjectClientPicker,
  type ProjectClientValue,
} from "@/components/projects/ProjectClientPicker";
import {
  ProjectManagerPicker,
  type ProjectManagerValue,
} from "@/components/projects/ProjectManagerPicker";

type MergeCandidate = { id: string; name: string; entryCount: number };
type Step = 1 | 2 | 3;

const STEPS: Array<{ n: Step; label: string; icon: typeof Sparkles }> = [
  { n: 1, label: "Назва і тип", icon: Sparkles },
  { n: 2, label: "Адреса і команда", icon: Users },
  { n: 3, label: "Дати і бюджет", icon: Calendar },
];

const TYPE_PRESETS = ["Житло", "Комерція", "Благоустрій", "Інфраструктура", "Внутрішнє"];

export default function AdminV2NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    code: "",
    type: "",
    description: "",
    address: "",
    authorName: "",
    totalBudget: "",
    startDate: "",
    expectedEndDate: "",
  });
  const [client, setClient] = useState<ProjectClientValue>(null);
  const [manager, setManager] = useState<ProjectManagerValue>(null);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [mergeFolderId, setMergeFolderId] = useState<string | null>(null);

  // Debounced пошук кандидатів на merge з finance folders по title.
  useEffect(() => {
    const title = form.title.trim();
    if (title.length < 2) {
      setMergeCandidates([]);
      setMergeFolderId(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/projects/match-finance-folders?title=${encodeURIComponent(title)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const json = await res.json();
        setMergeCandidates(json.data ?? []);
      } catch {
        /* aborted */
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [form.title]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Валідація кроку перед "Далі": step 1 — title required; step 2 — client required.
  function canAdvance(): { ok: boolean; reason?: string } {
    if (step === 1) {
      if (!form.title.trim()) return { ok: false, reason: "Вкажіть назву" };
      return { ok: true };
    }
    if (step === 2) {
      if (!client) return { ok: false, reason: "Вкажіть клієнта" };
      return { ok: true };
    }
    return { ok: true };
  }

  function handleNext() {
    setError(null);
    const v = canAdvance();
    if (!v.ok) {
      setError(v.reason ?? "Заповніть обов'язкові поля");
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }

  function handleBack() {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function handleSubmit() {
    if (!client) {
      setError("Вкажіть клієнта (кр. 2)");
      setStep(2);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const clientFields =
        client.mode === "counterparty"
          ? { clientCounterpartyId: client.id, clientName: client.name }
          : { clientName: client.name };
      const managerFields: { managerId?: string; managerName?: string } = (() => {
        if (!manager) return {};
        if (manager.mode === "user") return { managerId: manager.id };
        return { managerName: manager.name };
      })();
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          code: form.code.trim() || undefined,
          type: form.type.trim() || undefined,
          description: form.description.trim() || undefined,
          address: form.address.trim() || undefined,
          authorName: form.authorName.trim() || undefined,
          totalBudget: form.totalBudget ? parseFloat(form.totalBudget) : 0,
          startDate: form.startDate || undefined,
          expectedEndDate: form.expectedEndDate || undefined,
          mergeFinanceFolderId: mergeFolderId || undefined,
          ...clientFields,
          ...managerFields,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка створення");
      }
      const { data } = await res.json();
      router.push(`/admin-v2/projects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка створення");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <Link
        href="/admin-v2/projects"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-95"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> До списку проєктів
      </Link>

      <section className="flex flex-col gap-2">
        <span
          className="text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          СТВОРЕННЯ
        </span>
        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Новий проєкт
        </h1>
        <p className="text-[14px]" style={{ color: T.textSecondary }}>
          Крок {step} з 3 · {STEPS[step - 1].label}
        </p>
      </section>

      <StepIndicator currentStep={step} onJump={(s) => setStep(s)} />

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 3) void handleSubmit();
          else handleNext();
        }}
        className="flex flex-col gap-5 rounded-2xl p-6"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {step === 1 && (
          <StepOne
            form={form}
            update={update}
            mergeCandidates={mergeCandidates}
            mergeFolderId={mergeFolderId}
            setMergeFolderId={setMergeFolderId}
          />
        )}
        {step === 2 && (
          <StepTwo
            form={form}
            update={update}
            client={client}
            setClient={setClient}
            manager={manager}
            setManager={setManager}
          />
        )}
        {step === 3 && (
          <StepThree
            form={form}
            update={update}
            client={client}
            manager={manager}
            mergeCandidates={mergeCandidates}
            mergeFolderId={mergeFolderId}
          />
        )}

        <div
          className="flex items-center justify-between gap-2 pt-2"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textSecondary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <ArrowLeft size={14} /> Назад
            </button>
          ) : (
            <Link
              href="/admin-v2/projects"
              className="rounded-xl px-4 py-3 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              Скасувати
            </Link>
          )}

          {step < 3 ? (
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-sm font-bold text-white"
              style={{ backgroundColor: T.accentPrimary }}
            >
              Далі <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
              {loading ? "Створення…" : "Створити проєкт"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ---------- Step indicator ---------- */

function StepIndicator({
  currentStep,
  onJump,
}: {
  currentStep: Step;
  onJump: (s: Step) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      {STEPS.map((s, i) => {
        const done = currentStep > s.n;
        const active = currentStep === s.n;
        const reachable = s.n <= currentStep;
        const Icon = s.icon;
        return (
          <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => reachable && onJump(s.n)}
              disabled={!reachable}
              className="flex items-center gap-2 min-w-0"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0"
                style={{
                  backgroundColor: done
                    ? T.success
                    : active
                      ? T.accentPrimary
                      : T.panel,
                  color: done || active ? "#FFFFFF" : T.textMuted,
                  border: `1px solid ${
                    done ? T.success : active ? T.accentPrimary : T.borderSoft
                  }`,
                }}
              >
                {done ? <Check size={13} /> : <Icon size={13} />}
              </span>
              <span
                className="text-[12px] font-semibold truncate"
                style={{
                  color: active ? T.textPrimary : T.textMuted,
                }}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                className="flex-1 h-0.5 rounded-full"
                style={{
                  backgroundColor: currentStep > s.n ? T.success : T.borderSoft,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Step 1: Title + Type ---------- */

function StepOne({
  form,
  update,
  mergeCandidates,
  mergeFolderId,
  setMergeFolderId,
}: {
  form: { title: string; code: string; type: string; description: string };
  update: (k: "title" | "code" | "type" | "description", v: string) => void;
  mergeCandidates: MergeCandidate[];
  mergeFolderId: string | null;
  setMergeFolderId: (id: string | null) => void;
}) {
  return (
    <>
      <Field label="Назва проєкту" required>
        <input
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          required
          autoFocus
          placeholder="Будинок на Липовій, 15"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>

      {mergeCandidates.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl px-4 py-3"
          style={{
            backgroundColor: T.violetSoft,
            border: `1px solid ${T.violet}55`,
          }}
        >
          <div className="flex items-center gap-2">
            <Link2 size={14} style={{ color: T.violet }} />
            <span
              className="text-[12px] font-semibold"
              style={{ color: T.textPrimary }}
            >
              Знайдено існуючу папку фінансування
            </span>
          </div>
          <p className="text-[11px]" style={{ color: T.textSecondary }}>
            Можеш об'єднати — операції з тієї папки автоматично потраплять у
            цей проект.
          </p>
          <div className="flex flex-col gap-1.5">
            {mergeCandidates.map((c) => {
              const selected = mergeFolderId === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setMergeFolderId(selected ? null : c.id)}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12px] transition active:scale-[0.99]"
                  style={{
                    backgroundColor: selected ? T.violet + "33" : T.panelSoft,
                    border: `1px solid ${selected ? T.violet : T.borderSoft}`,
                    color: T.textPrimary,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      readOnly
                      checked={selected}
                      className="pointer-events-none"
                    />
                    <span className="font-medium">{c.name}</span>
                  </span>
                  <span style={{ color: T.textMuted }}>{c.entryCount} операцій</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Код (опц.)">
          <input
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
            placeholder="PRJ-2026-001 (авто)"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none tabular-nums"
            style={inputStyle}
          />
          <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>
            Згенерується автоматично якщо порожньо
          </p>
        </Field>
        <Field label="Тип (опц.)">
          <input
            list="type-presets-list"
            value={form.type}
            onChange={(e) => update("type", e.target.value)}
            placeholder="Житло / Комерція / ..."
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={inputStyle}
          />
          <datalist id="type-presets-list">
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
          placeholder="Стислий опис: масштаб, особливості, очікування"
          className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>
    </>
  );
}

/* ---------- Step 2: People + Address ---------- */

function StepTwo({
  form,
  update,
  client,
  setClient,
  manager,
  setManager,
}: {
  form: { address: string; authorName: string };
  update: (k: "address" | "authorName", v: string) => void;
  client: ProjectClientValue;
  setClient: (v: ProjectClientValue) => void;
  manager: ProjectManagerValue;
  setManager: (v: ProjectManagerValue) => void;
}) {
  return (
    <>
      <Field label="Адреса об'єкта">
        <input
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="Львів, вул. Орлика 12"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>

      <Field label="Клієнт" required>
        <ProjectClientPicker value={client} onChange={setClient} required />
        <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>
          Контрагент з книги або просто ім'я текстом
        </p>
      </Field>

      <Field label="Менеджер">
        <ProjectManagerPicker value={manager} onChange={setManager} />
        <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>
          User з логіном, співробітник штату або вільний текст
        </p>
      </Field>

      <Field label="Автор проекту (хто заводить)">
        <input
          value={form.authorName}
          onChange={(e) => update("authorName", e.target.value)}
          placeholder="Хто заводить у систему"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
      </Field>
    </>
  );
}

/* ---------- Step 3: Dates + Budget + Review ---------- */

function StepThree({
  form,
  update,
  client,
  manager,
  mergeCandidates,
  mergeFolderId,
}: {
  form: {
    title: string;
    code: string;
    type: string;
    description: string;
    address: string;
    totalBudget: string;
    startDate: string;
    expectedEndDate: string;
  };
  update: (k: "startDate" | "expectedEndDate" | "totalBudget", v: string) => void;
  client: ProjectClientValue;
  manager: ProjectManagerValue;
  mergeCandidates: MergeCandidate[];
  mergeFolderId: string | null;
}) {
  const merged = mergeCandidates.find((c) => c.id === mergeFolderId);

  return (
    <>
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

      <Field label="Орієнтовний бюджет, ₴">
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.totalBudget}
          onChange={(e) => update("totalBudget", e.target.value)}
          placeholder="0"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none tabular-nums"
          style={inputStyle}
        />
      </Field>

      {/* Review summary */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Info size={14} style={{ color: T.accentPrimary }} />
          <span
            className="text-[12px] font-bold tracking-wider uppercase"
            style={{ color: T.textPrimary }}
          >
            Перевірте перед створенням
          </span>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[12px]">
          <ReviewItem label="Назва" value={form.title || "—"} />
          <ReviewItem label="Код" value={form.code || "Авто"} />
          <ReviewItem label="Тип" value={form.type || "—"} />
          <ReviewItem label="Адреса" value={form.address || "—"} />
          <ReviewItem label="Клієнт" value={client?.name ?? "—"} />
          <ReviewItem
            label="Менеджер"
            value={manager?.name ?? "не призначено"}
          />
          <ReviewItem
            label="Бюджет"
            value={form.totalBudget ? `${form.totalBudget} ₴` : "0 ₴"}
          />
          <ReviewItem
            label="Початок"
            value={form.startDate || "не задано"}
          />
          <ReviewItem
            label="Дедлайн"
            value={form.expectedEndDate || "не задано"}
          />
        </dl>
        {merged && (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]"
            style={{ backgroundColor: T.violetSoft, color: T.violet }}
          >
            <Link2 size={12} />
            Об'єднується з папкою «{merged.name}» ({merged.entryCount} операцій)
          </div>
        )}
      </div>
    </>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt
        className="text-[10px] uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </dt>
      <dd
        className="text-[12px] font-semibold truncate"
        style={{ color: T.textPrimary }}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---------- Shared ---------- */

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
