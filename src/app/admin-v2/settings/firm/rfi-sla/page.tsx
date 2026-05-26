"use client";

import { useEffect, useState } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type SLA = {
  firmId: string;
  hoursLow: number;
  hoursNormal: number;
  hoursHigh: number;
  hoursUrgent: number;
  isDefault?: boolean;
};

type Firm = { id: string; name: string };

export default function RFISLASettingsPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [activeFirmId, setActiveFirmId] = useState<string>("");
  const [sla, setSla] = useState<SLA | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/firms")
      .then((r) => (r.ok ? r.json() : { firms: [] }))
      .then((j: { firms?: Firm[] }) => {
        setFirms(j.firms ?? []);
        if (j.firms && j.firms.length > 0) setActiveFirmId(j.firms[0].id);
      });
  }, []);

  useEffect(() => {
    if (!activeFirmId) return;
    void fetch(`/api/admin/firms/${activeFirmId}/rfi-sla`)
      .then((r) => r.json())
      .then((j: { sla: SLA }) => setSla(j.sla));
  }, [activeFirmId]);

  async function save() {
    if (!sla) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/firms/${activeFirmId}/rfi-sla`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hoursLow: sla.hoursLow,
        hoursNormal: sla.hoursNormal,
        hoursHigh: sla.hoursHigh,
        hoursUrgent: sla.hoursUrgent,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const j = (await res.json()) as { sla: SLA };
      setSla(j.sla);
      setMessage("Збережено. Діє ТІЛЬКИ на нові RFI; існуючі не перераховуються.");
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(`Помилка: ${j.error ?? res.status}`);
    }
  }

  if (!sla) return <div className="p-6 text-sm text-zinc-500">Завантаження…</div>;

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">SLA для RFI</h1>
      <p className="text-sm text-zinc-500 mb-4">
        Кількість робочих годин (Пн–Пт 09:00–18:00 Europe/Kyiv) від моменту створення RFI до дедлайну,
        залежно від пріоритету. Зміни діють ТІЛЬКИ на нові RFI — існуючі не перераховуються.
      </p>

      {firms.length > 1 && (
        <div className="mb-4">
          <label className="text-xs text-zinc-500 block mb-1">Фірма</label>
          <select
            value={activeFirmId}
            onChange={(e) => setActiveFirmId(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm"
            style={{ borderColor: T.borderSoft }}
          >
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-3">
        {(["hoursUrgent", "hoursHigh", "hoursNormal", "hoursLow"] as const).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <label className="text-sm w-28 capitalize">{k.replace("hours", "")}</label>
            <input
              type="number"
              min={1}
              max={24 * 30}
              value={sla[k]}
              onChange={(e) => setSla({ ...sla, [k]: Number(e.target.value) })}
              className="border rounded-lg px-2 py-1.5 text-sm w-24"
              style={{ borderColor: T.borderSoft }}
            />
            <span className="text-xs text-zinc-500">робочих годин</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-5 px-3 py-1.5 rounded-lg text-sm text-white disabled:opacity-40"
        style={{ backgroundColor: T.accentPrimary }}
      >
        {saving ? "Збереження…" : "Зберегти"}
      </button>

      {message && <div className="text-sm mt-3 text-zinc-700">{message}</div>}
    </div>
  );
}
