"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search, Filter, Users, Calculator, DollarSign,
  ExternalLink, ChevronDown, Download
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  STAGE_LABELS,
  ESTIMATE_STATUS_LABELS
} from "@/lib/constants";
import Link from "next/link";
import type { ProjectDashboardData } from "@/types";
import type { ProjectStatus, ProjectStage } from "@prisma/client";

type Props = {
  projects: ProjectDashboardData[];
  managers: { id: string; name: string }[];
};

export function ProjectsDashboardTable({ projects, managers }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus[]>([]);
  const [stageFilter, setStageFilter] = useState<ProjectStage[]>([]);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filtered data
  const filtered = useMemo(() => {
    return projects.filter((project) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        project.title.toLowerCase().includes(searchLower) ||
        project.client.name.toLowerCase().includes(searchLower) ||
        project.crewAssignments.some(ca =>
          ca.worker.name.toLowerCase().includes(searchLower)
        );

      // Status filter
      const matchesStatus =
        statusFilter.length === 0 ||
        statusFilter.includes(project.status);

      // Stage filter
      const matchesStage =
        stageFilter.length === 0 ||
        stageFilter.includes(project.currentStage);

      // Manager filter
      const matchesManager =
        !managerFilter ||
        project.managerId === managerFilter;

      return matchesSearch && matchesStatus && matchesStage && matchesManager;
    });
  }, [projects, search, statusFilter, stageFilter, managerFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalBudget = filtered.reduce((sum, p) =>
      sum + Number(p.totalBudget), 0
    );
    const totalPaid = filtered.reduce((sum, p) =>
      sum + Number(p.totalPaid), 0
    );
    const activeProjects = filtered.filter(p =>
      p.status === 'ACTIVE'
    ).length;

    return { totalBudget, totalPaid, activeProjects, total: filtered.length };
  }, [filtered]);

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/admin/projects/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: filtered.map(p => p.id)
        })
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projects-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Помилка експорту. Спробуйте ще раз.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Всього проєктів</p>
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.activeProjects} активних
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Загальний бюджет</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalBudget)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Сплачено</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Залишок</p>
          <p className="text-2xl font-bold">
            {formatCurrency(stats.totalBudget - stats.totalPaid)}
          </p>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук за назвою, клієнтом, бригадиром..."
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* Export Button */}
            <Button
              onClick={handleExport}
              disabled={isExporting || filtered.length === 0}
              variant="outline"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Експорт...' : 'Excel'}
            </Button>

            {/* Filter Toggle */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "bg-muted" : ""}
            >
              <Filter className="h-4 w-4" />
              Фільтри
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </Button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-3 border-t">
              {/* Status Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Статус
                </label>
                <select
                  multiple
                  value={statusFilter}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, o => o.value as ProjectStatus);
                    setStatusFilter(selected);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  size={5}
                >
                  {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Stage Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Етап
                </label>
                <select
                  multiple
                  value={stageFilter}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, o => o.value as ProjectStage);
                    setStageFilter(selected);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  size={5}
                >
                  {Object.entries(STAGE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Manager Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Менеджер
                </label>
                <select
                  value={managerFilter || ""}
                  onChange={(e) => setManagerFilter(e.target.value || null)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Всі менеджери</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filters */}
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter([]);
                    setStageFilter([]);
                    setManagerFilter(null);
                    setSearch("");
                  }}
                >
                  Скинути фільтри
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Проєкт
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  <Users className="inline h-3 w-3 mr-1" />
                  Бригадири
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  <DollarSign className="inline h-3 w-3 mr-1" />
                  Бюджет
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  <Calculator className="inline h-3 w-3 mr-1" />
                  Кошторис
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground w-10">

                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const latestEstimate = project.estimates[0];
                const brigadiers = project.crewAssignments.filter(ca =>
                  ca.role?.toLowerCase().includes('бригадир') ||
                  ca.role?.toLowerCase().includes('brigadier') ||
                  ca.role?.toLowerCase().includes('foreman')
                );
                const allWorkers = project.crewAssignments;

                return (
                  <tr key={project.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/projects/${project.id}`}
                            className="font-medium text-sm hover:text-primary transition-colors"
                          >
                            {project.title}
                          </Link>
                          <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                            {PROJECT_STATUS_LABELS[project.status]}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {project.client.name} • {STAGE_LABELS[project.currentStage]}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {brigadiers.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {brigadiers.slice(0, 3).map((ca) => (
                            <div key={ca.id} className="text-sm">
                              {ca.worker.name}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({ca.worker.specialty})
                              </span>
                            </div>
                          ))}
                          {brigadiers.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              ще {brigadiers.length - 3}
                            </span>
                          )}
                        </div>
                      ) : allWorkers.length > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {allWorkers.length} працівник(ів)
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Не призначено</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="text-sm font-medium">
                          {formatCurrency(Number(project.totalBudget))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Сплачено: {formatCurrency(Number(project.totalPaid))}
                        </div>
                        {Number(project.totalPaid) > 0 && Number(project.totalBudget) > 0 && (
                          <div className="text-xs text-primary">
                            {Math.round((Number(project.totalPaid) / Number(project.totalBudget)) * 100)}% оплачено
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {latestEstimate ? (
                        <Link
                          href={`/admin/estimates/${latestEstimate.id}`}
                          className="flex flex-col gap-0.5 hover:text-primary transition-colors"
                        >
                          <div className="text-sm font-medium">
                            {formatCurrency(Number(latestEstimate.finalAmount))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {latestEstimate.number}
                          </div>
                          <Badge variant="secondary" className="w-fit text-[10px]">
                            {ESTIMATE_STATUS_LABELS[latestEstimate.status]}
                          </Badge>
                        </Link>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {project._count.estimates > 0
                            ? `${project._count.estimates} кошторис(ів)`
                            : "Немає кошторису"
                          }
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/admin/projects/${project.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {filtered.map((project) => {
          const latestEstimate = project.estimates[0];
          const brigadiers = project.crewAssignments.filter(ca =>
            ca.role?.toLowerCase().includes('бригадир') ||
            ca.role?.toLowerCase().includes('brigadier') ||
            ca.role?.toLowerCase().includes('foreman')
          );

          return (
            <Link key={project.id} href={`/admin/projects/${project.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col gap-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{project.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {project.client.name}
                      </p>
                    </div>
                    <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </div>

                  {/* Brigadiers */}
                  {brigadiers.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">
                          Бригадири
                        </p>
                        {brigadiers.slice(0, 3).map((ca) => (
                          <p key={ca.id} className="text-sm">
                            {ca.worker.name} ({ca.worker.specialty})
                          </p>
                        ))}
                        {brigadiers.length > 3 && (
                          <p className="text-xs text-muted-foreground">ще {brigadiers.length - 3}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Budget */}
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-muted-foreground">Бюджет</p>
                      <p className="text-sm font-bold">
                        {formatCurrency(Number(project.totalBudget))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Сплачено: {formatCurrency(Number(project.totalPaid))}
                      </p>
                    </div>
                  </div>

                  {/* Estimate */}
                  {latestEstimate && (
                    <div className="flex items-start gap-2">
                      <Calculator className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground">Кошторис</p>
                        <p className="text-sm font-bold">
                          {formatCurrency(Number(latestEstimate.finalAmount))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {latestEstimate.number}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <Card className="p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Проєктів не знайдено</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Спробуйте змінити параметри пошуку або фільтри
          </p>
        </Card>
      )}

      {/* Results Count */}
      {filtered.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Показано {filtered.length} з {projects.length} проєктів
        </div>
      )}
    </div>
  );
}
