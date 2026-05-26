"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RFIPriority } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Member = { id: string; name: string | null };

export function RFICreateModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [priority, setPriority] = useState<RFIPriority>("NORMAL");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [impactsSchedule, setImpactsSchedule] = useState(false);
  const [impactsBudget, setImpactsBudget] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch(`/api/admin/projects/${projectId}/members`);
      if (!active || !res.ok) return;
      const json = (await res.json()) as { members?: Array<{ user: Member }> };
      const list = json.members?.map((m) => m.user) ?? [];
      setMembers(list);
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  async function submit() {
    setError(null);
    if (!subject.trim() || !question.trim()) {
      setError("Введіть тему і питання");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/rfis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        subject,
        question,
        priority,
        assignedToId: assignedToId || null,
        impactsSchedule,
        impactsBudget,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: T.borderSoft }}>
          <h2 className="text-base font-medium">Новий RFI</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Тема</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              style={{ borderColor: T.borderSoft }}
              placeholder="Коротка тема запиту"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Питання</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={5}
              className="w-full border rounded-lg p-2 text-sm"
              style={{ borderColor: T.borderSoft }}
              placeholder="Опишіть деталі запиту до проєктанта / ГІП"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Пріоритет</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RFIPriority)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                style={{ borderColor: T.borderSoft }}
              >
                <option value="LOW">LOW</option>
                <option value="NORMAL">NORMAL</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Виконавець</label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                style={{ borderColor: T.borderSoft }}
              >
                <option value="">— не призначено —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={impactsSchedule}
                onChange={(e) => setImpactsSchedule(e.target.checked)}
              />
              впливає на графік
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={impactsBudget}
                onChange={(e) => setImpactsBudget(e.target.checked)}
              />
              впливає на бюджет
            </label>
          </div>
          {error && <div className="text-sm text-rose-700">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t" style={{ borderColor: T.borderSoft }}>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm border"
            style={{ borderColor: T.borderSoft, color: T.textSecondary }}
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-sm text-white disabled:opacity-40"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {busy ? "Створення…" : "Створити"}
          </button>
        </div>
      </div>
    </div>
  );
}
