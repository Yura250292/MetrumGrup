"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StructuredReviewPanel } from "./_structured-review-panel";
import {
  Bot,
  Check,
  TriangleAlert,
  TrendingUp,
  FileText,
  FileSpreadsheet,
  Coins,
  Wallet,
  CircleAlert,
} from "lucide-react";

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
  counterpartyId: string | null;
  supplierGuess: string | null;
  counterparty: { id: string; name: string } | null;
  priceIncreaseFlag: boolean;
  previousUnitPrice: string | null;
  // Safe Finance Migration Phase 5.5: per-item рішення менеджера.
  costCodeId: string | null;
  costCode: { id: string; code: string; name: string } | null;
  financeIntent: "COMMITTED" | "ACTUAL" | null;
  managerNote: string | null;
};

type CostCodeOption = {
  id: string;
  code: string;
  name: string;
  defaultCostType: string | null;
};

type SupplierSearchResult = {
  id: string;
  name: string;
  edrpou: string | null;
};

type PendingSupplier = {
  id: string;
  title: string;
  costType: string;
  supplierGuess: string | null;
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
  const [pendingSuppliers, setPendingSuppliers] = useState<PendingSupplier[] | null>(null);
  const [pickerForItem, setPickerForItem] = useState<string | null>(null);
  const [costCodes, setCostCodes] = useState<CostCodeOption[]>([]);
  const [codePickerForItem, setCodePickerForItem] = useState<string | null>(null);

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

  // Завантажуємо довідник cost-codes один раз.
  useEffect(() => {
    fetch("/api/admin/financing/cost-codes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCostCodes(d.data ?? []))
      .catch(() => {});
  }, []);

  async function patchItem(itemId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/foreman-reports/${id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Не вдалось зберегти");
      return false;
    }
    return true;
  }

  async function setItemIntent(itemId: string, intent: "COMMITTED" | "ACTUAL") {
    const ok = await patchItem(itemId, { financeIntent: intent });
    if (!ok) return;
    setReport((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.id === itemId ? { ...it, financeIntent: intent } : it,
            ),
          }
        : prev,
    );
  }

  async function setItemCostCode(itemId: string, code: CostCodeOption | null) {
    const ok = await patchItem(itemId, { costCodeId: code?.id ?? null });
    if (!ok) return;
    setReport((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    costCodeId: code?.id ?? null,
                    costCode: code
                      ? { id: code.id, code: code.code, name: code.name }
                      : null,
                  }
                : it,
            ),
          }
        : prev,
    );
    setCodePickerForItem(null);
  }

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
      if (res.status === 422) {
        // Phase 2: backend блокує approve без counterparty для MATERIAL/SUBCONTRACT.
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          pendingItems?: PendingSupplier[];
        };
        if (body.pendingItems && body.pendingItems.length > 0) {
          setPendingSuppliers(body.pendingItems);
          setSubmitting(false);
          return;
        }
        throw new Error(body.message ?? "Потрібно довибрати постачальника");
      }
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

  async function setItemSupplier(
    itemId: string,
    counterpartyId: string | null,
    counterpartyName: string | null,
  ) {
    const res = await fetch(`/api/admin/foreman-reports/${id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartyId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Не вдалось зберегти");
      return;
    }
    setReport((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    counterpartyId,
                    supplierGuess: counterpartyId ? null : it.supplierGuess,
                    counterparty: counterpartyId
                      ? { id: counterpartyId, name: counterpartyName ?? "Постачальник" }
                      : null,
                  }
                : it,
            ),
          }
        : prev,
    );
    setPickerForItem(null);
    if (pendingSuppliers) {
      setPendingSuppliers((prev) => (prev ? prev.filter((p) => p.id !== itemId) : prev));
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
                  <div className="h-32 flex items-center justify-center text-zinc-500">
                    {a.mimeType.includes("pdf") ? (
                      <FileText size={36} strokeWidth={1.5} />
                    ) : (
                      <FileSpreadsheet size={36} strokeWidth={1.5} />
                    )}
                  </div>
                )}
                <div className="px-2 py-1.5 text-xs truncate">{a.originalName}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {pendingSuppliers && pendingSuppliers.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-4 mb-4">
          <div className="text-sm font-bold text-amber-200 mb-1">
            Затвердження заблоковано: {pendingSuppliers.length} {pendingSuppliers.length === 1 ? "позиція" : "позицій"} без постачальника
          </div>
          <div className="text-xs text-amber-300/80">
            Матеріали і субпідряд мають бути привʼязані до постачальника, інакше борг
            не агрегуватиметься. Виберіть для кожної позиції нижче ↓
          </div>
        </div>
      )}

      {/* P7/P10: structured-review (виконані обсяги + extra-рішення + доопрацювання) */}
      <StructuredReviewPanel id={id} canDecide={canDecide} />

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left px-4 py-2">Тип</th>
              <th className="text-left px-4 py-2">Назва</th>
              <th className="text-left px-4 py-2 min-w-[180px]">Постачальник</th>
              <th className="text-left px-4 py-2 min-w-[160px]">Стаття</th>
              <th className="text-left px-4 py-2 min-w-[140px]">Запис</th>
              <th className="text-right px-4 py-2">К-сть</th>
              <th className="text-left px-4 py-2">Од.</th>
              <th className="text-right px-4 py-2">Ціна</th>
              <th className="text-right px-4 py-2">Сума</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((it) => {
              const needsSupplier = (it.costType === "MATERIAL" || it.costType === "SUBCONTRACT") && !it.counterpartyId;
              const isHighlighted = pendingSuppliers?.some((p) => p.id === it.id);
              return (
                <tr
                  key={it.id}
                  className={`border-t border-zinc-800 ${isHighlighted ? "bg-amber-500/5" : ""}`}
                >
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
                  <td className="px-4 py-2">
                    {pickerForItem === it.id ? (
                      <AdminSupplierPicker
                        initialQuery={it.supplierGuess ?? ""}
                        onPick={(opt) => setItemSupplier(it.id, opt.id, opt.name)}
                        onClose={() => setPickerForItem(null)}
                      />
                    ) : it.counterparty ? (
                      <button
                        onClick={() => setPickerForItem(it.id)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-300 bg-emerald-500/10 rounded px-2 py-1 hover:bg-emerald-500/20"
                      >
                        <Check size={11} strokeWidth={2.5} /> {it.counterparty.name}
                      </button>
                    ) : it.supplierGuess ? (
                      <button
                        onClick={() => setPickerForItem(it.id)}
                        className="inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-500/10 rounded px-2 py-1 hover:bg-amber-500/20"
                      >
                        <Bot size={11} strokeWidth={2} /> AI: {it.supplierGuess}
                      </button>
                    ) : needsSupplier ? (
                      <button
                        onClick={() => setPickerForItem(it.id)}
                        className="inline-flex items-center gap-1 text-xs text-rose-300 bg-rose-500/10 rounded px-2 py-1 hover:bg-rose-500/20 font-semibold"
                      >
                        <TriangleAlert size={11} strokeWidth={2.5} /> Вибрати постачальника
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>

                  {/* Phase 5.5: cost-code picker per item */}
                  <td className="px-4 py-2">
                    {codePickerForItem === it.id ? (
                      <CostCodePicker
                        options={costCodes}
                        currentCostType={it.costType}
                        onPick={(opt) => setItemCostCode(it.id, opt)}
                        onClose={() => setCodePickerForItem(null)}
                      />
                    ) : it.costCode ? (
                      <button
                        onClick={() => setCodePickerForItem(it.id)}
                        className="inline-flex items-center gap-1 text-xs text-sky-300 bg-sky-500/10 rounded px-2 py-1 hover:bg-sky-500/20"
                        title={it.costCode.name}
                      >
                        <Check size={11} strokeWidth={2.5} /> {it.costCode.code}
                      </button>
                    ) : (
                      <button
                        onClick={() => setCodePickerForItem(it.id)}
                        className="text-xs text-zinc-500 bg-zinc-800/40 rounded px-2 py-1 hover:bg-zinc-700/50"
                      >
                        + стаття
                      </button>
                    )}
                  </td>

                  {/* Phase 5.5: per-item intent toggle (Борг / Оплачено) */}
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setItemIntent(it.id, "COMMITTED")}
                        className={`text-[10px] font-bold px-2 py-1 rounded transition ${
                          it.financeIntent === "COMMITTED"
                            ? "bg-amber-500/30 text-amber-200 border border-amber-500/60"
                            : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:bg-zinc-800"
                        }`}
                        title="Зобовʼязання: матеріал отримано, постачальнику ще не оплачено"
                      >
                        Борг
                      </button>
                      <button
                        onClick={() => setItemIntent(it.id, "ACTUAL")}
                        className={`text-[10px] font-bold px-2 py-1 rounded transition ${
                          it.financeIntent === "ACTUAL"
                            ? "bg-emerald-500/30 text-emerald-200 border border-emerald-500/60"
                            : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:bg-zinc-800"
                        }`}
                        title="Реально оплачено готівкою / з картки на місці"
                      >
                        Оплачено
                      </button>
                    </div>
                  </td>

                  <td className="px-4 py-2 text-right">{it.quantity ?? "—"}</td>
                  <td className="px-4 py-2">{it.unit ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {it.unitPrice ? (
                      <span className="inline-flex items-center gap-1">
                        {it.priceIncreaseFlag && it.previousUnitPrice && (
                          <span
                            className="inline-flex items-center text-[10px] font-bold text-rose-300 bg-rose-500/15 px-1 py-0.5 rounded"
                            title={`Подорожчання: було ${Number(it.previousUnitPrice).toFixed(2)} грн, стало ${Number(it.unitPrice).toFixed(2)} грн`}
                          >
                            <TrendingUp size={10} strokeWidth={2.5} />
                          </span>
                        )}
                        {Number(it.unitPrice).toFixed(2)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-400">
                    {Number(it.amount).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canDecide && !showReject && (
        <>
          {/* Phase 6 polish: pre-approve summary — критичний блок довіри.
              План: «що піде у борг», «що — у факт», «що без статті». */}
          {(() => {
            const commitItems = report.items.filter((i) => i.financeIntent !== "ACTUAL");
            const actualItems = report.items.filter((i) => i.financeIntent === "ACTUAL");
            const commitSum = commitItems.reduce((s, i) => s + Number(i.amount), 0);
            const actualSum = actualItems.reduce((s, i) => s + Number(i.amount), 0);
            const noCodeCount = report.items.filter((i) => !i.costCodeId).length;
            return (
              <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-5 mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-3">
                  Перевірте перед підтвердженням
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <SummaryRow
                    icon={<Coins size={16} strokeWidth={2} />}
                    accent="amber"
                    label={pluralPositions(commitItems.length, "піде у борг постачальникам")}
                    sum={commitSum}
                    muted={commitItems.length === 0}
                  />
                  <SummaryRow
                    icon={<Wallet size={16} strokeWidth={2} />}
                    accent="emerald"
                    label={pluralPositions(actualItems.length, "піде у фактичні витрати")}
                    sum={actualSum}
                    muted={actualItems.length === 0}
                  />
                </div>
                {noCodeCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
                    <CircleAlert size={14} strokeWidth={2} className="text-zinc-500 flex-shrink-0" />
                    <span>
                      {pluralPositions(noCodeCount, "без статті витрат")} — попадуть у «(без статті)» у budget vs actual
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-6 py-4">
            <div className="max-w-4xl mx-auto flex gap-3">
              <button
                onClick={() => setShowReject(true)}
                disabled={submitting}
                className="flex-1 px-6 py-3 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-600/40 hover:bg-rose-600/30 font-semibold disabled:opacity-50"
              >
                Повернути виконробу
              </button>
              <button
                onClick={handleApprove}
                disabled={submitting}
                className="flex-[2] px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-400 disabled:opacity-50"
              >
                {submitting ? "Підтвердження…" : "Підтвердити"}
              </button>
            </div>
          </div>
        </>
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

// Український plural для «N позиція / позиції / позицій».
function pluralPositions(n: number, suffix: string): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  let word: string;
  if (mod100 >= 11 && mod100 <= 14) word = "позицій";
  else if (mod10 === 1) word = "позиція";
  else if (mod10 >= 2 && mod10 <= 4) word = "позиції";
  else word = "позицій";
  return `${n} ${word} ${suffix}`;
}

function SummaryRow({
  icon,
  accent,
  label,
  sum,
  muted,
}: {
  icon: React.ReactNode;
  accent: "amber" | "emerald";
  label: string;
  sum: number;
  muted: boolean;
}) {
  const palette =
    accent === "amber"
      ? { ring: "border-amber-500/30", chip: "bg-amber-500/15 text-amber-300", text: "text-amber-100" }
      : { ring: "border-emerald-500/30", chip: "bg-emerald-500/15 text-emerald-300", text: "text-emerald-100" };
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border ${muted ? "border-zinc-800 opacity-60" : palette.ring} bg-zinc-950 p-3`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0 ${muted ? "bg-zinc-800 text-zinc-500" : palette.chip}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-semibold truncate ${muted ? "text-zinc-500" : palette.text}`}>
          {label}
        </div>
        <div className={`text-[12px] tabular-nums ${muted ? "text-zinc-600" : "text-zinc-400"}`}>
          {sum.toFixed(2)} грн
        </div>
      </div>
    </div>
  );
}

function AdminSupplierPicker({
  initialQuery,
  onPick,
  onClose,
}: {
  initialQuery: string;
  onPick: (opt: SupplierSearchResult) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(initialQuery);
  const [results, setResults] = useState<SupplierSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        params.set("role", "SUPPLIER");
        params.set("take", "20");
        const res = await fetch(`/api/admin/financing/counterparties?${params}`, {
          cache: "no-store",
        });
        const j = await res.json();
        setResults(j.data ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [search]);

  async function createNew() {
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/financing/counterparties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "LEGAL" }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Не вдалось створити");
        return;
      }
      // Phase 2: щойно створений counterparty не обовʼязково має SUPPLIER role
      // (admin-v2 endpoint цього не виставляє). PATCH сам на себе для додавання ролі —
      // непотрібно для функціональності привʼязки, але краще для UX списку
      // постачальників. Skip — додаємо лише через foreman path або вручну.
      onPick({ id: j.data.id, name: j.data.name, edrpou: j.data.edrpou ?? null });
    } finally {
      setCreating(false);
    }
  }

  const exact = results.find(
    (r) => r.name.trim().toLowerCase() === search.trim().toLowerCase(),
  );
  const showCreate = search.trim().length >= 2 && !exact && !loading;

  return (
    <div className="rounded-lg bg-zinc-950 border border-emerald-500/40 p-2 space-y-1.5 min-w-[260px]">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Будхата, Епіцентр…"
          className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-white text-xs focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={onClose}
          className="text-[10px] text-zinc-500 px-1.5 py-1 rounded"
        >
          ✕
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {loading && <div className="text-[11px] text-zinc-500 px-1 py-0.5">Шукаємо…</div>}
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick(r)}
            className="w-full flex items-center justify-between gap-2 text-left px-2 py-1 rounded text-xs bg-zinc-900 hover:bg-emerald-500/15"
          >
            <span className="truncate">{r.name}</span>
            {r.edrpou && (
              <span className="text-[10px] text-zinc-500 tabular-nums">{r.edrpou}</span>
            )}
          </button>
        ))}
        {showCreate && (
          <button
            onClick={createNew}
            disabled={creating}
            className="w-full text-left px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60"
          >
            {creating ? "Створення…" : `+ Створити: «${search.trim()}»`}
          </button>
        )}
      </div>
    </div>
  );
}

function CostCodePicker({
  options,
  currentCostType,
  onPick,
  onClose,
}: {
  options: CostCodeOption[];
  currentCostType: string;
  onPick: (opt: CostCodeOption | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  // Підказка: спочатку показуємо статті які матчать поточний costType.
  const filtered = options
    .filter(
      (o) =>
        !search ||
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.code.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const aMatch = a.defaultCostType === currentCostType ? 0 : 1;
      const bMatch = b.defaultCostType === currentCostType ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.code.localeCompare(b.code, "uk");
    });

  return (
    <div className="rounded-lg bg-zinc-950 border border-sky-500/40 p-2 space-y-1.5 min-w-[260px]">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Стаття витрат…"
          className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-white text-xs focus:border-sky-500 focus:outline-none"
        />
        <button
          onClick={() => onPick(null)}
          className="text-[10px] text-zinc-500 px-1.5 py-1 rounded hover:bg-zinc-800"
          title="Прибрати статтю"
        >
          ×
        </button>
        <button
          onClick={onClose}
          className="text-[10px] text-zinc-500 px-1.5 py-1 rounded"
        >
          ✕
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-[11px] text-zinc-500 px-1 py-0.5">
            Нічого не знайдено
          </div>
        )}
        {filtered.slice(0, 30).map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o)}
            className="w-full flex items-center justify-between gap-2 text-left px-2 py-1 rounded text-xs bg-zinc-900 hover:bg-sky-500/15"
          >
            <span className="truncate">
              <span className="text-zinc-500 mr-1.5">{o.code}</span>
              {o.name}
            </span>
            {o.defaultCostType === currentCostType && (
              <span className="text-[9px] text-emerald-400">match</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
