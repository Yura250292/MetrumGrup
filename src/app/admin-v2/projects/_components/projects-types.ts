import type { ProjectWithAggregations } from "@/lib/projects/aggregations";

export type ProjectExtra = {
  estimatesCount: number;
  hasApprovedEstimate: boolean;
  expectedEndDate: Date | null;
  coverImage: string | null;
  /** Активний етап (kind=STAGE, status=IN_PROGRESS) — назва і позиція у списку. */
  activeStageName: string | null;
  activeStageIndex: number | null;
  totalStageCount: number;
  /** Відкриті RFI прив'язані до проєкту (OPEN | IN_PROGRESS). */
  openRfiCount: number;
  /** Code з Project.code (наприклад "PRJ-2026-001"). Null якщо не заповнено. */
  code: string | null;
  /** Type з Project.type ("ЖИТЛО"/"КОМЕРЦІЯ"/...). Null якщо не заповнено. */
  type: string | null;
};

export type ProjectRow = ProjectWithAggregations & { extra: ProjectExtra };
