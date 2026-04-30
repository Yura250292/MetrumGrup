"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Wrench, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Counts = {
  orphansInMirror: number;
  outsideOfMirror: number;
  missingFirmId: number;
};

type Sample = {
  id: string;
  title: string;
  type: "INCOME" | "EXPENSE";
  kind: "PLAN" | "FACT";
  amount: number;
};

type Diagnostics = {
  mirrorFolderId: string | null;
  mirrorFolderName: string | null;
  counts: Counts;
  samples: {
    orphansInMirror: (Sample & { currentProjectTitle: string | null })[];
    outsideOfMirror: (Sample & { folderName: string | null })[];
  };
};

/**
 * Картка діагностики розбіжностей між фінансовими записами проекту і його
 * mirror-папкою. Показується автоматично якщо є невідповідності. Кнопка
 * "Виправити автоматично" викликає POST endpoint що stamp-ить projectId,
 * firmId і переносить orphan-записи у mirror.
 */
export function FinanceDiagnosticsCard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/finance-diagnostics`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка діагностики");
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function fix() {
    setFixing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/finance-diagnostics`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалось виправити");
      }
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setFixing(false);
    }
  }

  if (loading) return null;
  if (!data) return null;

  const total =
    data.counts.orphansInMirror +
    data.counts.outsideOfMirror +
    data.counts.missingFirmId;

  // Нічого не показуємо якщо все синхронізовано — щоб не плутати UI.
  if (total === 0) return null;

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl px-4 py-3"
      style={{
        backgroundColor: T.warningSoft ?? "#FEF3C7",
        border: `1px solid ${T.warning}55`,
      }}
    >
      <div className="flex items-center gap-2">
        <AlertCircle size={16} style={{ color: T.warning }} />
        <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
          Розсинхрон фінансування і проекту: {total} записів
        </span>
      </div>

      <ul className="flex flex-col gap-1.5 text-[12px]" style={{ color: T.textPrimary }}>
        {data.counts.orphansInMirror > 0 && (
          <li>
            <b>{data.counts.orphansInMirror}</b> записів лежать у папці
            <i> «{data.mirrorFolderName ?? "mirror"}»</i> (її піддереві), але не
            привʼязані до цього проекту → не видно на сторінці проекту, видно у
            Фінансуванні.
          </li>
        )}
        {data.counts.outsideOfMirror > 0 && (
          <li>
            <b>{data.counts.outsideOfMirror}</b> записів привʼязані до проекту,
            але лежать поза його mirror-папкою → видно на проекті, але «висять»
            у дереві Фінансування.
          </li>
        )}
        {data.counts.missingFirmId > 0 && (
          <li>
            <b>{data.counts.missingFirmId}</b> записів без firmId — не
            scope-ляться по фірмі.
          </li>
        )}
      </ul>

      {data.samples.orphansInMirror.length > 0 && (
        <details className="text-[11px]" style={{ color: T.textSecondary }}>
          <summary className="cursor-pointer">
            Приклади ({Math.min(20, data.samples.orphansInMirror.length)}):
          </summary>
          <ul className="mt-1 ml-4 list-disc">
            {data.samples.orphansInMirror.map((s) => (
              <li key={s.id}>
                {s.kind} · {s.type === "INCOME" ? "Дохід" : "Витрата"} ·{" "}
                {s.title} — {s.amount.toLocaleString("uk-UA")} ₴
                {s.currentProjectTitle ? ` (зараз → ${s.currentProjectTitle})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      {data.samples.outsideOfMirror.length > 0 && (
        <details className="text-[11px]" style={{ color: T.textSecondary }}>
          <summary className="cursor-pointer">
            Приклади outside-mirror ({Math.min(20, data.samples.outsideOfMirror.length)}):
          </summary>
          <ul className="mt-1 ml-4 list-disc">
            {data.samples.outsideOfMirror.map((s) => (
              <li key={s.id}>
                {s.kind} · {s.type === "INCOME" ? "Дохід" : "Витрата"} ·{" "}
                {s.title} — {s.amount.toLocaleString("uk-UA")} ₴
                {s.folderName ? ` (папка: ${s.folderName})` : " (без папки)"}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <span className="text-[11px]" style={{ color: T.danger }}>
          {error}
        </span>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={fix}
          disabled={fixing}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
          style={{ backgroundColor: T.warning ?? "#F59E0B" }}
        >
          {fixing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Wrench size={13} />
          )}
          {fixing ? "Виправляю…" : "Виправити автоматично"}
        </button>
      </div>
    </div>
  );
}
