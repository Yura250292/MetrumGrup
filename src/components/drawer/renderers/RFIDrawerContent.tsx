"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Clock, Paperclip } from "lucide-react";
import type { RFIPriority, RFIStatus, Role } from "@prisma/client";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import type { RendererProps } from "../types";

const STATUS_LABEL: Record<RFIStatus, string> = {
  OPEN: "Відкритий",
  IN_PROGRESS: "В роботі",
  ANSWERED: "Відповідь отримана",
  CLOSED: "Закритий",
  CANCELLED: "Скасований",
};

const STATUS_COLOR: Record<RFIStatus, string> = {
  OPEN: "bg-sky-100 text-sky-800 border-sky-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  ANSWERED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CLOSED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  CANCELLED: "bg-rose-100 text-rose-800 border-rose-200",
};

const PRIORITY_LABEL: Record<RFIPriority, string> = {
  LOW: "Низький",
  NORMAL: "Звичайний",
  HIGH: "Високий",
  URGENT: "Критичний",
};

const PRIORITY_COLOR: Record<RFIPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-700",
  NORMAL: "bg-sky-100 text-sky-800",
  HIGH: "bg-amber-100 text-amber-900",
  URGENT: "bg-rose-100 text-rose-800",
};

type Person = { id: string; name: string | null; avatar?: string | null };

type Attachment = {
  id: string;
  fileName: string;
  r2Key: string;
  mimeType: string;
  fileSize: number;
  context: string;
  uploadedAt: string;
  uploadedBy: { id: string; name: string | null };
};

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: Person;
};

type RFIDetail = {
  id: string;
  number: string;
  subject: string;
  question: string;
  status: RFIStatus;
  priority: RFIPriority;
  askedAt: string;
  dueAt: string | null;
  answer: string | null;
  answeredAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  impactsSchedule: boolean;
  impactsBudget: boolean;
  project: { id: string; title: string };
  askedBy: Person;
  assignedTo: Person | null;
  answeredBy: Person | null;
  attachments: Attachment[];
  comments: Comment[];
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function dueCountdown(dueAt: string | null, status: RFIStatus): { label: string; tone: "neutral" | "warn" | "danger" } | null {
  if (!dueAt || status === "ANSWERED" || status === "CLOSED" || status === "CANCELLED") return null;
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const diffH = Math.round((due - now) / (3600 * 1000));
  if (diffH < 0) return { label: `Прострочено на ${-diffH} год`, tone: "danger" };
  if (diffH < 24) return { label: `Лишилось ${diffH} год`, tone: "warn" };
  return { label: `Лишилось ~${Math.round(diffH / 24)} днів`, tone: "neutral" };
}

export function RFIDrawerContent({ id }: RendererProps) {
  const drawer = useDrillDown();
  const isMobile = useIsMobile();
  const [data, setData] = useState<RFIDetail | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerDraft, setAnswerDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [rfiRes, sessionRes] = await Promise.all([
        fetch(`/api/admin/rfis/${id}`),
        fetch("/api/auth/session"),
      ]);
      if (rfiRes.ok) {
        const json = (await rfiRes.json()) as { rfi: RFIDetail };
        setData(json.rfi);
        drawer.setTopBreadcrumb(json.rfi.number);
      }
      if (sessionRes.ok) {
        const sj = (await sessionRes.json()) as { user?: { id?: string; role?: Role } };
        setRole(sj.user?.role ?? null);
        setCurrentUserId(sj.user?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitAnswer(): Promise<void> {
    if (!answerDraft.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/rfis/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answerDraft }),
    });
    setBusy(false);
    if (res.ok) {
      setAnswerDraft("");
      await load();
    }
  }

  async function close(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/rfis/${id}/close`, { method: "POST" });
    setBusy(false);
    if (res.ok) await load();
  }

  async function cancelRfi(): Promise<void> {
    const reason = window.prompt("Причина скасування?");
    if (reason === null || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/rfis/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (res.ok) await load();
  }

  async function postComment(): Promise<void> {
    if (!commentDraft.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/rfis/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentDraft }),
    });
    setBusy(false);
    if (res.ok) {
      setCommentDraft("");
      await load();
    }
  }

  const canAnswer =
    !!data &&
    !!role &&
    (data.status === "OPEN" || data.status === "IN_PROGRESS") &&
    (role === "SUPER_ADMIN" || role === "MANAGER" || (data.assignedTo?.id && data.assignedTo.id === currentUserId));

  const canClose =
    !!data &&
    !!role &&
    data.status === "ANSWERED" &&
    (role === "SUPER_ADMIN" || role === "MANAGER" || data.askedBy.id === currentUserId || data.assignedTo?.id === currentUserId);

  const canCancel =
    !!data &&
    !!role &&
    data.status !== "CANCELLED" &&
    data.status !== "CLOSED" &&
    (role === "SUPER_ADMIN" || role === "MANAGER" || data.askedBy.id === currentUserId);

  const countdown = data ? dueCountdown(data.dueAt, data.status) : null;
  const questionAttachments = data?.attachments.filter((a) => a.context === "QUESTION") ?? [];
  const answerAttachments = data?.attachments.filter((a) => a.context === "ANSWER") ?? [];

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 p-6">
            <Loader2 className="animate-spin" size={16} /> Завантаження…
          </div>
        )}
        {!loading && !data && <div className="p-6 text-zinc-500">RFI не знайдено.</div>}
        {data && (
          <div className="p-6 space-y-5">
            <div>
              <div className="text-xs text-zinc-500 mb-1">
                {data.number} · {STATUS_LABEL[data.status]}
              </div>
              <h2 className="text-lg font-medium text-zinc-900">{data.subject}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[data.status]}`}>
                {STATUS_LABEL[data.status]}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[data.priority]}`}>
                {PRIORITY_LABEL[data.priority]}
              </span>
              {data.impactsSchedule && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                  впливає на графік
                </span>
              )}
              {data.impactsBudget && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-800">
                  впливає на бюджет
                </span>
              )}
              {countdown && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                    countdown.tone === "danger"
                      ? "bg-rose-50 text-rose-800"
                      : countdown.tone === "warn"
                        ? "bg-amber-50 text-amber-900"
                        : "bg-zinc-50 text-zinc-700"
                  }`}
                >
                  <Clock size={12} /> {countdown.label}
                </span>
              )}
            </div>

            <div className="text-sm text-zinc-700">
              <button
                type="button"
                onClick={() => drawer.open({ type: "project", id: data.project.id })}
                className="text-zinc-700 hover:underline"
              >
                {data.project.title}
              </button>
              {" · "}
              Запитав{" "}
              <button
                type="button"
                onClick={() => drawer.open({ type: "user", id: data.askedBy.id })}
                className="text-zinc-700 hover:underline"
              >
                {data.askedBy.name ?? "—"}
              </button>
              {" · "}
              <span className="text-zinc-500">{formatDate(data.askedAt)}</span>
              {data.assignedTo && (
                <>
                  {" → "}
                  <button
                    type="button"
                    onClick={() => drawer.open({ type: "user", id: data.assignedTo!.id })}
                    className="text-zinc-700 hover:underline"
                  >
                    {data.assignedTo.name ?? "—"}
                  </button>
                </>
              )}
            </div>

            <section>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Питання</h3>
              <p className="text-sm text-zinc-800 whitespace-pre-wrap">{data.question}</p>
              {questionAttachments.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {questionAttachments.map((a) => (
                    <li key={a.id} className="text-sm flex items-center gap-2">
                      <Paperclip size={14} className="text-zinc-400" />
                      <span>{a.fileName}</span>
                      <span className="text-xs text-zinc-400">
                        {(a.fileSize / 1024).toFixed(0)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Відповідь</h3>
              {data.answer ? (
                <div>
                  <p className="text-sm text-zinc-800 whitespace-pre-wrap">{data.answer}</p>
                  <div className="text-xs text-zinc-500 mt-2">
                    {data.answeredBy && (
                      <button
                        type="button"
                        onClick={() => drawer.open({ type: "user", id: data.answeredBy!.id })}
                        className="hover:underline"
                      >
                        {data.answeredBy.name ?? "—"}
                      </button>
                    )}
                    {" · "}
                    {formatDate(data.answeredAt)}
                  </div>
                  {answerAttachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {answerAttachments.map((a) => (
                        <li key={a.id} className="text-sm flex items-center gap-2">
                          <Paperclip size={14} className="text-zinc-400" />
                          <span>{a.fileName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : canAnswer ? (
                <div className="space-y-2">
                  <textarea
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    placeholder="Введіть відповідь…"
                    rows={4}
                    className="w-full border border-zinc-200 rounded-lg p-2 text-sm focus:outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => void submitAnswer()}
                    disabled={busy || !answerDraft.trim()}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm disabled:opacity-40"
                  >
                    {busy ? "Відправка…" : "Надіслати відповідь"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-400 italic">Очікує відповіді…</p>
              )}
            </section>

            <section>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                Коментарі ({data.comments.length})
              </h3>
              <ul className="space-y-3">
                {data.comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-baseline gap-2">
                      <button
                        type="button"
                        onClick={() => drawer.open({ type: "user", id: c.author.id })}
                        className="font-medium text-zinc-800 hover:underline"
                      >
                        {c.author.name ?? "—"}
                      </button>
                      <span className="text-xs text-zinc-400">{formatDate(c.createdAt)}</span>
                    </div>
                    <p className="text-zinc-700 whitespace-pre-wrap mt-1">{c.body}</p>
                  </li>
                ))}
                {data.comments.length === 0 && <li className="text-sm text-zinc-400 italic">Коментарів поки немає.</li>}
              </ul>
              {data.status !== "CANCELLED" && data.status !== "CLOSED" && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Додати коментар…"
                    rows={2}
                    className="w-full border border-zinc-200 rounded-lg p-2 text-sm focus:outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => void postComment()}
                    disabled={busy || !commentDraft.trim()}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-sm hover:bg-zinc-50 disabled:opacity-40"
                  >
                    Надіслати
                  </button>
                </div>
              )}
            </section>

            {(canClose || canCancel) && (
              <section className="border-t border-zinc-100 pt-4 flex flex-wrap gap-2">
                {canClose && (
                  <button
                    type="button"
                    onClick={() => void close()}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-40"
                  >
                    Закрити RFI
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => void cancelRfi()}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    <AlertCircle size={14} /> Скасувати
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </DrawerBody>
    </DrawerLayout>
  );
}
