"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Play, Lock } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ActivationReadiness = {
  ok: boolean;
  checks: {
    hasEstimate: boolean;
    hasLockedVersion: boolean;
    hasSection: boolean;
    hasWork: boolean;
    allWorkHaveForeman: boolean;
  };
  missingForemanItems: { id: string; description: string }[];
  reasons: string[];
};

type CompletionReadiness = {
  ok: boolean;
  totalSections: number;
  incompleteSections: { id: string; name: string }[];
  reasons: string[];
};

const ACTIVATE_LABELS: Record<string, string> = {
  hasEstimate: "Є кошторис",
  hasLockedVersion: "Кошторис заморожено",
  hasSection: "Є хоча б один розділ",
  hasWork: "Є хоча б одна робота",
  allWorkHaveForeman: "Усі роботи мають відповідального",
};

/**
 * P1/P4/P11: кнопка життєвого циклу проєкту.
 *   DRAFT / ON_HOLD → «Запустити» (з чеклистом готовності + датою старту);
 *   ACTIVE          → «Закрити» (з перевіркою завершення розділів).
 * Самодостатня: підтягує статус + readiness через GET .../activate.
 */
export function ProjectLifecycleButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activation, setActivation] = useState<ActivationReadiness | null>(null);
  const [completion, setCompletion] = useState<CompletionReadiness | null>(null);
  const [actualStartDate, setActualStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/projects/${projectId}/activate`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.data) return;
        setStatus(d.data.status);
        setActivation(d.data.readiness);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  const isClosable = status === "ACTIVE";
  const isStartable = status === "DRAFT" || status === "ON_HOLD";
  if (!isClosable && !isStartable) return null;

  async function openDialog() {
    setError(null);
    setOpen(true);
    if (isClosable) {
      const r = await fetch(`/api/admin/projects/${projectId}/complete`);
      if (r.ok) setCompletion((await r.json()).data.readiness);
    } else {
      const r = await fetch(`/api/admin/projects/${projectId}/activate`);
      if (r.ok) setActivation((await r.json()).data.readiness);
    }
  }

  async function doActivate() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStartDate: new Date(actualStartDate).toISOString(),
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        if (d?.readiness) setActivation(d.readiness);
        throw new Error(d?.message ?? "Не вдалося запустити проєкт");
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function doComplete() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/complete`, {
        method: "POST",
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        if (d?.readiness) setCompletion(d.readiness);
        throw new Error(d?.message ?? "Не вдалося закрити проєкт");
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
        style={{
          backgroundColor: isClosable ? T.panelElevated : T.accentPrimary,
          color: isClosable ? T.textPrimary : "#fff",
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        {isClosable ? <Lock size={16} /> : <Play size={16} />}
        {isClosable ? "Закрити проєкт" : "Запустити проєкт"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-3" style={{ color: T.textPrimary }}>
              {isClosable ? "Закриття проєкту" : "Запуск проєкту"}
            </h3>

            {isClosable ? (
              <CompletionChecklist data={completion} />
            ) : (
              <ActivationChecklist data={activation} />
            )}

            {isStartable && (
              <label className="block mt-4 text-sm" style={{ color: T.textSecondary }}>
                Фактична дата старту
                <input
                  type="date"
                  value={actualStartDate}
                  onChange={(e) => setActualStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderStrong}`,
                  }}
                />
              </label>
            )}

            {error && (
              <p className="mt-3 text-sm" style={{ color: "#ef4444" }}>
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={isClosable ? doComplete : doActivate}
                disabled={busy || (isClosable ? !completion?.ok : !activation?.ok)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: isClosable ? "#dc2626" : T.accentPrimary,
                  color: "#fff",
                }}
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {isClosable ? "Закрити" : "Запустити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ActivationChecklist({ data }: { data: ActivationReadiness | null }) {
  if (!data) return <Loading />;
  return (
    <ul className="space-y-2">
      {Object.entries(ACTIVATE_LABELS).map(([key, label]) => {
        const ok = data.checks[key as keyof ActivationReadiness["checks"]];
        return (
          <li key={key} className="flex items-center gap-2 text-sm" style={{ color: T.textPrimary }}>
            {ok ? (
              <CheckCircle2 size={16} color="#22c55e" />
            ) : (
              <XCircle size={16} color="#ef4444" />
            )}
            {label}
          </li>
        );
      })}
      {data.missingForemanItems.length > 0 && (
        <li className="text-xs mt-1" style={{ color: T.textSecondary }}>
          Без відповідального:{" "}
          {data.missingForemanItems.map((i) => i.description).join(", ")}
        </li>
      )}
    </ul>
  );
}

function CompletionChecklist({ data }: { data: CompletionReadiness | null }) {
  if (!data) return <Loading />;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm" style={{ color: T.textPrimary }}>
        {data.ok ? (
          <CheckCircle2 size={16} color="#22c55e" />
        ) : (
          <XCircle size={16} color="#ef4444" />
        )}
        {data.ok
          ? `Усі розділи завершені (${data.totalSections})`
          : `Незавершені розділи: ${data.incompleteSections.length} з ${data.totalSections}`}
      </p>
      {data.incompleteSections.length > 0 && (
        <ul className="text-xs pl-6 list-disc" style={{ color: T.textSecondary }}>
          {data.incompleteSections.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm py-4" style={{ color: T.textSecondary }}>
      <Loader2 size={15} className="animate-spin" /> Перевірка готовності…
    </div>
  );
}
