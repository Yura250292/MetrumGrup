"use client";

import { Card } from "@/components/ui/card";
import { useProjectAggregations } from "@/hooks/useProjectAggregations";
import { AdminProjectCard } from "./AdminProjectCard";

export function ProjectsList() {
  const { data: projects, isLoading, error } = useProjectAggregations();

  if (isLoading) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Завантаження...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center text-red-500">
        Помилка завантаження: {(error as Error).message}
      </Card>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Немає проєктів</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <AdminProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
