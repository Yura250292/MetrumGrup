"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, Plus, Loader2, AlertCircle, FolderOpen } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  formatDuration,
  STATUS_LABELS,
  type MeetingListItem,
} from "./_components/types";

export default function MeetingsListPage() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/meetings");
        if (!res.ok) throw new Error("Не вдалося завантажити наради");
        const data = await res.json();
        setMeetings(data.meetings || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Помилка");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="flex items-center gap-2 text-2xl font-bold"
            style={{ color: T.textPrimary }}
          >
            <Mic size={24} style={{ color: T.accentPrimary }} />
            Наради
          </h1>
          <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
            Запис, транскрипція та AI-підсумки ділових зустрічей
          </p>
        </div>
        <Link
          href="/admin-v2/meetings/new"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: T.accentPrimary }}
        >
          <Plus size={16} /> Нова нарада
        </Link>
      </div>

      {loading && (
        <div
          className="flex items-center justify-center rounded-xl p-12"
          style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Loader2 size={24} className="animate-spin" style={{ color: T.textMuted }} />
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl p-4"
          style={{ background: T.dangerSoft, color: T.danger }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {!loading && !error && meetings.length === 0 && (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Mic size={40} className="mx-auto mb-3" style={{ color: T.textMuted }} />
          <p className="text-sm font-medium" style={{ color: T.textPrimary }}>
            Ще немає жодної наради
          </p>
          <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
            Натисніть «Нова нарада», щоб записати першу
          </p>
        </div>
      )}

      {!loading && meetings.length > 0 && (
        <div className="flex flex-col gap-2">
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={`/admin-v2/meetings/${m.id}`}
              className="flex items-center gap-4 rounded-xl p-4 transition hover:brightness-[0.98]"
              style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ background: T.accentPrimarySoft, color: T.accentPrimary }}
              >
                <Mic size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: T.textPrimary }}
                >
                  {m.title}
                </p>
                <div
                  className="mt-0.5 flex items-center gap-3 text-xs"
                  style={{ color: T.textMuted }}
                >
                  <span className="flex items-center gap-1">
                    <FolderOpen size={12} /> {m.project.title}
                  </span>
                  <span>{new Date(m.recordedAt).toLocaleString("uk-UA")}</span>
                  {m.audioDurationMs && (
                    <span>{formatDuration(m.audioDurationMs)}</span>
                  )}
                </div>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background:
                    m.status === "READY"
                      ? T.successSoft
                      : m.status === "FAILED"
                      ? T.dangerSoft
                      : T.panelElevated,
                  color:
                    m.status === "READY"
                      ? T.success
                      : m.status === "FAILED"
                      ? T.danger
                      : T.textSecondary,
                }}
              >
                {STATUS_LABELS[m.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
