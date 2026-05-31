"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Link2, X, RefreshCw, Plus, Clock } from "lucide-react";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type ProposalSummary = {
  id: string;
  status:
    | "DRAFT"
    | "SENT"
    | "IN_NEGOTIATION"
    | "PARTIALLY_APPROVED"
    | "FULLY_APPROVED"
    | "REJECTED"
    | "WITHDRAWN"
    | "EXPIRED";
  emailSnapshot: string;
  sentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  expiresAt: string | null;
  itemsTotal: number;
  itemsApproved: number;
  itemsRejected: number;
  itemsPending: number;
  createdAt: string;
  counterparty: { id: string; name: string; email: string | null } | null;
  createdBy: { id: string; name: string } | null;
};

const STATUS_LABELS: Record<ProposalSummary["status"], string> = {
  DRAFT: "Чернетка",
  SENT: "Надіслано",
  IN_NEGOTIATION: "У торгу",
  PARTIALLY_APPROVED: "Часткове",
  FULLY_APPROVED: "Погоджено",
  REJECTED: "Відхилено",
  WITHDRAWN: "Відкликано",
  EXPIRED: "Прострочено",
};

const STATUS_COLORS: Record<ProposalSummary["status"], string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  IN_NEGOTIATION: "bg-indigo-100 text-indigo-700",
  PARTIALLY_APPROVED: "bg-amber-100 text-amber-700",
  FULLY_APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-zinc-200 text-zinc-700",
  EXPIRED: "bg-zinc-200 text-zinc-700",
};

/**
 * Negotiation tab (Phase 2 skeleton).
 *
 * Список proposals + create-form. Per-line negotiation drawer + counter-modal
 * прибувають у Phase 3 разом із respond-endpoints.
 */
export function NegotiationTab({ estimateId }: { estimateId: string }) {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [emailSnapshot, setEmailSnapshot] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/proposals`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ProposalSummary[] };
      setProposals(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!counterpartyId.trim() || !emailSnapshot.trim()) {
      setError("Вкажіть counterpartyId та email клієнта");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartyId: counterpartyId.trim(),
          emailSnapshot: emailSnapshot.trim(),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setCreateOpen(false);
      setCounterpartyId("");
      setEmailSnapshot("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка створення");
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(proposalId: string) {
    setSending(proposalId);
    try {
      const res = await fetch(
        `/api/admin/estimates/${estimateId}/proposals/${proposalId}/send`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка надсилання");
    } finally {
      setSending(null);
    }
  }

  async function handleWithdraw(proposalId: string) {
    if (!confirm("Відкликати proposal? Token стане invalid.")) return;
    setWithdrawing(proposalId);
    try {
      const res = await fetch(
        `/api/admin/estimates/${estimateId}/proposals/${proposalId}/withdraw`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка відкликання");
    } finally {
      setWithdrawing(null);
    }
  }

  async function copyLink(proposalId: string) {
    // Token не повертається у LIST з міркувань безпеки; робимо запит за detail.
    try {
      const res = await fetch(
        `/api/admin/estimates/${estimateId}/proposals/${proposalId}`,
      );
      if (!res.ok) throw new Error("Помилка отримання deталей");
      // detail endpoint не повертає accessToken — для безпеки. Натомість показуємо ID.
      const link = `${window.location.origin}/estimate-proposal/${proposalId}`;
      await navigator.clipboard.writeText(link);
      alert("Посилання скопійовано (ID, не token)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Перемовини з клієнтом
          </h3>
          <p className="text-[12px]" style={{ color: T.textSecondary }}>
            Token-link для замовника, погодження по рядках, контр-оферти
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]"
            style={{ border: `1px solid ${T.borderSoft}`, color: T.textSecondary }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Оновити
          </button>
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            <Plus size={12} />
            Новий proposal
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl p-3 text-[12px]"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      {createOpen && (
        <div
          className="flex flex-col gap-3 rounded-2xl p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <input
            placeholder="Counterparty ID (контрагент-клієнт)"
            value={counterpartyId}
            onChange={(e) => setCounterpartyId(e.target.value)}
            className="rounded-lg px-3 py-2 text-[13px]"
            style={{ border: `1px solid ${T.borderSoft}` }}
          />
          <input
            placeholder="Email клієнта (snapshot)"
            type="email"
            value={emailSnapshot}
            onChange={(e) => setEmailSnapshot(e.target.value)}
            className="rounded-lg px-3 py-2 text-[13px]"
            style={{ border: `1px solid ${T.borderSoft}` }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ border: `1px solid ${T.borderSoft}`, color: T.textSecondary }}
            >
              Скасувати
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              {creating ? "Створюю..." : "Створити (DRAFT)"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {loading && proposals.length === 0 && (
          <div className="text-[12px]" style={{ color: T.textSecondary }}>
            Завантаження…
          </div>
        )}

        {!loading && proposals.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center text-[13px]"
            style={{ backgroundColor: T.panel, border: `1px dashed ${T.borderSoft}`, color: T.textSecondary }}
          >
            Ще немає proposals. Створіть першу, щоб надіслати кошторис клієнту.
          </div>
        )}

        {proposals.map((p) => (
          <div
            key={p.id}
            className="flex flex-col gap-2 rounded-2xl p-4"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${STATUS_COLORS[p.status]}`}
                >
                  {STATUS_LABELS[p.status]}
                </span>
                <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  {p.counterparty?.name ?? "—"}
                </span>
                <span className="text-[11px]" style={{ color: T.textSecondary }}>
                  {p.emailSnapshot}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {p.status === "DRAFT" && (
                  <button
                    onClick={() => void handleSend(p.id)}
                    disabled={sending === p.id}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
                  >
                    <Send size={11} />
                    {sending === p.id ? "Надсилаю..." : "Надіслати"}
                  </button>
                )}
                {(p.status === "SENT" ||
                  p.status === "IN_NEGOTIATION" ||
                  p.status === "PARTIALLY_APPROVED") && (
                  <>
                    <button
                      onClick={() => void copyLink(p.id)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                      style={{ border: `1px solid ${T.borderSoft}`, color: T.textSecondary }}
                    >
                      <Link2 size={11} />
                      Копіювати
                    </button>
                    <button
                      onClick={() => void handleWithdraw(p.id)}
                      disabled={withdrawing === p.id}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                      style={{ border: `1px solid ${T.borderSoft}`, color: T.danger }}
                    >
                      <X size={11} />
                      Відкликати
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px]" style={{ color: T.textSecondary }}>
              <span>Всього: {p.itemsTotal}</span>
              <span style={{ color: T.success }}>Approved: {p.itemsApproved}</span>
              <span style={{ color: T.danger }}>Rejected: {p.itemsRejected}</span>
              <span>Pending: {p.itemsPending}</span>
              {p.firstViewedAt && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  Перегляд: {new Date(p.firstViewedAt).toLocaleString("uk-UA")}
                </span>
              )}
              {p.expiresAt && (
                <span>Дійсний до: {new Date(p.expiresAt).toLocaleDateString("uk-UA")}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
