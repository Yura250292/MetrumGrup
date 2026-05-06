"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

type Item = {
  id: string;
  costType: string;
  title: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  currency: string;
  confidence: number | null;
};

type Attachment = {
  id: string;
  r2Key: string;
  originalName: string;
  mimeType: string;
  size: number;
  previewUrl: string | null;
};

type ReportDetail = {
  id: string;
  status: string;
  rawText: string | null;
  occurredAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  project: { id: string; title: string };
  createdBy: { id: string; name: string; email: string; phone: string | null };
  reviewedBy: { id: string; name: string } | null;
  items: Item[];
  attachments: Attachment[];
};

const COST_TYPE_LABELS: Record<string, string> = {
  MATERIAL: "Матеріал",
  LABOR: "Робота",
  SUBCONTRACT: "Підряд",
  EQUIPMENT: "Техніка",
  OVERHEAD: "Накладні",
  OTHER: "Інше",
};

export default function ForemanReportDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    fetch(`/api/admin/foreman-reports/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("fetch");
        return r.json();
      })
      .then((d) => setReport(d.report))
      .catch(() => setError("Не вдалось завантажити звіт"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-500">Завантаження…</div>;
  if (error || !report) return <div className="p-6 text-rose-400">{error ?? "Звіт не знайдено"}</div>;

  const total = report.items.reduce((sum, it) => sum + Number(it.amount), 0);
  const materials = report.items
    .filter((i) => i.costType === "MATERIAL")
    .reduce((s, i) => s + Number(i.amount), 0);
  const labor = report.items
    .filter((i) => i.costType === "LABOR")
    .reduce((s, i) => s + Number(i.amount), 0);

  async function handleApprove() {
    if (submitting) return;
    if (!confirm("Підтвердити звіт? Сума буде записана у фактичні витрати проекту.")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/foreman-reports/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Не вдалось підтвердити");
      }
      router.push("/admin-v2/foreman-reports");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Помилка");
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (submitting) return;
    if (rejectReason.trim().length < 3) {
      alert("Вкажіть причину (мін. 3 символи)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/foreman-reports/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Не вдалось відхилити");
      }
      router.push("/admin-v2/foreman-reports");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Помилка");
      setSubmitting(false);
    }
  }

  const canDecide = report.status === "PENDING_APPROVAL";

  return (
    <div className="p-6 max-w-4xl mx-auto pb-32">
      <Link href="/admin-v2/foreman-reports" className="text-sm text-zinc-400 hover:text-emerald-400 mb-4 inline-block">
        ← До списку
      </Link>

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-xl font-bold">{report.project.title}</h1>
            <div className="text-sm text-zinc-400 mt-1">
              {report.createdBy.name} · {report.createdBy.email}
              {report.createdBy.phone ? ` · ${report.createdBy.phone}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-400">{total.toFixed(2)} грн</div>
            <div className="text-xs text-zinc-500">
              Дата витрати: {new Date(report.occurredAt).toLocaleDateString("uk-UA")}
            </div>
          </div>
        </div>

        <div className="flex gap-3 text-sm">
          <div className="flex-1 rounded-lg bg-zinc-950 px-3 py-2">
            <div className="text-xs text-zinc-500">Матеріали</div>
            <div className="font-semibold">{materials.toFixed(2)} грн</div>
          </div>
          <div className="flex-1 rounded-lg bg-zinc-950 px-3 py-2">
            <div className="text-xs text-zinc-500">Робота</div>
            <div className="font-semibold">{labor.toFixed(2)} грн</div>
          </div>
        </div>
      </div>

      {report.rawText && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 mb-4">
          <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Оригінальний текст</div>
          <pre className="text-sm whitespace-pre-wrap text-zinc-300 font-mono">{report.rawText}</pre>
        </div>
      )}

      {report.attachments.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 mb-4">
          <div className="text-xs font-semibold uppercase text-zinc-500 mb-3">Прикріплені файли</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {report.attachments.map((a) => (
              <a
                key={a.id}
                href={a.previewUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 hover:border-emerald-500 transition"
              >
                {a.mimeType.startsWith("image/") && a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, не оптимізуємо через next/image
                  <img src={a.previewUrl} alt={a.originalName} className="w-full h-32 object-cover" />
                ) : (
                  <div className="h-32 flex items-center justify-center text-4xl">
                    {a.mimeType.includes("pdf") ? "📄" : "📊"}
                  </div>
                )}
                <div className="px-2 py-1.5 text-xs truncate">{a.originalName}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left px-4 py-2">Тип</th>
              <th className="text-left px-4 py-2">Назва</th>
              <th className="text-right px-4 py-2">К-сть</th>
              <th className="text-left px-4 py-2">Од.</th>
              <th className="text-right px-4 py-2">Ціна</th>
              <th className="text-right px-4 py-2">Сума</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((it) => (
              <tr key={it.id} className="border-t border-zinc-800">
                <td className="px-4 py-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      it.costType === "LABOR"
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {COST_TYPE_LABELS[it.costType] ?? it.costType}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium">{it.title}</td>
                <td className="px-4 py-2 text-right">{it.quantity ?? "—"}</td>
                <td className="px-4 py-2">{it.unit ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  {it.unitPrice ? `${Number(it.unitPrice).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-2 text-right font-bold text-emerald-400">
                  {Number(it.amount).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canDecide && !showReject && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-6 py-4">
          <div className="max-w-4xl mx-auto flex gap-3">
            <button
              onClick={() => setShowReject(true)}
              disabled={submitting}
              className="flex-1 px-6 py-3 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-600/40 hover:bg-rose-600/30 font-semibold disabled:opacity-50"
            >
              Відхилити
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="flex-[2] px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? "Затвердження…" : "Підтвердити та записати у витрати"}
            </button>
          </div>
        </div>
      )}

      {showReject && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-3">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Причина відхилення (буде показана виконробу)"
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white focus:border-emerald-500 focus:outline-none"
              rows={2}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowReject(false)}
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold disabled:opacity-50"
              >
                Скасувати
              </button>
              <button
                onClick={handleReject}
                disabled={submitting || rejectReason.trim().length < 3}
                className="flex-1 px-6 py-3 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-500 disabled:opacity-50"
              >
                {submitting ? "Відхилення…" : "Відхилити звіт"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canDecide && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-sm text-zinc-400">
          Статус: <span className="font-semibold text-zinc-200">{report.status}</span>
          {report.reviewedBy && report.reviewedAt && (
            <>
              {" "}
              · перевірив: {report.reviewedBy.name},{" "}
              {new Date(report.reviewedAt).toLocaleString("uk-UA")}
            </>
          )}
          {report.rejectionReason && (
            <div className="mt-2 text-rose-300">Причина: {report.rejectionReason}</div>
          )}
        </div>
      )}
    </div>
  );
}
