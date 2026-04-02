"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search, Filter, Users, Calculator, DollarSign,
  ExternalLink, ChevronDown, Download, Calendar, Clock, AlertCircle
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

// Helper functions for deadline calculations
function getDeadlineStatus(expectedEndDate: Date | null) {
  if (!expectedEndDate) return null;

  const now = new Date();
  const deadline = new Date(expectedEndDate);
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return { status: 'overdue', days: Math.abs(daysUntil), color: 'bg-red-50 text-red-700 border-red-200' };
  } else if (daysUntil <= 7) {
    return { status: 'urgent', days: daysUntil, color: 'bg-orange-50 text-orange-700 border-orange-200' };
  } else if (daysUntil <= 30) {
    return { status: 'soon', days: daysUntil, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
  } else {
    return { status: 'normal', days: daysUntil, color: 'bg-green-50 text-green-700 border-green-200' };
  }
}

function getProgressPercentage(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) return 0;

  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();

  const percentage = Math.round((elapsed / total) * 100);
  return Math.max(0, Math.min(100, percentage));
}

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

      {/* Projects Grid Cards */}
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => {
          const latestEstimate = project.estimates[0];
          const brigadiers = project.crewAssignments.filter(ca =>
            ca.role?.toLowerCase().includes('бригадир') ||
            ca.role?.toLowerCase().includes('brigadier') ||
            ca.role?.toLowerCase().includes('foreman')
          );

          const deadlineInfo = getDeadlineStatus(project.expectedEndDate);
          const progress = getProgressPercentage(project.startDate, project.expectedEndDate);

          return (
            <Card
              key={project.id}
              className={`p-0 hover:shadow-lg transition-all border-l-4 overflow-hidden ${
                deadlineInfo ? deadlineInfo.color : 'border-l-gray-300'
              }`}
            >
              <Link href={`/admin/projects/${project.id}`}>
                {/* Card Header with Deadline Badge */}
                <div className="p-4 pb-3 bg-gradient-to-br from-white to-gray-50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base truncate">{project.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {project.client.name}
                      </p>
                    </div>
                    <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </div>

                  {/* Deadline Alert */}
                  {deadlineInfo && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${deadlineInfo.color} mt-2`}>
                      {deadlineInfo.status === 'overdue' ? (
                        <>
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            Прострочено на {deadlineInfo.days} дн.
                          </span>
                        </>
                      ) : deadlineInfo.status === 'urgent' ? (
                        <>
                          <Clock className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            Терміново! {deadlineInfo.days} дн.
                          </span>
                        </>
                      ) : (
                        <>
                          <Calendar className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            До здачі: {deadlineInfo.days} дн.
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Timeline Progress */}
                  {project.startDate && project.expectedEndDate && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{formatDateShort(project.startDate)}</span>
                        <span className="font-medium">{progress}%</span>
                        <span>{formatDateShort(project.expectedEndDate)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            progress > 100 ? 'bg-red-500' : progress > 75 ? 'bg-orange-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 pt-3 space-y-3">
                  {/* Stage Badge */}
                  <div>
                    <Badge variant="outline" className="text-xs">
                      {STAGE_LABELS[project.currentStage]}
                    </Badge>
                  </div>

                  {/* Brigadiers with Timeline */}
                  {brigadiers.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        <p className="text-xs font-semibold text-blue-900">Бригадири</p>
                      </div>
                      <div className="space-y-1.5 pl-6">
                        {brigadiers.slice(0, 2).map((ca) => (
                          <div key={ca.id} className="bg-blue-50 rounded-md p-2 border border-blue-100">
                            <p className="text-sm font-medium text-blue-900">
                              {ca.worker.name}
                            </p>
                            <p className="text-xs text-blue-700">
                              {ca.worker.specialty}
                            </p>
                            {ca.startDate && (
                              <div className="flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3 text-blue-600" />
                                <span className="text-xs text-blue-600">
                                  {formatDateShort(ca.startDate)}
                                  {ca.endDate && ` - ${formatDateShort(ca.endDate)}`}
                                  {!ca.endDate && ' - активний'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                        {brigadiers.length > 2 && (
                          <p className="text-xs text-blue-600 pl-2">
                            ще {brigadiers.length - 2} бригадир(ів)
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Budget */}
                  <div className="bg-green-50 rounded-md p-3 border border-green-100">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <p className="text-xs font-semibold text-green-900">Бюджет</p>
                    </div>
                    <p className="text-lg font-bold text-green-700">
                      {formatCurrency(Number(project.totalBudget))}
                    </p>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-green-600">
                        Сплачено: {formatCurrency(Number(project.totalPaid))}
                      </p>
                      {Number(project.totalBudget) > 0 && (
                        <span className="text-xs font-medium text-green-700">
                          {Math.round((Number(project.totalPaid) / Number(project.totalBudget)) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Estimate */}
                  {latestEstimate && (
                    <div className="bg-purple-50 rounded-md p-3 border border-purple-100">
                      <div className="flex items-center gap-2 mb-1">
                        <Calculator className="h-4 w-4 text-purple-600" />
                        <p className="text-xs font-semibold text-purple-900">Кошторис</p>
                      </div>
                      <p className="text-lg font-bold text-purple-700">
                        {formatCurrency(Number(latestEstimate.finalAmount))}
                      </p>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-xs text-purple-600">
                          {latestEstimate.number}
                        </p>
                        <Badge variant="secondary" className="text-[10px]">
                          {ESTIMATE_STATUS_LABELS[latestEstimate.status]}
                        </Badge>
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
