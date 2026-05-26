"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Star } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { RatingStars } from "./rating-stars";

interface Review {
  id: string;
  projectId: string;
  rating: string;
  qualityScore: number;
  timelinessScore: number;
  priceScore: number;
  communicationScore: number;
  comment: string | null;
  reviewedAt: string;
  by: { id: string; name: string; avatar: string | null };
  project: { id: string; title: string; slug: string };
}

interface ProjectOption {
  id: string;
  title: string;
}

const SCORE_LABELS: Array<{
  key: "qualityScore" | "timelinessScore" | "priceScore" | "communicationScore";
  label: string;
  helper: string;
}> = [
  { key: "qualityScore", label: "Якість", helper: "Якість матеріалу/робіт" },
  { key: "timelinessScore", label: "Терміни", helper: "Дотримання дедлайнів" },
  { key: "priceScore", label: "Ціна", helper: "Ціна vs ринок" },
  { key: "communicationScore", label: "Комунікація", helper: "Швидкість, прозорість" },
];

export function SrmReviewsTab({
  counterpartyId,
  canWrite,
  projects,
}: {
  counterpartyId: string;
  canWrite: boolean;
  projects: ProjectOption[];
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function loadReviews() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/reviews`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const j = await res.json();
        setReviews(j.reviews ?? []);
      } else {
        setReviews([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterpartyId]);

  if (loading && !reviews) {
    return (
      <div className="flex items-center gap-2 p-4 text-[13px]" style={{ color: T.textMuted }}>
        <Loader2 size={14} className="animate-spin" /> Завантаження відгуків…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canWrite && projects.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[13px]" style={{ color: T.textSecondary }}>
            {reviews?.length ?? 0} відгуків
          </span>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold"
            style={{
              backgroundColor: T.accentPrimarySoft,
              color: T.accentPrimary,
            }}
          >
            <MessageSquarePlus size={14} />
            {showForm ? "Сховати форму" : "Написати відгук"}
          </button>
        </div>
      )}

      {showForm && (
        <ReviewForm
          counterpartyId={counterpartyId}
          projects={projects}
          onSubmitted={() => {
            setShowForm(false);
            void loadReviews();
          }}
        />
      )}

      {(reviews?.length ?? 0) === 0 ? (
        <div
          className="rounded-2xl p-6 text-center text-[13px]"
          style={{
            backgroundColor: T.panel,
            border: `1px dashed ${T.borderStrong}`,
            color: T.textMuted,
          }}
        >
          Поки що немає відгуків. {canWrite && "Будьте першим — напишіть свою оцінку."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {reviews?.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
            {review.by.name}
          </span>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            · {review.project.title}
          </span>
        </div>
        <RatingStars value={review.rating} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]" style={{ color: T.textSecondary }}>
        {SCORE_LABELS.map((s) => (
          <div key={s.key} className="flex justify-between">
            <span>{s.label}</span>
            <span style={{ color: T.textPrimary }}>{review[s.key]}/5</span>
          </div>
        ))}
      </div>
      {review.comment && (
        <p className="mt-2 whitespace-pre-wrap text-[13px]" style={{ color: T.textPrimary }}>
          {review.comment}
        </p>
      )}
      <div className="mt-2 text-[10px]" style={{ color: T.textMuted }}>
        {format(new Date(review.reviewedAt), "d MMM yyyy", { locale: uk })}
      </div>
    </div>
  );
}

function ReviewForm({
  counterpartyId,
  projects,
  onSubmitted,
}: {
  counterpartyId: string;
  projects: ProjectOption[];
  onSubmitted: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [scores, setScores] = useState({
    qualityScore: 4,
    timelinessScore: 4,
    priceScore: 4,
    communicationScore: 4,
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avg = useMemo(() => {
    const a =
      (scores.qualityScore +
        scores.timelinessScore +
        scores.priceScore +
        scores.communicationScore) /
      4;
    return Math.round(a * 10) / 10;
  }, [scores]);

  async function submit() {
    if (!projectId) {
      setError("Оберіть проєкт");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/financing/counterparties/${counterpartyId}/reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            ...scores,
            comment: comment.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Помилка збереження");
        return;
      }
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
    >
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-semibold uppercase" style={{ color: T.textSecondary }}>
          Проєкт
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-lg px-2 py-1.5 text-[13px]"
          style={{ backgroundColor: T.panelSoft, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SCORE_LABELS.map((s) => (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: T.textSecondary }}>
              <span>{s.label}</span>
              <span style={{ color: T.textPrimary }}>{scores[s.key]}/5</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={scores[s.key]}
              onChange={(e) =>
                setScores((p) => ({ ...p, [s.key]: Number(e.target.value) }))
              }
              className="w-full"
            />
            <div className="text-[10px]" style={{ color: T.textMuted }}>
              {s.helper}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[13px]" style={{ color: T.textSecondary }}>
          <Star size={14} fill={T.accentPrimary} color={T.accentPrimary} />
          Загальний: <strong style={{ color: T.textPrimary }}>{avg}/5</strong>
        </span>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Коментар (необов'язково)"
        rows={3}
        className="mt-3 w-full rounded-lg px-2 py-1.5 text-[13px]"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textPrimary,
          border: `1px solid ${T.borderStrong}`,
        }}
      />

      {error && (
        <div className="mt-2 text-[11px]" style={{ color: T.danger }}>
          {error}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold"
          style={{ backgroundColor: T.accentPrimary, color: "white" }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
          Зберегти відгук
        </button>
      </div>
    </div>
  );
}
