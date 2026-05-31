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
};

export type ProjectRow = ProjectWithAggregations & { extra: ProjectExtra };
