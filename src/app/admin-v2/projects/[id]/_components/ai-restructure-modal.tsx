"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, Sparkles, Check, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Move = { stageId: string; parentRef: string | null };
type NewGroup = { tempId: string; name: string; parentRef: string | null };

type StageLite = { id: string; name: string };

type Proposal = {
  moves: Move[];
  newGroups: NewGroup[];
  stagesCount: number;
  moveCount: number;
  newGroupCount: number;
};

type Phase = "loading" | "preview" | "applying" | "done";

export function AiRestructureModal({
  projectId,
  stages,
  onClose,
  onApplied,
}: {
  projectId: string;
  stages: StageLite[];
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ applied: number; created: number } | null>(null);

  const propose = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/stages/ai-restructure`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "propose" }),
        },
      );
      const json = (await res.json()) as
        | { data: Proposal }
        | { error: string };
      if (!res.ok || !("data" in json)) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setProposal(json.data);
      setPhase("preview");
    } catch (err) {
      console.error("[ai-restructure propose] failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setPhase("preview");
    }
  }, [projectId]);

  useEffect(() => {
    void propose();
  }, [propose]);

  async function apply() {
    if (!proposal) return;
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/stages/ai-restructure`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "apply",
            moves: proposal.moves,
            newGroups: proposal.newGroups,
          }),
        },
      );
      const json = (await res.json()) as
        | { data: { applied: number; created: number } }
        | { error: string };
      if (!res.ok || !("data" in json)) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setResult(json.data);
      setPhase("done");
      await onApplied();
    } catch (err) {
      console.error("[ai-restructure apply] failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setPhase("preview");
    }
  }

  const stageById = new Map(stages.map((s) => [s.id, s.name]));
  const tempNameById = new Map<string, string>(
    proposal?.newGroups.map((g) => [`new:${g.tempId}`, g.name]) ?? [],
  );

  function describeParent(ref: string | null): string {
    if (ref === null) return "корінь";
    if (ref.startsWith("existing:")) {
      const id = ref.slice("existing:".length);
      return stageById.get(id) ?? "(невідомий етап)";
    }
    if (ref.startsWith("new:")) {
      return `новий: ${tempNameById.get(ref) ?? ref}`;
    }
    return ref;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex max-h-[80vh] w-full max-w-[720px] flex-col rounded-2xl shadow-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <header
            className="flex items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: T.borderSoft }}
          >
            <div className="min-w-0">
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.violet }}
              >
                <Sparkles size={11} />
                <span>AI</span>
              </div>
              <h3
                className="mt-1 text-[16px] font-bold"
                style={{ color: T.textPrimary }}
              >
                Побудувати дерево етапів
              </h3>
              <p
                className="mt-1 text-[12px]"
                style={{ color: T.textSecondary }}
              >
                AI проаналізує назви і запропонує згрупувати схожі етапи під батьківські категорії.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:brightness-95"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              aria-label="Закрити"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {phase === "loading" && (
              <div
                className="flex flex-col items-center justify-center gap-2 py-8"
                style={{ color: T.textMuted }}
              >
                <Loader2 size={20} className="animate-spin" />
                <span className="text-[12px]">AI аналізує етапи…</span>
              </div>
            )}

            {error && (
              <div
                className="mb-3 flex items-start gap-2 rounded-lg border p-3 text-[12px]"
                style={{
                  backgroundColor: T.dangerSoft,
                  borderColor: T.danger + "55",
                  color: T.textPrimary,
                }}
              >
                <AlertCircle size={14} style={{ color: T.danger, flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {phase === "preview" && proposal && !error && (
              <>
                <div
                  className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-[12px]"
                  style={{
                    backgroundColor: T.panelSoft,
                    borderColor: T.borderSoft,
                    color: T.textPrimary,
                  }}
                >
                  <span>
                    Всього етапів:{" "}
                    <strong>{proposal.stagesCount}</strong>
                  </span>
                  <span style={{ color: T.textMuted }}>·</span>
                  <span>
                    Переміщень:{" "}
                    <strong style={{ color: T.accentPrimary }}>
                      {proposal.moveCount}
                    </strong>
                  </span>
                  <span style={{ color: T.textMuted }}>·</span>
                  <span>
                    Нові групи:{" "}
                    <strong style={{ color: T.violet }}>
                      {proposal.newGroupCount}
                    </strong>
                  </span>
                </div>

                {proposal.newGroups.length > 0 && (
                  <section className="mb-4">
                    <h4
                      className="mb-1.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: T.violet }}
                    >
                      Нові категорії
                    </h4>
                    <ul className="flex flex-col gap-1">
                      {proposal.newGroups.map((g) => (
                        <li
                          key={g.tempId}
                          className="rounded-lg border px-3 py-1.5 text-[12px]"
                          style={{
                            borderColor: T.borderSoft,
                            color: T.textPrimary,
                          }}
                        >
                          <span className="font-semibold">{g.name}</span>
                          <span className="ml-2 text-[10px]" style={{ color: T.textMuted }}>
                            → {describeParent(g.parentRef)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h4
                    className="mb-1.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: T.textMuted }}
                  >
                    Переміщення етапів
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {proposal.moves.map((m) => (
                      <li
                        key={m.stageId}
                        className="rounded-lg border px-3 py-1.5 text-[12px]"
                        style={{
                          borderColor: T.borderSoft,
                          color: T.textPrimary,
                        }}
                      >
                        <span className="font-medium">
                          {stageById.get(m.stageId) ?? m.stageId}
                        </span>
                        <span className="ml-2 text-[10px]" style={{ color: T.textMuted }}>
                          → {describeParent(m.parentRef)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {phase === "applying" && (
              <div
                className="flex flex-col items-center justify-center gap-2 py-8"
                style={{ color: T.textMuted }}
              >
                <Loader2 size={20} className="animate-spin" />
                <span className="text-[12px]">Застосування…</span>
              </div>
            )}

            {phase === "done" && result && (
              <div
                className="flex flex-col items-center justify-center gap-2 py-8 text-[13px]"
                style={{ color: T.success }}
              >
                <Check size={32} />
                <span>
                  Готово: переміщено <strong>{result.applied}</strong>, створено{" "}
                  <strong>{result.created}</strong> нових груп
                </span>
              </div>
            )}
          </div>

          <footer
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: T.borderSoft }}
          >
            {phase === "preview" && !error && proposal && (
              <>
                <button
                  type="button"
                  onClick={() => void propose()}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
                  style={{
                    backgroundColor: T.panelSoft,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  Перегенерувати
                </button>
                <button
                  type="button"
                  onClick={() => void apply()}
                  disabled={proposal.moveCount === 0 && proposal.newGroupCount === 0}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50"
                  style={{ backgroundColor: T.accentPrimary, color: "white" }}
                >
                  Застосувати
                </button>
              </>
            )}
            {(phase === "loading" || phase === "applying" || phase === "done") && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
                style={{ backgroundColor: T.panelSoft, color: T.textPrimary }}
              >
                {phase === "done" ? "Закрити" : "Скасувати"}
              </button>
            )}
          </footer>
        </div>
      </div>
    </>
  );
}
