"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldDef, FormSchema, SubmissionData } from "@/lib/forms/schema";
import { filterVisible, validateSubmissionAgainstSchema } from "@/lib/forms/validators";
import {
  autoFlushOnOnline,
  enqueue,
  flush,
  makeClientUuid,
} from "@/lib/forms/offline-queue";
import { FormFieldRenderer } from "./form-field-renderer";

type Project = { id: string; title: string };

export function ForemanFormFillClient({
  template,
  projects,
}: {
  template: { id: string; name: string; description: string | null; version: number; schema: FormSchema };
  projects: Project[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [data, setData] = useState<SubmissionData>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Авто-флаш черги, коли мережа з'являється або при mount.
  useEffect(() => {
    void flush();
    const off = autoFlushOnOnline();
    return off;
  }, []);

  const visibleFields = useMemo(
    () => filterVisible(template.schema.fields, data),
    [template.schema.fields, data],
  );

  function updateField(field: FieldDef, value: unknown) {
    setData((prev) => ({ ...prev, [field.key]: value as never }));
  }

  async function handleSubmit() {
    const result = validateSubmissionAgainstSchema(data, template.schema);
    if (!result.ok) {
      setErrors(result.errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSubmitting(true);
    try {
      // Offline-first: спочатку у IndexedDB outbox, далі — спроба flush.
      // Якщо мережі немає — лишиться у черзі і відправиться, як з'явиться.
      const clientUuid = makeClientUuid();
      await enqueue({
        clientUuid,
        templateId: template.id,
        templateVersion: template.version,
        projectId: projectId || null,
        taskId: null,
        foremanReportId: null,
        data: data as Record<string, unknown>,
      });
      await flush();
      router.push("/foreman/forms?submitted=1");
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Помилка надсилання"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-24 pt-4">
      {template.description && (
        <p className="mb-4 text-[13px] text-white/70">{template.description}</p>
      )}

      {errors.length > 0 && (
        <div className="mb-4 rounded-xl bg-red-500/15 p-3 text-[12px] text-red-100">
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div className="mb-4">
          <label className="mb-1 block text-[12px] text-white/60">Проєкт</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-xl bg-white/[0.06] px-3 py-2 text-[14px] text-white outline-none"
          >
            <option value="">— без проєкту —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-4">
        {visibleFields.map((f) => (
          <FormFieldRenderer
            key={f.key}
            field={f}
            value={data[f.key]}
            onChange={(v) => updateField(f, v)}
            submissionDraftId={`draft-${template.id}`}
          />
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="fixed bottom-4 left-4 right-4 rounded-2xl bg-emerald-500 py-3 text-[15px] font-semibold text-white shadow-lg disabled:opacity-50"
      >
        {submitting ? "Надсилаю…" : "Надіслати"}
      </button>
    </div>
  );
}
