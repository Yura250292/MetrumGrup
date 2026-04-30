"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, X, Search, Check, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Candidate = {
  id: string;
  name: string;
  entryCount: number;
  subfolderCount: number;
};

/**
 * Кнопка + модалка для привʼязки існуючої FINANCE-папки до існуючого проекту.
 * Корисно коли проект створили БЕЗ обʼєднання, але потім зрозуміли що є окрема
 * папка фінансів зі своїми операціями. Зливає її з mirror папкою проекту.
 */
export function LinkFinanceFolderButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(
          `/api/admin/projects/${projectId}/link-finance-folder`,
          window.location.origin,
        );
        if (q.length >= 2) url.searchParams.set("q", q);
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Помилка завантаження");
        }
        const json = await res.json();
        setCandidates(json.data ?? []);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Помилка");
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [open, q, projectId]);

  async function apply() {
    if (!picked) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/link-finance-folder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: picked }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалось привʼязати");
      }
      router.refresh();
      setOpen(false);
      setPicked(null);
      setQ("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tap-highlight-none active:scale-[0.97]"
        style={{
          backgroundColor: T.panelElevated,
          color: T.textPrimary,
          border: `1px solid ${T.borderStrong}`,
        }}
        title="Привʼязати існуючу папку фінансування"
      >
        <Link2 size={16} /> Привʼязати папку
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl shadow-2xl"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <div
              className="flex items-center justify-between gap-3 px-5 py-4"
              style={{ borderBottom: `1px solid ${T.borderSoft}` }}
            >
              <div className="flex items-center gap-2">
                <Link2 size={16} style={{ color: T.accentPrimary }} />
                <h2
                  className="text-[15px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  Привʼязати папку фінансування
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 transition hover:brightness-[0.97]"
                style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4 overflow-y-auto">
              <p className="text-[12px]" style={{ color: T.textSecondary }}>
                Обери існуючу FINANCE-папку — її підпапки і фінансові записи
                переїдуть у цей проект (mirror-папка проекту вбере усе всередину).
              </p>
              <p className="text-[10.5px]" style={{ color: T.textMuted }}>
                Тут лише <b>вільні</b> папки. Папки інших проектів (вже з mirror)
                і системні (🔒 «Проєкти», «Загальні витрати») — не показуються,
                бо вони не призначені для прямої привʼязки.
              </p>

              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                }}
              >
                <Search size={14} style={{ color: T.textMuted }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Пошук за назвою…"
                  className="flex-1 bg-transparent text-[13px] outline-none"
                  style={{ color: T.textPrimary }}
                />
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
                  style={{
                    backgroundColor: T.dangerSoft ?? "#FEE2E2",
                    color: T.danger,
                    border: `1px solid ${T.danger}55`,
                  }}
                >
                  <AlertCircle size={13} />
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 size={16} className="animate-spin" style={{ color: T.accentPrimary }} />
                  <span className="text-[12px]" style={{ color: T.textSecondary }}>
                    Завантаження…
                  </span>
                </div>
              ) : candidates.length === 0 ? (
                <div className="py-6 text-center text-[12px] flex flex-col gap-2" style={{ color: T.textMuted }}>
                  <span>
                    Немає вільних папок для привʼязки {q.length >= 2 ? "за цим запитом" : ""}.
                  </span>
                  <span className="text-[11px]">
                    Тут не показуються папки які вже привʼязані до інших проектів,
                    а також системні (з 🔒 — наприклад «Загальні витрати», «Проєкти»).
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {candidates.map((c) => {
                    const sel = picked === c.id;
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setPicked(sel ? null : c.id)}
                        className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12px] transition active:scale-[0.99]"
                        style={{
                          backgroundColor: sel
                            ? T.accentPrimary + "22"
                            : T.panelSoft,
                          border: `1px solid ${sel ? T.accentPrimary : T.borderSoft}`,
                          color: T.textPrimary,
                        }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            readOnly
                            checked={sel}
                            className="pointer-events-none"
                          />
                          <span className="font-medium truncate">{c.name}</span>
                        </span>
                        <span style={{ color: T.textMuted }}>
                          {c.entryCount} опер., {c.subfolderCount} підпапок
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 px-5 py-4"
              style={{ borderTop: `1px solid ${T.borderSoft}` }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={applying}
                className="rounded-xl px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!picked || applying}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {applying ? "Привʼязую…" : "Привʼязати"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
