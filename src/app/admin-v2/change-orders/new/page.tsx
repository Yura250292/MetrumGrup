"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ItemsEditor, type DraftItem } from "../_components/ItemsEditor";

type ProjectOption = { id: string; title: string };

type COType = "ADD" | "REMOVE" | "SWAP";

const TYPES: Array<{ value: COType; label: string }> = [
  { value: "ADD", label: "Додавання обсягу" },
  { value: "REMOVE", label: "Зменшення обсягу" },
  { value: "SWAP", label: "Заміна обсягу" },
];

export default function NewChangeOrderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialProjectId = params.get("projectId") ?? "";

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [type, setType] = useState<COType>("ADD");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reasonFromClient, setReasonFromClient] = useState("");
  const [scheduleImpactDays, setScheduleImpactDays] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/projects?limit=200")
      .then((r) => r.json())
      .then((j: { items?: ProjectOption[] }) => setProjects(j.items ?? []))
      .catch(() => setProjects([]));
  }, []);

  async function submit(): Promise<void> {
    if (!projectId) {
      alert("Оберіть проєкт");
      return;
    }
    if (!title.trim() || !description.trim()) {
      alert("Заповніть назву та опис");
      return;
    }
    if (items.length === 0 || items.some((i) => !i.costCodeId)) {
      alert("Додайте позиції з cost code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/change-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          type,
          title: title.trim(),
          description: description.trim(),
          reasonFromClient: reasonFromClient.trim() || null,
          scheduleImpactDays,
          items: items.map((i) => ({
            costCodeId: i.costCodeId,
            description: i.description,
            unit: i.unit,
            qty: i.qty,
            unitPrice: i.unitPrice,
            sign: type === "REMOVE" ? -1 : i.sign,
          })),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Помилка: ${j.error ?? res.statusText}`);
        return;
      }
      const json = (await res.json()) as { id: string };
      router.push(`/admin-v2/change-orders/${json.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Нова додаткова угода</h1>

      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Проєкт</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 text-sm bg-white"
          >
            <option value="">— оберіть —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Тип</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as COType)}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 text-sm bg-white"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Стисла назва зміни</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-zinc-300 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Опис</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-32 px-3 py-2 rounded-md border border-zinc-300 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">
          Обґрунтування замовника (опційно)
        </span>
        <textarea
          value={reasonFromClient}
          onChange={(e) => setReasonFromClient(e.target.value)}
          className="w-full h-20 px-3 py-2 rounded-md border border-zinc-300 text-sm"
        />
      </label>

      <label className="block space-y-1 max-w-xs">
        <span className="text-xs text-zinc-500">Зміна терміну (днів)</span>
        <input
          type="number"
          value={scheduleImpactDays}
          onChange={(e) => setScheduleImpactDays(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-md border border-zinc-300 text-sm"
        />
      </label>

      <div>
        <h2 className="text-sm font-medium text-zinc-500 mb-2">Позиції</h2>
        <ItemsEditor
          items={items}
          onChange={setItems}
          allowNegativeSign={type === "SWAP"}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded-md border border-zinc-300 text-sm"
        >
          Скасувати
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {submitting ? "Створення…" : "Створити чернетку"}
        </button>
      </div>
    </div>
  );
}
