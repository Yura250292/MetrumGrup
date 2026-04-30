"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, X, Loader2, Save } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ProjectClientPicker,
  type ProjectClientValue,
} from "./ProjectClientPicker";

/**
 * Кнопка-олівець біля імені клієнта на сторінці проекту. Відкриває модалку
 * з ProjectClientPicker — дає змінити привʼязку (контрагент / free-text)
 * без бубнів з email/phone. Legacy User-CLIENT відобразиться як free-text
 * (його імʼя), що технічно змінить FK на null + збереже clientName.
 */
export function ProjectClientEditButton({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectClientValue;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ProjectClientValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    if (!value) {
      setError("Вкажіть клієнта");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body =
        value.mode === "counterparty"
          ? {
              clientCounterpartyId: value.id,
              clientName: value.name,
              clientId: null,
            }
          : {
              clientCounterpartyId: null,
              clientName: value.name,
              clientId: null,
            };
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалось зберегти");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1 transition hover:brightness-[0.95]"
        style={{ color: T.textMuted }}
        title="Редагувати клієнта"
        aria-label="Редагувати клієнта"
      >
        <Edit3 size={12} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => !saving && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
            }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: T.borderSoft }}
            >
              <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
                Клієнт проекту
              </h3>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="rounded-md p-1"
                style={{ color: T.textMuted }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3 px-5 py-5">
              <ProjectClientPicker value={value} onChange={setValue} />
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                Оберіть контрагента або введіть імʼя вручну. Email/телефон
                не вимагаються.
              </p>
              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{
                    backgroundColor: T.dangerSoft,
                    color: T.danger,
                    border: `1px solid ${T.danger}`,
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-4"
              style={{ borderColor: T.borderSoft }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-[13px] font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !value}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
