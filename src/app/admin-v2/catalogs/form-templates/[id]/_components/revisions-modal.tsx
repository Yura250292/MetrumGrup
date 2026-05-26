"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Revision = {
  id: string;
  version: number;
  changeNote: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

export function RevisionsModal({
  revisions,
  templateId,
  onClose,
}: {
  revisions: Revision[];
  templateId: string;
  onClose: () => void;
}) {
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [schemaJson, setSchemaJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function showRevision(v: number) {
    setOpenVersion(v);
    setLoading(true);
    setSchemaJson(null);
    try {
      const res = await fetch(`/api/admin/form-templates/${templateId}/revisions/${v}`);
      if (res.ok) {
        const data = await res.json();
        setSchemaJson(JSON.stringify(data.data?.schema, null, 2));
      } else {
        setSchemaJson("(не вдалося завантажити)");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg shadow-2xl"
        style={{ backgroundColor: T.panel, color: T.textPrimary }}
      >
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="font-semibold">Історія версій</div>
          <button onClick={onClose} aria-label="Закрити">
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 shrink-0 overflow-y-auto border-r" style={{ borderColor: T.borderSoft }}>
            {revisions.length === 0 && (
              <div className="p-4 text-[12px]" style={{ color: T.textMuted }}>
                Немає версій
              </div>
            )}
            {revisions.map((r) => (
              <button
                key={r.id}
                onClick={() => showRevision(r.version)}
                className="block w-full border-b px-4 py-3 text-left transition hover:bg-white/[0.04]"
                style={{
                  borderColor: T.borderSoft,
                  backgroundColor: openVersion === r.version ? "rgba(255,255,255,0.04)" : "transparent",
                }}
              >
                <div className="text-[13px] font-medium">v{r.version}</div>
                <div className="text-[11px]" style={{ color: T.textMuted }}>
                  {new Date(r.createdAt).toLocaleString("uk-UA")} · {r.createdBy.name}
                </div>
                {r.changeNote && (
                  <div className="mt-0.5 text-[11px]" style={{ color: T.textPrimary }}>
                    {r.changeNote}
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {openVersion === null && (
              <div className="text-[12px]" style={{ color: T.textMuted }}>
                Виберіть версію зліва.
              </div>
            )}
            {loading && <div style={{ color: T.textMuted }}>Завантаження…</div>}
            {schemaJson && (
              <pre
                className="overflow-x-auto rounded-md p-3 text-[11px]"
                style={{ backgroundColor: T.background, color: T.textPrimary }}
              >
                <code>{schemaJson}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
