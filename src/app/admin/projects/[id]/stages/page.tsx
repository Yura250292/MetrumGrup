"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_ORDER, STAGE_STATUS_LABELS } from "@/lib/constants";
import { ArrowLeft, Save, Check, Clock, Circle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type StageData = {
  id?: string;
  stage: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  notes: string;
  startDate: string;
  endDate: string;
};

export default function StageManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [stages, setStages] = useState<StageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProjectTitle(data.title);
        if (data.stages?.length > 0) {
          setStages(
            data.stages.map((s: Record<string, string>) => ({
              id: s.id,
              stage: s.stage,
              status: s.status,
              progress: Number(s.progress),
              notes: s.notes || "",
              startDate: s.startDate ? s.startDate.split("T")[0] : "",
              endDate: s.endDate ? s.endDate.split("T")[0] : "",
            }))
          );
        } else {
          setStages(
            STAGE_ORDER.map((stage, i) => ({
              stage,
              status: "PENDING",
              progress: 0,
              notes: "",
              startDate: "",
              endDate: "",
            }))
          );
        }
        setLoading(false);
      });
  }, [id]);

  function updateStage(index: number, updates: Partial<StageData>) {
    setStages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      // Auto-set progress
      if (updates.status === "COMPLETED") {
        next[index].progress = 100;
      } else if (updates.status === "PENDING") {
        next[index].progress = 0;
      }

      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/admin/projects/${id}/stages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages }),
      });
      router.push(`/admin/projects/${id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Завантаження...</div>;

  const statusIcons = { COMPLETED: Check, IN_PROGRESS: Clock, PENDING: Circle };

  return (
    <div className="max-w-3xl">
      <Link
        href={`/admin/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {projectTitle}
      </Link>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold">Управління етапами</h1>
        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          <Save className="h-4 w-4" />
          {saving ? "Збереження..." : "Зберегти"}
        </Button>
      </div>

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const Icon = statusIcons[stage.status];
          return (
            <Card key={stage.stage} className="p-4">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "mt-1 flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0",
                    stage.status === "COMPLETED" && "bg-success text-success-foreground",
                    stage.status === "IN_PROGRESS" && "bg-primary text-primary-foreground",
                    stage.status === "PENDING" && "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      {STAGE_LABELS[stage.stage as keyof typeof STAGE_LABELS]}
                    </h3>
                    <select
                      value={stage.status}
                      onChange={(e) =>
                        updateStage(index, { status: e.target.value as StageData["status"] })
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                    >
                      <option value="PENDING">Очікує</option>
                      <option value="IN_PROGRESS">В процесі</option>
                      <option value="COMPLETED">Завершено</option>
                    </select>
                  </div>

                  {stage.status === "IN_PROGRESS" && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">
                          Прогрес: {stage.progress}%
                        </label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={stage.progress}
                        onChange={(e) =>
                          updateStage(index, { progress: parseInt(e.target.value) })
                        }
                        className="w-full accent-primary"
                      />
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Початок</label>
                      <input
                        type="date"
                        value={stage.startDate}
                        onChange={(e) =>
                          updateStage(index, { startDate: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Завершення</label>
                      <input
                        type="date"
                        value={stage.endDate}
                        onChange={(e) =>
                          updateStage(index, { endDate: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Примітки</label>
                    <textarea
                      value={stage.notes}
                      onChange={(e) =>
                        updateStage(index, { notes: e.target.value })
                      }
                      rows={2}
                      placeholder="Деталі по етапу..."
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
